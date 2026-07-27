-- Vocation Match — D-035: the Upcoming room is scoped to your own dates.
--
-- The owner's rule (2026-07-27): everyone entering Upcoming declares stay
-- dates, so the room should not be one wide season — you meet the people
-- whose declared stay crosses yours. The overlap is inclusive at the
-- edges: a checkout day and a checkin day are the same day at the pool.
-- This closes the deliberate breadth recorded when the room was built
-- ("left broad on purpose; one where clause changes it" — this is that
-- where clause).
--
-- The headcount follows the same truth: when you have declared dates, the
-- Upcoming number counts the people you could actually meet; before you
-- declare, it counts the whole room, because there is no personal window
-- to scope it to yet.

drop function if exists public.discovery_feed(text, integer);

create function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text,
  photo_paths  text[],
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
           -- The set, in the owner's order. Coalesced for the impossible case
           -- of a primary with no set row, so the card never loses a photo it
           -- would have had before this change.
           coalesce(
             (select array_agg(pp.path order by pp.slot)
                from public.profile_photos pp
               where pp.user_id = p.id),
             case when p.photo_path is not null then array[p.photo_path]
                  else '{}'::text[] end
           ),
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
       -- D-035: the Upcoming room is personal, not a season. Everyone in it
       -- declared dates, so the deck shows only the people whose stay
       -- crosses yours — inclusive at the edges, because the day one person
       -- checks out and another checks in is a day both are at the hotel.
       and (
         p_room <> 'UPCOMING'
         or exists (
           select 1
             from public.upcoming_stays mine
             join public.upcoming_stays theirs
               on theirs.user_id = other.user_id
              and theirs.hotel_id = v_hotel
            where mine.user_id = v_user
              and mine.hotel_id = v_hotel
              and mine.start_date <= theirs.end_date
              and theirs.start_date <= mine.end_date
         )
       )
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

-- The headcount, overlap-scoped once the caller has a window of their own.
create or replace function public.hotel_room_counts()
returns table (room text, headcount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_hotel uuid;
  v_start date;
  v_end   date;
begin
  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  perform app.rate_limit(v_user, 'room_counts', 120, interval '1 hour');

  select us.start_date, us.end_date into v_start, v_end
    from public.upcoming_stays us
   where us.user_id = v_user and us.hotel_id = v_hotel;

  return query
    with population as (
      select r.room as room_key,
             count(*) filter (
               where app.room_eligible(other.user_id, v_hotel, r.room)
                 -- D-035: with a declared window, Upcoming counts only the
                 -- people whose stay crosses it.
                 and (
                   r.room <> 'UPCOMING'
                   or v_start is null
                   or exists (
                     select 1 from public.upcoming_stays theirs
                      where theirs.user_id = other.user_id
                        and theirs.hotel_id = v_hotel
                        and v_start <= theirs.end_date
                        and theirs.start_date <= v_end
                   )
                 )
             )::integer as n
        from public.user_active_hotel other
        join public.profiles p on p.id = other.user_id
        cross join (values ('UPCOMING'), ('HERE_NOW')) as r(room)
       where other.hotel_id = v_hotel
         and other.user_id <> v_user
         and p.suspended_at is null
         and p.onboarding_completed_at is not null
       group by r.room
    ),
    both_rooms as (
      select r.room as room_key, coalesce(pop.n, 0) as n
        from (values ('UPCOMING'), ('HERE_NOW')) as r(room)
        left join population pop on pop.room_key = r.room
    )
    select b.room_key,
           case when b.n >= 5 then b.n else null end
      from both_rooms b;
end;
$$;
