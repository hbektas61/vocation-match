-- Vocation Match — fixes from the Phase 1 independent review and security audit.
--
-- 1. MEDIUM (security). `photo_path` was a directly writable column, so a
--    client could PATCH it to any string matching the shape constraint without
--    ever uploading anything. Two consequences: the profile could point at an
--    object that does not exist, and every distinct value fired the cleanup
--    trigger, so a loop could grow `storage_cleanup_queue` without bound at no
--    cost to the caller. Writes now go through an RPC that checks the object is
--    really there and counts against a per-user limit, the same pattern every
--    other mutation in this program uses.
-- 2. LOW (security). A photo stayed visible to someone who had already swiped
--    past its owner. Nothing new became discoverable that way, but it left a
--    cheap way to keep polling "are they still checked in?" about a specific
--    person after actively dismissing them, which is the behaviour D-005
--    exists to prevent. The read now respects a swipe, exactly as
--    `discovery_feed` already did.
-- 3. Raised as an open question by the code review: a suspended account's
--    photo was still visible to people it had matched with, because only the
--    room branch checked `suspended_at`. Suspension is supposed to remove an
--    account from every room; there is no reason its face should survive that
--    in someone's inbox. The name stays — the conversation history is still
--    readable — but the photo does not.

-- ------------------------------------------------------- 2 and 3, the read
create or replace function app.may_view_photo(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    when app.blocked_between(p_viewer, p_owner) then false
    when exists (
      select 1 from public.profiles p
       where p.id = p_owner and p.suspended_at is not null
    ) then false
    else
      exists (
        select 1 from public.matches m
         where m.user_a = least(p_viewer, p_owner)
           and m.user_b = greatest(p_viewer, p_owner)
      )
      or exists (
        select 1
          from public.user_active_hotel mine
          join public.user_active_hotel theirs on theirs.hotel_id = mine.hotel_id
          join public.profiles viewer on viewer.id = p_viewer
          join (values ('UPCOMING'), ('HERE_NOW')) as r(room) on true
         where mine.user_id = p_viewer
           and theirs.user_id = p_owner
           and viewer.suspended_at is null
           -- Already decided on this person: they are out of the deck, so
           -- their photo is out of reach too. Without this, a pass leaves
           -- behind a working "is that person still here" probe.
           and not exists (
             select 1 from public.swipes s
              where s.actor_id = p_viewer and s.target_id = p_owner)
           and app.room_eligible(p_viewer, mine.hotel_id, r.room)
           and app.room_eligible(p_owner,  mine.hotel_id, r.room)
      )
  end;
$$;

revoke all on function app.may_view_photo(uuid, uuid) from public, anon;
grant execute on function app.may_view_photo(uuid, uuid) to authenticated, service_role;

-- --------------------------------------------------------- 1, the write path
-- The column stops being client-writable. Everything else about the grant is
-- restated because a bare `revoke ... (photo_path)` leaves the rest intact but
-- is easy to read as revoking more than it does.
revoke update (photo_path) on table public.profiles from authenticated;

create or replace function public.set_profile_photo(p_path text)
returns table (
  id           uuid,
  display_name text,
  birthdate    date,
  bio          text,
  photo_path   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if p_path is not null then
    -- Ownership from the caller's identity, never from the argument.
    if app.photo_owner(p_path) is distinct from v_user then
      raise exception 'That photo is not yours.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'profile-photos' and o.name = p_path
    ) then
      raise exception 'That photo was not uploaded.' using errcode = 'P0002';
    end if;
  end if;

  -- Twenty changes an hour is far more than anyone editing a profile needs,
  -- and enough to stop a loop that exists only to grow the cleanup queue.
  perform app.rate_limit(v_user, 'profile_photo', 20, interval '1 hour');

  update public.profiles p set photo_path = p_path where p.id = v_user;

  return query
    select p.id, p.display_name, p.birthdate, p.bio, p.photo_path
      from public.profiles p
     where p.id = v_user;
end;
$$;

revoke all on function public.set_profile_photo(text) from public, anon;
grant execute on function public.set_profile_photo(text) to authenticated, service_role;

comment on function public.set_profile_photo(text) is
  'The only way to change profiles.photo_path. Refuses a path the caller does '
  'not own and a path with no object behind it.';
