-- Vacation Match — D-036: premium entitlement, without billing.
--
-- The owner's rules (2026-07-28): a free member in the Upcoming room may
-- send at most 3 likes and pass on at most 5 people, per hotel; the Here Now
-- room is for Premium members only. Premium removes the limits. There is no
-- purchase flow yet — `premium_until` is set by the operator (or a later
-- billing phase); the client can read it but never write it.
--
-- Everything is enforced here, on the server. The client only explains.
-- Refusals about the caller's own entitlement are raised (they reveal
-- nothing about anyone else) with the project-private SQLSTATE 'PP001',
-- which the client maps to one error kind: "this needs Premium".

alter table public.profiles
  add column premium_until timestamptz;

-- The table-wide select grant already lets a member read their own row's
-- premium_until (RLS scopes the rows). The insert/update column grants from
-- 20260726000800 deliberately do not include it: entitlement is never
-- client-writable.

create or replace function app.is_premium(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user
       and p.premium_until > now()
  );
$$;

revoke all on function app.is_premium(uuid) from public, anon, authenticated;
grant execute on function app.is_premium(uuid) to service_role;

-- ---------------------------------------------------------------- Here Now
-- Premium is part of Here Now eligibility itself, not a separate door check.
-- Because discovery_feed, hotel_room_counts, my_rooms and swipe's
-- target-in-room test all go through this one function, a lapsed
-- subscription removes a person from the room, the deck, and the count in
-- the same instant, with no path that still shows them.

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
    else false
  end;
$$;

-- The entrance is gated too: a free member's location is never taken for a
-- room they cannot enter. The raise is about the caller's own entitlement —
-- it reveals nothing about anybody else — so per H-403 it may stay an
-- exception, placed before the rate-limit like the other self-state checks.
create or replace function public.record_presence_check(
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
  v_hotel   uuid;
  v_within  boolean;
  v_now     timestamptz := now();
  v_expires timestamptz;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  if not app.is_premium(v_user) then
    raise exception 'Here Now is for Premium members.' using errcode = 'PP001';
  end if;

  -- An answer lasts 30 minutes, so a real user needs a handful of these an
  -- hour at most. The cap also blunts using repeated calls to binary-search
  -- the hotel's own position.
  perform app.rate_limit(v_user, 'presence_check', 30, interval '1 hour');

  select extensions.st_dwithin(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
           app.presence_radius_meters()
         )
    into v_within
    from public.hotels h
   where h.id = v_hotel;

  v_expires := v_now + app.presence_freshness();

  delete from public.presence_checks pc where pc.expires_at < v_now;

  insert into public.presence_checks as pc (user_id, hotel_id, within_range, checked_at, expires_at)
  values (v_user, v_hotel, v_within, v_now, v_expires)
  on conflict (user_id) do update
     set hotel_id = excluded.hotel_id,
         within_range = excluded.within_range,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  return query select v_within, v_expires;
end;
$$;

revoke all on function public.record_presence_check(double precision, double precision) from public, anon;
grant execute on function public.record_presence_check(double precision, double precision) to authenticated, service_role;

-- ------------------------------------------------------- Upcoming allowance
-- The free allowance in Upcoming: 3 likes, 5 passes, counted per hotel from
-- the swipes already stored. Counted before the rate-limit row because the
-- refusal is about the caller alone (same reasoning as the eligibility
-- raise above); the idempotent-replay branch runs first, so retrying an
-- already-stored swipe never trips the limit.

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

  -- The target has to actually be in the same room of the same hotel, so the
  -- endpoint cannot be used to like arbitrary users by id.
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
        where other.user_id = p_target_id
          and other.hotel_id = v_hotel
          and p.suspended_at is null
          and app.room_eligible(p_target_id, v_hotel, p_room)
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

-- ------------------------------------------------------------------ my_rooms
-- The Here Now card needs its own word for the free state: PREMIUM_ONLY
-- comes before TOO_FAR / NO_RECENT_CHECK, because for a free member the
-- distance story is not the true reason the door is closed.

create or replace function public.my_rooms()
returns table (room text, eligible boolean, reason text, valid_until timestamptz)
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
      select r.room, false, 'NO_ACTIVE_HOTEL'::text, null::timestamptz
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
         end::text,
         -- A stay lapses on a calendar date, not at a clock instant. A timer
         -- to the second would be false precision, so this stays null.
         null::timestamptz
  union all
  select 'HERE_NOW'::text,
         app.room_eligible(v_user, v_hotel, 'HERE_NOW'),
         case
           when app.room_eligible(v_user, v_hotel, 'HERE_NOW') then 'ELIGIBLE'
           when not app.is_premium(v_user) then 'PREMIUM_ONLY'
           when exists (select 1 from public.presence_checks pc
                         where pc.user_id = v_user
                           and pc.hotel_id = v_hotel
                           and pc.expires_at > now()
                           and not pc.within_range)
             then 'TOO_FAR'
           else 'NO_RECENT_CHECK'
         end::text,
         (select pc.expires_at
            from public.presence_checks pc
           where pc.user_id = v_user
             and pc.hotel_id = v_hotel
             and pc.within_range
             and pc.expires_at > now());
end;
$$;

revoke all on function public.my_rooms() from public, anon;
grant execute on function public.my_rooms() to authenticated, service_role;
