-- D-048: the room is geometry, not a data row.
--
-- Çevremde's promise is "the people who are here, right now", and until now
-- that promise was hostage to the catalogue: `checkins.venue_id` is a
-- required reference to a place row, so if no provider knew the spot there
-- was no row, no room, and the feature simply did not exist for whoever was
-- standing there. Every widening of the tag vocabulary shrinks that gap
-- without closing it — a concert stage in a forest, a beach nobody mapped,
-- a café that opened last week.
--
-- So the anchor of last resort stops being data and becomes arithmetic. The
-- reading is snapped to a ~200 m cell, and the cell is a catalogue row like
-- any other, written through the one provider boundary under `provider =
-- 'cell'`. It is the same idea D-039 already established — "where there is
-- no venue, the neighbourhood is the venue" — one step smaller, and
-- guaranteed: a cell can always be computed, anywhere on Earth, so
-- `checkin_here` cannot fail for want of a place.
--
-- What a cell row must never do is *speak*. Its provider key is derived from
-- coordinates, which `hotels.location` is deliberately never allowed to
-- reveal (D-005), so the name is a fixed placeholder rather than anything
-- positional, cells are excluded from the around-you list and from text
-- search, and the deck nulls their name for callers and strangers alike. A
-- cell is a place to stand in, not a place to be told about.

-- ------------------------------------------------------------ the cell grid
-- A ~200 m square, stable inside itself: the longitude step is derived from
-- the cell's *own* centre latitude, so every point in a cell agrees on which
-- cell it is in. Two people a few metres apart may still land either side of
-- a boundary — which is why the deck matches on distance (1 km) rather than
-- on cell equality, and a grid edge changes nobody's room.
create or replace function app.cell_of(
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
  v_lat_step constant double precision := 0.0018;
  v_lat_index bigint;
  v_lon_step  double precision;
  v_lon_index bigint;
begin
  v_lat_index := floor(p_latitude / v_lat_step);
  cell_latitude := (v_lat_index + 0.5) * v_lat_step;
  -- Clamped so the poles cannot divide by zero.
  v_lon_step := v_lat_step / greatest(cos(radians(cell_latitude)), 0.1);
  v_lon_index := floor(p_longitude / v_lon_step);
  cell_longitude := (v_lon_index + 0.5) * v_lon_step;
  cell_key := 'cell:' || v_lat_index::text || ':' || v_lon_index::text;
end;
$$;

comment on function app.cell_of(double precision, double precision) is
  'D-048: snaps a reading to a ~200 m cell. The key is positional and never leaves the server.';

-- A seventh kind, and the only one the client is never offered by name.
alter table public.hotels drop constraint hotels_venue_kind;
alter table public.hotels add constraint hotels_venue_kind
  check (venue_kind in ('hotel', 'cafe', 'restaurant', 'bar', 'beach', 'area', 'cell'));

-- ------------------------------------------------------- checking in nowhere
create or replace function public.checkin_here(
  p_latitude  double precision,
  p_longitude double precision
)
returns table (within_range boolean, expires_at timestamptz, venue_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_cell    record;
  v_venue   uuid;
  v_now     timestamptz := now();
  v_expires timestamptz;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  -- The same allowance as a named check-in: this is the same act.
  perform app.rate_limit(v_user, 'checkin', 30, interval '1 hour');

  select * into v_cell from app.cell_of(p_latitude, p_longitude);

  -- The placeholder name is deliberate: a cell's identity is its provider
  -- key, which is positional, and no positional value may be returned.
  v_venue := public.upsert_hotel_from_provider(
    p_provider          => 'cell',
    p_provider_hotel_id => v_cell.cell_key,
    p_name              => '(cell)',
    p_city              => '(cell)',
    p_country           => '(cell)',
    p_latitude          => v_cell.cell_latitude,
    p_longitude         => v_cell.cell_longitude,
    p_venue_kind        => 'cell'
  );

  v_expires := v_now + app.checkin_freshness();

  delete from public.checkins c where c.expires_at < v_now;

  insert into public.checkins as c (user_id, venue_id, checked_at, expires_at)
  values (v_user, v_venue, v_now, v_expires)
  on conflict (user_id) do update
     set venue_id = excluded.venue_id,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  -- Always in range: the cell is built around the reading, so there is no
  -- geometry left to fail. This is the guarantee the whole change is for.
  return query select true, v_expires, v_venue;
end;
$$;

comment on function public.checkin_here(double precision, double precision) is
  'D-048: checks in to the caller''s own cell. Cannot fail for want of a mapped place.';

revoke all on function public.checkin_here(double precision, double precision) from public, anon;
grant execute on function public.checkin_here(double precision, double precision) to authenticated, service_role;

-- ---------------------------------------------------------- what I am in now
-- A cell answers with no name: the screen says "where you are" in the
-- reader's own language rather than carrying a placeholder across the wire.
drop function public.my_checkin();

create function public.my_checkin()
returns table (
  venue_id          uuid,
  venue_name        text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text,
  expires_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.venue_id,
         case when h.venue_kind = 'cell' then null else h.name end,
         h.photo_url,
         h.photo_attribution,
         h.venue_kind,
         c.expires_at
    from public.checkins c
    join public.hotels h on h.id = c.venue_id
   where c.user_id = app.require_user()
     and c.expires_at > now();
$$;

revoke all on function public.my_checkin() from public, anon;
grant execute on function public.my_checkin() to authenticated, service_role;

-- ------------------------------------------- the list, minus the cells
create or replace function public.nearby_venues(
  p_latitude  double precision,
  p_longitude double precision
)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text
)
language sql
stable
-- Definer on purpose: `hotels.location` is deliberately not granted to
-- clients (D-005). The function *uses* the column to filter and order and
-- returns no coordinate and no distance.
security definer
set search_path = ''
as $$
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution, h.venue_kind
    from public.hotels h
   where h.is_active
     -- D-048: a cell exists to be checked into, not to be picked by name.
     and coalesce(h.venue_kind, '') <> 'cell'
     and p_latitude between -90 and 90
     and p_longitude between -180 and 180
     and extensions.st_dwithin(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
           greatest(h.checkin_radius_meters, app.presence_radius_meters())
         )
   order by extensions.st_distance(
              h.location,
              extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
            )
   limit 20;
$$;

revoke all on function public.nearby_venues(double precision, double precision) from public, anon;
grant execute on function public.nearby_venues(double precision, double precision) to authenticated, service_role;

-- ----------------------------------------- text search, minus the cells
create or replace function public.search_hotels(p_query text, p_limit integer default 20)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_')
             as term,
           regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:]]+', '', 'g')
             as squashed
  ),
  toks as (
    select t.tok, t.ord
      from q, unnest(regexp_split_to_array(q.term, '\s+')) with ordinality as t(tok, ord)
     where t.tok <> ''
  ),
  minus_last as (
    select coalesce(
             (select regexp_replace(lower(string_agg(t.tok, '' order by t.ord)),
                                    '[^[:alnum:]]+', '', 'g')
                from toks t
               where t.ord < (select max(t2.ord) from toks t2)),
             '') as squashed
  ),
  need as (
    select greatest(count(*) - 1, least(count(*), 2))::int as hits from toks
  )
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution, h.venue_kind
    from public.hotels h, q
   where h.is_active
     and coalesce(h.venue_kind, '') <> 'cell'
     and (
       q.term = ''
       or h.name ilike '%' || q.term || '%'
       or h.city ilike '%' || q.term || '%'
       or (
         q.squashed <> ''
         and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                            '[^[:alnum:]]+', '', 'g')
             like '%' || q.squashed || '%'
       )
       or (
         (select ml.squashed from minus_last ml) <> ''
         and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                            '[^[:alnum:]]+', '', 'g')
             like '%' || (select ml.squashed from minus_last ml) || '%'
       )
       or (
         select count(*)
           from toks t
          where h.name ilike '%' || t.tok || '%'
             or h.city ilike '%' || t.tok || '%'
             or coalesce(h.address, '') ilike '%' || t.tok || '%'
             or (
               regexp_replace(lower(t.tok), '[^[:alnum:]]+', '', 'g') <> ''
               and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                                  '[^[:alnum:]]+', '', 'g')
                   like '%' || regexp_replace(lower(t.tok), '[^[:alnum:]]+', '', 'g') || '%'
             )
       ) >= (select n.hits from need n)
     )
   order by
     case when h.name ilike q.term || '%' then 0 else 1 end,
     h.name,
     h.id
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_hotels(text, integer) from public, anon;
grant execute on function public.search_hotels(text, integer) to authenticated, service_role;

-- ------------------------------------- the deck, where a cell stays mute
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
             -- D-048: a cell is a coarse position, so its row never names
             -- itself to anybody — same room or not.
             case when c.venue_id = v_anchor or th.venue_kind = 'cell'
                  then null else th.name end,
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
