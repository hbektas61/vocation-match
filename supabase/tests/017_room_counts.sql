-- D-032 — room headcounts behind the five-person threshold.
--
-- The exact number of people in a room is the strongest signal the hotel
-- card can show and the easiest deanonymiser at a quiet hotel: "1 person in
-- Here Now" plus one glance around the lobby is identification. The rule
-- under test: an exact count only at 5 or more; below that, null — and null
-- must mean *nothing*, never "a few", because at one person even "somebody"
-- is a presence leak.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('viewer@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('nowhere@example.test', '00000000-0000-0000-0000-0000000000e1', 'Erol');

create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one,
       tests.create_hotel('Galata Rooms',    41.0256, 28.9744) as two;
grant select on h to anon, authenticated;

-- Four people declare a stay at hotel one — a crowd, but one person short
-- of the crowd that hides an individual.
do $$
declare
  i int;
  v_id uuid;
begin
  for i in 1..4 loop
    v_id := format('00000000-0000-0000-0000-0000000002%s', lpad(i::text, 2, '0'))::uuid;
    perform tests.create_member(format('crowd%s@example.test', i), v_id, format('Crowd%s', i));
    perform tests.authenticate_as(v_id);
    perform public.set_active_hotel((select one from h));
    perform public.declare_upcoming_stay(current_date + 2, current_date + 5);
  end loop;
end $$;

-- ------------------------------------------------------- below the threshold
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.set_active_hotel((select one from h));

select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  null,
  'four people are below the threshold: no number, and no hint of one'
);

select is(
  (select headcount from public.hotel_room_counts() where room = 'HERE_NOW'),
  null,
  'an empty room reads exactly like a small one'
);

-- ---------------------------------------------------------- the fifth person
select tests.create_member('crowd5@example.test', '00000000-0000-0000-0000-000000000205', 'Crowd5');
select tests.authenticate_as('00000000-0000-0000-0000-000000000205');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 2, current_date + 5);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  5,
  'at five the exact count appears'
);

-- The viewer declares a stay too: the count describes other people, so it
-- must not move.
select public.declare_upcoming_stay(current_date + 2, current_date + 5);
select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  5,
  'the caller is never part of the number they are shown'
);

-- The crowd walks up to the hotel: Here Now fills to five as well.
do $$
declare
  i int;
begin
  for i in 1..4 loop
    perform tests.authenticate_as(
      format('00000000-0000-0000-0000-0000000002%s', lpad(i::text, 2, '0'))::uuid);
    perform public.record_presence_check(41.0369, 28.9850, 10);
  end loop;
  perform tests.authenticate_as('00000000-0000-0000-0000-000000000205');
  perform public.record_presence_check(41.0369, 28.9850, 10);
end $$;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select headcount from public.hotel_room_counts() where room = 'HERE_NOW'),
  5,
  'Here Now counts proximity-checked people the same way'
);

-- A declaration at a different hotel never leaks into this one.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select public.set_active_hotel((select two from h));
select public.declare_upcoming_stay(current_date + 2, current_date + 5);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  5,
  'people at other hotels are not in the number'
);

-- D-035: with the caller's own window declared (+2..+5), a person whose
-- stay starts long after it must not enter the Upcoming number.
select tests.create_member('faraway@example.test', '00000000-0000-0000-0000-000000000206', 'Faraway');
select tests.authenticate_as('00000000-0000-0000-0000-000000000206');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 40, current_date + 43);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  5,
  'a stay outside the caller''s window stays outside the count'
);

-- Suspension removes a person from the count the moment it lands — and the
-- count falls back to silence rather than to "4".
select tests.clear_auth();
update public.profiles
   set suspended_at = now()
 where id = '00000000-0000-0000-0000-000000000201';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  null,
  'losing one person below the threshold silences the count entirely'
);

-- ------------------------------------------------------------------- access
select tests.create_member('hotelless@example.test', '00000000-0000-0000-0000-0000000000f1', 'Faruk');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000f1');
select throws_ok(
  $$select * from public.hotel_room_counts()$$,
  'P0002',
  'Choose a hotel first.',
  'no active hotel, no counts'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$select * from public.hotel_room_counts()$$,
  '42501',
  null,
  'anonymous callers cannot reach the function at all'
);

select tests.clear_auth();
select * from finish();
rollback;
