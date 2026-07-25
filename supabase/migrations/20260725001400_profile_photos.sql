-- Vocation Match — H-101..H-104 (backlog S-001, decision D-014)
-- Profile photos move off the open internet and into a private bucket.
--
-- The problem this closes: `profiles.photo_url` accepted any https URL, and a
-- discovery card renders without any interaction. A URL the profile owner
-- controls is therefore a passive beacon — they learn the IP address and the
-- timing of everyone who merely saw them. On an app whose whole promise is not
-- revealing who is near whom, that is the wrong default. The 2048-character cap
-- from the review was a stop-gap; this is the fix.
--
-- After this migration there is no column anywhere that accepts a URL. A photo
-- is an object in a private bucket whose path begins with the owner's user id,
-- and every read of it goes through a policy.

do $$
begin
  if to_regclass('storage.objects') is null then
    raise exception
      'storage.objects is missing. A real Supabase project has it before any '
      'migration runs; the local test harness creates it from '
      'supabase/scripts/storage-bootstrap.sql. Apply that first.';
  end if;
end;
$$;

-- --------------------------------------------------------------- the bucket
-- Private. There is no public URL for a profile photo and no anonymous read:
-- the app asks for a short-lived signed URL, and the signature is only issued
-- when the SELECT policy below says this caller may see this object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------- the path rule
-- `<owner uuid>/<random token>.<ext>`.
--
-- The first segment is what binds an object to a person, and it is what the
-- write policies compare against the caller. The second segment is random
-- rather than something derived (`avatar.jpg`, a counter) so that knowing
-- somebody's user id — which every card in a room hands out — is not enough to
-- construct the path of their photo. Guessing has to be impossible; being in
-- the room is what grants the read, not knowing the name.
create or replace function app.valid_photo_path(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9]{24,64}\.(jpg|jpeg|png|webp)$';
$$;

grant execute on function app.valid_photo_path(text) to anon, authenticated, service_role;

-- The owner of an object path, or NULL when the path is not one of ours.
create or replace function app.photo_owner(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not app.valid_photo_path(p_name) then
    return null;
  end if;
  return split_part(p_name, '/', 1)::uuid;
exception
  when others then
    return null;
end;
$$;

grant execute on function app.photo_owner(text) to anon, authenticated, service_role;

-- ------------------------------------------------------- profiles.photo_path
alter table public.profiles
  add column photo_path text;

comment on column public.profiles.photo_path is
  'Object path in the private profile-photos bucket. Never a URL: the client '
  'cannot point this at a host the profile owner controls (decision D-014).';

alter table public.profiles
  add constraint profiles_photo_path_shape
  check (photo_path is null
         or photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9]{24,64}\.(jpg|jpeg|png|webp)$');

-- The prefix has to be this row's own id. Written inline rather than through
-- `app.valid_photo_path` because a CHECK constraint may only call immutable
-- functions and must keep working if that helper is ever redefined.
alter table public.profiles
  add constraint profiles_photo_path_owned
  check (photo_path is null or split_part(photo_path, '/', 1) = id::text);

-- The URL column and both of its stop-gap constraints go away entirely. This
-- is the point of the migration: there is no longer anywhere to put a URL.
alter table public.profiles drop constraint profiles_photo_url_is_https;
alter table public.profiles drop constraint profiles_photo_url_length;
alter table public.profiles drop column photo_url;

-- Dropping a column drops its column-level grants with it, so the client's
-- writable column list is restated in full — the same reason migration
-- 20260725000700 restates it after adding `suspended_at`.
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, display_name, bio, birthdate, photo_path) on table public.profiles to authenticated;
grant update (display_name, bio, birthdate, photo_path)     on table public.profiles to authenticated;

-- --------------------------------------------------------- who may see a photo
-- Three ways, and no fourth:
--   * it is your own photo;
--   * you are matched with the owner (including a conversation that has been
--     ended — the inbox keeps that history readable, avatar included);
--   * the owner is in a room you can enter right now, at your active hotel.
--
-- A block ends all three. SECURITY DEFINER because the helpers it needs are
-- service_role-only and the tables it reads are behind row level security: a
-- viewer cannot read the owner's `user_active_hotel` row directly, and should
-- not be able to.
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
          join public.profiles owner  on owner.id  = p_owner
          join (values ('UPCOMING'), ('HERE_NOW')) as r(room) on true
         where mine.user_id = p_viewer
           and theirs.user_id = p_owner
           -- A suspended account is out of every room, in both directions.
           and viewer.suspended_at is null
           and owner.suspended_at is null
           and app.room_eligible(p_viewer, mine.hotel_id, r.room)
           and app.room_eligible(p_owner,  mine.hotel_id, r.room)
      )
  end;
$$;

-- Callable by a signed-in user because the storage policy below is evaluated
-- as that user. It is not reachable over the API: PostgREST exposes `public`
-- only, and this lives in `app`.
revoke all on function app.may_view_photo(uuid, uuid) from public, anon;
grant execute on function app.may_view_photo(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------ write policies
-- Ownership is decided from the path prefix against the caller's own id, never
-- from an argument or from `storage.objects.owner` — that column is written by
-- the storage service and a policy that trusted it would be trusting the row
-- being inserted.
create policy profile_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and app.photo_owner(name) = app.current_user_id()
  );

create policy profile_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and app.photo_owner(name) = app.current_user_id()
  )
  with check (
    bucket_id = 'profile-photos'
    and app.photo_owner(name) = app.current_user_id()
  );

create policy profile_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and app.photo_owner(name) = app.current_user_id()
  );

-- ------------------------------------------------------------- read policy
-- No policy is granted to `anon`, so a logged-out request sees nothing at all,
-- and the bucket is not public — together those are what stop a photo from
-- being a URL anyone can fetch.
create policy profile_photos_select_visible on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and app.may_view_photo(app.current_user_id(), app.photo_owner(name))
  );

-- ------------------------------------------------------------- H-104 cleanup
-- What a database can and cannot do here, stated rather than implied:
--
--   * It can drop the row in `storage.objects`, which is what makes the object
--     unreadable and unlistable immediately.
--   * It cannot remove the bytes. Those live in the object store, and only the
--     storage service can delete them. The client does that directly when it
--     replaces or removes a photo; when the client is not there to do it —
--     a crash mid-replace, or an account deletion — the work is recorded here
--     so a service-role job can finish it. Nothing pretends the bytes are gone.
create table public.storage_cleanup_queue (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text not null,
  object_name text not null,
  reason      text not null,
  queued_at   timestamptz not null default now(),
  purged_at   timestamptz,

  constraint storage_cleanup_reason check (reason in ('REPLACED', 'REMOVED', 'PROFILE_DELETED'))
);

comment on table public.storage_cleanup_queue is
  'Objects whose metadata row has been removed but whose bytes still need a '
  'storage-API delete. Read and drained by a service-role job; no client role '
  'can see it.';

create index storage_cleanup_pending_idx
  on public.storage_cleanup_queue (queued_at) where purged_at is null;

alter table public.storage_cleanup_queue enable row level security;
alter table public.storage_cleanup_queue force row level security;
revoke all on table public.storage_cleanup_queue from anon, authenticated;
grant select, update on table public.storage_cleanup_queue to service_role;

create or replace function app.queue_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_object record;
begin
  if tg_op = 'DELETE' then
    -- The profile is gone, so nobody is left to call the storage API. Drop
    -- every object under this user's prefix and record the byte-level work.
    for v_object in
      select o.name
        from storage.objects o
       where o.bucket_id = 'profile-photos'
         and app.photo_owner(o.name) = old.id
    loop
      insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
      values ('profile-photos', v_object.name, 'PROFILE_DELETED');
    end loop;

    delete from storage.objects o
     where o.bucket_id = 'profile-photos'
       and app.photo_owner(o.name) = old.id;

    return old;
  end if;

  -- Replaced or cleared. The client removes the object itself, which deletes
  -- the bytes as well; this row is the backstop for when it does not get that
  -- far, and draining it twice is harmless.
  if old.photo_path is not null and old.photo_path is distinct from new.photo_path then
    insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
    values ('profile-photos', old.photo_path,
            case when new.photo_path is null then 'REMOVED' else 'REPLACED' end);
  end if;

  return new;
end;
$$;

create trigger profiles_photo_cleanup_on_change
  after update of photo_path on public.profiles
  for each row execute function app.queue_photo_cleanup();

create trigger profiles_photo_cleanup_on_delete
  after delete on public.profiles
  for each row execute function app.queue_photo_cleanup();

-- ------------------------------------------- cards now carry a path, not a URL
-- The return type changes, so these have to be dropped and recreated rather
-- than replaced.
drop function if exists public.discovery_feed(text, integer);

create function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_hotel uuid;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  if not app.room_eligible(v_user, v_hotel, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_path
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and p.suspended_at is null
       and app.room_eligible(other.user_id, v_hotel, p_room)
       and not exists (
         select 1 from public.swipes s
          where s.actor_id = v_user and s.target_id = other.user_id)
       and not app.blocked_between(v_user, other.user_id)
     order by p.created_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.discovery_feed(text, integer) from public, anon;
grant execute on function public.discovery_feed(text, integer) to authenticated, service_role;

drop function if exists public.my_matches();

create function public.my_matches()
returns table (
  match_id          uuid,
  other_user_id     uuid,
  display_name      text,
  age               integer,
  photo_path        text,
  room              text,
  created_at        timestamptz,
  unmatched_at      timestamptz,
  last_message_at   timestamptz,
  last_message_body text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select app.require_any_user() as id)
  select m.id,
         other.id,
         other.display_name,
         app.age_years(other.birthdate),
         other.photo_path,
         m.room,
         m.created_at,
         m.unmatched_at,
         last_message.created_at,
         last_message.body
    from public.matches m
    join me on me.id = m.user_a or me.id = m.user_b
    join public.profiles other
      on other.id = case when m.user_a = me.id then m.user_b else m.user_a end
    left join lateral (
      select msg.created_at, msg.body
        from public.messages msg
       where msg.match_id = m.id
       order by msg.seq desc
       limit 1
    ) as last_message on true
   where not app.blocked_between(me.id, other.id)
   order by coalesce(last_message.created_at, m.created_at) desc, m.id;
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated, service_role;
