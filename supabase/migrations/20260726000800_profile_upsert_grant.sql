-- Vocation Match — let the first profile save actually happen.
--
-- Found by the first real onboarding against hosted Supabase, not by any
-- test: the app saves a profile with PostgREST's upsert, and on conflict
-- PostgREST writes `SET id = excluded.id, display_name = ...` — every
-- payload column, including the key. Column-level UPDATE grants without
-- `id` therefore fail the whole statement with 42501, even though nothing
-- about the row's identity changes. The container tests never saw it
-- because they speak plain INSERT and UPDATE; the shape below is asserted
-- in pgTAP now so it cannot regress silently.
--
-- Granting UPDATE on `id` is safe here and only here because the update
-- policy's `with check (id = app.current_user_id())` refuses any row whose
-- id ends up as somebody else — the only value the column can be "changed"
-- to is the one it already has.
--
-- The writable list is restated in full, as always (it has bitten the
-- project three times). `onboarding_completed_at` stays server-only.
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, display_name, bio, birthdate, interests,
              gender_identity, show_gender, orientations, show_orientation, show_me)
  on table public.profiles to authenticated;
grant update (id, display_name, bio, birthdate, interests,
              gender_identity, show_gender, orientations, show_orientation, show_me)
  on table public.profiles to authenticated;
