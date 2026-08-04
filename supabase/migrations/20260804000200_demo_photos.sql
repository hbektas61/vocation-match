-- Vacation Match — photos for the investor-demo pool (owner, 2026-08-04).
--
-- The demo decks worked but showed initial-letter cards, which demos nothing
-- about how the product actually feels. The photos themselves are uploaded by
-- an operator script (scripts/demo-photos.mjs) with the service key; these two
-- RPCs are the only SQL it needs — one to learn who the pool is, one to bind
-- an uploaded set to a profile the way the app's own photo endpoints would.
-- Both are service_role-only: no client can call either.

create or replace function public.demo_pool_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select du.user_id from app.demo_users du order by du.user_id;
$$;

revoke all on function public.demo_pool_ids() from public, anon, authenticated;
grant execute on function public.demo_pool_ids() to service_role;

create or replace function public.demo_set_photos(p_user uuid, p_paths text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i integer;
begin
  -- Only ever a demo account: this function must not be able to touch a
  -- real member's photo set, service key or not.
  if not exists (select 1 from app.demo_users du where du.user_id = p_user) then
    raise exception 'Not a demo account.' using errcode = '42501';
  end if;
  if p_paths is null or array_length(p_paths, 1) is null or array_length(p_paths, 1) > 9 then
    raise exception 'Between 1 and 9 paths.' using errcode = '23514';
  end if;

  delete from public.profile_photos pp where pp.user_id = p_user;
  for v_i in 1 .. array_length(p_paths, 1) loop
    insert into public.profile_photos (user_id, slot, path)
    values (p_user, v_i, p_paths[v_i]);
  end loop;
  update public.profiles set photo_path = p_paths[1], updated_at = now()
   where id = p_user;
end;
$$;

revoke all on function public.demo_set_photos(uuid, text[]) from public, anon, authenticated;
grant execute on function public.demo_set_photos(uuid, text[]) to service_role;
