-- D-056 — Etkinlikler, part two: the same room engine, a fourth subject.
--
-- Nothing here is a new matching or chat system. `swipes` and `matches` gain a
-- nullable `event_id` beside a now-nullable `hotel_id`, with a check that
-- exactly one of them is set; the room vocabulary gains two values; and
-- `room_eligible`, `discovery_feed` and `swipe` gain a branch each — which is
-- precisely how `NEARBY` was added in D-039, and for the same reason.
--
-- What an event room may never do is mix. Two events at one venue are two
-- rooms; a person standing outside with a Çevremde check-in is not in the
-- concert; the region pool has no meaning here and is not reached. The event
-- branch of the deck returns early rather than sharing the venue query,
-- because sharing it is how those leaks happen.

-- ------------------------------------------------- the vocabulary, widened
alter table public.swipes drop constraint swipes_room;
alter table public.swipes add constraint swipes_room
  check (room in ('UPCOMING', 'HERE_NOW', 'NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW'));
alter table public.matches drop constraint matches_room;
alter table public.matches add constraint matches_room
  check (room in ('UPCOMING', 'HERE_NOW', 'NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW'));

-- A swipe is about exactly one subject. Making `hotel_id` nullable is safe
-- because the new constraint immediately requires the other one instead: there
-- is no state in which a row is about nothing.
alter table public.swipes  alter column hotel_id drop not null;
alter table public.matches alter column hotel_id drop not null;

alter table public.swipes
  add column event_id uuid references public.events (id) on delete cascade,
  add constraint swipes_one_subject
    check ((hotel_id is not null) <> (event_id is not null));
alter table public.matches
  add column event_id uuid references public.events (id) on delete cascade,
  add constraint matches_one_subject
    check ((hotel_id is not null) <> (event_id is not null));

comment on constraint swipes_one_subject on public.swipes is
  'D-056: a swipe happened in a hotel room or an event room, never both and never neither.';

grant select (actor_id, target_id, hotel_id, event_id, room, decision, created_at)
  on table public.swipes to authenticated;

create index swipes_event_idx on public.swipes (event_id) where event_id is not null;
create index matches_event_idx on public.matches (event_id) where event_id is not null;

-- The attribution carries the subject it actually happened in (S-004).
-- Return type changes, so it is dropped rather than replaced.
drop function if exists app.pair_first_swipe(uuid, uuid);

create function app.pair_first_swipe(p_one uuid, p_two uuid)
returns table (hotel_id uuid, event_id uuid, room text)
language sql
stable
set search_path = ''
as $$
  select s.hotel_id, s.event_id, s.room
    from public.swipes s
   where (s.actor_id = p_one  and s.target_id = p_two)
      or (s.actor_id = p_two  and s.target_id = p_one)
   order by s.seq
   limit 1;
$$;

revoke all on function app.pair_first_swipe(uuid, uuid) from public, anon, authenticated;
grant execute on function app.pair_first_swipe(uuid, uuid) to service_role;

-- ------------------------------------------------------- the live window
-- Configuration, in one place, reversible without touching a query (§8.2).
create or replace function app.event_live_early()
returns interval language sql immutable set search_path = '' as $$ select interval '120 minutes'; $$;
create or replace function app.event_live_late()
returns interval language sql immutable set search_path = '' as $$ select interval '180 minutes'; $$;
create or replace function app.event_default_duration()
returns interval language sql immutable set search_path = '' as $$ select interval '480 minutes'; $$;
create or replace function app.event_presence_ttl()
returns interval language sql immutable set search_path = '' as $$ select interval '180 minutes'; $$;
create or replace function app.event_presence_radius_meters()
returns integer language sql immutable set search_path = '' as $$ select 500; $$;

/**
 * When an event is live, in absolute time.
 *
 * The provider gives a local start and a timezone; `starts_at` is already the
 * absolute instant that pair resolves to, so the arithmetic here is plain
 * interval maths on an instant rather than a second timezone conversion —
 * which is the version that goes wrong at a DST boundary.
 *
 * Answers nothing for a date-only event. That is the point: a window we would
 * have to invent is a window we do not have (§8.2).
 */
create or replace function app.event_live_window(p_event uuid)
returns table (opens_at timestamptz, closes_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.starts_at - app.event_live_early(),
         coalesce(c.ends_at, c.starts_at + app.event_default_duration()) + app.event_live_late()
    from app.event_content c
   where c.event_id = p_event
     and c.purge_requested_at is null
     and not c.date_tbd
     and c.starts_at is not null;
$$;

revoke all on function app.event_live_window(uuid) from public, anon, authenticated;
grant execute on function app.event_live_window(uuid) to authenticated, service_role;

-- --------------------------------------------------------- the eligibility
/**
 * The event rooms' half of `app.room_eligible`.
 *
 * Kept as its own function rather than overloading the venue one, because the
 * second argument would otherwise be a uuid that points at one of two tables
 * depending on the third — which is the kind of cleverness that eventually
 * puts a hotel guest in a concert.
 *
 * `EVENT_UPCOMING` deliberately does not require fresh provider content: a
 * declaration is ours, and a provider outage must not empty a room somebody
 * already joined (§3.4, §12). Cancellation closes *new* joins, which happens
 * where joining happens.
 */
create or replace function app.event_room_eligible(p_user uuid, p_event uuid, p_room text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_room
    when 'EVENT_UPCOMING' then exists (
      select 1 from public.event_memberships m
       where m.user_id = p_user
         and m.event_id = p_event
         and m.withdrawn_at is null
    )
    when 'EVENT_HERE_NOW' then exists (
      select 1 from public.event_presence_checks pc
       where pc.user_id = p_user
         and pc.event_id = p_event
         and pc.within_range
         and pc.expires_at > now()
    )
    else false
  end
  and app.event_capability(p_user, case p_room
        when 'EVENT_UPCOMING' then 'can_join_event_upcoming'
        else 'can_join_event_here_now' end);
$$;

revoke all on function app.event_room_eligible(uuid, uuid, text) from public, anon;
grant execute on function app.event_room_eligible(uuid, uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------- the swiping
/**
 * A swipe in an event room.
 *
 * Deliberately the same shape as `app.swipe_nearby`: the caller has already
 * settled idempotency and the pair order, and this decides only "are these two
 * in the same room" before handing back to the shared machinery.
 */
create or replace function app.swipe_event(
  p_user     uuid,
  p_target   uuid,
  p_room     text,
  p_decision text,
  p_a        uuid,
  p_b        uuid
)
returns table (matched boolean, match_id uuid, refused text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_match uuid;
  v_first record;
  v_unmatched timestamptz;
begin
  select f.event_id into v_event
    from public.user_event_focus f
   where f.user_id = p_user and f.room = p_room;

  if v_event is null then
    raise exception 'Choose an event first.' using errcode = 'P0002';
  end if;
  if not app.event_room_eligible(p_user, v_event, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;

  perform app.rate_limit(p_user, 'swipe', 500, interval '1 hour');

  -- The other person must be in *this* event's room. Not the same venue, not
  -- nearby, not the hotel — the same canonical event (§5, §16.17).
  if app.blocked_between(p_user, p_target)
     or not app.event_room_eligible(p_target, v_event, p_room)
     or not exists (
       select 1 from public.profiles p
        where p.id = p_target and p.suspended_at is null
          and p.onboarding_completed_at is not null)
  then
    return query select false, null::uuid, 'NOT_IN_ROOM'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(app.pair_lock_key(p_user, p_target));

  insert into public.swipes (actor_id, target_id, event_id, room, decision)
  values (p_user, p_target, v_event, p_room, p_decision)
  on conflict (actor_id, target_id) do nothing;

  select m.id, m.unmatched_at into v_match, v_unmatched
    from public.matches m
   where m.user_a = p_a and m.user_b = p_b;

  if v_match is not null then
    return query select v_unmatched is null,
                        case when v_unmatched is null then v_match end,
                        null::text;
    return;
  end if;

  if p_decision = 'LIKE' and exists (
    select 1 from public.swipes s
     where s.actor_id = p_target and s.target_id = p_user and s.decision = 'LIKE'
  ) then
    select f.hotel_id, f.event_id, f.room into v_first from app.pair_first_swipe(p_a, p_b) f;

    insert into public.matches (user_a, user_b, hotel_id, event_id, room)
    values (p_a, p_b, v_first.hotel_id, v_first.event_id, v_first.room)
    on conflict on constraint matches_pair_unique do nothing
    returning id into v_match;

    if v_match is null then
      select m.id into v_match from public.matches m
       where m.user_a = p_a and m.user_b = p_b;
    end if;

    return query select true, v_match, null::text;
    return;
  end if;

  return query select false, null::uuid, null::text;
end;
$$;

revoke all on function app.swipe_event(uuid, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app.swipe_event(uuid, uuid, text, text, uuid, uuid) to service_role;

-- ---------------------------------------------------- the two endpoints
-- Both are the current definitions, copied verbatim from
-- `20260730001400_region_cell.sql` and changed only where the comments above
-- say. Rewriting either by hand would silently drop the NEARBY branch, the
-- region anchor or the match-attribution rule.
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
  venue_name   text,
  /**
   * V-011: the Place ID behind a *neighbour's* Google venue, so the client can
   * resolve a handful of labels per deck instead of one per render. Null on
   * own-venue rows — the screen already says where you are — and null for a
   * catalogue venue, which carries its name above.
   */
  venue_place_id text,
  same_venue   boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_anchor  uuid;
  v_event   uuid;
  v_show_me text;
  v_gender  text;
  v_done    timestamptz;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW', 'NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;

  select p.show_me, p.gender_identity, p.onboarding_completed_at
    into v_show_me, v_gender, v_done
    from public.profiles p where p.id = v_user;

  if v_done is null then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;

  -- D-056: an event deck is anchored on the event the person is *looking* at,
  -- which is a choice they made and can change without losing anything. It
  -- returns early because an event room shares no geometry with the venue
  -- rooms below — no region pool, no neighbour labels, nothing to mix.
  if p_room in ('EVENT_UPCOMING', 'EVENT_HERE_NOW') then
    select f.event_id into v_event
      from public.user_event_focus f
     where f.user_id = v_user and f.room = p_room;
    if v_event is null then
      raise exception 'Choose an event first.' using errcode = 'P0002';
    end if;
    if not app.event_room_eligible(v_user, v_event, p_room) then
      raise exception 'You do not have access to this room yet.' using errcode = '42501';
    end if;

    perform app.rate_limit(v_user, 'discovery_feed', 300, interval '1 hour');

    return query
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
             -- The event is the shared context and the screen already names
             -- it, so there is nothing to label a card with — and nothing of
             -- the provider's gets near a card either.
             null::text,
             null::text,
             true
        from public.profiles p
       where p.id <> v_user
         and p.suspended_at is null
         and p.onboarding_completed_at is not null
         and app.show_me_matches(v_show_me, p.gender_identity)
         and app.show_me_matches(p.show_me, v_gender)
         -- Same canonical event, same room, judged at their own membership.
         and app.event_room_eligible(p.id, v_event, p_room)
         and not exists (
           select 1 from public.swipes s
            where s.actor_id = v_user and s.target_id = p.id)
         and not app.blocked_between(v_user, p.id)
       order by p.created_at, p.id
       limit least(greatest(coalesce(p_limit, 20), 1), 50);
    return;
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
             null::text,
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
      -- V-010: a Google venue's region anchor is the ~1.5 km cell its own
      -- visitors taught us. Null means "we do not know", which the region
      -- test below reads as "not a neighbour" rather than "everywhere".
      select coalesce(h.location, h.coarse_region_point) as loc
        from public.hotels h where h.id = v_anchor
    ),
    pool as (
      select other.user_id as uid,
             (other.hotel_id = v_anchor) as own,
             case when th.provider = 'google' then null else th.name end as th_name,
             case when th.provider = 'google' then th.provider_hotel_id end as th_place,
             p.created_at as joined_at
        from public.user_active_hotel other
        join public.profiles p on p.id = other.user_id
        join public.hotels th on th.id = other.hotel_id
        cross join me
       where other.user_id <> v_user
         and (
           other.hotel_id = v_anchor
           or extensions.st_dwithin(
                coalesce(th.location, th.coarse_region_point),
                me.loc,
                app.region_radius_meters())
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
           case when g.own then null else g.th_place end,
           g.own
      from gated g
      join public.profiles p on p.id = g.uid
     order by g.own desc, g.joined_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.discovery_feed(text, integer) from public, anon;
grant execute on function public.discovery_feed(text, integer) to authenticated, service_role;

create or replace function public.swipe(p_target_id uuid, p_room text, p_decision text)
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
  if p_room not in ('UPCOMING', 'HERE_NOW', 'NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW') then
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
  -- D-056: an event room's subject is an event, not a venue, so it takes its
  -- own branch and its own column. Everything after the eligibility test —
  -- the advisory lock, the idempotent insert, the reciprocity rule, the match
  -- attribution — is the same code, which is the point of generalizing rather
  -- than forking.
  if p_room in ('EVENT_UPCOMING', 'EVENT_HERE_NOW') then
    return query select * from app.swipe_event(v_user, p_target_id, p_room, p_decision, v_a, v_b);
    return;
  end if;

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
            -- V-010: the swipe endpoint must recognise exactly the region
            -- the deck drew, so it reads the same anchor.
            and (
              other.hotel_id = v_hotel
              or extensions.st_dwithin(
                   coalesce(th.location, th.coarse_region_point),
                   coalesce(mh.location, mh.coarse_region_point),
                   app.region_radius_meters())
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

notify pgrst, 'reload schema';
