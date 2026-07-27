-- Vocation Match — the one Google identifier we are allowed to keep.
--
-- Google's Places terms forbid storing photo content or its URLs, but
-- explicitly allow storing place IDs indefinitely. So the catalogue keeps
-- the ID, and the photo travels a different road: `hotels.photo_url` points
-- at our own `hotel-photo` edge function, which resolves the ID to a fresh
-- image URL on every request. Nothing of Google's is ever at rest here.
alter table public.hotels
  add column google_place_id text;

comment on column public.hotels.google_place_id is
  'Google Places ID (storable indefinitely per Google''s terms). Resolved to '
  'a photo at request time by the hotel-photo edge function; the image itself '
  'is never stored.';
