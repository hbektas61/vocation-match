-- Vocation Match — two findings from the independent security review of the
-- photo set and the identity fields.
--
-- Neither is a cross-user leak. Both are cases where the server trusted
-- something it did not have to.

-- 1. `reorder_profile_photos` checked that the list was the right length and
--    that every path in it belonged to the caller — but not that the paths were
--    distinct. `['A', 'A']` against a two-photo set passes both checks, and the
--    UPDATE then matches A twice and B not at all: A takes an arbitrary one of
--    the two slots and B keeps its old one, which either collides on the
--    primary key at commit or leaves the set non-contiguous. Refusing
--    duplicates is cheaper than reasoning about which.
create or replace function public.reorder_profile_photos(p_paths text[])
returns table (slot smallint, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_count integer;
begin
  perform app.rate_limit(v_user, 'profile_photo', 20, interval '1 hour');

  select count(*) into v_count from public.profile_photos pp where pp.user_id = v_user;

  if coalesce(array_length(p_paths, 1), 0) <> v_count then
    raise exception 'That is not the whole set.' using errcode = '23514';
  end if;

  -- A list that repeats a photo is not a permutation of the set, whatever its
  -- length says.
  if (select count(distinct d) from unnest(p_paths) as d) <> coalesce(array_length(p_paths, 1), 0) then
    raise exception 'That is not the whole set.' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(p_paths) as wanted(path)
     where not exists (
       select 1 from public.profile_photos pp
        where pp.user_id = v_user and pp.path = wanted.path)
  ) then
    raise exception 'That photo is not yours.' using errcode = '42501';
  end if;

  set constraints public.profile_photos_pkey deferred;

  update public.profile_photos pp
     set slot = wanted.ordinality::smallint
    from unnest(p_paths) with ordinality as wanted(path, ordinality)
   where pp.user_id = v_user and pp.path = wanted.path;

  set constraints public.profile_photos_pkey immediate;

  perform app.sync_primary_photo(v_user);
  return query select pp.slot, pp.path from public.profile_photos pp
                where pp.user_id = v_user order by pp.slot;
end;
$$;

revoke all on function public.reorder_profile_photos(text[]) from public, anon;
grant execute on function public.reorder_profile_photos(text[]) to authenticated, service_role;

-- 2. `discovery_feed` refused to *show* a draft profile but was happy to serve
--    a feed *to* one. The navigator does not let that happen, which is exactly
--    the reason to close it here: a rule enforced only on the client is a rule
--    that holds until somebody calls the RPC directly. D-024 says a draft takes
--    no part in discovery, and browsing is taking part.
create or replace function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text,
  interests    text[],
  gender       text,
  orientations text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_hotel   uuid;
  v_show_me text;
  v_gender  text;
  v_done    timestamptz;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;

  select p.show_me, p.gender_identity, p.onboarding_completed_at
    into v_show_me, v_gender, v_done
    from public.profiles p where p.id = v_user;

  if v_done is null then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
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

  perform app.rate_limit(v_user, 'discovery_feed', 300, interval '1 hour');

  return query
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_path,
           p.interests,
           case when p.show_gender      then p.gender_identity else null end,
           case when p.show_orientation then p.orientations    else '{}'::text[] end
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and p.suspended_at is null
       and p.onboarding_completed_at is not null
       and app.show_me_matches(v_show_me, p.gender_identity)
       and app.show_me_matches(p.show_me, v_gender)
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

-- 3. Add, remove and reorder all drew on one 20-an-hour bucket, inherited from
--    the single-photo path where "changing your photo" was the only thing you
--    could do. With nine slots the arithmetic stopped working: filling the grid
--    is nine calls, and every tap of a reorder arrow is another, so somebody
--    organising their photos once could be told they were doing it too often.
--
--    Split by what each actually costs. Removing keeps the tight budget,
--    because it is the one that grows the cleanup queue — which is the abuse
--    the original limit was written for. Adding is bounded by uploads the
--    bucket already limits by size. Reordering touches no storage at all.
create or replace function public.add_profile_photo(p_path text)
returns table (slot smallint, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_next smallint;
begin
  perform app.assert_photo_usable(v_user, p_path);
  perform app.rate_limit(v_user, 'profile_photo_add', 40, interval '1 hour');

  select coalesce(max(pp.slot), 0) + 1 into v_next
    from public.profile_photos pp where pp.user_id = v_user;

  if v_next > 9 then
    raise exception 'That is nine photos already.' using errcode = '23514';
  end if;

  insert into public.profile_photos (user_id, slot, path)
  values (v_user, v_next, p_path);

  perform app.sync_primary_photo(v_user);
  return query select pp.slot, pp.path from public.profile_photos pp
                where pp.user_id = v_user order by pp.slot;
end;
$$;

revoke all on function public.add_profile_photo(text) from public, anon;
grant execute on function public.add_profile_photo(text) to authenticated, service_role;

create or replace function public.reorder_profile_photos(p_paths text[])
returns table (slot smallint, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_count integer;
begin
  -- Generous, because a reorder writes no object and queues no cleanup: the
  -- only thing it costs is the row update.
  perform app.rate_limit(v_user, 'profile_photo_order', 200, interval '1 hour');

  select count(*) into v_count from public.profile_photos pp where pp.user_id = v_user;

  if coalesce(array_length(p_paths, 1), 0) <> v_count then
    raise exception 'That is not the whole set.' using errcode = '23514';
  end if;

  if (select count(distinct d) from unnest(p_paths) as d) <> coalesce(array_length(p_paths, 1), 0) then
    raise exception 'That is not the whole set.' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(p_paths) as wanted(path)
     where not exists (
       select 1 from public.profile_photos pp
        where pp.user_id = v_user and pp.path = wanted.path)
  ) then
    raise exception 'That photo is not yours.' using errcode = '42501';
  end if;

  set constraints public.profile_photos_pkey deferred;

  update public.profile_photos pp
     set slot = wanted.ordinality::smallint
    from unnest(p_paths) with ordinality as wanted(path, ordinality)
   where pp.user_id = v_user and pp.path = wanted.path;

  set constraints public.profile_photos_pkey immediate;

  perform app.sync_primary_photo(v_user);
  return query select pp.slot, pp.path from public.profile_photos pp
                where pp.user_id = v_user order by pp.slot;
end;
$$;

revoke all on function public.reorder_profile_photos(text[]) from public, anon;
grant execute on function public.reorder_profile_photos(text[]) to authenticated, service_role;
