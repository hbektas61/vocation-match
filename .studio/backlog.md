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

## Google advanced place search (D-053 / D-053a / D-053b, 2026-07-30)

- [x] G-001 Autocomplete (New) only, with a per-session token and a 1,500 m
      `locationRestriction`. Text Search and Nearby are barred by a static
      contract test that reads the function's code with its prose stripped, so
      neither a call nor a comment can hide one.
- [x] G-002 A label must be earned: the backend records what Autocomplete
      returned, bound to the searching user, single-use and short-lived, and
      `checkin_here` accepts only that token. All four refusals — unknown,
      another user's, expired, replayed — settle in one UPDATE.
- [x] G-003 Two separate monthly ceilings (Autocomplete 9,000, Details 4,500),
      claimed before the paid call, refusing inside the deciding statement.
- [x] G-004 Metrics: `app.provider_events` and session outcomes
      (`open|abandoned|empty|failed|converted`), with no query text, coordinate
      or display name recorded.
- [x] G-005 Same-query deduplication inside a session, answered before the
      request cap and without an upstream call.
- [x] G-006 One live search session per user; opening one closes the rest.
- [x] G-007 Ceiling-exhaustion tests: the Google door closes and the catalogue,
      the written search and "Buradayım" keep working — and a refused search
      spends none of the user's entitlement.
- [x] G-008 Provider disclosure in Settings, in both languages.
- [x] G-009 Overture sync metadata and gated retirement: `source_release`,
      `last_seen_at`, `deactivated_at`, `app.sync_runs`, and a retirement that
      refuses any run that is not `complete`.
- [ ] G-010 **Owner action** — set `GOOGLE_PLACES_KEY` (plus the two allowance
      secrets), restrict the key to this backend, and keep the Cloud daily quota
      near 150. Nothing above requires it; nothing above can be measured against
      real traffic without it.
- [ ] G-011 Build the cost estimate *from* `provider_event_counts` and
      `search_session_counts` after a week of real use. Deliberately not
      forecast in advance (D-053a withdrew the earlier figure).
- [ ] G-012 A self-hosted or commercial Overpass endpoint. The public one failed
      five or more times in one working session, and the venue sweep is the one
      path that has no fallback of its own.

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

## Done — destination-first vacation venue (D-054, 2026-07-30)

- [x] V-001 Provider-aware venue identity: `(provider='google', place_id)` is
      the canonical key; `hotels.location` nullable for that provider only.
- [x] V-002 Destination Autocomplete (New), worldwide, geocoding results only,
      so a business can never be a destination and a sublocality can.
- [x] V-003 Venue Autocomplete (New) restricted to the destination's padded
      viewport; the default mode sends no type restriction.
- [x] V-004 `activate_google_venue` from a single-use selection token, not
      entitlement-gated (§6) and reusing `set_active_hotel` for D-003/D-004.
- [x] V-005 Here Now for a coordinate we may not keep:
      `record_presence_verified`, same radius, same expiry, same privacy.
- [x] V-006 Live name resolution on the trip tab and the details screen, with a
      stated absence when Google cannot answer.
- [x] V-007 Cost controls: 3-character floor, 350 ms debounce, one request in
      flight with the newest query queued, stale-response rejection, per-session
      Google tokens, per-kind rolling session limits, per-operation ceilings.
- [x] V-008 §8 test coverage: 30 mobile cases plus 27 pgTAP assertions.
- [x] V-009 Provider disclosure extended: Google is now the venue path, not
      only the check-in escape hatch.

## Done — the three consequences, closed (D-055, 2026-07-30)

- [x] V-010 Coarse region cell, learned from verified Here Now readings.
- [x] V-011 Bounded venue-name resolution: three labels per deck session.
- [x] V-012 The eight operational counts, with no forecast and no quota change.
- [x] V-013 `scripts/staging-reset.sh` — safe, idempotent, refuses anywhere
      but staging, and never touches profiles, matches, chat or the metrics.
- [x] V-014 `023_nothing_persisted.sql` — the schema itself cannot hold a raw
      location, a Google coordinate or a Google name.

## Done — D-055a security corrections (2026-07-30)

- [x] S-010 One shared reading validator for every presence path, reused by the
      coming event room rather than copied into it.
- [x] S-011 `LOCATION_INACCURATE` as its own outcome, writing nothing.
- [x] S-012 Contributions unlinked from users: HMAC contributor keys and a
      venue-level tally, with the old shape dropped in the same migration.
- [x] S-013 Explicit schema assertions that no location-derived column or table
      is reachable by a client.

## Done — Etkinlikler, the fourth feature (D-056, 2026-07-31)

- [x] E-001 `public.events`: canonical `(provider, provider_event_id)`, unique,
      concurrency-safe first selection.
- [x] E-002 The room engine generalized — nullable `event_id` beside a nullable
      `hotel_id`, exactly-one-subject, two more room values, one branch each in
      `discovery_feed` and `swipe`. No second matching or chat system.
- [x] E-003 `app.event_content`: the expiring lease, with takedown and sweep.
- [x] E-004 Provider boundary: Discovery v2 behind the edge function, shared
      cache, in-flight coalescing, per-second limit, daily ceiling, timeout,
      circuit breaker, kill switch, schema validation, test-event rejection.
- [x] E-005 Server-issued selection tokens; a client can never create a room
      from an id it invented.
- [x] E-006 `EVENT_UPCOMING`, with no ticket and no proof, withdrawable without
      losing a match.
- [x] E-007 `EVENT_HERE_NOW`: fresh status, live window in the venue's own
      timezone, provider venue coordinate, the shared D-055a reading rule, the
      same 500 m test, expiry clamped to the window.
- [x] E-008 Events tab with Bugün / Yaklaşan, explicit area selection, chips,
      and all nine failure states in both languages.
- [x] E-009 Capabilities `can_join_event_upcoming` / `can_join_event_here_now`.
- [x] E-010 §16 coverage: 36 mobile cases and 50 pgTAP assertions.

## Next — Etkinlikler, what is left

- [x] E-011 Key added by the owner; §17 Scenario A run across all ten markets
      on 2026-07-31 and recorded in the handoff. Ibiza is empty, Mykonos and
      Paris are effectively empty, and that is Ticketmaster's coverage rather
      than a defect — see the handoff for what it means for a pilot.
- [ ] E-012 **Blocked on the owner:** written Ticketmaster commercial-use
      approval or an approved affiliate agreement, before any paid production
      launch. Implementation and staging need neither.
- [ ] E-013 Decide the free/premium mapping for the two event modes. The
      capabilities exist and both answer true; copying the hotel's D-036 rule
      across would be a product decision, and so would promising both are free.
- [x] E-014 `EVENTS_FEATURE_ENABLED` is **on for staging**. It ships **off**
      and a fresh database — which production will be — starts off; a pgTAP
      assertion holds that, so nobody has to remember it.
- [x] E-016a **Diagnosed** (2026-07-31, `docs/e016-coverage-diagnosis.md`).
      Not a query fault: France holds **one** event in the whole dataset, the
      Balearics hold none of Spain's 10 000+, Greece holds 96 nationally and
      Mykonos two, and Dubai is simply seasonal (0 / 10 / 26 across 30 / 90 /
      180 days). `geoPoint` was ruled out as a cause — it filters correctly,
      accepts both lat/lng and geohash, and agrees with `city` in every market
      that has inventory. One genuine geo-index gap exists, and it is Paris's
      single event.
- [ ] E-016b Decide, on that evidence: pilot in the markets Ticketmaster
      actually covers (İstanbul, İzmir, London, Berlin, Las Vegas, Miami), or
      accept thin markets honestly, or open a second-provider decision. Two
      smaller findings feed it — a longer default window helps seasonal Gulf
      markets far more than a wider radius, and a location-based search is
      strictly weaker than a city search in exactly the thin markets. Neither
      is a change to make before the decision.
- [x] E-015 Hourly pg_cron sweep, idempotent by name, with a run ledger
      (`app.cron_runs`), a health view (`public.cron_health`), a runbook
      (`docs/runbook-event-content-purge.md`) and tests that count every
      app-owned table across a purge.

## Known flake — worth a real fix

- [ ] Q-001 `profileAndStay.test.tsx` › "can be withdrawn, and closes the room
      when it is" fails intermittently under a full parallel run
      (`Unable to find an element with testID: upcoming-withdraw`), and passes
      every time in isolation and on re-run. Seen twice on 2026-07-30/31, both
      times in the same test. It is almost certainly a race between the screen's
      focus effect and the assertion rather than a product bug — but "it passed
      the second time" is how a real intermittent failure gets dismissed, so it
      is written down. Fix by awaiting the state the button depends on rather
      than the button.
- [ ] Q-002 Same class, second test. `profilePhotoUi.test.tsx` ›
      "keeps the rest of the set when one photo is changed" failed once inside
      the full mobile gate on 2026-07-31 at load average **4.10** (the Expo
      harness dev server on 8098 was competing for CPU). The assertion is
      `waitFor(() => expect(getOwnPhotos()).toHaveLength(4))` and it saw 3 —
      the fourth upload had not landed inside `waitFor`'s default 1000 ms.
      Re-run alone three times: **6/6 passed each time, 6.34 s / 4.76 s /
      4.26 s**. So it is the same shape as Q-001 — a default timeout that is
      generous on an idle machine and not on a busy one — and the same fix
      applies: wait on the state, and give uploads a timeout that reflects what
      they actually do. Recorded rather than re-run into silence.

## Accessibility — found by the D-057 visual gate

- [ ] A-001 `Button`'s `busy` prop does not reach the accessibility tree.
      The component's own comment says `busy` exists because "a screen reader
      does not re-announce the label of a control that already has focus" —
      but `Pressable` whitelists the props it forwards, so neither the native
      test tree nor the web export carries it. Measured two ways on
      2026-07-31: the exported web markup for a busy button was
      `<button aria-label="Kontrol ediliyor…" role="button" aria-disabled="true" disabled>`
      with **no `aria-busy`**, and `document.querySelectorAll('[aria-busy]')`
      returned **0** for the whole page; in jest the host node's prop list was
      `accessibilityRole, accessibilityLabel, testID, accessible,
      accessibilityState, focusable, accessibilityValue, …` — `accessibilityState`
      is there, an `aria-busy` passed alongside it is dropped.
      Passing `aria-busy` explicitly was tried and reverted: it changed
      nothing, and an inert line under a confident comment is worse than no
      line. What still works is the *label*, which every busy button already
      swaps ("Kontrol ediliyor…", "Kaydediliyor…"), so the announcement is
      probably fine in practice — but "probably" is why this is written down.
      Settle it with a real screen reader on a device (VoiceOver and TalkBack),
      not in a browser; it is row 17 of `.studio/d057-device-checklist.md`.

## Superseded — the wording these replaced

- [x] V-010 A Google venue cannot join the D-038 region pool, because it has no
      coordinate of ours. Decide where such a coordinate may legitimately come
      from — the honest candidate is our *own* users' verified readings, which
      is app-owned data rather than Google Content — or accept the gap in
      writing.
- [ ] V-011 Another user's card cannot be labelled with a Google venue's name
      without a Place Details call per viewer. Measure how often that actually
      happens once `provider_event_counts` has a week of real traffic, then
      decide whether a per-render cache is worth its complexity.
- [ ] V-012 Build the cost estimate the brief refuses to guess at, from
      `provider_event_counts` and `search_session_counts` — now that both are
      running against a real key.

## 2026-08-01 — Core search P0

- [x] S-001 Vacation selection requires country before destination; the
      backend restricts Autocomplete to that country and fingerprints
      country + query together.
- [x] S-002 The explicit around-me action asks Google Nearby and the open
      catalogue in parallel from one foreground reading, restricted to 500 m
      and distance-ranked.
- [x] S-003 The nearby text field filters only the bounded live list; it never
      invokes the worldwide venue catalogue search. Live Google content wins
      over a same-named stale catalogue row.
- [x] S-004 Privacy/cost boundaries stay intact: no provider coordinate or
      type list reaches the app or database, selection tokens stay single-use,
      attribution is visible, OSM and “I’m here” remain fallbacks, and Nearby
      has a separate hard monthly ceiling.

Evidence: both halves of `scripts/check.sh` are green — TypeScript, zero-warning
lint, `git diff --check`, web bundle, 58 Jest suites / 700 tests, 707 SQL
assertions, concurrency, client↔database contract and migration replay. A live
staging probe returned Alaçatı under `TR` and 20 distance-ranked Nearby rows;
the client shape contained presentation kinds and attribution, and no
coordinate or provider type list.

## Explicitly excluded

- Reservation upload or reservation number.
- Passport/ID.
- Hotel staff approval.
- Background tracking.
- Exact distance display.
- Live user map.
- Production deploy or store submission.

## D-065 redesign backlog (2026-08-07)

- [ ] D-065 slice 2 — remaining four tab heads (Keşfet, Çevremde, Etkinlikler,
      Mesajlar) adopt the drawn title + subtitle head; per-screen bodies per
      Figma `kesfet_view`, `cevremde_venues_view`, `etkinlikler_view`,
      `mesajlar_view`.
- [ ] D-065 slice 3 — onboarding restyle (auth 10 + venue/permission 7) per
      Figma `auth_*`, `welcome`…`home_ready`.
- [ ] D-065 slice 4 — flows (venue switch, Oteldeyim states, event join,
      match, chat, profile detail).
- [ ] D-065 slice 5 — profile edit, settings, report/block, system states.
- [ ] BUG — Google venue's cached HotelCard carries literal "(google)" as
      name/city; VenueRibbon's catalogueName check trusts it, so the chip can
      print "(google)". Real fix touches DiscoveryScreen's out-of-cache
      getActiveVenue/resolveGooglePlace calls (venueLabels cache unification).
      Found during D-065 slice 1; deliberately not fixed in that slice.
- [ ] Avatar stack on Tatilim venue card ("Burada olanlar" + count) needs a
      member-preview data source that does not exist today; design element
      omitted until an endpoint/decision exists (D-032 thresholds apply).
- [ ] D-065 — Etkinlikler "joined" state (Figma 177:5363): participants
      avatar grid + headcount need an endpoint that does not exist, and the
      design's post-join destination replaces the navigation
      fourFeatureIA.test.tsx pins. Its own slice, with the data decision.
