-- Vocation Match — fix from the Phase 2 security audit.
--
-- MEDIUM. `delete_my_account()` was not the only way to delete your data. Since
-- the very first profiles migration, `authenticated` has held a table-wide
-- DELETE grant on `public.profiles` with a matching own-row policy, so any
-- client could issue `from('profiles').delete().eq('id', me)` straight over
-- PostgREST. Because everything user-owned references `profiles` on delete
-- cascade, that one statement wiped the profile, the hotel, the stay, the
-- swipes, the matches and the conversations — with no confirmation, no warning
-- about what does not come back, and no rate limit.
--
-- Worse, it left the `auth.users` row behind. The email stayed registered
-- forever and the session stayed valid, so the person was still signed in to an
-- account that now looked freshly onboarded. That is the opposite of what the
-- deletion flow promises.
--
-- Nothing needs this grant. `delete_my_account()` is SECURITY DEFINER and
-- deletes the auth row, which cascades regardless of what the caller may do to
-- `public.profiles` directly.

drop policy if exists profiles_delete_own on public.profiles;
revoke delete on table public.profiles from authenticated, anon;
