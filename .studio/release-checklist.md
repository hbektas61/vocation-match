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
- [x] Account deletion flow exists before store submission.
      *`public.delete_my_account()` takes no arguments — the account comes from
      the JWT — and deletes the `auth.users` row so every cascade fires. Two
      taps in Settings, with what disappears and what does not said before the
      second one. `supabase/tests/012_account_deletion.sql` (24 assertions),
      `mobile/src/__tests__/deleteAccountUi.test.tsx`. The audit also found and
      closed a second, unguarded deletion path: a table-wide DELETE grant on
      `profiles` that wiped the same data with no confirmation and left the auth
      row behind.*
- [x] A profile photo is not a beacon.
      *Private bucket, owner-scoped path, no URL field anywhere, and EXIF
      dropped by re-encoding before upload.
      `supabase/tests/011_profile_photos.sql` (49 assertions) — the read policy
      is negative-controlled, so five of them go red if it is weakened.
      **Not verified:** that the native encoder really emits metadata-free
      bytes. That needs a GPS-tagged photo on a device (D-015).*
- [x] Email addresses are confirmed before an account can be used.
      *`enable_confirmations = true`, `scripts/verify-auth-config.js` fails the
      build if it is turned off, and the client handles the unconfirmed states
      rather than throwing on the happy path. **The hosted project keeps its
      own copy of this setting and nothing here can check it** —
      `docs/hosted-setup.md`.*
- [x] The sign-up form does not reveal who already has an account.
      *A duplicate sign-up gets the same answer as a fresh one, in both the
      real client and the fake; `apiContract.test.ts`.*

## Quality

- [x] Happy, empty, loading, and error states on every screen that calls the API.
- [ ] Offline and permission-denied states verified on a device. **Deferred to
      the next phase as an accepted risk (D-015).** *Scenarios listed in
      `.studio/device-readiness.md`. Nothing here has been observed on real
      hardware.*
- [x] Unit and integration tests pass.
      *`scripts/check.sh` — 311 pgTAP assertions across 14 SQL suites, 14
      concurrency checks racing real connections, a performance smoke check, the
      migration-replay comparison, the auth-configuration check, the dependency
      gate, and 202 jest tests.*
- [x] A migration applied in steps reaches the same database as a fresh one.
      *`scripts/verify-migration-replay.sh` applies every migration one at a
      time, with rows written in between, and compares the schema, the grants
      and the policies against the all-at-once run. Verified in both directions.*
- [x] No request can hang forever.
      *Every call carries a ten-second deadline, so a connection that is
      accepted and then goes quiet produces an error someone can act on rather
      than a button that stays disabled.*
- [x] A lapsed session does not leave the app looking signed in.
      *Re-checked whenever the app returns to the foreground; a failed check is
      not treated as evidence, because a dropped connection looks the same.*
- [x] Dependency advisories are either fixed or written down with a reason.
      *`scripts/check-dependencies.js` fails on any unaccepted high or critical.*
- [x] Lint and typecheck pass. *`npx eslint . --max-warnings 0`, `npx tsc --noEmit`.*
- [x] The client and the database cannot drift apart unnoticed.
      *`node scripts/verify-api-contract.js`, itself verified against
      deliberate mismatches.*
- [ ] iOS and Android device checks. **Deferred to the next phase as an
      accepted risk (D-015).** *Matrix and scenarios in
      `.studio/device-readiness.md`. Must be run before any pilot with real
      users.*
- [x] Accessibility pass (backlog R-004, then again over everything phases 1–3
      changed). *Two independent audits. The first found errors that were never
      announced on iOS and chat bubbles that were not accessibility nodes. The
      second found the same class of defect in four new places: a screen that
      replaced itself in place without a word being said, a resend that
      announced nothing on success, a delete warning where only the last of
      three sentences was spoken, and inbox rows that collapsed the message
      preview and the closed-conversation caption into a label naming only the
      person. All fixed, all with a regression test
      (`mobile/src/__tests__/announcements.test.tsx`). Contrast on every new
      pairing is 5.6:1 or better. **What no code can show — whether the
      announcement is audible, and where the cursor lands afterwards — needs a
      device (D-015).***
- [x] Neither a repeat swipe nor a photo read says where anybody is (D-016).
      *The highest-severity finding of the whole hardening program, and it was
      in two places at once. Both endpoints answered from the target's room
      eligibility **at that moment**, and a user id is public to everyone who
      has seen a card — so either could be polled to learn when a named person
      arrived near the hotel and when they left. The swipe version worked on
      people the deck had deliberately stopped showing you. Closed in
      `20260725002100` and `20260725002200`; `supabase/tests/014_swipe_idempotence.sql`
      runs the case the previous idempotency test could not have caught, because
      that one kept the target eligible throughout. The same fix restored D-012:
      a retry after a dropped response no longer fails if the other person moved
      in between.*
- [x] The endpoints that can be polled are rate-limited.
      *`swipe` and `discovery_feed` had no limit at all, which is what made the
      oracle above practical rather than theoretical. Both are counted only when
      there is new work to do, so a retry over a bad connection stays free.*
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
