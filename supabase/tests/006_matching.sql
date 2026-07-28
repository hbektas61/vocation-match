-- N-007 — swiping and mutual matching.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cam@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cam');
select tests.create_member('dev@example.test', '00000000-0000-0000-0000-0000000000d1', 'Dev');
-- Eve is at hotel one and never swiped on, so she is the only person left who
-- can exercise the checks a *first* swipe makes.
select tests.create_member('eve@example.test', '00000000-0000-0000-0000-0000000000e1', 'Eve');

create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one,
       -- Another city on purpose: within 15 km hotel two would be the same
       -- region (D-038), and this suite needs a truly unreachable target.
       tests.create_hotel('Ankara Palas',    39.9334, 32.8597) as two;
grant select on h to anon, authenticated;

-- Ada, Bo, Cam and Eve all declare a stay at hotel one; Dev is at hotel two.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select public.set_active_hotel((select two from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

-- ------------------------------------------------------------- one-way like
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select ok(
  not (select matched from public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE')),
  'a like on its own does not make a match'
);

select is(
  (select count(*)::int from public.matches),
  0,
  'and no match row exists yet'
);

select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Bo'),
  0,
  'someone already swiped on drops out of the deck'
);

-- --------------------------------------------------------------- idempotent
select ok(
  not (select matched from public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE')),
  'repeating the same swipe is accepted rather than failing'
);

select is(
  (select count(*)::int from public.swipes
    where actor_id = '00000000-0000-0000-0000-0000000000a1'
      and target_id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'and it does not create a second swipe row'
);

select is(
  (select decision from public.swipes
    where actor_id = '00000000-0000-0000-0000-0000000000a1'
      and target_id = '00000000-0000-0000-0000-0000000000b1'),
  'LIKE',
  'the first decision is the one that stands'
);

-- ------------------------------------------------------------- mutual like
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE')),
  'the answering like makes the match'
);

select is(
  (select count(*)::int from public.matches),
  1,
  'exactly one match row exists for the pair'
);

select ok(
  (select user_a < user_b from public.matches limit 1),
  'the pair is stored in a fixed order so (x,y) and (y,x) cannot both exist'
);

-- The same call again returns the same match instead of creating another.
select is(
  (select match_id from public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE')),
  (select id from public.matches limit 1),
  'a retried swipe returns the existing match'
);

select is(
  (select count(*)::int from public.matches),
  1,
  'and still exactly one match exists'
);

-- --------------------------------------------------------------- pass path
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select ok(
  not (select matched from public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'PASS')),
  'a pass never matches'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select ok(
  not (select matched from public.swipe('00000000-0000-0000-0000-0000000000c1', 'UPCOMING', 'LIKE')),
  'liking someone who passed does not match either'
);

-- ------------------------------------------------------------ bad requests
select throws_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE')$$,
  '23514',
  'You cannot swipe on yourself.',
  'a user cannot swipe on themselves'
);

-- Returned rather than raised, so the rate-limit row the call just wrote
-- survives the statement. A limit placed before a `raise` is not a limit.
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-0000000000d1', 'UPCOMING', 'LIKE')),
  'NOT_IN_ROOM',
  'a user in another region cannot be swiped by id'
);

-- A target with no decision stored yet: a repeat swipe deliberately answers
-- from storage without looking at rooms at all, so this has to be somebody new
-- or it would pass for the wrong reason.
select throws_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000e1', 'HERE_NOW', 'LIKE')$$,
  '42501',
  'You do not have access to this room yet.',
  'a room the caller has not unlocked cannot be swiped in'
);

-- And a decision already made is answered from storage whatever room the
-- caller claims, because one pair holds one decision and the room is not part
-- of it (D-012).
select lives_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000b1', 'HERE_NOW', 'LIKE')$$,
  'a repeat swipe is answered from what is stored, not from where either person is now'
);

select throws_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'MAYBE')$$,
  '23514',
  'Unknown decision.',
  'only LIKE and PASS are decisions'
);

-- --------------------------------------------------------------- isolation
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');

select is(
  (select count(*)::int from public.swipes),
  0,
  'a user cannot read anyone else`s swipes'
);

select is(
  (select count(*)::int from public.matches),
  0,
  'a user cannot read matches they are not part of'
);

select throws_ok(
  $$insert into public.matches (user_a, user_b, hotel_id, room)
    select '00000000-0000-0000-0000-0000000000a1',
           '00000000-0000-0000-0000-0000000000d1', one, 'UPCOMING' from h$$,
  '42501',
  null,
  'a client cannot fabricate a match'
);

select throws_ok(
  $$insert into public.swipes (actor_id, target_id, hotel_id, room, decision)
    select '00000000-0000-0000-0000-0000000000b1',
           '00000000-0000-0000-0000-0000000000d1', one, 'UPCOMING', 'LIKE' from h$$,
  '42501',
  null,
  'a client cannot write a swipe on someone else`s behalf'
);

-- ---------------------------------------------------------------- unmatch
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  format($$select public.unmatch(%L)$$, (select id from public.matches limit 1)),
  'P0002',
  'That match is not open.',
  'a stranger cannot unmatch other people'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  format($$select public.unmatch(%L)$$, (select id from public.matches limit 1)),
  'a participant can unmatch'
);

select ok(
  not (select matched from public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE')),
  'an unmatched pair does not come back to life on a repeated swipe'
);

select is(
  (select count(*)::int from public.matches where unmatched_at is null),
  0,
  'and the match stays closed'
);

select * from finish(true);
rollback;
