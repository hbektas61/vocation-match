-- H-305, H-306 (backlog S-004) — a match's room does not depend on who swiped second.
--
-- The point of the suite is the pair of mirrored cases: the same two people,
-- the same two rooms, the swipe order reversed. Before the fix those produced
-- two different labels. One case alone would not have caught it.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cem@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cem');
select tests.create_member('dee@example.test', '00000000-0000-0000-0000-0000000000d1', 'Dee');
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850);

create or replace function tests.hotel_id(p_name text) returns uuid
language sql stable as $$ select id from public.hotels where name = p_name $$;
grant execute on function tests.hotel_id(text) to anon, authenticated;

-- Opens both rooms for a user: a declared stay and a proximity check.
create or replace function tests.join_both_rooms(p_user uuid) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform public.set_active_hotel(tests.hotel_id('Bosphorus Grand'));
  perform public.declare_upcoming_stay(current_date + 1, current_date + 4);
  perform public.record_presence_check(41.0369, 28.9850, 10);
end;
$$;
grant execute on function tests.join_both_rooms(uuid) to anon, authenticated;

create or replace function tests.match_room(p_one uuid, p_two uuid) returns text
language sql stable as $$
  select m.room from public.matches m
   where m.user_a = least(p_one, p_two) and m.user_b = greatest(p_one, p_two);
$$;
grant execute on function tests.match_room(uuid, uuid) to anon, authenticated;

select tests.join_both_rooms('00000000-0000-0000-0000-0000000000a1');
select tests.join_both_rooms('00000000-0000-0000-0000-0000000000b1');
select tests.join_both_rooms('00000000-0000-0000-0000-0000000000c1');
select tests.join_both_rooms('00000000-0000-0000-0000-0000000000d1');

-- ------------------------------------------------- ada likes bo from UPCOMING
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');

-- ... and bo answers from HERE_NOW, which is what used to decide the label.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000a1', 'HERE_NOW', 'LIKE')),
  'the pair matched');

select is(
  tests.match_room('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'),
  'UPCOMING',
  'the label is the first swipe''s room, not the second''s');

-- --------------------------------------- the same thing with the order reversed
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select public.swipe('00000000-0000-0000-0000-0000000000c1', 'HERE_NOW', 'LIKE');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000d1', 'UPCOMING', 'LIKE')),
  'the second pair matched too');

select is(
  tests.match_room('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1'),
  'HERE_NOW',
  'and here the first swipe was HERE_NOW, so that is the label — the rule does not care who closed it');

-- The whole defect, stated as one assertion: two pairs, identical rooms,
-- opposite swipe order. Before the fix both matches were labelled with the
-- *second* swiper's room and these two would have been equal.
select isnt(
  tests.match_room('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'),
  tests.match_room('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1'),
  'the label follows the pair''s own history rather than the order they happened to swipe in');

-- ------------------------------------------------------------- the hotel too
-- Read as the owning role: row level security would otherwise hide the row
-- from whichever user the previous block left authenticated as, and the
-- assertion would pass on a NULL for the wrong reason.
select tests.clear_auth();
select is(
  (select hotel_id from public.matches
    where user_a = least('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid)),
  tests.hotel_id('Bosphorus Grand'),
  'the hotel comes from the same row, so the two can never disagree');

-- ---------------------------------------------------------------- idempotence
-- A retried swipe must not relabel a match that already exists.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000a1', 'HERE_NOW', 'LIKE')),
  'a repeat swipe still reports the match');
select is(
  tests.match_room('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'),
  'UPCOMING',
  'and does not move the label');

-- ------------------------------------------------------------- the helper
select tests.clear_auth();
select is(
  (select room from app.pair_first_swipe(
     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1')),
  'UPCOMING',
  'the attribution is symmetric: the same answer whichever way the arguments arrive');

select is(
  (select count(*)::int from app.pair_first_swipe(
     '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1')),
  0,
  'and returns nothing for a pair that never swiped');

-- ------------------------------------------- seq is not a window on everyone
-- The counter is global, so a client that could read it would learn how many
-- swipes the whole service recorded between two of its own.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$select seq from public.swipes$$,
  '42501',
  null,
  'a client cannot read the insertion counter, only the columns that are about them');

select lives_ok(
  $$select actor_id, target_id, hotel_id, room, decision, created_at from public.swipes$$,
  'and can still read its own swipe rows');

-- ------------------------------------------------------------------ backfill
-- A match written the old way — labelled with the closing swipe — is corrected
-- by re-applying the same rule, which is what the migration's backfill does.
select tests.clear_auth();
update public.matches set room = 'HERE_NOW'
 where user_a = least('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid);

update public.matches m
   set room = coalesce((select f.room from app.pair_first_swipe(m.user_a, m.user_b) f), m.room);

select is(
  tests.match_room('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'),
  'UPCOMING',
  'the backfill repairs a match that was labelled the old way');

-- ------------------------------------------------------ what the client sees
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select room from public.my_matches() where other_user_id = '00000000-0000-0000-0000-0000000000b1'),
  'UPCOMING',
  'and both sides of the pair are told the same thing');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select room from public.my_matches() where other_user_id = '00000000-0000-0000-0000-0000000000a1'),
  'UPCOMING',
  'including the one who swiped second');

select * from finish(true);
rollback;
