-- Test-only helpers. Never applied as a migration and never shipped to a
-- real project: `supabase/scripts/db-test.sh` loads this file into the
-- throwaway test database only.

create schema if not exists tests;

-- Creates a row in auth.users the way GoTrue would, so foreign keys and RLS
-- behave exactly as they do against a real Supabase project.
create or replace function tests.create_user(p_email text, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  -- A phone, confirmed, because that is what a real member is since the
  -- identity gate landed. Derived from the id so fixtures stay unique, and set
  -- here rather than in each test so the difference between "a member" and "an
  -- account with no phone" has to be stated deliberately — see 026, which
  -- creates the email-only case on purpose.
  insert into auth.users (id, instance_id, aud, role, email, phone, phone_confirmed_at, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email,
          -- Hashed over the whole id, not sliced off the front: the fixture
          -- uuids are hand-written and mostly zeros, so a prefix collides
          -- immediately.
          '+9' || lpad((abs(hashtext(v_id::text)) % 10000000000)::text, 10, '0'),
          now(), now(), now());
  return v_id;
end;
$$;

-- Switches the current transaction to the `authenticated` role carrying the
-- given user's JWT claims. SECURITY INVOKER on purpose: a definer function
-- would restore the previous role on exit.
create or replace function tests.authenticate_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text
  );
  execute 'set local role authenticated';
end;
$$;

-- Switches to the anonymous (logged-out) role.
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
  execute 'set local role anon';
end;
$$;

-- The `authenticated` role with no JWT claims: what a request carrying a token
-- the gateway accepted but that has no subject looks like.
create or replace function tests.authenticate_without_claims()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
  execute 'set local role authenticated';
end;
$$;

-- Switches to the trusted server role a moderation job would run as.
create or replace function tests.authenticate_as_service()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
  execute 'set local role service_role';
end;
$$;

-- Returns to the owning superuser role for setup/teardown work.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
end;
$$;

-- An auth user plus an adult profile: the normal starting state for a test.
--
-- Finished by default, because "a member" means somebody who got all the way
-- in. A draft is the exception and has to be asked for, which is what keeps
-- the incomplete-profile tests honest — they say what they are testing rather
-- than relying on a fixture happening to leave a column null.
create or replace function tests.create_member(
  p_email     text,
  p_id        uuid default null,
  p_name      text default null,
  p_birthdate date default null,
  p_gender    text default 'WOMAN',
  p_show_me   text default 'EVERYONE',
  p_complete  boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := tests.create_user(p_email, p_id);
begin
  insert into public.profiles (id, display_name, birthdate)
  values (v_id,
          coalesce(p_name, split_part(p_email, '@', 1)),
          coalesce(p_birthdate, (current_date - interval '30 years')::date));

  -- The identity columns are set separately and only if they exist yet.
  -- `verify-migration-replay.sh` seeds rows partway through the migration list
  -- precisely so that later migrations meet a database with data in it, which
  -- means this helper has to work on both sides of the migration that adds
  -- them. Leaving the rows without a completion mark is also what gives that
  -- migration's backfill something real to back-fill.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'gender_identity'
  ) then
    execute format(
      'update public.profiles
          set gender_identity = %L, show_me = %L, onboarding_completed_at = %s
        where id = %L',
      p_gender, p_show_me,
      case when p_complete then 'now()' else 'null' end,
      v_id);
  end if;

  -- D-036: members are premium by default here, because most suites are
  -- about presence, discovery or matching and simply need the rooms open —
  -- the entitlement gates themselves are exercised deliberately, on members
  -- made free with tests.set_premium, in 018_premium.sql. Same
  -- both-sides-of-the-migration guard as the identity columns above.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'premium_until'
  ) then
    execute format(
      'update public.profiles set premium_until = now() + interval ''1 year'' where id = %L',
      v_id);
  end if;

  return v_id;
end;
$$;

-- Flip one member's entitlement, in either direction. plpgsql on purpose:
-- helpers load before the replay harness has applied the migration that adds
-- premium_until, and a sql-language body would be checked against that older
-- schema at create time.
create or replace function tests.set_premium(p_user uuid, p_premium boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set premium_until = case when p_premium then now() + interval '1 year' end
   where id = p_user;
end;
$$;

-- A hotel at a given point, created through the same provider entry point a
-- real feed would use.
--
-- The kind is declared because D-051 made it load-bearing: `search_hotels`
-- asks for lodging, and a row whose provider never said what it was is not
-- lodging as far as that filter is concerned. The helper is called
-- `create_hotel`, so it says so — before this, every hotel it made was
-- invisible to the very search these tests assert on.
create or replace function tests.create_hotel(
  p_name       text,
  p_latitude   double precision,
  p_longitude  double precision,
  p_city       text default 'Istanbul',
  p_venue_kind text default 'hotel'
)
returns uuid
-- plpgsql rather than sql, so the body is resolved when it is *called* rather
-- than when it is created. The migration-replay harness installs these helpers
-- part-way through history, at a point where the provider boundary had fewer
-- arguments, and a `language sql` body is type-checked the moment it is
-- defined — which made merely installing the helpers fail there.
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select public.upsert_hotel_from_provider(
    'test', p_name, p_name, p_city, 'Turkiye', p_latitude, p_longitude,
    p_venue_kind => p_venue_kind)
    into v_id;
  return v_id;
end;
$$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;
