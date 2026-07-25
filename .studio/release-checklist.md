# Release Checklist

A box is ticked only when something reproducible proves it, and the proof is
named. Everything still unticked is unticked on purpose.

## Product

- [x] Exactly one active hotel is enforced server-side.
      *Primary key on `user_active_hotel.user_id` plus a row lock in
      `set_active_hotel`; `supabase/tests/003_active_hotel.sql` and the
      8-connection race in `supabase/tests/concurrency.sh`.*
- [x] Upcoming is clearly described as self-declared.
      *No proof column exists anywhere, and `000_security_baseline.sql` fails
      the build if one appears.*
- [x] Here Now is clearly described as proximity-based.
      *`record_presence_check` computes `ST_DWithin(..., 500)` on the server
      and returns a boolean; `supabase/tests/004_presence.sql`.*
- [x] No UI claims reservation or hotel verification.
      *Trust wording is centralised in `mobile/src/copy.ts` so all of it can be
      read in one sitting.*
- [x] Payment remains excluded until the monetization phase is opened.
      *The baseline test rejects any payment, billing, or entitlement table,
      and no such dependency is installed.*

## Safety and privacy

- [x] 18+ gate — and it is a database trigger, not a screen.
      *`profiles_enforce_adult`; `supabase/tests/001_profiles.sql` proves an
      underage insert is refused even when a client skips its own check.*
- [x] Block and report, reachable before a match as well as inside a chat.
      *`supabase/tests/007_safety.sql`. Blocking is reversible (D-011), and a
      blocked person is never told (`supabase/tests/008_chat.sql`).*
- [x] Exact coordinates and exact distance are not exposed.
      *`hotels.location` is granted to no client role, and the baseline test
      rejects any public function whose result type mentions a coordinate, a
      location, or a distance.*
- [x] No background location.
      *`ACCESS_BACKGROUND_LOCATION` is blocked in `app.json`, the expo-location
      plugin is configured foreground-only, and one file reads position.*
- [x] No location history retained.
      *One row per user in `presence_checks`, holding a boolean and an expiry.*
- [x] Withdrawing location consent actually stops sharing.
      *`clearPresenceCheck()` deletes the stored answer rather than only
      changing local state.*
- [ ] Logs and analytics contain no sensitive location, stay, profile, or
      message content. *No analytics SDK is installed, so there is nothing to
      audit yet. Recheck the moment one is added.*
- [ ] Account deletion flow exists before store submission.
      *The schema already cascades correctly; the UI does not exist.*

## Quality

- [x] Happy, empty, loading, and error states on every screen that calls the API.
- [ ] Offline and permission-denied states verified on a device.
      *Scenarios listed in `.studio/device-readiness.md`.*
- [x] Unit and integration tests pass.
      *`scripts/check.sh` — 228 pgTAP assertions plus 11 concurrency checks,
      and the mobile jest suite.*
- [x] Lint and typecheck pass. *`npx eslint . --max-warnings 0`, `npx tsc --noEmit`.*
- [x] The client and the database cannot drift apart unnoticed.
      *`node scripts/verify-api-contract.js`, itself verified against
      deliberate mismatches.*
- [ ] iOS and Android device checks. *Matrix and scenarios in
      `.studio/device-readiness.md`; needs hardware.*
- [x] Accessibility pass (backlog R-004). *Independent audit; two blockers found
      and fixed in shared components — errors were never announced on iOS, and
      chat bubbles were not accessibility nodes so the sender was never read.
      Text contrast passes 7.3:1–16.9:1; the border token was raised to 3.02:1.*
- [x] Independent code and security review. *Both delivered, both with live
      evidence against the running database. The review found one high-severity
      defect the build had missed: a suspended account could still browse and
      swipe, because the gate never looked at `suspended_at` and only the
      target's suspension was filtered. Fixed, with tests covering both what a
      suspended account can no longer do and what it must still be able to do.
      Also fixed from the review: a first-activation race, an unbounded photo
      URL, and a wrong error code for "not signed in". No critical or high
      finding remains open.*

## External actions — none taken, all owner decisions

- [ ] Production deploy explicitly approved. *No hosted project is provisioned,
      and no migration has run anywhere but a throwaway local container.*
- [ ] Store metadata reviewed by owner. *No listing exists.*
- [ ] App Store/Google Play submission explicitly approved. *No build has been
      uploaded anywhere.*
- [x] No credential is committed. *`.env` is ignored, only an empty
      `.env.example` is tracked, and the app runs on the in-memory
      implementation when no URL and key are present.*
