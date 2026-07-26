-- Structural guards that must hold for every future migration.
-- These encode owner decisions D-005, D-006, D-008 and the project's
-- "explicitly excluded" list as executable checks.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

-- 1. Every public base table is protected by row level security.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (not c.relrowsecurity or not c.relforcerowsecurity)),
  0,
  'every public table has row level security enabled and forced'
);

-- 2. The logged-out role can touch nothing in public.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'),
  0,
  'anon holds no privileges on any public table'
);

-- 2b. Destructive writes go through a function, never a table grant. A DELETE
-- grant on `profiles` is a second way to delete an account — one that skips the
-- confirmation, skips the rate limit, and leaves the auth row behind. The
-- security audit found exactly that, and this is the guard so it cannot come
-- back with the next migration that restates a grant.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'authenticated'
      and privilege_type = 'DELETE'
      -- The three exceptions are all "take back a thing I said about myself":
      -- unblocking, withdrawing a presence answer, and cancelling a declared
      -- stay. None of them remove an account.
      and table_name not in ('blocks', 'presence_checks', 'upcoming_stays')),
  0,
  'authenticated may not DELETE any table beyond the three self-service ones — deleting an account goes through delete_my_account, which also removes the auth row'
);

-- 3. SECURITY DEFINER functions pin their search_path (no schema hijacking).
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
         where cfg like 'search_path=%')),
  0,
  'every SECURITY DEFINER function sets an explicit search_path'
);

-- 4. No reservation, identity-document, or room-number data anywhere (D-001, D-002).
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and column_name ~* '(reservation|passport|national_id|id_number|id_document|document_number|room_number|confirmation_code|booking_ref)'),
  0,
  'no reservation, ID-document, or room-number columns exist'
);

-- 5. No payment or entitlement storage before the monetization phase (D-006).
select is(
  (select count(*)::int
     from information_schema.tables
    where table_schema = 'public'
      and table_name ~* '(payment|billing|subscription|entitlement|purchase|paywall|invoice)'),
  0,
  'no payment or entitlement tables exist yet'
);

-- 5b. Phone is an authentication credential, not profile or discovery data
-- (D-019). Supabase Auth owns it; nothing in the public schema may copy it.
select is(
  (select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and column_name ~* '(phone|telephone|mobile|msisdn|subscriber)'),
  0,
  'no public table stores a phone number'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) ~* '(phone|telephone|mobile|msisdn|subscriber)'),
  0,
  'no public function returns a phone number'
);

-- 6. Coordinates live only on the public hotel catalog — never on a user row (D-005).
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and udt_name in ('geography', 'geometry')
      and table_name <> 'hotels'),
  0,
  'geography/geometry columns exist only on public.hotels'
);

select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name <> 'hotels'
      and column_name ~* '(latitude|longitude|^lat$|^lng$|^lon$|coordinate)'),
  0,
  'no user-facing table stores latitude/longitude'
);

-- 7. No API function hands a coordinate or a distance back to a caller (D-005).
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) ~* '(geography|geometry|latitude|longitude|distance|meters|location)'),
  0,
  'no public function returns coordinates, a location, or a distance'
);

-- 8. No table records a location history for a user.
select is(
  (select count(*)::int
     from information_schema.tables
    where table_schema = 'public'
      and table_name ~* '(location_history|position_history|tracking|breadcrumb)'),
  0,
  'no location-history table exists'
);

select * from finish(true);
rollback;
