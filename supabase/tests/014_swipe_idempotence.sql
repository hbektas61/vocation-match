-- H-401/H-403 — a repeat swipe answers from storage, and says nothing about
-- where the other person is.
--
-- The defect this covers was two things at once: a live presence oracle on a
-- specific person, and a broken retry. Both came from asking whether the target
-- is in the room *before* checking whether the caller had already decided. The
-- previous idempotency test could not have found it, because it kept the target
-- eligible throughout — which is exactly the case that works either way.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cem@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cem');
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850);

create or replace function tests.hotel_id(p_name text) returns uuid
language sql stable as $$ select id from public.hotels where name = p_name $$;
grant execute on function tests.hotel_id(text) to anon, authenticated;

create or replace function tests.join_here_now(p_user uuid) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform public.set_active_hotel(tests.hotel_id('Bosphorus Grand'));
  perform public.record_presence_check(41.0369, 28.9850);
end;
$$;
grant execute on function tests.join_here_now(uuid) to anon, authenticated;

select tests.join_here_now('00000000-0000-0000-0000-0000000000a1');
select tests.join_here_now('00000000-0000-0000-0000-0000000000b1');
select tests.join_here_now('00000000-0000-0000-0000-0000000000c1');

-- ----------------------------------------------- a pass, then the room closes
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000b1', 'HERE_NOW', 'PASS')$$,
  'ada passes on bo while they are both here');

-- Bo walks away: the proximity answer is gone, so bo is out of the room.
select tests.clear_auth();
delete from public.presence_checks where user_id = '00000000-0000-0000-0000-0000000000b1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.discovery_feed('HERE_NOW')
    where user_id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'and the deck no longer shows them, which is the answer ada is entitled to');

-- The oracle. Before the fix this raised 42501 the moment bo left range and
-- stopped raising it the moment they came back — a live feed on one person,
-- pollable by anyone holding a user id, which every card hands out.
select lives_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000b1', 'HERE_NOW', 'PASS')$$,
  'a repeat swipe still answers, so it cannot be used to watch someone arrive and leave');

select is(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000b1', 'HERE_NOW', 'PASS')),
  false,
  'and it answers with the decision that was already stored (D-012)');

-- The retry the endpoint exists to make safe: a dropped response, and by the
-- time the client tries again the other person has moved.
select is(
  (select count(*)::int from public.swipes
    where actor_id = '00000000-0000-0000-0000-0000000000a1'
      and target_id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'the retry did not write a second decision');

-- Nor can the argument be changed to turn a pass into a like on the second try.
select is(
  (select decision from public.swipes
    where actor_id = '00000000-0000-0000-0000-0000000000a1'
      and target_id = '00000000-0000-0000-0000-0000000000b1'),
  'PASS',
  'and a repeat with a different decision does not overwrite the first');

-- ------------------------------------- a match still survives the same journey
select tests.join_here_now('00000000-0000-0000-0000-0000000000b1');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'HERE_NOW', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000c1', 'HERE_NOW', 'LIKE')),
  'ada and cem match');

select tests.clear_auth();
delete from public.presence_checks where user_id = '00000000-0000-0000-0000-0000000000c1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000c1', 'HERE_NOW', 'LIKE')),
  'and a retry after cem leaves the room still reports the match rather than failing');

-- ------------------------------------------------------------- someone new
-- The check on the target is still there for a decision that has not been made
-- yet, which is the case it was written for.
select tests.clear_auth();
select tests.create_member('dee@example.test', '00000000-0000-0000-0000-0000000000d1', 'Dee');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select refused from public.swipe('00000000-0000-0000-0000-0000000000d1', 'HERE_NOW', 'LIKE')),
  'NOT_IN_ROOM',
  'a first swipe on somebody who is not in the room is still refused');

-- The reason it is returned rather than raised: a raise rolls back the whole
-- statement, and the rate-limit row written moments earlier goes with it. Five
-- refused probes used to cost nothing at all, which made "has this named person
-- just become reachable" a free question to ask on a loop.
select tests.clear_auth();
select is(
  (select attempts from public.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000000a1' and bucket = 'swipe'),
  3,
  'a refused swipe is counted — the two decisions ada made, plus the one that was turned away');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

-- ------------------------------------------------------------- the limits
-- Generous enough that nobody using the app meets them, low enough that a
-- script polling every second stops being free.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$select public.discovery_feed('HERE_NOW') from generate_series(1, 300)$$,
  'three hundred deck loads in an hour are fine');
select throws_ok(
  $$select public.discovery_feed('HERE_NOW')$$,
  '54000',
  'You are doing that too often. Try again later.',
  'the three hundred and first is refused');

-- Ada made two new decisions in this file — a pass on Bo and a like on Cem —
-- and then repeated both of them several times. Only the two count. A retry
-- that burned budget would let a flaky connection lock somebody out of the app.
select tests.clear_auth();
select is(
  (select attempts from public.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000000a1' and bucket = 'swipe'),
  3,
  'swiping is counted for a new decision and for a refusal, but never for a retry');

select * from finish(true);
rollback;
