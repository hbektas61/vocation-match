-- Vacation Match — D-039, continued: where there is no venue, the
-- neighbourhood is the venue.
--
-- The owner's report (2026-07-28): standing on an ordinary street, the
-- check-in screen listed nothing — OSM knows no named venue within 500 m of
-- most homes. The ask was "use my location directly"; the answer keeps the
-- product's oldest promise (no user coordinate is ever stored) by anchoring
-- to the *neighbourhood* instead: a named OSM area ("Alaçatı Mahallesi"),
-- with its own public centroid, wide enough that standing anywhere in it
-- checks you in. A neighbourhood name is coarser than a street — more
-- private than what was asked for, not less.
--
-- Mechanically: venues gain a per-row check-in radius. Ordinary venues keep
-- 500 m; area rows (written by the venues-nearby function from a reverse
-- lookup) carry 2000 m. Verification and the around-you list both honour it.

alter table public.hotels
  add column checkin_radius_meters integer not null default 500
  constraint hotels_checkin_radius check (checkin_radius_meters between 100 and 5000);

comment on column public.hotels.checkin_radius_meters is
  'How close a check-in must be (D-039). 500 for venues; larger for named areas like neighbourhoods.';

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
           greatest(h.checkin_radius_meters, app.presence_radius_meters())
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

-- The around-you list honours each row's own ring, so a neighbourhood
-- offers itself from anywhere inside it.
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
  photo_attribution text
)
language sql
stable
-- Definer on purpose: `hotels.location` is deliberately not granted to
-- clients (D-005). The function *uses* the column to filter and order and
-- returns no coordinate and no distance — the same posture as the presence
-- check.
security definer
set search_path = ''
as $$
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution
    from public.hotels h
   where h.is_active
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
