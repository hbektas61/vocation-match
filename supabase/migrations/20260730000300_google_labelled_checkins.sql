-- D-052: a check-in may carry a Google label, and that label is all it carries.
--
-- Feature three only. The anchor stays what D-048 made it — the caller's own
-- cell, computed here, never a provider's coordinate — and a Google pick adds
-- exactly one field beside it: the Place ID, which is the one value Google's
-- terms allow to be stored indefinitely. The name is deliberately absent from
-- this schema. It is resolved live from the Place ID by whoever is looking at
-- the screen and deduplicated in their session, so no column of ours ever
-- holds Google Content.
--
-- Rejected on the way here, and it was the assistant's proposal: matching a
-- Google pick to an Overture row by name and proximity, then storing that row.
-- Two reasons. It is fairly read as producing new content from Google Content,
-- which the terms restrict. And it does not work: one Istanbul bounding box in
-- our own Overture ingest held forty rows named "Espressolab", so a
-- name-plus-proximity match is a coin toss between branches.
--
-- An Overture or OSM pick is unaffected and keeps its catalogue row, because
-- those licences (CC0, CDLA-Permissive, Apache) permit exactly what this one
-- forbids.

alter table public.checkins
  add column google_place_id text
  constraint checkins_google_place_id_shape
    check (
      google_place_id is null
      -- Google's ids are opaque; the only safe assertions are that it is not
      -- empty and not long enough to be somebody smuggling a payload through.
      or (char_length(google_place_id) between 4 and 200)
    );

comment on column public.checkins.google_place_id is
  'D-052: a Google Place ID, the only Google field permitted to persist. The name is never stored — it is resolved live and kept in session memory.';

-- ------------------------------------------------------------- checking in
-- The same call as D-048, with an optional label. A Google pick still anchors
-- on the cell: the label says where somebody is, the cell decides who is near
-- them, and the two are deliberately independent.
create or replace function public.checkin_here(
  p_latitude        double precision,
  p_longitude       double precision,
  p_google_place_id text default null
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
  v_label   text := nullif(btrim(coalesce(p_google_place_id, '')), '');
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  if v_label is not null and char_length(v_label) not between 4 and 200 then
    raise exception 'That place reference is not usable.' using errcode = '23514';
  end if;

  perform app.rate_limit(v_user, 'checkin', 30, interval '1 hour');

  select * into v_cell from app.cell_of(p_latitude, p_longitude);

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

  insert into public.checkins as c (user_id, venue_id, google_place_id, checked_at, expires_at)
  values (v_user, v_venue, v_label, v_now, v_expires)
  on conflict (user_id) do update
     set venue_id = excluded.venue_id,
         google_place_id = excluded.google_place_id,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  return query select true, v_expires, v_venue;
end;
$$;

comment on function public.checkin_here(double precision, double precision, text) is
  'D-048/D-052: checks in to the caller''s own cell, optionally labelled by a Google Place ID.';

revoke all on function public.checkin_here(double precision, double precision, text) from public, anon;
grant execute on function public.checkin_here(double precision, double precision, text) to authenticated, service_role;

-- A catalogue pick clears any Google label: the two providers never mix on one
-- row, so a place cannot end up half Overture and half Google.
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
    return query select false, null::timestamptz;
    return;
  end if;

  v_expires := v_now + app.checkin_freshness();

  delete from public.checkins c where c.expires_at < v_now;

  insert into public.checkins as c (user_id, venue_id, google_place_id, checked_at, expires_at)
  values (v_user, p_venue, null, v_now, v_expires)
  on conflict (user_id) do update
     set venue_id = excluded.venue_id,
         google_place_id = null,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  return query select true, v_expires;
end;
$$;

revoke all on function public.record_checkin(uuid, double precision, double precision) from public, anon;
grant execute on function public.record_checkin(uuid, double precision, double precision) to authenticated, service_role;

-- --------------------------------------------------------- what I am in now
-- The label travels as an id, never as a name, and the screen resolves it.
drop function public.my_checkin();

create function public.my_checkin()
returns table (
  venue_id          uuid,
  venue_name        text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text,
  google_place_id   text,
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
         c.google_place_id,
         c.expires_at
    from public.checkins c
    join public.hotels h on h.id = c.venue_id
   where c.user_id = app.require_user()
     and c.expires_at > now();
$$;

revoke all on function public.my_checkin() from public, anon;
grant execute on function public.my_checkin() to authenticated, service_role;
