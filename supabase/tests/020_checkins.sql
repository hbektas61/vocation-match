-- D-039 — "Çevremde": venue check-ins, mutual, expiring, and free.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

-- Venue A and B ~600 m apart; C is ~2 km away — outside the 1 km street.
create temp table v as
select tests.create_hotel('Corner Beach Bar', 41.0369, 28.9850) as a,
       tests.create_hotel('Marina Club',      41.0400, 28.9900) as b,
       tests.create_hotel('Far Pier',         41.0550, 28.9850) as c,
       -- ~150 m from A: inside the 500 m check-in ring, for the list test.
       tests.create_hotel('Corner Kiosk',     41.0380, 28.9860) as d;
grant select on v to anon, authenticated;

-- Nil is deliberately FREE: the whole feature must work without premium.
select tests.create_member('nil@example.test', '00000000-0000-0000-0000-000000000701', 'Nil');
select tests.set_premium('00000000-0000-0000-0000-000000000701', false);

select tests.create_member('same@example.test', '00000000-0000-0000-0000-000000000702', 'SameVenue');
select tests.create_member('near@example.test', '00000000-0000-0000-0000-000000000703', 'NearStreet');
select tests.create_member('far@example.test',  '00000000-0000-0000-0000-000000000704', 'FarPier');

-- ------------------------------------------------------------ the mutual door
select tests.authenticate_as('00000000-0000-0000-0000-000000000701');
select throws_ok(
  $$select * from public.discovery_feed('NEARBY')$$,
  'P0002',
  'Check in somewhere first.',
  'no check-in, no looking: mutuality is structural'
);

-- Too far from the venue: answered, not stored.
select results_eq(
  $$select within_range from public.record_checkin((select a from v), 41.09, 28.985)$$,
  $$values (false)$$,
  'a check-in from across town is refused'
);
select is(
  (select count(*)::int from public.my_checkin()),
  0,
  'and nothing was stored by the refusal'
);

-- In range: stored, with the three-hour clock.
select results_eq(
  $$select within_range from public.record_checkin((select a from v), 41.0369, 28.9850)$$,
  $$values (true)$$,
  'standing at the venue checks in — no premium required'
);
select results_eq(
  $$select venue_name from public.my_checkin()$$,
  $$values ('Corner Beach Bar'::text)$$,
  'my_checkin answers with the venue by name'
);

-- --------------------------------------------------------------- the street
select tests.authenticate_as('00000000-0000-0000-0000-000000000702');
select * from public.record_checkin((select a from v), 41.0369, 28.9850);
select tests.authenticate_as('00000000-0000-0000-0000-000000000703');
select * from public.record_checkin((select b from v), 41.0400, 28.9900);
select tests.authenticate_as('00000000-0000-0000-0000-000000000704');
select * from public.record_checkin((select c from v), 41.0550, 28.9850);

select tests.authenticate_as('00000000-0000-0000-0000-000000000701');
select results_eq(
  $$select display_name, venue_name, same_venue
      from public.discovery_feed('NEARBY') order by same_venue desc$$,
  $$values ('SameVenue'::text, null::text, true),
           ('NearStreet',      'Marina Club', false)$$,
  'the street: same venue unlabelled and first, 600 m labelled, 2 km absent'
);

-- ------------------------------------------------------- swiping the street
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-000000000703', 'NEARBY', 'LIKE')),
  null,
  'a nearby card accepts the like'
);
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-000000000704', 'NEARBY', 'LIKE')),
  'NOT_IN_ROOM',
  '2 km away is not the street'
);

-- Free members meet no allowance here: a fourth NEARBY like still passes.
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000702', 'NEARBY', 'LIKE')$$, 'nearby like 2');
do $$
declare
  i int;
  v_id uuid;
begin
  for i in 5..7 loop
    v_id := format('00000000-0000-0000-0000-0000000007%s', lpad(i::text, 2, '0'))::uuid;
    perform tests.create_member(format('crowd%s@nearby.test', i), v_id, format('Street%s', i));
    perform tests.authenticate_as(v_id);
    perform public.record_checkin((select a from v), 41.0369, 28.9850);
  end loop;
end $$;
select tests.authenticate_as('00000000-0000-0000-0000-000000000701');
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000705', 'NEARBY', 'LIKE')$$, 'nearby like 3');
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000706', 'NEARBY', 'LIKE')$$, 'nearby like 4: no D-036 allowance in the free room');

-- A mutual like across the street is a match, labelled NEARBY.
select tests.authenticate_as('00000000-0000-0000-0000-000000000703');
select is(
  (select matched from public.swipe('00000000-0000-0000-0000-000000000701', 'NEARBY', 'LIKE')),
  true,
  'a mutual nearby like is a match'
);
select is(
  (select m.room from public.matches m
    where '00000000-0000-0000-0000-000000000701' in (m.user_a, m.user_b)
      and '00000000-0000-0000-0000-000000000703' in (m.user_a, m.user_b)),
  'NEARBY',
  'and the match remembers which room made it'
);

-- ---------------------------------------------------------------- expiry
select tests.clear_auth();
update public.checkins set expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-0000-0000-000000000701';

select tests.authenticate_as('00000000-0000-0000-0000-000000000701');
select is(
  (select count(*)::int from public.my_checkin()),
  0,
  'an expired check-in is gone from my_checkin'
);
select throws_ok(
  $$select * from public.discovery_feed('NEARBY')$$,
  'P0002',
  'Check in somewhere first.',
  'and the street closes with it — visibility ends together, both ways'
);

-- Checking out is explicit too.
select * from public.record_checkin((select a from v), 41.0369, 28.9850);
select public.clear_checkin();
select is(
  (select count(*)::int from public.my_checkin()),
  0,
  'clearing a check-in removes it at once'
);

-- ------------------------------------------------------------------ privacy
select is(
  (select count(*)::int from public.checkins),
  0,
  'RLS: a member reads only their own check-in row — everyone else''s is invisible'
);

-- ------------------------------------------------- the venues around a point
-- D-039, continued: the screen reads the location once and offers the
-- catalogue's venues within check-in range, nearest first.
select results_eq(
  $$select name from public.nearby_venues(41.0369, 28.9850)$$,
  $$values ('Corner Beach Bar'::text), ('Corner Kiosk')$$,
  'around the bar: itself first, 150 m second — 540 m is outside check-in range'
);
select is(
  (select count(*)::int from public.nearby_venues(41.0550, 28.9850)),
  1,
  'around the far pier only the pier answers'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$select * from public.nearby_venues(41.0369, 28.9850)$$,
  '42501',
  null,
  'anonymous callers cannot look around'
);

select tests.clear_auth();
select * from finish();
rollback;
