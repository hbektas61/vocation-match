-- D-038 — the region pool: the deck widens to the town, honestly labelled,
-- and only when the own-venue deck runs thin.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

-- Hotel A and B are ~1.3 km apart (one holiday town); C is Ankara — another
-- world as far as a beach deck is concerned.
create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as a,
       tests.create_hotel('Galata Rooms',    41.0256, 28.9744) as b,
       tests.create_hotel('Ankara Palas',    39.9334, 32.8597) as c;
grant select on h to anon, authenticated;

-- The viewer, at A.
select tests.create_member('viewer@example.test', '00000000-0000-0000-0000-000000000501', 'Vera');
select tests.authenticate_as('00000000-0000-0000-0000-000000000501');
select public.set_active_hotel((select a from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);

-- Five overlapping people at A: a rich own-venue room.
do $$
declare
  i int;
  v_id uuid;
begin
  for i in 1..5 loop
    v_id := format('00000000-0000-0000-0000-0000000006%s', lpad(i::text, 2, '0'))::uuid;
    perform tests.create_member(format('atA%s@example.test', i), v_id, format('LocalA%s', i));
    perform tests.authenticate_as(v_id);
    perform public.set_active_hotel((select a from h));
    perform public.declare_upcoming_stay(current_date + 1, current_date + 10);
  end loop;
end $$;

-- One overlapping and one out-of-window person at B, one overlapping at C.
select tests.create_member('atB@example.test', '00000000-0000-0000-0000-000000000611', 'NearB');
select tests.authenticate_as('00000000-0000-0000-0000-000000000611');
select public.set_active_hotel((select b from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);

select tests.create_member('atB2@example.test', '00000000-0000-0000-0000-000000000612', 'WinterB');
select tests.authenticate_as('00000000-0000-0000-0000-000000000612');
select public.set_active_hotel((select b from h));
select public.declare_upcoming_stay(current_date + 40, current_date + 43);

select tests.create_member('atC@example.test', '00000000-0000-0000-0000-000000000613', 'FarC');
select tests.authenticate_as('00000000-0000-0000-0000-000000000613');
select public.set_active_hotel((select c from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);

-- ------------------------------------------------- a rich room stays local
select tests.authenticate_as('00000000-0000-0000-0000-000000000501');
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING')),
  5,
  'with five unswiped locals, the deck is exactly the locals'
);
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') where not same_venue),
  0,
  'and the region stays silent'
);
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') where venue_name is not null),
  0,
  'own-venue rows never carry a redundant venue label'
);

-- --------------------------------------------- thinning opens the region
select * from public.swipe('00000000-0000-0000-0000-000000000601', 'UPCOMING', 'PASS');

select is(
  (select count(*)::int from public.discovery_feed('UPCOMING')),
  5,
  'four locals left: the region person joins the deck'
);
select results_eq(
  $$select display_name, venue_name, same_venue
      from public.discovery_feed('UPCOMING') where not same_venue$$,
  $$values ('NearB'::text, 'Galata Rooms'::text, false)$$,
  'the region row is the overlapping neighbour, labelled with their venue'
);
select is(
  (select count(*)::int from public.discovery_feed('UPCOMING')
    where display_name in ('WinterB', 'FarC')),
  0,
  'out-of-window and out-of-region people are not in the deck'
);
select is(
  (select bool_and(same_venue) from (
     select same_venue from public.discovery_feed('UPCOMING') limit 4) own_rows),
  true,
  'locals still come before the region'
);

-- The headcount describes the venue, not the region: still the five at A.
select is(
  (select headcount from public.hotel_room_counts() where room = 'UPCOMING'),
  5,
  'the room count never absorbs the region'
);

-- ------------------------------------------------- swiping across the region
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-000000000611', 'UPCOMING', 'LIKE')),
  null,
  'a labelled region card accepts the like it invited'
);
select tests.authenticate_as('00000000-0000-0000-0000-000000000611');
select is(
  (select matched from public.swipe('00000000-0000-0000-0000-000000000501', 'UPCOMING', 'LIKE')),
  true,
  'and a mutual like across the region is a match'
);

select tests.authenticate_as('00000000-0000-0000-0000-000000000501');
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-000000000613', 'UPCOMING', 'LIKE')),
  'NOT_IN_ROOM',
  'another city is not a region: the far target is refused'
);

-- --------------------------------------------------- Here Now, regionally
-- A fresh neighbour (the matched one is already swiped, and a swipe removes
-- a pair from every deck) walks up to their own venue; the viewer checks in
-- at A. Both are premium (test default), both in range of their own hotels.
select tests.create_member('atB3@example.test', '00000000-0000-0000-0000-000000000614', 'NearBeach');
select tests.authenticate_as('00000000-0000-0000-0000-000000000614');
select public.set_active_hotel((select b from h));
select * from public.record_presence_check(41.0256, 28.9744);

select tests.authenticate_as('00000000-0000-0000-0000-000000000501');
select * from public.record_presence_check(41.0369, 28.9850);

select results_eq(
  $$select display_name, venue_name from public.discovery_feed('HERE_NOW')$$,
  $$values ('NearBeach'::text, 'Galata Rooms'::text)$$,
  'an empty own-venue Here Now deck continues with the checked-in neighbour'
);

select tests.clear_auth();
select * from finish();
rollback;
