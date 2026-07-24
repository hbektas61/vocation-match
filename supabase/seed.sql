-- Local and staging seed data. Never run against production.
--
-- Hotels only. There are no seeded users on purpose: accounts come from real
-- sign-ups so the auth path is exercised rather than faked, and a seeded
-- password would be a committed credential.
--
--   docker exec -i vocation_db_test psql -U postgres -d postgres < supabase/seed.sql
-- or, once the Supabase CLI is installed, `supabase db reset` picks it up.

select public.upsert_hotel_from_provider(
  'seed', 'lara-shore', 'Lara Shore Resort', 'Antalya', 'Turkiye',
  36.8531, 30.7995, 'Lara Caddesi');

select public.upsert_hotel_from_provider(
  'seed', 'bosphorus-garden', 'Bosphorus Garden Hotel', 'Istanbul', 'Turkiye',
  41.0433, 29.0031, 'Kurucesme');

select public.upsert_hotel_from_provider(
  'seed', 'cesme-breeze', 'Cesme Breeze Club', 'Izmir', 'Turkiye',
  38.3228, 26.3067, 'Ilica');

select public.upsert_hotel_from_provider(
  'seed', 'kas-blue', 'Kas Blue Bay Suites', 'Antalya', 'Turkiye',
  36.2007, 29.6394, 'Cukurbag');

select public.upsert_hotel_from_provider(
  'seed', 'cappadocia-stone', 'Cappadocia Stone House', 'Nevsehir', 'Turkiye',
  38.6431, 34.8289, 'Goreme');
