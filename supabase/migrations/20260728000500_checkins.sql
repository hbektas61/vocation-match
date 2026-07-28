-- Vacation Match — D-039: "Çevremde" — venue check-ins, free for everyone.
--
-- The owner's feature (2026-07-28), shaped by the lessons of the apps that
-- did this before: you check in to a *venue* (never a coordinate — Swarm's
-- old wisdom), the check-in is verified as a one-time foreground reading
-- within the same 500 m the rooms already use, it lasts three hours, and
-- while it lasts you see — and are seen by — people checked in at venues
-- within 1 km. Mutuality is the privacy core ("Girls Around Me" died of
-- its absence): there is no way to scan a neighbourhood without standing
-- in it yourself, on the record, for the same three hours as everyone
-- you can see.
--
-- What stays true: no coordinate and no distance is ever exposed (a card
-- carries a venue name, exactly like the region pool); one row per user,
-- so there is no check-in history and no movement trail; the row expires
-- and is swept, not archived. NEARBY swipes carry no premium allowance in
-- the pilot (the feature is the free tier's heart) — the global swipe rate
-- limit still applies.

create or replace function app.nearby_radius_meters()
returns integer language sql immutable set search_path = '' as $$ select 1000; $$;

comment on function app.nearby_radius_meters() is
  'Çevremde radius (owner decision D-039): the street you would actually walk, not the town.';

create or replace function app.checkin_freshness()
returns interval language sql immutable set search_path = '' as $$ select interval '3 hours'; $$;

grant execute on function app.nearby_radius_meters() to authenticated, service_role;
grant execute on function app.checkin_freshness() to authenticated, service_role;

-- ------------------------------------------------------------------ storage
create table public.checkins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  venue_id   uuid not null references public.hotels (id) on delete restrict,
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.checkins is
  'At most one row per user (D-039): a present-tense fact, never a movement history.';

create index checkins_venue_idx on public.checkins (venue_id, expires_at);
create index checkins_expires_idx on public.checkins (expires_at);

alter table public.checkins enable row level security;
alter table public.checkins force row level security;
revoke all on table public.checkins from anon, authenticated;
grant select on table public.checkins to authenticated;

create policy checkins_select_own on public.checkins
  for select to authenticated
  using (user_id = app.current_user_id());

-- A third value for the room vocabulary, everywhere it is pinned.
alter table public.swipes drop constraint swipes_room;
alter table public.swipes add constraint swipes_room
  check (room in ('UPCOMING', 'HERE_NOW', 'NEARBY'));
alter table public.matches drop constraint matches_room;
alter table public.matches add constraint matches_room
  check (room in ('UPCOMING', 'HERE_NOW', 'NEARBY'));

-- --------------------------------------------------------------- eligibility
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
    when 'HERE_NOW' then app.is_premium(p_user) and exists (
      select 1 from public.presence_checks pc
       where pc.user_id = p_user
         and pc.hotel_id = p_hotel
         and pc.within_range
         and pc.expires_at > now()
    )
    -- D-039: a fresh check-in at that venue. No premium test — Çevremde is
    -- the free tier's room.
    when 'NEARBY' then exists (
      select 1 from public.checkins c
       where c.user_id = p_user
         and c.venue_id = p_hotel
         and c.expires_at > now()
    )
    else false
  end;
$$;

-- ------------------------------------------------------------ the endpoints
create or replace function public.record_checkin(
  p_venue     uuid,
  p_latitude  double precision,
  p_longitude double precision
)
returns table (within_range boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_within  boolean;
  v_now     timestamptz := now();
  v_expires timestamptz;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  if not exists (select 1 from public.hotels h where h.id = p_venue and h.is_active) then
    raise exception 'That place is not in the catalogue.' using errcode = 'P0002';
  end if;

  perform app.rate_limit(v_user, 'checkin', 30, interval '1 hour');

  select extensions.st_dwithin(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
           app.presence_radius_meters()
         )
    into v_within
    from public.hotels h
   where h.id = p_venue;

  if not v_within then
    -- Nothing is stored: an out-of-range attempt is an answer, not a state.
    return query select false, null::timestamptz;
    return;
  end if;

  v_expires := v_now + app.checkin_freshness();

  delete from public.checkins c where c.expires_at < v_now;

  insert into public.checkins as c (user_id, venue_id, checked_at, expires_at)
  values (v_user, p_venue, v_now, v_expires)
  on conflict (user_id) do update
     set venue_id = excluded.venue_id,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  return query select true, v_expires;
end;
$$;

revoke all on function public.record_checkin(uuid, double precision, double precision) from public, anon;
grant execute on function public.record_checkin(uuid, double precision, double precision) to authenticated, service_role;

create or replace function public.clear_checkin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.checkins c where c.user_id = app.require_user();
end;
$$;

revoke all on function public.clear_checkin() from public, anon;
grant execute on function public.clear_checkin() to authenticated, service_role;

create or replace function public.my_checkin()
returns table (venue_id uuid, venue_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.venue_id, h.name, c.expires_at
    from public.checkins c
    join public.hotels h on h.id = c.venue_id
   where c.user_id = app.require_user()
     and c.expires_at > now();
$$;

revoke all on function public.my_checkin() from public, anon;
grant execute on function public.my_checkin() to authenticated, service_role;

-- ---------------------------------------------------------------- the deck
-- Same signature and return shape; NEARBY becomes a third branch whose
-- anchor is the caller's check-in venue rather than their active hotel.
create or replace function public.discovery_feed(p_room text, p_limit integer default 20)
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
  venue_name   text,
  same_venue   boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_anchor  uuid;
  v_show_me text;
  v_gender  text;
  v_done    timestamptz;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW', 'NEARBY') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;

  select p.show_me, p.gender_identity, p.onboarding_completed_at
    into v_show_me, v_gender, v_done
    from public.profiles p where p.id = v_user;

  if v_done is null then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;

  if p_room = 'NEARBY' then
    select c.venue_id into v_anchor
      from public.checkins c
     where c.user_id = v_user and c.expires_at > now();
    if v_anchor is null then
      raise exception 'Check in somewhere first.' using errcode = 'P0002';
    end if;
  else
    select uah.hotel_id into v_anchor
      from public.user_active_hotel uah
     where uah.user_id = v_user;
    if v_anchor is null then
      raise exception 'Choose a hotel first.' using errcode = 'P0002';
    end if;
    if not app.room_eligible(v_user, v_anchor, p_room) then
      raise exception 'You do not have access to this room yet.' using errcode = '42501';
    end if;
  end if;

  perform app.rate_limit(v_user, 'discovery_feed', 300, interval '1 hour');

  if p_room = 'NEARBY' then
    -- Mutuality is structural: reaching this line required a fresh check-in,
    -- and everyone below is judged by the same present-tense rule.
    return query
      with me as (
        select h.location as loc from public.hotels h where h.id = v_anchor
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
             case when c.venue_id = v_anchor then null else th.name end,
             (c.venue_id = v_anchor)
        from public.checkins c
        join public.profiles p on p.id = c.user_id
        join public.hotels th on th.id = c.venue_id
        cross join me
       where c.user_id <> v_user
         and c.expires_at > now()
         and (
           c.venue_id = v_anchor
           or extensions.st_dwithin(th.location, me.loc, app.nearby_radius_meters())
         )
         and p.suspended_at is null
         and p.onboarding_completed_at is not null
         and app.show_me_matches(v_show_me, p.gender_identity)
         and app.show_me_matches(p.show_me, v_gender)
         and not exists (
           select 1 from public.swipes s
            where s.actor_id = v_user and s.target_id = c.user_id)
         and not app.blocked_between(v_user, c.user_id)
       order by (c.venue_id = v_anchor) desc, p.created_at, p.id
       limit least(greatest(coalesce(p_limit, 20), 1), 50);
    return;
  end if;

  return query
    with me as (
      select h.location as loc from public.hotels h where h.id = v_anchor
    ),
    pool as (
      select other.user_id as uid,
             (other.hotel_id = v_anchor) as own,
             th.name as th_name,
             p.created_at as joined_at
        from public.user_active_hotel other
        join public.profiles p on p.id = other.user_id
        join public.hotels th on th.id = other.hotel_id
        cross join me
       where other.user_id <> v_user
         and (
           other.hotel_id = v_anchor
           or extensions.st_dwithin(th.location, me.loc, app.region_radius_meters())
         )
         and p.suspended_at is null
         and p.onboarding_completed_at is not null
         and app.show_me_matches(v_show_me, p.gender_identity)
         and app.show_me_matches(p.show_me, v_gender)
         and app.room_eligible(other.user_id, other.hotel_id, p_room)
         -- D-035, regional in reach: in Upcoming you meet the people whose
         -- declared window crosses yours, edges inclusive.
         and (
           p_room <> 'UPCOMING'
           or exists (
             select 1
               from public.upcoming_stays mine
               join public.upcoming_stays theirs
                 on theirs.user_id = other.user_id
                and theirs.hotel_id = other.hotel_id
              where mine.user_id = v_user
                and mine.hotel_id = v_anchor
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

-- ------------------------------------------------------------------- swipe
-- NEARBY joins the vocabulary: the anchor is the caller's check-in venue,
-- the target must hold a fresh check-in within 1 km of it, and the D-036
-- allowance deliberately does not apply (the feature is free, the global
-- rate limit still counts). The rooms' behaviour is unchanged.
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
  if p_room not in ('UPCOMING', 'HERE_NOW', 'NEARBY') then
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

  -- These are about the caller's own state, so they say nothing about
  -- anybody else and stay exceptions.
  if p_room = 'NEARBY' then
    select c.venue_id into v_hotel
      from public.checkins c
     where c.user_id = v_user and c.expires_at > now();
    if v_hotel is null then
      raise exception 'Check in somewhere first.' using errcode = 'P0002';
    end if;
  else
    select uah.hotel_id into v_hotel
      from public.user_active_hotel uah
     where uah.user_id = v_user;
    if v_hotel is null then
      raise exception 'Choose a hotel first.' using errcode = 'P0002';
    end if;
    if not app.room_eligible(v_user, v_hotel, p_room) then
      raise exception 'You do not have access to this room yet.' using errcode = '42501';
    end if;
  end if;

  -- D-036: the free allowance in Upcoming, per hotel. A new hotel starts a
  -- new allowance; Premium removes it entirely. NEARBY is exempt (D-039).
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

  -- The target has to actually be reachable from the caller's deck, so the
  -- endpoint cannot be used to like arbitrary users by id. For the rooms
  -- that means the caller's venue or its region (D-038); for NEARBY it
  -- means a fresh check-in within 1 km of the caller's own (D-039).
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
     or (
       p_room = 'NEARBY'
       and not exists (
         select 1
           from public.checkins c
           join public.profiles p on p.id = c.user_id
           join public.hotels th on th.id = c.venue_id
           join public.hotels mh on mh.id = v_hotel
          where c.user_id = p_target_id
            and c.expires_at > now()
            and p.suspended_at is null
            and (
              c.venue_id = v_hotel
              or extensions.st_dwithin(th.location, mh.location, app.nearby_radius_meters())
            )
       )
     )
     or (
       p_room <> 'NEARBY'
       and not exists (
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
       )
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
