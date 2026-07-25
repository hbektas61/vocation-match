-- N-006 — room eligibility and the discovery feed.
-- Upcoming and Here Now are independent (D-002): neither is a precondition
-- for the other, and both are decided on the server.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada',
                           (current_date - interval '31 years')::date);
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cam@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cam');
select tests.create_member('dev@example.test', '00000000-0000-0000-0000-0000000000d1', 'Dev');

create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one,
       tests.create_hotel('Galata Rooms',    41.0256, 28.9744) as two;
grant select on h to anon, authenticated;

-- Bo declares a stay at hotel one.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 3, current_date + 6);

-- Cam is standing next to hotel one but has declared nothing.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.set_active_hotel((select one from h));
select public.record_presence_check(41.0389, 28.9850);

-- Dev declares a stay at a different hotel.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select public.set_active_hotel((select two from h));
select public.declare_upcoming_stay(current_date + 3, current_date + 6);

-- ------------------------------------------------------------- ada's rooms
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select reason from public.my_rooms() where room = 'UPCOMING'),
  'NO_ACTIVE_HOTEL',
  'without an active hotel no room is open'
);

select public.set_active_hotel((select one from h));

select is(
  (select reason from public.my_rooms() where room = 'UPCOMING'),
  'NO_DECLARATION',
  'Upcoming needs a self-declared stay'
);

select is(
  (select reason from public.my_rooms() where room = 'HERE_NOW'),
  'NO_RECENT_CHECK',
  'Here Now needs a recent foreground check'
);

select throws_ok(
  $$select * from public.discovery_feed('UPCOMING')$$,
  '42501',
  'You do not have access to this room yet.',
  'the feed refuses a room the caller has not unlocked'
);

-- ---------------------------------------------------------------- upcoming
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select ok(
  (select eligible from public.my_rooms() where room = 'UPCOMING'),
  'declaring a stay opens Upcoming with no location check at all (D-001)'
);

select ok(
  not (select eligible from public.my_rooms() where room = 'HERE_NOW'),
  'declaring a stay does not open Here Now'
);

select bag_eq(
  $$select display_name from public.discovery_feed('UPCOMING')$$,
  $$values ('Bo'::text)$$,
  'Upcoming shows the other declared guest, and only them'
);

select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the feed never contains the caller'
);

select is(
  (select age from public.discovery_feed('UPCOMING') limit 1),
  30,
  'the feed carries a whole-year age, not a birthdate'
);

select bag_eq(
  $$select a.attname::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join unnest(p.proargnames, p.proargmodes) as a(attname, mode) on true
     where n.nspname = 'public' and p.proname = 'discovery_feed' and a.mode = 't'$$,
  $$values ('user_id'::text),('display_name'),('age'),('bio'),('photo_path'),('interests')$$,
  'the feed returns exactly the card fields — no birthdate, no email, no location'
);

-- ---------------------------------------------------------------- here now
select ok(
  (select within_range from public.record_presence_check(41.0389, 28.9850)),
  'ada checks in near the hotel'
);

select ok(
  (select eligible from public.my_rooms() where room = 'HERE_NOW'),
  'proximity alone opens Here Now — no declaration required (D-002)'
);

select bag_eq(
  $$select display_name from public.discovery_feed('HERE_NOW')$$,
  $$values ('Cam'::text)$$,
  'Here Now shows the guest who is nearby, not the one who only declared a stay'
);

-- Backlog R-003: the client needs to know when this stops being true, so it
-- can refresh at the boundary instead of showing a room the server refuses.
select ok(
  (select valid_until from public.my_rooms() where room = 'HERE_NOW')
    between now() and now() + interval '31 minutes',
  'Here Now reports when its answer lapses'
);

select is(
  (select valid_until from public.my_rooms() where room = 'UPCOMING'),
  null,
  'a declared stay lapses on a date, so it reports no clock expiry'
);

-- --------------------------------------------------------- far away reading
select ok(
  not (select within_range from public.record_presence_check(41.0469, 28.9850)),
  'a distant reading answers no'
);

select is(
  (select reason from public.my_rooms() where room = 'HERE_NOW'),
  'TOO_FAR',
  'and the room reports why it closed'
);

-- ------------------------------------------------------------- stay expiry
select tests.clear_auth();
update public.upcoming_stays
   set start_date = current_date - interval '10 days',
       end_date   = current_date - interval '3 days'
 where user_id = '00000000-0000-0000-0000-0000000000a1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select reason from public.my_rooms() where room = 'UPCOMING'),
  'STAY_ENDED',
  'a stay that has already finished stops opening Upcoming'
);

-- ------------------------------------------------------- declaration rules
select throws_ok(
  $$select public.declare_upcoming_stay(current_date + 5, current_date + 2)$$,
  '23514',
  'The check-out date must be after the check-in date.',
  'the dates have to be in order'
);

select throws_ok(
  $$select public.declare_upcoming_stay(current_date + 2, current_date + 2)$$,
  '23514',
  'The check-out date must be after the check-in date.',
  'a zero-night stay is not a stay'
);

select throws_ok(
  $$select public.declare_upcoming_stay(current_date - 10, current_date - 5)$$,
  '23514',
  'That stay has already ended.',
  'a stay in the past cannot be declared'
);

select throws_ok(
  $$select public.declare_upcoming_stay(current_date + 900, current_date + 905)$$,
  '23514',
  'Declare a stay within the next two years.',
  'a stay far in the future cannot be declared'
);

select throws_ok(
  $$insert into public.upcoming_stays (user_id, hotel_id, start_date, end_date)
    values ('00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000ff', current_date, current_date + 1)$$,
  '42501',
  null,
  'a client cannot write a declaration directly, so it cannot declare for another hotel'
);

select is(
  (select count(*)::int from public.upcoming_stays),
  1,
  'a user only ever sees their own declarations'
);

-- ------------------------------------------------------------- other hotel
select public.declare_upcoming_stay(current_date + 1, current_date + 4);
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Dev'),
  0,
  'a guest at another hotel never appears in this hotel`s room'
);

select * from finish(true);
rollback;
