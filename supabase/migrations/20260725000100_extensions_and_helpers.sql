-- Vocation Match — N-001
-- Extensions, private helper schema, and shared trigger functions.
--
-- Privilege note: this database template grants ALL privileges on every new
-- public table to `anon` and `authenticated` by default. Every migration must
-- therefore revoke explicitly and enable row level security. `000_security_baseline`
-- in supabase/tests asserts that no public table escapes this rule.

create extension if not exists postgis with schema extensions;

create schema if not exists app;
comment on schema app is
  'Private helpers. PostgREST only exposes `public`, so nothing here is reachable over the API.';

revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- Caller identity, portable across PostgREST claim conventions.
-- The local Supabase image sets `request.jwt.claim.sub`; hosted PostgREST sets
-- the JSON `request.jwt.claims`. Policies use this wrapper so both work.
create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

comment on function app.current_user_id() is
  'Authenticated user id from the request JWT, or NULL when unauthenticated.';

grant execute on function app.current_user_id() to anon, authenticated, service_role;

-- Server-side 18+ rule (backlog R-001). The client gate is advisory only;
-- this is the enforcement point.
create or replace function app.is_adult(p_birthdate date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_birthdate is not null
     and p_birthdate <= (current_date - interval '18 years')::date;
$$;

comment on function app.is_adult(date) is
  'True when the birthdate is at least 18 years before today (owner decision D-008).';

grant execute on function app.is_adult(date) to anon, authenticated, service_role;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
