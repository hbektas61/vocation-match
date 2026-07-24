-- Vocation Match — N-006
-- Room eligibility and the discovery feed.
--
-- The two rooms are independent (owner decision D-002): being near the hotel
-- is enough for HERE_NOW with no declaration, and a declaration is enough for
-- UPCOMING with no location check. Both are evaluated on the server; a client
-- cannot assert its own eligibility.

create or replace function app.room_eligible(p_user uuid, p_hotel uuid, p_room text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_room
    when 'UPCOMING' then exists (
      select 1 from public.upcoming_stays us
       where us.user_id = p_user
         and us.hotel_id = p_hotel
         and us.end_date >= current_date
    )
    when 'HERE_NOW' then exists (
      select 1 from public.presence_checks pc
       where pc.user_id = p_user
         and pc.hotel_id = p_hotel
         and pc.within_range
         and pc.expires_at > now()
    )
    else false
  end;
$$;

revoke all on function app.room_eligible(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app.room_eligible(uuid, uuid, text) to service_role;

-- What the signed-in user may enter right now, and why not when they may not.
create or replace function public.my_rooms()
returns table (room text, eligible boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_hotel uuid;
begin
  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    return query
      select r.room, false, 'NO_ACTIVE_HOTEL'::text
        from (values ('UPCOMING'), ('HERE_NOW')) as r(room);
    return;
  end if;

  return query
  select 'UPCOMING'::text,
         app.room_eligible(v_user, v_hotel, 'UPCOMING'),
         case
           when app.room_eligible(v_user, v_hotel, 'UPCOMING') then 'ELIGIBLE'
           when exists (select 1 from public.upcoming_stays us
                         where us.user_id = v_user and us.hotel_id = v_hotel)
             then 'STAY_ENDED'
           else 'NO_DECLARATION'
         end::text
  union all
  select 'HERE_NOW'::text,
         app.room_eligible(v_user, v_hotel, 'HERE_NOW'),
         case
           when app.room_eligible(v_user, v_hotel, 'HERE_NOW') then 'ELIGIBLE'
           when exists (select 1 from public.presence_checks pc
                         where pc.user_id = v_user
                           and pc.hotel_id = v_hotel
                           and pc.expires_at > now()
                           and not pc.within_range)
             then 'TOO_FAR'
           else 'NO_RECENT_CHECK'
         end::text;
end;
$$;

revoke all on function public.my_rooms() from public, anon;
grant execute on function public.my_rooms() to authenticated, service_role;

-- The people the caller may see in a room. Returns a card and nothing else:
-- no birthdate, no email, no coordinates, no distance.
--
-- Extension point: migration 20260725000700 replaces this function to also
-- exclude already-swiped and blocked users once those tables exist.
create or replace function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_url    text
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
           p.photo_url
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and app.room_eligible(other.user_id, v_hotel, p_room)
     -- Deterministic ordering keeps the tests meaningful; ranking is a later
     -- product decision, not an MVP requirement.
     order by p.created_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.discovery_feed(text, integer) from public, anon;
grant execute on function public.discovery_feed(text, integer) to authenticated, service_role;
