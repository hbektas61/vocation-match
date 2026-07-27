-- Vocation Match — a real photo for a real hotel, or none at all.
--
-- The owner's rule for the new hotel card: "resim şart" — the photo is a
-- must. The honest version of that rule: a photo is shown only when it is
-- actually a photo of that hotel. OSM carries no imagery, but many hotels
-- carry a wikidata tag, and Wikidata's P18 is a curated photograph with a
-- Commons licence. The edge function resolves it at catalogue-fill time;
-- these columns are where the answer lives. No photo → the card falls back
-- to the drawing, which the designer's own layout anticipates.

alter table public.hotels
  add column photo_url text,
  add column photo_attribution text;

alter table public.hotels
  add constraint hotels_photo_url_https
    check (photo_url is null or photo_url ~ '^https://');

comment on column public.hotels.photo_url is
  'A photograph of this hotel (Wikimedia Commons via the wikidata P18 claim), '
  'or null. Never a stock image: a wrong photo is a lie about a business.';
comment on column public.hotels.photo_attribution is
  'Credit line required by the photo''s licence, shown wherever the photo is.';

-- The catalogue's readable columns are granted one by one (location is not
-- among them); the two new ones join the readable set.
grant select (photo_url, photo_attribution) on public.hotels to authenticated;

-- The provider upsert learns the two new arguments. The old signature is
-- dropped first: CREATE OR REPLACE with more parameters would leave both
-- overloads alive and every existing call ambiguous.
drop function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean);

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
  p_photo_attribution text default null
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
     photo_url, photo_attribution, cached_at)
  values
    (p_provider, p_provider_hotel_id, p_name, p_city, p_country, p_address,
     extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
     p_is_active, p_photo_url, p_photo_attribution, now())
  on conflict (provider, provider_hotel_id) do update
     set name      = excluded.name,
         city      = excluded.city,
         country   = excluded.country,
         address   = excluded.address,
         location  = excluded.location,
         is_active = excluded.is_active,
         -- A photo, once found, is not erased by a later pass that did not
         -- look for one.
         photo_url = coalesce(excluded.photo_url, h.photo_url),
         photo_attribution = coalesce(excluded.photo_attribution, h.photo_attribution),
         cached_at = now()
  returning h.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_hotel_from_provider(
  text, text, text, text, text, double precision, double precision, text, boolean, text, text)
  to service_role;

-- The search answers with the photo. Return type changes, so drop-and-create.
drop function public.search_hotels(text, integer);

create function public.search_hotels(p_query text, p_limit integer default 20)
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
security invoker
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_')
             as term
  )
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution
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
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_hotels(text, integer) from public, anon;
grant execute on function public.search_hotels(text, integer) to authenticated, service_role;
