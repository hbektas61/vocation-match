-- V-010 (owner, 2026-07-30) — a Google venue earns a coarse region cell from
-- our own users, and from nothing else.
--
-- D-054 left a Google venue with no position of ours, which kept it out of the
-- D-038 fifteen-kilometre region pool. The owner's ruling closes that without
-- storing either forbidden coordinate: not Google's, and not anybody's raw GPS.
--
-- Instead the venue's *approximate* whereabouts is learned from the app's own
-- successful location checks. When somebody's Here Now verification places them
-- at a Google venue, the reading they consented to is snapped to a ~1.5 km cell
-- inside the same transaction and then discarded; what is kept is a cell key,
-- which is app-owned data about a public place rather than data about a person.
--
-- The rules the owner set, and where each one lives:
--
--   raw GPS used and thrown away         `record_presence_verified` takes it as
--                                        an argument and writes no column
--   Google's coordinate never stored     it never reaches this file at all
--   venue-level, app-owned only          `hotels.coarse_region_cell`
--   never on a user row or an event log  `app.venue_region_votes` holds a user
--                                        id only to enforce one vote each, and
--                                        `provider_events` is untouched
--   no cell without a good check         in-range plus an accuracy ceiling
--   one user cannot move it              primary key (venue_id, user_id),
--                                        insert-only, `do nothing` on conflict
--   later readings consolidate it        a confirmation count per cell
--   outliers are refused                 a rival cell needs two distinct users
--                                        *and* strictly more than the incumbent
--   region candidacy only                used by `discovery_feed`/`swipe`, and
--                                        by nothing else
--   never in the Here Now check          `record_presence_verified` still
--                                        measures against the resolved
--                                        coordinate, never against the cell
--   never shown, never a distance        no function returns it to a client
--
-- A Google venue with no cell yet keeps its own room exactly as it is. It is
-- simply not offered as a neighbour, which is the honest state: we do not know
-- where it is.

-- ------------------------------------------------------------------ the cell
/**
 * ~1.5 km cells. Deliberately far coarser than D-048's ~200 m check-in cell,
 * because this answers "roughly where is this venue" rather than "who is
 * standing with me", and the coarser the answer the less it can ever be.
 *
 * Same scheme as `app.cell_of` so there is one way to think about cells: a
 * latitude band, then a longitude step widened by the band's own cosine.
 */
create or replace function app.region_cell_of(
  p_latitude       double precision,
  p_longitude      double precision,
  out cell_key     text,
  out cell_latitude  double precision,
  out cell_longitude double precision
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lat_step constant double precision := 0.0135;
  v_lat_index bigint;
  v_lon_step  double precision;
  v_lon_index bigint;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    return;
  end if;
  v_lat_index := floor(p_latitude / v_lat_step);
  cell_latitude := (v_lat_index + 0.5) * v_lat_step;
  v_lon_step := v_lat_step / greatest(cos(radians(cell_latitude)), 0.1);
  v_lon_index := floor(p_longitude / v_lon_step);
  cell_longitude := (v_lon_index + 0.5) * v_lon_step;
  cell_key := 'rcell:' || v_lat_index::text || ':' || v_lon_index::text;
end;
$$;

comment on function app.region_cell_of(double precision, double precision) is
  'V-010: snaps a verified reading to a ~1.5 km cell. Positional, app-owned, and never returned to a client.';

/**
 * The cell key, back into the point at its centre.
 *
 * This exists so the region radius can be measured in PostGIS. It is a pure
 * function of the key — which is why the column below is GENERATED rather than
 * written: there is no way for a more precise coordinate to be smuggled into
 * it, because nothing writes it at all.
 */
create or replace function app.region_cell_point(p_cell_key text)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lat_step constant double precision := 0.0135;
  v_parts    text[];
  v_lat_index bigint;
  v_lon_index bigint;
  v_latitude  double precision;
  v_longitude double precision;
begin
  if p_cell_key is null then return null; end if;
  v_parts := string_to_array(p_cell_key, ':');
  if array_length(v_parts, 1) <> 3 or v_parts[1] <> 'rcell' then return null; end if;

  v_lat_index := v_parts[2]::bigint;
  v_lon_index := v_parts[3]::bigint;
  v_latitude  := (v_lat_index + 0.5) * v_lat_step;
  v_longitude := (v_lon_index + 0.5) * (v_lat_step / greatest(cos(radians(v_latitude)), 0.1));

  return extensions.st_setsrid(
           extensions.st_makepoint(v_longitude, v_latitude), 4326)::extensions.geography;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------- the column
alter table public.hotels
  add column coarse_region_cell text
    constraint hotels_region_cell_google
      check (coarse_region_cell is null or provider = 'google'),
  /**
   * Derived, never written. A generated column is the whole guarantee here:
   * the only thing that can be stored is the centre of a ~1.5 km cell, so no
   * code path — present or future — can put a real coordinate in it.
   */
  add column coarse_region_point extensions.geography(Point, 4326)
    generated always as (app.region_cell_point(coarse_region_cell)) stored;

comment on column public.hotels.coarse_region_cell is
  'V-010: a ~1.5 km cell learned from our own verified Here Now readings. Google venues only, region candidacy only, never shown and never used for the 500 m check.';

create index hotels_region_point_gix on public.hotels using gist (coarse_region_point);

-- Neither column is granted to a client. `coarse_region_point` is a
-- coordinate, and `coarse_region_cell` is one in a thin disguise.
revoke all (coarse_region_cell, coarse_region_point) on public.hotels from anon, authenticated;

-- ----------------------------------------------------------------- the votes
create table app.venue_region_votes (
  venue_id   uuid not null references public.hotels (id) on delete cascade,
  /**
   * Whose verified check this was. Held only to make "one contribution per
   * person" enforceable — it is never read back as a fact about the person,
   * and it is not a location record: the cell is on the venue, not here.
   */
  user_id    uuid not null references public.profiles (id) on delete cascade,
  cell_key   text not null,
  created_at timestamptz not null default now(),

  primary key (venue_id, user_id),
  constraint venue_region_votes_key check (cell_key like 'rcell:%')
);

comment on table app.venue_region_votes is
  'V-010: one coarse-cell contribution per person per venue, insert-only. What makes a repeated contribution unable to move a venue.';

create index venue_region_votes_tally on app.venue_region_votes (venue_id, cell_key);

alter table app.venue_region_votes enable row level security;
revoke all on table app.venue_region_votes from anon, authenticated;

/**
 * How good a reading has to be before it may say anything about a venue.
 *
 * A 500 m check can succeed on a reading accurate to a kilometre, and such a
 * reading has no business naming a 1.5 km cell. Null accuracy is refused too:
 * "we do not know how good this was" is not evidence.
 */
create or replace function app.region_accuracy_ceiling()
returns double precision language sql immutable set search_path = '' as $$ select 100.0; $$;

/**
 * Establishes or consolidates a venue's cell from the votes it has.
 *
 * The incumbent stands unless a rival is confirmed by at least two distinct
 * people *and* by strictly more of them. That is the "outliers are not
 * accepted" rule: one stray reading from a grid edge or a bad fix can never
 * move a venue, and a genuine correction can — slowly, and only in company.
 */
create or replace function app.consolidate_region_cell(p_venue uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current   text;
  v_current_n integer;
  v_rival     text;
  v_rival_n   integer;
begin
  select h.coarse_region_cell into v_current
    from public.hotels h where h.id = p_venue for update;

  select v.cell_key, count(*)::int into v_rival, v_rival_n
    from app.venue_region_votes v
   where v.venue_id = p_venue
   group by v.cell_key
   order by count(*) desc, v.cell_key
   limit 1;

  if v_rival is null then
    return;
  end if;

  if v_current is null then
    -- The first verified reading establishes it. One is enough to *start*,
    -- because until then the venue is invisible to the region pool anyway and
    -- a wrong cell is no worse than no cell.
    update public.hotels h set coarse_region_cell = v_rival where h.id = p_venue;
    return;
  end if;

  if v_rival = v_current then
    return;
  end if;

  select count(*)::int into v_current_n
    from app.venue_region_votes v
   where v.venue_id = p_venue and v.cell_key = v_current;

  if v_rival_n >= 2 and v_rival_n > v_current_n then
    update public.hotels h set coarse_region_cell = v_rival where h.id = p_venue;
  end if;
end;
$$;

revoke all on function app.consolidate_region_cell(uuid) from public, anon, authenticated;

-- --------------------------------------------- the check that feeds the cell
-- Same signature plus the accuracy the device reported, because a cell may
-- only be learned from a reading good enough to mean something.
drop function if exists public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision);

create function public.record_presence_verified(
  p_user            uuid,
  p_latitude        double precision,
  p_longitude       double precision,
  p_venue_latitude  double precision,
  p_venue_longitude double precision,
  p_accuracy_meters double precision default null
)
returns table (within_range boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hotel   uuid;
  v_within  boolean;
  v_now     timestamptz := now();
  v_expires timestamptz;
  v_cell    record;
  v_added   boolean := false;
begin
  if p_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180
     or p_venue_latitude is null or p_venue_longitude is null
     or p_venue_latitude < -90 or p_venue_latitude > 90
     or p_venue_longitude < -180 or p_venue_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = p_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  if not app.is_premium(p_user) then
    raise exception 'Here Now is for Premium members.' using errcode = 'PP001';
  end if;

  perform app.rate_limit(p_user, 'presence_check', 30, interval '1 hour');

  -- The 500 m rule, measured against the coordinate the backend resolved a
  -- moment ago (D-054). The cell below plays no part in this: an approximate
  -- venue position must never decide whether somebody is *at* the venue.
  v_within := extensions.st_dwithin(
    extensions.st_setsrid(extensions.st_makepoint(p_venue_longitude, p_venue_latitude), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    app.presence_radius_meters()
  );

  v_expires := v_now + app.presence_freshness();

  delete from public.presence_checks pc where pc.expires_at < v_now;

  insert into public.presence_checks as pc (user_id, hotel_id, within_range, checked_at, expires_at)
  values (p_user, v_hotel, v_within, v_now, v_expires)
  on conflict (user_id) do update
     set hotel_id = excluded.hotel_id,
         within_range = excluded.within_range,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  -- V-010. Only on a success, only at a Google venue, and only from a reading
  -- accurate enough to be evidence. The reading itself is consumed here: the
  -- row written holds a cell key and nothing else about where anybody was.
  if v_within
     and p_accuracy_meters is not null
     and p_accuracy_meters <= app.region_accuracy_ceiling()
     and exists (select 1 from public.hotels h where h.id = v_hotel and h.provider = 'google')
  then
    select * into v_cell from app.region_cell_of(p_latitude, p_longitude);
    if v_cell.cell_key is not null then
      -- `do nothing`: a person contributes once to a venue, ever. A second
      -- reading from the same person cannot move the cell, however many times
      -- they check in.
      insert into app.venue_region_votes (venue_id, user_id, cell_key)
      values (v_hotel, p_user, v_cell.cell_key)
      on conflict (venue_id, user_id) do nothing;
      get diagnostics v_added = row_count;
      if v_added then
        perform app.consolidate_region_cell(v_hotel);
      end if;
    end if;
  end if;

  return query select v_within, v_expires;
end;
$$;

comment on function public.record_presence_verified(uuid, double precision, double precision, double precision, double precision, double precision) is
  'D-054/V-010: the Here Now check for a venue whose coordinate we may not store, and the one place a venue''s coarse region cell can be learned.';

revoke all on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  to service_role;

-- ------------------------------------------------------- the anchor, one way
/**
 * Where a venue is, for region purposes only.
 *
 * A catalogue venue has a real coordinate; a Google venue has, at best, a
 * ~1.5 km cell. Null means "we do not know", and every region test below
 * treats that as "not a neighbour" rather than as "everywhere".
 */
create or replace function app.region_anchor(p_hotel uuid)
returns extensions.geography
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(h.location, h.coarse_region_point)
    from public.hotels h where h.id = p_hotel;
$$;

revoke all on function app.region_anchor(uuid) from public, anon, authenticated;

-- The deck learns the region anchor, and learns to hand back a Place ID
-- instead of a placeholder name.
--
-- Both functions below are the *current* definitions from
-- `20260728000500_checkins.sql`, copied verbatim and changed in exactly the
-- places listed above. Rewriting them by hand would have quietly dropped the
-- NEARBY branch and the match-attribution rules, which is the kind of
-- regression a region change has no business causing.
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
