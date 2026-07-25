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
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
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
create or replace function tests.create_member(
  p_email     text,
  p_id        uuid default null,
  p_name      text default null,
  p_birthdate date default null
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
  return v_id;
end;
$$;

-- A hotel at a given point, created through the same provider entry point a
-- real feed would use.
create or replace function tests.create_hotel(
  p_name      text,
  p_latitude  double precision,
  p_longitude double precision,
  p_city      text default 'Istanbul'
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.upsert_hotel_from_provider(
    'test', p_name, p_name, p_city, 'Turkiye', p_latitude, p_longitude);
$$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;
