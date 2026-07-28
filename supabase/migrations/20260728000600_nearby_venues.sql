-- Vacation Match — D-039, continued: the check-in screen stops asking for
-- typing. A person about to check in is *standing somewhere*; the app's job
-- is to read the location once and offer the venues around it, Swarm-style.
-- This is the catalogue half: the places already in `hotels` within
-- check-in range of a point, nearest first. The world half (asking OSM for
-- venues around the point when the catalogue is thin) lives in the
-- `venues-nearby` edge function, exactly as text search splits between
-- `search_hotels` and `hotel-search`.
--
-- The radius is the check-in radius on purpose: everything this returns is
-- a place the caller could actually check in to from where they stand.
-- Distances are computed to order the list and are not returned.

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
           app.presence_radius_meters()
         )
   order by extensions.st_distance(
              h.location,
              extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
            )
   limit 20;
$$;

revoke all on function public.nearby_venues(double precision, double precision) from public, anon;
grant execute on function public.nearby_venues(double precision, double precision) to authenticated, service_role;
