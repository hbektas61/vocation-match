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
       -- Hotel two is deliberately in another city: within 15 km it would now
       -- be the same region (D-038), and these tests are about true isolation.
       tests.create_hotel('Ankara Palas',    39.9334, 32.8597) as two;
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

-- Eda declares at hotel one, but long after everyone leaves (D-035).
select tests.create_member('eda@example.test', '00000000-0000-0000-0000-0000000000e2', 'Eda');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 30, current_date + 33);

-- Fer checks in the very day Bo checks out — one shared day at the pool.
select tests.create_member('fer@example.test', '00000000-0000-0000-0000-0000000000f2', 'Fer');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000f2');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 6, current_date + 9);

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
  -- D-035 is half of this assertion now: Eda (+30..+33) and Fer (+6..+9)
  -- both declared at this hotel, but neither crosses Ada's +1..+4 window.
  'Upcoming shows only the declared guests whose stay crosses the caller''s'
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

-- ------------------------------------------------- D-035, the shared edge
-- Fer arrives the day Bo leaves: one shared day at the pool is an overlap.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000f2');
select bag_eq(
  $$select display_name from public.discovery_feed('UPCOMING')$$,
  $$values ('Bo'::text)$$,
  'a checkout day and a checkin day are the same day: the edge counts'
);

-- Eda's window crosses nobody's; her room is honestly empty.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING')),
  0,
  'a stay that crosses no other stay sees an empty room'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select bag_eq(
  $$select a.attname::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join unnest(p.proargnames, p.proargmodes) as a(attname, mode) on true
     where n.nspname = 'public' and p.proname = 'discovery_feed' and a.mode = 't'$$,
  $$values ('user_id'::text),('display_name'),('age'),('bio'),('photo_path'),('photo_paths'),
           ('interests'),('gender'),('orientations'),('venue_name'),('same_venue')$$,
  'the feed returns exactly the card fields — no birthdate, no email, no location, no show_me'
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
  'a guest in another region never appears in this hotel`s room (D-038: nearby is a different story)'
);

-- ------------------------------------------- drafts, show-me, and toggles
--
-- Everyone above is a finished profile who wants to see everyone, which is why
-- none of this was in the way. Each block below changes exactly one of those
-- facts.

-- A draft: every required answer present except the server's own mark.
select tests.create_member('eve@example.test', '00000000-0000-0000-0000-0000000000e9', 'Eve',
                           null, 'WOMAN', 'EVERYONE', false);
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e9');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Eve'),
  0,
  'an unfinished profile is in the room but not in the feed'
);

-- And is refused a feed of its own. The navigator already prevents this, which
-- is the reason to enforce it here too: a rule that lives only on the client
-- holds until somebody calls the RPC directly (found by security review).
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e9');
select throws_ok(
  $$select * from public.discovery_feed('UPCOMING')$$,
  'P0002',
  'Finish your profile first.',
  'a draft profile cannot browse either, not just be browsed'
);

-- Every change below is made by its own owner. Updating somebody else's row
-- is not a shortcut here — RLS turns it into a silent no-op, which would make
-- these assertions pass for the wrong reason.
-- Bo asks to see men. Ada, Cam and Eve are women, so the room empties out.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
update public.profiles
   set gender_identity = 'WOMAN', show_me = 'MEN',
       show_gender = false, show_orientation = false, orientations = '{}'
 where id = '00000000-0000-0000-0000-0000000000b1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING')),
  0,
  'show_me filters the feed server-side rather than being collected and ignored'
);

-- And it runs both ways: Cam wanting only women does not override Bo being a man.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
update public.profiles
   set gender_identity = 'WOMAN', show_me = 'WOMEN',
       show_gender = false, show_orientation = false, orientations = '{}'
 where id = '00000000-0000-0000-0000-0000000000c1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
update public.profiles
   set gender_identity = 'MAN', show_me = 'EVERYONE',
       show_gender = false, show_orientation = false, orientations = '{}'
 where id = '00000000-0000-0000-0000-0000000000b1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Cam'),
  0,
  'the other person''s show_me is honoured too, so neither preference wins'
);

-- A gender outside the two discovery can filter on is reachable only by
-- someone asking for everyone. That is a real limit of the model, and it is
-- asserted so that changing it has to be deliberate (D-023).
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
update public.profiles
   set gender_identity = 'NON-BINARY', show_me = 'EVERYONE',
       show_gender = false, show_orientation = false, orientations = '{}'
 where id = '00000000-0000-0000-0000-0000000000a1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Ada'),
  1,
  'someone outside WOMAN and MAN is visible to a viewer asking for everyone'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
update public.profiles
   set gender_identity = 'MAN', show_me = 'WOMEN',
       show_gender = false, show_orientation = false, orientations = '{}'
 where id = '00000000-0000-0000-0000-0000000000b1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Ada'),
  0,
  'and not to a viewer who asked for one of the two the filter knows'
);

-- The toggles. Answering is required; publishing is not, and both default off.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
update public.profiles
   set gender_identity = 'MAN', show_me = 'EVERYONE',
       show_gender = false, show_orientation = false, orientations = '{}'
 where id = '00000000-0000-0000-0000-0000000000b1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
update public.profiles
   set gender_identity = 'WOMAN', show_me = 'EVERYONE',
       show_gender = false, show_orientation = false, orientations = array['Queer']
 where id = '00000000-0000-0000-0000-0000000000a1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select f.gender from public.discovery_feed('UPCOMING') f where f.display_name = 'Ada'),
  null,
  'a card carries no gender while its owner has not published one'
);
select is(
  (select f.orientations from public.discovery_feed('UPCOMING') f where f.display_name = 'Ada'),
  '{}'::text[],
  'and no orientation either'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
update public.profiles
   set gender_identity = 'WOMAN', show_me = 'EVERYONE',
       show_gender = true, show_orientation = true, orientations = array['Queer']
 where id = '00000000-0000-0000-0000-0000000000a1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select f.gender from public.discovery_feed('UPCOMING') f where f.display_name = 'Ada'),
  'WOMAN',
  'turning the toggle on is what puts it on the card'
);
select is(
  (select f.orientations from public.discovery_feed('UPCOMING') f where f.display_name = 'Ada'),
  array['Queer'],
  'and the same for orientation'
);

-- show_me is a preference, not a profile field, and never leaves its own row.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_name = 'discovery_feed' and column_name = 'show_me'),
  0,
  'show_me is never returned to anybody else'
);

-- ------------------------------------------------- the card's photo set
-- Owner decision amending D-026: the card carries every photo, in order.
select tests.clear_auth();
insert into storage.objects (bucket_id, name, owner)
values
  ('profile-photos', '00000000-0000-0000-0000-0000000000a1/cardset1aaaa2222bbbb3333.jpg',
   '00000000-0000-0000-0000-0000000000a1'),
  ('profile-photos', '00000000-0000-0000-0000-0000000000a1/cardset4cccc5555dddd6666.jpg',
   '00000000-0000-0000-0000-0000000000a1');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.add_profile_photo('00000000-0000-0000-0000-0000000000a1/cardset1aaaa2222bbbb3333.jpg');
select public.add_profile_photo('00000000-0000-0000-0000-0000000000a1/cardset4cccc5555dddd6666.jpg');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select f.photo_paths from public.discovery_feed('UPCOMING') f where f.display_name = 'Ada'),
  array['00000000-0000-0000-0000-0000000000a1/cardset1aaaa2222bbbb3333.jpg',
        '00000000-0000-0000-0000-0000000000a1/cardset4cccc5555dddd6666.jpg'],
  'the card carries the whole set, in the owner''s order'
);
select is(
  (select f.photo_path from public.discovery_feed('UPCOMING') f where f.display_name = 'Ada'),
  '00000000-0000-0000-0000-0000000000a1/cardset1aaaa2222bbbb3333.jpg',
  'and the single photo_path is still the primary, so nothing built on it moves'
);

select * from finish(true);
rollback;
