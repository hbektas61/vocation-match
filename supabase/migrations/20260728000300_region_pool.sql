-- Vacation Match — D-038: the region pool.
--
-- The owner's cold-start rule (2026-07-28), replacing the rejected invite
-- mechanic: a room should not feel dead just because the pool is sliced
-- venue-by-venue. Holiday social life happens at the scale of the town, so
-- when your own venue's room runs thin — fewer than five unswiped people —
-- the deck continues with real people anchored at venues within 15 km,
-- each card honestly labelled with their venue's name. Nothing else moves:
-- one active venue per person, D-035 date overlap holds across the region,
-- Here Now still needs premium and a fresh in-range check at their own
-- venue, and no coordinate or distance is ever exposed — the only new
-- disclosure is the venue name on the card, which is the point of the label.
--
-- The five-person gate is deliberately about *unswiped* people: a fresh
-- room with ten locals shows only locals, and the region arrives exactly
-- when the local deck is running out, with no separate "expanded" state for
-- the client to manage.

create or replace function app.region_radius_meters()
returns integer language sql immutable set search_path = '' as $$ select 15000; $$;

comment on function app.region_radius_meters() is
  'The region pool radius (owner decision D-038). Covers a holiday town, not the next city.';

grant execute on function app.region_radius_meters() to authenticated, service_role;

-- The deck: own venue first, then the labelled region rows. Return type
-- gains the label columns, so drop-and-create.
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
  orientations text[],
  /** The other person's venue name — null on own-venue rows, where it would
      only repeat what the screen already says. */
  venue_name   text,
  same_venue   boolean
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
    with me as (
      select h.location as loc from public.hotels h where h.id = v_hotel
    ),
    -- Everyone swipeable in the whole region, each judged at their *own*
    -- venue: their eligibility, their declared dates, their room.
    pool as (
      select other.user_id as uid,
             (other.hotel_id = v_hotel) as own,
             th.name as th_name,
             p.created_at as joined_at
        from public.user_active_hotel other
        join public.profiles p on p.id = other.user_id
        join public.hotels th on th.id = other.hotel_id
        cross join me
       where other.user_id <> v_user
         and (
           other.hotel_id = v_hotel
           or extensions.st_dwithin(th.location, me.loc, app.region_radius_meters())
         )
         and p.suspended_at is null
         and p.onboarding_completed_at is not null
         and app.show_me_matches(v_show_me, p.gender_identity)
         and app.show_me_matches(p.show_me, v_gender)
         and app.room_eligible(other.user_id, other.hotel_id, p_room)
         -- D-035, unchanged in spirit and now regional in reach: in Upcoming
         -- you meet the people whose declared window crosses yours, edges
         -- inclusive, wherever in the region they are staying.
         and (
           p_room <> 'UPCOMING'
           or exists (
             select 1
               from public.upcoming_stays mine
               join public.upcoming_stays theirs
                 on theirs.user_id = other.user_id
                and theirs.hotel_id = other.hotel_id
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
    ),
    -- The gate (D-038): the region only speaks when the own-venue deck has
    -- fewer than five unswiped people left in it.
    gated as (
      select * from pool
       where pool.own
          or (select count(*) from pool p2 where p2.own) < 5
    )
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_path,
           coalesce(
             (select array_agg(pp.path order by pp.slot)
                from public.profile_photos pp
               where pp.user_id = p.id),
             case when p.photo_path is not null then array[p.photo_path]
                  else '{}'::text[] end
           ),
           p.interests,
           case when p.show_gender      then p.gender_identity else null end,
           case when p.show_orientation then p.orientations    else '{}'::text[] end,
           case when g.own then null else g.th_name end,
           g.own
      from gated g
      join public.profiles p on p.id = g.uid
     order by g.own desc, g.joined_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.discovery_feed(text, integer) from public, anon;
grant execute on function public.discovery_feed(text, integer) to authenticated, service_role;

-- The swipe endpoint has to recognise the same region the deck shows, or a
-- labelled card would refuse the like it invited. One clause moves: the
-- target may be at the caller's venue or at a venue within the region
-- radius, judged room-eligible at their own venue. Everything else —
-- allowance, replay, block folding, match rules — is unchanged.

drop function if exists public.swipe(uuid, text, text);

create function public.swipe(p_target_id uuid, p_room text, p_decision text)
returns table (matched boolean, match_id uuid, refused text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := app.require_user();
  v_hotel    uuid;
  v_match    uuid;
  v_a        uuid;
  v_b        uuid;
  v_unmatched  timestamptz;
  v_reciprocal boolean;
  v_first    record;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;
  if p_decision not in ('LIKE', 'PASS') then
    raise exception 'Unknown decision.' using errcode = '23514';
  end if;
  if p_target_id = v_user then
    raise exception 'You cannot swipe on yourself.' using errcode = '23514';
  end if;

  v_a := least(v_user, p_target_id);
  v_b := greatest(v_user, p_target_id);

  -- Already decided. Answer from what is stored and touch nothing else: this
  -- makes a retry safe (D-012) and means the answer carries no information
  -- about where the other person is right now (D-016).
  if exists (
    select 1 from public.swipes s
     where s.actor_id = v_user and s.target_id = p_target_id
  ) then
    select m.id, m.unmatched_at into v_match, v_unmatched
      from public.matches m
     where m.user_a = v_a and m.user_b = v_b;

    if v_match is not null and v_unmatched is null then
      return query select true, v_match, null::text;
    else
      return query select false, null::uuid, null::text;
    end if;
    return;
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  -- These are about the caller's own state, so they say nothing about
  -- anybody else and stay exceptions.
  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;
  if not app.room_eligible(v_user, v_hotel, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;

  -- D-036: the free allowance in Upcoming, per hotel. A new hotel starts a
  -- new allowance; Premium removes it entirely.
  if p_room = 'UPCOMING' and not app.is_premium(v_user) then
    if p_decision = 'LIKE' and (
      select count(*) from public.swipes s
       where s.actor_id = v_user
         and s.hotel_id = v_hotel
         and s.room = 'UPCOMING'
         and s.decision = 'LIKE'
    ) >= 3 then
      raise exception 'Liking more people here needs Premium.' using errcode = 'PP001';
    end if;
    if p_decision = 'PASS' and (
      select count(*) from public.swipes s
       where s.actor_id = v_user
         and s.hotel_id = v_hotel
         and s.room = 'UPCOMING'
         and s.decision = 'PASS'
    ) >= 5 then
      raise exception 'Passing more people here needs Premium.' using errcode = 'PP001';
    end if;
  end if;

  perform app.rate_limit(v_user, 'swipe', 300, interval '1 hour');

  -- The target has to actually be reachable from the caller's deck: in the
  -- same room, at the caller's venue or within the region radius of it
  -- (D-038) — so the endpoint cannot be used to like arbitrary users by id.
  --
  -- A block is folded into this same check on purpose. Answering "that person
  -- is not available" for a block and "not in this room" for everything else
  -- would tell someone they had been blocked, which is exactly what the blocks
  -- table is careful never to reveal.
  --
  -- Returned rather than raised, so the rate-limit row above survives. That is
  -- the whole point: this is the one branch whose answer depends on somebody
  -- else, so it is the one that has to be counted.
  if app.blocked_between(v_user, p_target_id)
     or not exists (
       select 1
         from public.user_active_hotel other
         join public.profiles p on p.id = other.user_id
         join public.hotels th on th.id = other.hotel_id
         join public.hotels mh on mh.id = v_hotel
        where other.user_id = p_target_id
          and p.suspended_at is null
          and (
            other.hotel_id = v_hotel
            or extensions.st_dwithin(th.location, mh.location, app.region_radius_meters())
          )
          and app.room_eligible(p_target_id, other.hotel_id, p_room)
     ) then
    return query select false, null::uuid, 'NOT_IN_ROOM'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(app.pair_lock_key(v_user, p_target_id));

  insert into public.swipes (actor_id, target_id, hotel_id, room, decision)
  values (v_user, p_target_id, v_hotel, p_room, p_decision)
  on conflict (actor_id, target_id) do nothing;

  select m.id, m.unmatched_at into v_match, v_unmatched
    from public.matches m
   where m.user_a = v_a and m.user_b = v_b;

  if v_match is not null then
    -- A pair that has been unmatched stays unmatched: it does not silently
    -- come back to life.
    if v_unmatched is null then
      return query select true, v_match, null::text;
    else
      return query select false, null::uuid, null::text;
    end if;
    return;
  end if;

  select exists (
    select 1 from public.swipes s
     where s.actor_id = p_target_id
       and s.target_id = v_user
       and s.decision = 'LIKE'
  ) into v_reciprocal;

  -- Only a like that is answered by a like makes a match. The caller's own
  -- stored decision is read back rather than trusted from the argument, so a
  -- retried PASS cannot be turned into a match.
  if v_reciprocal and exists (
    select 1 from public.swipes s
     where s.actor_id = v_user and s.target_id = p_target_id and s.decision = 'LIKE'
  ) then
    -- The pair's first swipe decides the label, not whoever closed it (S-004).
    select f.hotel_id, f.room into v_first from app.pair_first_swipe(v_a, v_b) f;

    insert into public.matches (user_a, user_b, hotel_id, room)
    values (v_a, v_b, v_first.hotel_id, v_first.room)
    on conflict on constraint matches_pair_unique do nothing
    returning id into v_match;

    if v_match is null then
      -- Another connection won the race; use the match it created. It applied
      -- the same rule to the same two rows, so the label agrees either way.
      select m.id into v_match
        from public.matches m
       where m.user_a = v_a and m.user_b = v_b;
    end if;

    return query select true, v_match, null::text;
    return;
  end if;

  return query select false, null::uuid, null::text;
end;
$$;

revoke all on function public.swipe(uuid, text, text) from public, anon;
grant execute on function public.swipe(uuid, text, text) to authenticated, service_role;
