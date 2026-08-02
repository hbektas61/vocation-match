-- A phone-verified account, enforced by the database rather than asserted.
--
-- The Apple 1.2 argument for this product turns on one claim: every member is
-- a persistent, phone-verified, enforceable identity, which is what makes a
-- suspension mean something and what makes this not an anonymous chat app.
--
-- The database did not enforce any of it. `profiles_insert_own` asked only
-- that the row's id match the caller, so *any* session could create a profile
-- and walk into discovery — and the hosted project currently accepts email
-- sign-in, so such a session is obtainable today. The guarantee rested on the
-- client not having an email screen, which is not a guarantee at all.
--
-- Where the truth is read from matters here. `auth.jwt()` carries a phone
-- claim, and user metadata is writable by the user, so neither can be trusted
-- for this. `auth.users.phone_confirmed_at` is written by GoTrue when a code
-- is actually verified and is not reachable by any client role.

create or replace function app.current_user_has_verified_phone()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- SECURITY DEFINER because `auth.users` is not readable by `authenticated`,
  -- and deliberately so: this returns one boolean about the caller and nothing
  -- else. It takes no argument, so it cannot be asked about anybody else.
  --
  -- The caller is identified with `app.current_user_id()` rather than
  -- `auth.uid()`. Both read the same thing — the `sub` of a signed JWT, which
  -- no client can forge — but this project's accessor understands both shapes
  -- PostgREST sets the claims in, and `auth.uid()` in the published image
  -- understands only one of them. Using it here would have made this function
  -- return null under test and false for everybody, which is a gate that fails
  -- closed in the most useless possible way.
  --
  -- What is emphatically *not* taken from the JWT is the phone. That is read
  -- from auth.users below, because a phone claim and user metadata are both
  -- writable by the user they describe.
  select exists (
    select 1
      from auth.users u
     where u.id = app.current_user_id()
       and u.phone is not null
       and btrim(u.phone) <> ''
       and u.phone_confirmed_at is not null
  );
$$;

comment on function app.current_user_has_verified_phone() is
  'True when the caller proved a phone number to GoTrue. Read from auth.users, never '
  'from the JWT or user metadata, because those are writable by the user they describe.';

revoke all on function app.current_user_has_verified_phone() from public, anon;
grant execute on function app.current_user_has_verified_phone() to authenticated, service_role;

-- ------------------------------------------------------------- the gate
--
-- On INSERT only. Existing rows are not revalidated: staging carries profiles
-- that predate phone-only sign-in, and silently locking real people out of
-- accounts they already have is not a migration's decision to make. The board
-- carries the count and the cleanup plan.
--
-- UPDATE is deliberately left alone too. Somebody already inside must still be
-- able to edit their name, and — more to the point — must still be able to
-- delete their account.

drop policy if exists profiles_insert_own on public.profiles;

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (
    id = app.current_user_id()
    and app.current_user_has_verified_phone()
  );

comment on policy profiles_insert_own on public.profiles is
  'A profile may only be created by the account it belongs to, and only once that '
  'account has proved a phone number. Insert-only: existing profiles are not '
  'revalidated, and editing or deleting your own row is never gated on this.';

-- `service_role` is unaffected: it is not the `authenticated` role, so no
-- policy for `authenticated` applies to it. Moderation, the dispatcher, the
-- storage drain and every maintenance script keep working. The pgTAP helper
-- runs as a superuser and bypasses RLS entirely, which is why the tests for
-- this gate authenticate as a real user rather than using the helper.
