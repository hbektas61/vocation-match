# Backlog

Agents must move an item only after recording verification evidence.

## Now — MVP foundation (completed 2026-07-25)

Evidence: 55/55 jest tests (incl. critical-flow component test), `tsc --noEmit` clean, `eslint .` clean, `expo export --platform web` bundles; independent code + security review passed with no critical/high finding. Branch `worktree-mvp-foundation`.

- [x] B-001 Record architecture decisions for Expo layout, navigation, state, fixtures, and tests. (`.studio/architecture.md`)
- [x] B-002 Initialize `mobile/` as an Expo React Native TypeScript app.
- [x] B-003 Add design tokens and accessible shared components. (`src/theme.ts`, `src/components/ui.tsx`)
- [x] B-004 Implement onboarding, 18+ gate, auth placeholder, and profile flow.
- [x] B-005 Implement hotel search fixtures, hotel card, and one-active-hotel activation.
- [x] B-006 Implement self-declared Upcoming dates and room eligibility.
- [x] B-007 Implement simulated foreground distance result and 500-meter Here Now eligibility.
- [x] B-008 Implement discovery deck, swipe decisions, mutual match, inbox, and chat fixtures.
- [x] B-009 Implement block/report/settings placeholders and honest trust copy. (report/block reachable from discovery deck and chat)
- [x] B-010 Add domain unit tests, lint, typecheck, and build verification.
- [x] B-011 Run code, security, accessibility, and mobile QA review; fix valid findings. (code + security done; medium finding fixed; accessibility/mobile-QA deep pass deferred to pre-release gate)
- [x] B-012 Record handoff and prepare backend milestone. (`.studio/handoffs.md` 2026-07-25)

### Review follow-ups carried to next milestones

- [x] R-001 Closed by the `profiles_enforce_adult` trigger in `20260725000200_profiles.sql`; `supabase/tests/001_profiles.sql` proves an underage insert is refused server-side.
- [x] R-002 Done. `unblock_user()` / `my_blocks()` server-side (`supabase/tests/007_safety.sql`) and a blocked-people list with an unblock action in Settings; the product call is recorded as decision D-011. Blocking is no longer irreversible in-app.
- [x] R-003 Done. `my_rooms()` returns `valid_until`, and Rooms schedules one refresh at that instant (`src/state/roomSchedule.ts`), so a lapsed Here Now check stops looking open on its own rather than at the next navigation. A test advances past the boundary and asserts the room closed.
- [x] R-004 Accessibility audit done and its findings applied. Two blockers
      were real: error `Notice`s were never announced on iOS (`accessibilityLiveRegion`
      is Android-only, so a failed sign-in or a denied location check was a
      silent failure for a VoiceOver user), and chat bubbles were plain `View`s,
      which default to `accessible={false}` in React Native — so the label
      naming the sender was never read and a conversation could not be
      followed. Both fixed in the shared component rather than per call site.
      Also: `busy` state on submit buttons, the date format moved out of
      placeholders into announced hints, a numeric keyboard for date fields,
      and `color.border` raised from 1.40:1 to 3.02:1 so an input's boundary is
      perceivable. Text contrast already passed everywhere (7.3:1 to 16.9:1).
      Device-only scenarios remain listed in `.studio/device-readiness.md`.

## Phase 1 — backend foundation

Evidence command: `bash supabase/scripts/db-test.sh` — fresh container, migrations
applied in order, pgTAP suites plus multi-connection concurrency checks.

- [x] N-001 Supabase project structure and local migrations. (`supabase/migrations/`, `supabase/config.toml`, `supabase/scripts/db-test.sh`; harness verified in both directions — a deliberately failing assertion exits non-zero.)
- [x] N-002 Auth and profile RLS. (`20260725000200_profiles.sql`; 18+ enforced by trigger, not by the client — closes R-001. Typed mobile boundary in `mobile/src/data/` with a credential-free in-memory implementation.)

## Phase 2 — hotel, presence, and discovery

- [x] N-003 Hotel provider integration and cached hotel catalog. (`20260725000300_hotels.sql`; single `upsert_hotel_from_provider` write boundary restricted to service_role; `location` not granted to any client role.)
- [x] N-004 Transactional one-active-hotel enforcement. (`20260725000500_hotel_state_functions.sql`; primary key + row lock, raced by `supabase/tests/concurrency.sh`.)
- [x] N-005 Ephemeral location check and server-side PostGIS distance. (`record_presence_check`; coordinates are arguments only, one boolean answer per user, 30-minute freshness, no distance ever returned.)
- [x] N-006 Discovery eligibility endpoint. (`20260725000600_discovery.sql`; `my_rooms()` and `discovery_feed()`, both rooms independent.)

## Phase 3 — matching, chat, and safety

- [x] N-007 Idempotent swipe/match. (`swipe()`; primary key on the pair absorbs retries, advisory pair lock makes simultaneous likes produce exactly one match — raced in `concurrency.sh`.)
- [x] N-008 Realtime persistent chat. (`20260725000900_chat.sql`; one insert policy carries every rule and Realtime applies the same select policy.)
- [x] N-009 Block/report/moderation pipeline. (`block_user`/`unblock_user`/`report_user`, automatic flagging at three distinct reporters, service_role-only `moderation_queue` and `resolve_report`, suspension removes the account from every room.)

## Phase 4 — staging and device readiness

- [x] N-010 End-to-end evidence done. The **device test is deferred to the next phase as an accepted risk** (decision D-015), not completed — `supabase/tests/009_end_to_end.sql` walks two
      strangers from an empty database to a conversation using only the calls
      the client makes; `scripts/verify-api-contract.js` proves the client and
      the database cannot drift apart unnoticed; `scripts/check.sh` runs
      everything. Device checks that need real hardware are specified in
      `.studio/device-readiness.md` — they are listed, not claimed. No build has
      run on a device or simulator: this machine has Command Line Tools without
      Xcode and no Android SDK, so there is nothing to run one on. Installing a
      toolchain is an owner action. The web bundle was loaded in a real browser
      as a partial substitute — the app boots and the age gate renders with zero
      console errors — but that exercises none of the keychain, permission
      dialog, backgrounding, or screen-reader behaviour that matters.

## Carried from the independent review (2026-07-25)

- [x] S-001 Done. `profiles.photo_url` no longer exists — not the column, not
      its constraints, and not any code path that could write a URL. A photo is
      an object in the private `profile-photos` bucket at
      `<owner uuid>/<random token>.<ext>`, written only under the owner's own
      prefix, read only by the owner, a match, or someone in an open room with
      them, and attached to the profile only through `public.set_profile_photo()`,
      which refuses a path with no object behind it. EXIF is dropped by
      re-encoding before upload, because a photo taken at the hotel carries the
      exact GPS position D-005 says never leaves. Evidence:
      `supabase/tests/011_profile_photos.sql` (43 assertions),
      `mobile/src/data/__tests__/{profilePhotos,imagePicker}.test.ts`,
      `mobile/src/__tests__/profilePhotoUi.test.tsx`. The one thing still
      deferred is on-device confirmation that the encoder emits metadata-free
      bytes (D-015).
- [x] S-002 Done. Per-user fixed-window counters in `app.rate_limit()`:
      reporting 10/hour (the tightest, because unlimited reporting is both a
      way to bury the moderation queue and a way to mass-block), presence
      checks 30/hour, messages 60/minute. The counters table is readable by
      nobody — how close you are to a limit is itself useful to someone probing
      it. `supabase/tests/010_rate_limits.sql`.
- [x] S-003 Done as far as this repository can take it. `enable_confirmations`
      is on in `supabase/config.toml` — locally too, because "local only" was
      what let the client be written against a flow no real project has — and
      `scripts/verify-auth-config.js` fails the build if it is turned back off,
      along with the new `[auth.rate_limit]` ceilings on the endpoints that send
      mail. The client now handles the unconfirmed states instead of throwing on
      the happy path. **The hosted project keeps its own copy of every one of
      these settings and nothing here can check them**; `docs/hosted-setup.md`
      lists exactly what to set and why. That part is owner work.
- [x] S-004 Done. A match's `room` and `hotel_id` come from the pair's *first*
      swipe, both from the same row so they cannot disagree
      (`20260725001800_match_room_attribution.sql`). "First" is a new `seq`
      identity column, not `created_at` — that is the transaction timestamp and
      ties between swipes written together, the same defect `20260725001300`
      fixed for messages. Evidence: `supabase/tests/013_match_attribution.sql`
      runs the same two rooms with the swipe order reversed and asserts the two
      pairs get different labels, and `concurrency.sh` races both directions from
      different rooms and asserts the label always agrees with the first recorded
      swipe.

## Pilot hardening (completed 2026-07-25)

Evidence command: `bash scripts/check.sh` — the auth-configuration check, the
dependency gate, 335 pgTAP assertions across 15 SQL suites, 13 concurrency
checks, the performance smoke check, the client/database contract check, the
migration-replay comparison, `tsc`, `eslint --max-warnings 0`, 226 jest tests,
and the web bundle. Four of those checks are negative-controlled.

- [x] H-101–H-106 Profile photos in a private bucket (closes S-001, D-014).
- [x] H-201–H-206 In-app account deletion, and the removal of the second,
      unguarded deletion path the audit found.
- [x] H-301–H-304 Email confirmation configured, verified by a check, and
      handled in the UI (closes S-003 as far as this repository can).
- [x] H-305–H-306 Deterministic match attribution (closes S-004).
- [x] H-401 Security. No grant drift found anywhere; every `add column` against
      a table with a narrow grant restates it, and the baseline suite now fails
      if a table-wide DELETE reappears. One critical finding — a live presence
      oracle in `swipe()` and in the photo read — closed and recorded as D-016.
- [x] H-402 Privacy. Nothing crosses the user boundary that should not; the copy
      promises nothing the system does not deliver, and that is now an
      executable check (`mobile/src/__tests__/trustCopy.test.ts`) rather than a
      rule in a document.
- [x] H-403 Abuse resistance. `swipe` and `discovery_feed` limited; the storage
      cleanup queue given a drain contract, and then (2026-07-25) the worker
      that uses it — `scripts/drain-storage-cleanup.js`, verified against the
      real database with the object store stubbed. Two residual risks sized rather than
      only noted, in `.studio/decisions.md`: a suspended account can delete
      itself and re-register, and three disposable addresses can force a
      moderation flag — which is queue priority, not a ban.
- [x] H-404 Accessibility over every screen phases 1–3 changed. Four defects of
      the same shape as R-004's, all fixed with regression tests.
- [x] H-405 Lifecycle. A lapsed session, or an account deleted from another
      device, no longer leaves the app looking signed in.
- [x] H-406 Offline. Every request has a deadline; nothing had one before.
- [x] H-407 Migration replay. Applied both ways and compared — schema, grants,
      policies.
- [x] H-408 Contract drift, including storage buckets, their policies, and
      whether the client's RPCs are executable by `authenticated` at all.
- [x] H-409 Dependency health. 33 high advisories closed by an override; the
      one that remains is written down with the reason it cannot reach a phone.
- [x] H-410 Performance. One index; the deck's dominant scan was bounded by
      lifetime signups rather than by the room.
- [x] H-411 Documentation. README, `docs/hosted-setup.md`, and the Studio
      records, including what was *not* verified.

## Pilot usability (completed 2026-07-25)

Three gaps a pilot with real people would have hit on day one. All three were
client work; the server already allowed every one of them.

- [x] U-001 Edit your profile after onboarding. There was exactly one screen
      that wrote a profile and it only rendered when you had none, so a name
      typed wrong during onboarding was permanent — on a product where the name
      is most of what a stranger has to go on. The form is now shared between
      the first save and every edit after it, so the validation, the copy and
      the 18+ message cannot drift apart.
- [x] U-002 See, amend and withdraw a declared stay. You could re-declare dates
      but never see what you had said, which made "update your stay" a guess,
      and there was no way to take it back at all — while a presence answer
      could always be withdrawn. The asymmetry is gone.
      Evidence: `supabase/tests/003_active_hotel.sql` proves the withdrawal
      closes the room on the server, not only on the screen.
- [x] U-003 A conversation whose match disappeared underneath it. Since account
      deletion shipped, the other person leaving takes the match and its
      messages with them, and the cached copy kept the screen looking alive.
      Found while fixing it: a vanished match produced a foreign key violation
      that mapped to UNKNOWN, so the app said "something went wrong" and never
      worked out the conversation was gone.

## Onboarding and visual direction (completed 2026-07-26)

- [x] O-001 One onboarding wizard replacing the age gate, auth screen and
      profile setup: eleven steps, one question each, a progress line, a back
      and a skip only where skipping is real, and a single wide action pinned
      above the keyboard. The step is derived from server state (D-017), so a
      finished onboarding cannot reappear and a half-finished one resumes where
      the server says it is.
      Evidence: `mobile/src/__tests__/onboarding.test.tsx` — the draft survives
      going back, the limit on interests is enforced rather than printed, skip
      appears only on optional steps, and a relaunch lands in the app.
- [x] O-002 `profiles.interests` (D-018), with the count and per-element bounds
      enforced in the database and the field carried on the discovery card.
      Evidence: `supabase/tests/001_profiles.sql` refuses six interests, an
      over-long one, and a blank one, and proves a refused write leaves the
      stored list untouched; `005_discovery.sql` pins the card's exact field
      set.
- [x] O-003 Ocean-and-sand palette in one token file, with the two supplied
      values that failed contrast corrected and every value commented with the
      ratio measured against the surface it is used on.
- [x] O-004 Four defects only a screenshot found: every tab label cut in half,
      an unreadable disabled button label, a duplicated privacy paragraph next
      to two identical primary buttons, and a teaching figure collapsed into
      two hairlines.
- [x] O-005 An unrelated profile edit no longer empties the interests list —
      the same trap the photo field already had. Omitting the field on a write
      means "leave it alone".
- [x] O-006 Signing back in restores the active hotel, so a returning account
      is no longer asked to choose a hotel it already has.
- [x] O-007 Android's back button walks back through the wizard instead of
      closing the app. Eleven steps live inside one navigator screen, so there
      was nothing for React Navigation to pop and back left the app from step
      four, taking the whole draft with it. Where back goes is now one table
      read by both the arrow and the button, so the two cannot drift.
      Evidence: `mobile/src/__tests__/onboarding.test.tsx` — a press goes back
      a step with the answer intact and is claimed, and a step with no arrow
      leaves the press unclaimed.
- [x] O-008 Every onboarding step announces itself. A step swaps in place and a
      swap does not move the screen-reader cursor the way a push does, so
      most steps and two of the three teaching cards originally arrived in
      silence — the same defect H-404 fixed elsewhere, in the one flow where it
      repeats throughout. The announcement is in the scaffold, so no step can
      forget it.
      Evidence: `mobile/src/__tests__/announcements.test.tsx`.
- [x] O-009 Integrate the onboarding work onto the Expo SDK 54 baseline.
      React 19-compatible test actions now await asynchronous wizard updates;
      interrupted profile creation resumes conservatively instead of dropping
      optional steps; credentials are cleared from component state after each
      successful auth outcome; and interests reject null elements server-side.
      Evidence: `scripts/check.sh` — 346 pgTAP assertions, concurrency,
      migration replay, contract and storage checks, typecheck, zero-warning
      lint, 251 Jest tests, and the SDK 54 web bundle.
- [x] O-010 Replace email/password entry with phone-only SMS OTP. New and
      returning users share one non-enumerating flow; E.164 validation happens
      before the network; no session exists until the six-digit code succeeds;
      resend has a 60-second cooldown, including lost responses; and phone
      numbers remain in Supabase Auth rather than profiles/discovery. The OTP
      screen masks the number and a root privacy shield covers app-switcher
      snapshots. Email sign-up is disabled; missing backend configuration fails
      closed; and the config gate rejects committed fixed OTPs, provider
      secrets, providers and Send SMS Hooks before CAPTCHA. Hosted CAPTCHA,
      provider setup and a real-device delivery pass remain external.

## The owner's brief — theme, onboarding, photos, hotel (completed 2026-07-26)

- [x] B-001 White ground, one lavender `#E1C4FF`, old ocean/sea/sand tokens
      removed rather than re-pointed (D-020). The brand colour measures 1.55:1
      on white, so it is never a boundary, never text on white, and never the
      only carrier of a state.
      Evidence: `mobile/src/__tests__/theme.test.ts` computes the ratios from
      the tokens instead of trusting the comments.
- [x] B-002 Focus border exactly `#E1C4FF`, joined by weight, fill and a
      `#7B4FA8` ring (D-021), and `Field` owning its box so a single line
      centres on both platforms while a composer starts at the top.
      Evidence: `mobile/src/components/__tests__/Field.test.tsx`.
- [x] B-003 `+90` as a fixed, non-editable prefix; ten national digits in,
      E.164 out (D-022).
      Evidence: `mobile/src/data/__tests__/phoneTr.test.ts` — the four ways
      people really paste a number.
- [x] B-004 `DD/MM/YYYY` on the way in and out, ISO at every boundary, with the
      18+ boundary asserted either side of UTC.
      Evidence: `mobile/src/domain/__tests__/dateInput.test.ts`.
- [x] B-005 Bio out of onboarding; order is name, birthdate, gender,
      orientation, show-me, passions, photos.
- [x] B-006 Gender, orientation and show-me: schema, RLS, column grants,
      visibility toggles defaulting off, and mutual server-side filtering
      (D-023). Orientation is never a filter.
      Evidence: `supabase/tests/005_discovery.sql`.
- [x] B-007 `onboarding_completed_at`, server-set only, required by discovery
      (D-024). A draft profile is invisible to everyone but its owner.
- [x] B-008 The hotel leaves onboarding (D-025) and is asked for at the point
      something needs it, with the way out on the blocked screen.
- [x] B-009 Hotel search asks the server nothing until two characters are
      typed, discards stale answers by sequence, and has four distinct states.
      Evidence: `mobile/src/__tests__/hotelSearch.test.tsx`.
- [x] B-010 Nine ordered photos with a derived primary (D-026), reordering by
      explicit controls rather than a claimed gesture (D-027).
      Evidence: `supabase/tests/015_photo_set.sql`,
      `mobile/src/data/__tests__/photoSet.test.ts`,
      `mobile/src/__tests__/photoGridUi.test.tsx`.
- [x] B-011 The upload failure: `fetch('file://…')` reaches OkHttp, which has
      no `file` handler, so Android never worked; iOS paid a base64 round trip
      through `FileReader`. Now `expo-file-system`'s `File` (D-028).
- [x] B-012 Gender, orientation and show-me editable after onboarding — show_me
      decides whose cards you see, and no way back would leave somebody with an
      empty deck and no explanation.

## Later — monetization

- [ ] L-001 Define premium value and price.
- [ ] L-002 Add store products and RevenueCat.
- [x] L-003 Decide free versus premium room access. (D-036, 2026-07-28: free =
      Upcoming with a 3-like/5-pass per-hotel allowance; Here Now and
      unlimited swiping = Premium. Entitlement is `profiles.premium_until`,
      operator-set, server-enforced; no purchase flow yet.)
- [ ] L-004 Purchase restore, webhook, entitlement, and paywall tests.
- [ ] L-005 Premium direct message: chat without a mutual match (owner rule in
      D-036). Needs a pre-match conversation model the recipient can refuse,
      safety rules, and screens — the named next premium slice.

## Explicitly excluded

- Reservation upload or reservation number.
- Passport/ID.
- Hotel staff approval.
- Background tracking.
- Exact distance display.
- Live user map.
- Production deploy or store submission.
