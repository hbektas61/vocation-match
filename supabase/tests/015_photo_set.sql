-- H-107 — nine ordered photos, and the invariant that keeps the card honest.
--
-- The set is new; the guarantees are not. Every photo is an object in the same
-- private bucket under the same owner prefix, so what is tested here is the
-- part that is genuinely new: ordering, the derived primary, who may change
-- whose set, and that a removed object is handed to the cleanup queue rather
-- than left in a bucket nothing points at.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');

/** An uploaded object under someone's own prefix, as the client would leave it. */
create or replace function tests.upload(p_user uuid, p_token text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_path text := p_user::text || '/' || p_token || '.jpg';
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('profile-photos', v_path, p_user);
  return v_path;
end;
$$;
grant execute on function tests.upload(uuid, text) to authenticated;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

create temp table p as
select tests.upload('00000000-0000-0000-0000-0000000000a1', 'aaaa1111bbbb2222cccc3333') as one,
       tests.upload('00000000-0000-0000-0000-0000000000a1', 'dddd4444eeee5555ffff6666') as two,
       tests.upload('00000000-0000-0000-0000-0000000000a1', 'gggg7777hhhh8888iiii9999') as three;
grant select on p to authenticated;

-- ------------------------------------------------------------------ adding
select is(
  (select count(*)::int from public.add_profile_photo((select one from p))),
  1,
  'the first photo lands in the set'
);

select is(
  (select photo_path from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  (select one from p),
  'and the card''s photo is derived from slot 1 rather than set separately'
);

select public.add_profile_photo((select two from p));
select public.add_profile_photo((select three from p));

select results_eq(
  $$select slot, path from public.own_profile_photos()$$,
  $$select 1::smallint, one from p
    union all select 2::smallint, two from p
    union all select 3::smallint, three from p$$,
  'photos keep the order they were added in'
);

-- ---------------------------------------------------------------- reordering
select public.reorder_profile_photos(
  array[(select three from p), (select one from p), (select two from p)]);

select is(
  (select path from public.own_profile_photos() where slot = 1),
  (select three from p),
  'reordering moves a photo to the front'
);

select is(
  (select photo_path from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  (select three from p),
  'and the card follows it, because the primary is derived'
);

select throws_ok(
  $$select public.reorder_profile_photos(array[(select one from p)])$$,
  '23514',
  'That is not the whole set.',
  'a partial list is refused, so reordering cannot be used to delete'
);

-- Right length, wrong contents. Found by the independent security review: the
-- length and ownership checks both pass, and the update then matches one photo
-- twice and another not at all.
select throws_ok(
  $$select public.reorder_profile_photos(
      array[(select one from p), (select one from p), (select two from p)])$$,
  '23514',
  'That is not the whole set.',
  'a list that repeats a photo is refused, however long it is'
);

-- ------------------------------------------------------------------ removing
select public.remove_profile_photo(1::smallint);

select is(
  (select count(*)::int from public.own_profile_photos()),
  2,
  'removing takes one out'
);

select results_eq(
  $$select slot from public.own_profile_photos()$$,
  $$values (1::smallint), (2::smallint)$$,
  'and closes the gap, so there is never a hole to reason about'
);

-- The queue is internal and no client may read it, so this one is asked as the
-- owner role rather than as Ada.
select tests.clear_auth();
select is(
  (select count(*)::int from public.storage_cleanup_queue
    where object_name = (select three from p) and reason = 'REMOVED'),
  1,
  'the removed object is queued for deletion rather than orphaned'
);
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$select public.remove_profile_photo(9::smallint)$$,
  'removing an empty slot is not an error, so a retry is safe'
);

-- -------------------------------------------------------------------- limits
-- Fill to nine, then ask for a tenth.
select public.add_profile_photo(
  tests.upload('00000000-0000-0000-0000-0000000000a1', 'j' || lpad(g::text, 23, '0')))
  from generate_series(1, 7) as g;

select is(
  (select count(*)::int from public.own_profile_photos()),
  9,
  'nine is reachable'
);

select throws_ok(
  $$select public.add_profile_photo(
      tests.upload('00000000-0000-0000-0000-0000000000a1', 'zzzz0000zzzz0000zzzz0000'))$$,
  '23514',
  'That is nine photos already.',
  'and ten is not'
);

-- ------------------------------------------------------------- whose set it is
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from public.own_profile_photos()),
  0,
  'somebody else''s set is not visible, so the number of photos is not collectable'
);

select is(
  (select count(*)::int from public.profile_photos),
  0,
  'and the table itself answers nothing about another account'
);

select throws_ok(
  $$select public.add_profile_photo((select one from p))$$,
  '42501',
  'That photo is not yours.',
  'a path belonging to someone else is refused whoever asks'
);

select throws_ok(
  $$select public.reorder_profile_photos(array[(select one from p)])$$,
  '23514',
  'That is not the whole set.',
  'and another account''s photos cannot be reordered into your own set'
);

-- Nothing a client may write directly: the functions are the only way in.
select is(
  (select count(*)::int
     from information_schema.column_privileges
    where table_name = 'profile_photos'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'no client has a direct write on the set'
);

-- Filling the grid and then organising it is ordinary use, and used to run
-- into the single-photo upload budget (found by code review).
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.reorder_profile_photos(
      array(select path from public.own_profile_photos() order by slot desc))$$,
  'reordering a full grid repeatedly is not rate-limited like an upload'
);

select * from finish(true);
rollback;
