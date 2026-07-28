-- Vacation Match — D-041 (designer screens, 2026-07-29): a venue says what
-- kind of place it is.
--
-- The Çevremde list wears a category chip and a category icon per row —
-- Kafe, Otel, Restoran, Mahalle. The catalogue never stored that fact; the
-- providers always knew it (OSM tags, the reverse lookup's area-ness), so
-- the write boundary now carries it. Nullable on purpose: an old row whose
-- kind was never seen renders as a plain venue, not a guess.

alter table public.hotels
  add column venue_kind text
  constraint hotels_venue_kind
    check (venue_kind in ('hotel', 'cafe', 'restaurant', 'bar', 'beach', 'area'));

comment on column public.hotels.venue_kind is
  'What kind of place (D-041): hotel/cafe/restaurant/bar/beach/area, or null when the provider never said.';

grant select (venue_kind) on public.hotels to authenticated;

-- The one backfill the data can already answer: an area ring wider than the
-- venue default is, by construction, a neighbourhood anchor.
update public.hotels set venue_kind = 'area' where checkin_radius_meters > 500;

-- The provider upsert learns the argument. Old signature dropped first, so
-- no ambiguous overload survives.
drop function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean, text, text);

create function public.upsert_hotel_from_provider(
  p_provider          text,
  p_provider_hotel_id text,
  p_name              text,
  p_city              text,
  p_country           text,
  p_latitude          double precision,
  p_longitude         double precision,
  p_address           text default null,
  p_is_active         boolean default true,
  p_photo_url         text default null,
  p_photo_attribution text default null,
  p_venue_kind        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90
     or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Hotel coordinates are out of range.'
      using errcode = 'check_violation';
  end if;

  insert into public.hotels as h
    (provider, provider_hotel_id, name, city, country, address, location, is_active,
     photo_url, photo_attribution, venue_kind, cached_at)
  values
    (p_provider, p_provider_hotel_id, p_name, p_city, p_country, p_address,
     extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
     p_is_active, p_photo_url, p_photo_attribution, p_venue_kind, now())
  on conflict (provider, provider_hotel_id) do update
     set name      = excluded.name,
         city      = excluded.city,
         country   = excluded.country,
         address   = excluded.address,
         location  = excluded.location,
         is_active = excluded.is_active,
         -- A photo, once found, is not erased by a later pass that did not
         -- look for one; the same for a kind.
         photo_url = coalesce(excluded.photo_url, h.photo_url),
         photo_attribution = coalesce(excluded.photo_attribution, h.photo_attribution),
         venue_kind = coalesce(excluded.venue_kind, h.venue_kind),
         cached_at = now()
  returning h.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean, text, text, text)
  to service_role;

-- Both venue readers answer with the kind. Return types change: drop-and-create.
drop function public.search_hotels(text, integer);

create function public.search_hotels(p_query text, p_limit integer default 20)
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

drop function public.nearby_venues(double precision, double precision);

create function public.nearby_venues(
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

-- The active check-in card wears the venue's photo (designer, 2026-07-29).
-- Return type changes: drop-and-create.
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
  select c.venue_id, h.name, h.photo_url, h.photo_attribution, h.venue_kind, c.expires_at
    from public.checkins c
    join public.hotels h on h.id = c.venue_id
   where c.user_id = app.require_user()
     and c.expires_at > now();
$$;

revoke all on function public.my_checkin() from public, anon;
grant execute on function public.my_checkin() to authenticated, service_role;
