-- Brings the test container's `auth.users` up to what a real project has.
-- Test harness only; never applied to a hosted project, which already has it.
--
-- The Postgres image Supabase publishes ships an `auth` schema that predates
-- GoTrue's phone support, so `phone` and `phone_confirmed_at` are missing from
-- it. A hosted project has had both for years — they are what GoTrue writes
-- when somebody verifies an SMS code, and `app.current_user_has_verified_phone()`
-- reads them because they are the only record of that fact a client cannot
-- forge.
--
-- Without this the container cannot express the difference between an account
-- that proved a phone and one that did not, which is precisely the difference
-- the identity gate is about. Same reasoning, and the same place in the run, as
-- `storage-bootstrap.sql`.

alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists phone_confirmed_at timestamptz;

-- GoTrue keeps phone numbers unique across accounts; the gate does not depend
-- on it, but a fixture that quietly reused one would not look like production.
create unique index if not exists users_phone_key
  on auth.users (phone) where phone is not null;
