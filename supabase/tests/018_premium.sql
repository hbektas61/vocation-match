-- D-036 — the premium entitlement rules, exercised with free members.
--
-- Every other suite runs on default-premium members so the rooms stay open;
-- this one deliberately turns entitlement off and checks each gate: the
-- Upcoming allowance (3 likes, 5 passes, per hotel), the Here Now door
-- (premium only, at the entrance and in eligibility itself), and the fact
-- that the column granting all of this is not client-writable.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one,
       tests.create_hotel('Galata Rooms',    41.0256, 28.9744) as two;
grant select on h to anon, authenticated;

-- Filiz is the free member under test.
select tests.create_member('filiz@example.test', '00000000-0000-0000-0000-000000000301', 'Filiz');
select tests.set_premium('00000000-0000-0000-0000-000000000301', false);

-- Ten targets in Upcoming at hotel one, stays crossing everyone's window.
do $$
declare
  i int;
  v_id uuid;
begin
  for i in 1..10 loop
    v_id := format('00000000-0000-0000-0000-0000000004%s', lpad(i::text, 2, '0'))::uuid;
    perform tests.create_member(format('target%s@example.test', i), v_id, format('Target%s', i));
    perform tests.authenticate_as(v_id);
    perform public.set_active_hotel((select one from h));
    perform public.declare_upcoming_stay(current_date + 1, current_date + 10);
  end loop;
end $$;

select tests.authenticate_as('00000000-0000-0000-0000-000000000301');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);

-- --------------------------------------------------- the Here Now door, free
select results_eq(
  $$select eligible, reason from public.my_rooms() where room = 'HERE_NOW'$$,
  $$values (false, 'PREMIUM_ONLY')$$,
  'a free member sees the true reason the Here Now door is closed'
);

select throws_ok(
  $$select * from public.record_presence_check(41.0369, 28.9850)$$,
  'PP001',
  'Here Now is for Premium members.',
  'a free member''s location is never even taken for Here Now'
);

-- ------------------------------------------------- the Upcoming allowance
-- Three likes pass.
select lives_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000401', 'UPCOMING', 'LIKE')$$,
  'free like 1 of 3'
);
select lives_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000402', 'UPCOMING', 'LIKE')$$,
  'free like 2 of 3'
);
select lives_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000403', 'UPCOMING', 'LIKE')$$,
  'free like 3 of 3'
);

-- The fourth is refused for the one true reason.
select throws_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000404', 'UPCOMING', 'LIKE')$$,
  'PP001',
  'Liking more people here needs Premium.',
  'the fourth like needs Premium'
);

-- Retrying an already-stored like is a replay, not a new like: it answers
-- from storage and never meets the limit.
select lives_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000401', 'UPCOMING', 'LIKE')$$,
  'retrying a stored like is not refused by the allowance'
);

-- Five passes pass; the sixth is refused. The three likes above must not
-- have eaten into the pass allowance.
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000404', 'UPCOMING', 'PASS')$$, 'free pass 1 of 5');
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000405', 'UPCOMING', 'PASS')$$, 'free pass 2 of 5');
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000406', 'UPCOMING', 'PASS')$$, 'free pass 3 of 5');
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000407', 'UPCOMING', 'PASS')$$, 'free pass 4 of 5');
select lives_ok($$select * from public.swipe('00000000-0000-0000-0000-000000000408', 'UPCOMING', 'PASS')$$, 'free pass 5 of 5');
select throws_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000409', 'UPCOMING', 'PASS')$$,
  'PP001',
  'Passing more people here needs Premium.',
  'the sixth pass needs Premium'
);

-- ------------------------------------------- the allowance is per hotel
-- A new hotel is a new room and a fresh allowance. (D-036: "3 likes in the
-- Upcoming room" scopes to the room you are in, not to a lifetime.)
select tests.create_member('elsewhere@example.test', '00000000-0000-0000-0000-000000000420', 'Elsewhere');
select tests.authenticate_as('00000000-0000-0000-0000-000000000420');
select public.set_active_hotel((select two from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);

select tests.authenticate_as('00000000-0000-0000-0000-000000000301');
select public.set_active_hotel((select two from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);
select lives_ok(
  $$select * from public.swipe('00000000-0000-0000-0000-000000000420', 'UPCOMING', 'LIKE')$$,
  'switching hotels starts a fresh allowance'
);

-- ------------------------------------------------------- premium lifts it all
-- Pelin (default premium) likes past three and walks into Here Now.
select tests.create_member('pelin@example.test', '00000000-0000-0000-0000-000000000302', 'Pelin');
select tests.authenticate_as('00000000-0000-0000-0000-000000000302');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 10);

do $$
declare
  i int;
begin
  for i in 1..5 loop
    perform public.swipe(
      format('00000000-0000-0000-0000-0000000004%s', lpad(i::text, 2, '0'))::uuid,
      'UPCOMING', 'LIKE');
  end loop;
end $$;
select is(
  (select count(*)::int from public.swipes s
    where s.actor_id = '00000000-0000-0000-0000-000000000302' and s.decision = 'LIKE'),
  5,
  'a premium member likes past three without refusal'
);

select lives_ok(
  $$select * from public.record_presence_check(41.0369, 28.9850)$$,
  'a premium member can take the proximity check'
);
select results_eq(
  $$select eligible, reason from public.my_rooms() where room = 'HERE_NOW'$$,
  $$values (true, 'ELIGIBLE')$$,
  'proximity plus premium opens Here Now'
);

-- ------------------------------------------------ lapsing closes every path
-- Pelin's entitlement ends while her presence answer is still fresh: the
-- room, the deck and the count must all forget her in the same instant.
select tests.set_premium('00000000-0000-0000-0000-000000000302', false);

select results_eq(
  $$select eligible, reason from public.my_rooms() where room = 'HERE_NOW'$$,
  $$values (false, 'PREMIUM_ONLY')$$,
  'a fresh presence answer does not outlive the entitlement'
);

-- A premium viewer standing at the hotel no longer sees her.
select tests.create_member('vera@example.test', '00000000-0000-0000-0000-000000000303', 'Vera');
select tests.authenticate_as('00000000-0000-0000-0000-000000000303');
select public.set_active_hotel((select one from h));
select * from public.record_presence_check(41.0369, 28.9850);

select is(
  (select count(*)::int from public.discovery_feed('HERE_NOW')
    where user_id = '00000000-0000-0000-0000-000000000302'),
  0,
  'a lapsed member is not in anyone''s Here Now deck'
);
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-000000000302', 'HERE_NOW', 'LIKE')),
  'NOT_IN_ROOM',
  'a lapsed member cannot be swiped in Here Now'
);

-- --------------------------------------------- entitlement is read-only
-- The client can read premium_until; writing it is not in the column grants.
select tests.authenticate_as('00000000-0000-0000-0000-000000000301');
select throws_ok(
  $$update public.profiles set premium_until = now() + interval '10 years'
     where id = '00000000-0000-0000-0000-000000000301'$$,
  '42501',
  null,
  'no member can grant themselves premium'
);

select tests.clear_auth();
select * from finish();
rollback;
