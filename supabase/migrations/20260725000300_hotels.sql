-- Vocation Match — N-003
-- Cached hotel catalog and the single write boundary a provider feed uses.
--
-- Privacy note (owner decision D-005): hotel coordinates are the input to the
-- proximity check and never need to reach a client. `authenticated` therefore
-- holds column-level SELECT on everything EXCEPT `location`, so even a fully
-- compromised client cannot pull venue geometry, and the distance maths stays
-- on the server.

create extension if not exists pg_trgm with schema extensions;

create table public.hotels (
  id                uuid primary key default gen_random_uuid(),
  provider          text        not null default 'manual',
  provider_hotel_id text        not null,
  name              text        not null,
  city              text        not null,
  country           text        not null,
  address           text,
  location          extensions.geography(Point, 4326) not null,
  is_active         boolean     not null default true,
  cached_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint hotels_provider_key unique (provider, provider_hotel_id),
  constraint hotels_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint hotels_city_length check (char_length(btrim(city)) between 1 and 80),
  constraint hotels_country_length check (char_length(btrim(country)) between 2 and 80)
);

comment on table public.hotels is
  'Cached venue catalog. Rows come from a provider feed through upsert_hotel_from_provider().';
comment on column public.hotels.location is
  'Server-only. Never granted to anon/authenticated and never returned by an API function.';

create index hotels_location_gix on public.hotels using gist (location);
create index hotels_name_trgm on public.hotels using gin (name extensions.gin_trgm_ops);
create index hotels_city_trgm on public.hotels using gin (city extensions.gin_trgm_ops);

create trigger hotels_set_updated_at
  before update on public.hotels
  for each row execute function app.set_updated_at();

alter table public.hotels enable row level security;
alter table public.hotels force row level security;

revoke all on table public.hotels from anon, authenticated;
grant select (id, provider, provider_hotel_id, name, city, country, address, is_active)
  on table public.hotels to authenticated;

create policy hotels_select_active on public.hotels
  for select to authenticated
  using (is_active);

-- ---------------------------------------------------------------- provider boundary
-- One entry point for the catalog. Only a trusted server-side job (service_role)
-- may call it; there is no client path that writes a hotel.
create or replace function public.upsert_hotel_from_provider(
  p_provider          text,
  p_provider_hotel_id text,
  p_name              text,
  p_city              text,
  p_country           text,
  p_latitude          double precision,
  p_longitude         double precision,
  p_address           text default null,
  p_is_active         boolean default true
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
    (provider, provider_hotel_id, name, city, country, address, location, is_active, cached_at)
  values
    (p_provider, p_provider_hotel_id, p_name, p_city, p_country, p_address,
     extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
     p_is_active, now())
  on conflict (provider, provider_hotel_id) do update
     set name      = excluded.name,
         city      = excluded.city,
         country   = excluded.country,
         address   = excluded.address,
         location  = excluded.location,
         is_active = excluded.is_active,
         cached_at = now()
  returning h.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean) from public, anon, authenticated;
grant execute on function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean) to service_role;

-- ------------------------------------------------------------------- search
-- The only hotel lookup a client needs. Returns no geometry.
create or replace function public.search_hotels(p_query text, p_limit integer default 20)
returns table (
  id      uuid,
  name    text,
  city    text,
  country text,
  address text
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- The query is a search term, not a pattern: `%` and `_` typed by a user are
  -- escaped so a single character cannot match the whole catalog.
  with q as (
    select replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_')
             as term
  )
  select h.id, h.name, h.city, h.country, h.address
    from public.hotels h, q
   where h.is_active
     and (
       q.term = ''
       or h.name ilike '%' || q.term || '%'
       or h.city ilike '%' || q.term || '%'
     )
   order by
     case when h.name ilike q.term || '%' then 0 else 1 end,
     h.name,
     h.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_hotels(text, integer) from public, anon;
grant execute on function public.search_hotels(text, integer) to authenticated, service_role;
