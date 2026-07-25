-- Vocation Match — H-401/H-402, from the pilot-hardening security audit.
--
-- The other half of the presence oracle. `swipe()` was one way to poll whether
-- a specific person is checked in near the hotel right now; asking for a signed
-- URL was the other, and a worse one — it writes nothing, leaves no swipe row,
-- and `createSignedUrls` takes an array, so a single request can probe a whole
-- watchlist at once. Nothing throttles it, and nothing can: it is a storage-API
-- call, not a table read a policy can count.
--
-- So the answer stops moving. The read used to require the *owner* to be
-- eligible for a room at that moment, which is exactly what made it track them.
-- It now requires:
--
--   * the viewer to be eligible for a room right now — their own state, which
--     tells them nothing about anybody else;
--   * the owner to have the same hotel active, not be suspended, not be
--     blocked, and not be somebody the viewer has already swiped on.
--
-- Nothing new is disclosed by dropping the live half. A path is unguessable and
-- is only ever handed out by `discovery_feed` or `my_matches` — both of which
-- already required the owner to be in the room at the moment the card was
-- shown. So the only people who can ask are people who were already shown the
-- card; what changes is that the answer no longer flickers as its subject walks
-- in and out of range.

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
           -- their photo is out of reach too.
           and not exists (
             select 1 from public.swipes s
              where s.actor_id = p_viewer and s.target_id = p_owner)
           -- Only the viewer's own eligibility. The owner's was here, and it
           -- is what turned this into a live feed on them.
           and app.room_eligible(p_viewer, mine.hotel_id, r.room)
      )
  end;
$$;

revoke all on function app.may_view_photo(uuid, uuid) from public, anon;
grant execute on function app.may_view_photo(uuid, uuid) to authenticated, service_role;

comment on function app.may_view_photo(uuid, uuid) is
  'Whether one user may see another''s photo. Deliberately does not depend on '
  'whether the owner is checked in at this moment: an answer that changed with '
  'their presence was a way to watch them (D-005).';
