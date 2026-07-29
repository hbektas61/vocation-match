-- D-049: an eighth kind, and a second provider.
--
-- Two findings drove this. The first: every big Istanbul concert venue is in
-- OpenStreetMap under a tag the app refused — Volkswagen Arena is a
-- `leisure=sports_centre`, Küçükçiftlik Park a `tourism=theme_park`, the
-- açıkhavas `amenity=theatre`, Bostancı Gösteri Merkezi an
-- `amenity=arts_centre`. So "konsere gittim, mekân yok" was our answer, not
-- the map's. Places built for a crowd now join the vocabulary as `venue`,
-- one kind rather than five, because the chip's job is to tell a café from a
-- stadium and not to catalogue architecture.
--
-- The second: OSM's coverage of small commercial venues is thin where this
-- product needs it most, and the licence of the sources that have it
-- (Google, Apple) forbids the one thing the schema is built on — storing a
-- place row and joining months of matches to it. Overture Maps publishes an
-- open places dataset under CDLA-Permissive, which allows exactly that, so
-- it becomes a second provider under `provider = 'overture'`, entering
-- through the same single write boundary as everything else. Overture is a
-- bulk dataset on S3 rather than a lookup service, so it arrives by an
-- ingest run (`scripts/overture-ingest.py`) that pre-fills a region, not by
-- a per-request call. Nothing about the tables or the screens changes.

alter table public.hotels drop constraint hotels_venue_kind;
alter table public.hotels add constraint hotels_venue_kind
  check (venue_kind in (
    'hotel', 'cafe', 'restaurant', 'bar', 'beach', 'area', 'cell', 'venue'
  ));

comment on column public.hotels.venue_kind is
  'What kind of place (D-041, widened D-049). Drives the category chip and icon, never any logic.';
