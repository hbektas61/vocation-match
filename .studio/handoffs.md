# Handoffs

## 2026-07-25 — Physical Expo Go test unblocked on SDK 54

Handoff:
- Date: 2026-07-25
- From agent: `cross-platform-engineer`
- To: the owner for the physical iPhone walkthrough
- Status: **ready for Expo Go device testing; device checklist still open**

The verified change is committed on local `main`. Pushing to `origin/main`
failed because the Mac's HTTPS credential provider returned `Device not
configured`; no force push or alternate credential path was attempted. The
local device test does not depend on that push.

The mobile project is intentionally on Expo SDK 54 for the current App Store
Expo Go client. This is a temporary compatibility choice for physical-device
testing, not a development build and not a store release; it needs neither an
Apple Developer membership nor a paid Expo plan. Expo resolves the public
configuration as `sdkVersion: 54.0.0`.

The SDK-aligned dependency set was rebuilt from a clean install and verified:
Expo Doctor 18/18, Expo dependency check clean, TypeScript and ESLint clean,
239/239 Jest tests passing, and a fresh web export. One latent lifecycle-test
race was made explicit by waiting for the hotel screen before replacing the
session checker; application behaviour did not change. The SDK 54 React Native
types also require `StyleSheet.absoluteFillObject` rather than spreading the
registered `StyleSheet.absoluteFill` style.

SDK 54's supported Metro toolchain pins PostCSS 8.4.x. Two newly published
PostCSS advisories are recorded as a temporary, reasoned dependency-gate
exception: this project accepts no user CSS, PostCSS runs only in local
web/build tooling, and the native Expo Go runtime does not ship that Node path.
Remove the exception when Expo's supported dependency range reaches the patched
PostCSS line or when the project returns to a newer SDK.

Start on the Mac with `cd mobile && npx expo start --clear --lan`, keep the
iPhone and Mac on the same Wi-Fi, then scan the QR code from Expo Go. Tunnel is
only a fallback and may require `@expo/ngrok`; it is not needed for the LAN
route.

This does **not** mark any scenario in `.studio/device-readiness.md` complete.
The next evidence is the actual iPhone walkthrough: launch, keychain/session,
photo and location permission paths, background/resume, offline handling, and
VoiceOver.

## 2026-07-25 — MVP systems program closed; device pass carried forward

Handoff:
- Date: 2026-07-25
- From agent: `project-orchestrator`
- To agent: `mobile-qa-release`, once a device toolchain exists
- Status: **program closed** at the owner's instruction, with one item carried
  forward as a named risk rather than done (decision D-015).

What is true: N-001 through N-010 are implemented and verified, gates P0–P5
are closed, and every finding from the independent code review, security audit,
and accessibility audit has been fixed. One command reproduces the evidence —
`scripts/check.sh`: 228 pgTAP assertions across 11 SQL suites, 11 concurrency
checks racing real connections, the client/database contract check, `tsc`,
`eslint --max-warnings 0`, the mobile jest suite, and a web bundle. The
exported bundle was also driven end to end in a real browser, age gate through
hotel activation, with no console errors.

What is not true, and must not be read as true later: **nothing has run on a
phone or a simulator.** The build machine has Command Line Tools without Xcode
and no Android SDK. That leaves untested exactly what a bundle cannot reach —
the keychain, the location permission dialog and its denial and revocation
paths, backgrounding and token refresh, offline behaviour, and
VoiceOver/TalkBack. `.studio/device-readiness.md` is the checklist to run, and
it is a list of things to do, not a list of things that passed.

Work this off before any pilot with real users. The cheapest route is Expo Go
on a phone; the fuller one is Xcode or the Android SDK.

Also open, and deliberately: S-001 photo storage (D-014, the current cap is a
stop-gap against a passive tracking beacon, not a fix), S-003 email
confirmation on whatever hosted project this ships to, S-004 the match room
label, and the account-deletion UI required before store submission.

Nothing was deployed, submitted, or published, and no credential is committed.

## 2026-07-25 — Program blocked on one thing: no device toolchain

Handoff:
- Date: 2026-07-25
- From agent: `project-orchestrator`
- To: the owner, for one action
- Status: **the four-phase program is not complete**, and the only thing left
  is N-010's device test.

Everything else is done and verified in one command, `scripts/check.sh`:
228 pgTAP assertions across 11 SQL suites, 11 concurrency checks racing real
connections, the client/database contract check, `tsc`, `eslint --max-warnings 0`,
the mobile jest suite, and a web bundle. The exported bundle was also driven
end to end in a real browser — age gate through hotel activation, zero console
errors — which proves the app boots and the whole typed boundary runs.

**The blocker:** no build has run on a phone or a simulator, and none can on
this machine. It has Command Line Tools without Xcode, and no Android SDK, so
there is no simulator or emulator to run and nothing to install one from
without the owner's involvement. This is an external dependency, not
unfinished code.

What that leaves untested is exactly what a bundle cannot reach: the keychain,
the location permission dialog and its denial and revocation paths,
backgrounding and token refresh, offline behaviour, and VoiceOver/TalkBack.
The scenarios are written out in `.studio/device-readiness.md` — they are a
checklist to run, not a claim that they passed.

Owner action to unblock: install Xcode (for an iOS simulator) or the Android
SDK, or connect a physical device with Expo Go, then run the
`.studio/device-readiness.md` list.

Also landed since the last handoff:
- Rate limiting (S-002) on reporting, presence checks, and messages. Reporting
  is the tightest, because unlimited reporting is both a way to bury the
  moderation queue and a way to mass-block, and the automatic flag at three
  distinct reporters makes a pile-on cheap.
- A latent chat bug the rate-limit trigger exposed: `messages.created_at`
  defaults to `now()`, the *transaction* timestamp, so two messages written in
  one transaction tied and "the last message" was a coin flip. Rare in
  production, which is what would have made it appear once and never
  reproduce. Messages now carry an identity `seq`.

Still open and deliberately so: S-001 photo storage (D-014), S-003 email
confirmation on the hosted project, S-004 the match room label, and the
account-deletion UI required before store submission.

## 2026-07-25 — Independent review findings applied; program complete

Handoff:
- Date: 2026-07-25
- From agent: `project-orchestrator` with `code-reviewer`, `security-auditor`, `accessibility-auditor`, `cross-platform-engineer`
- To agent: `mobile-qa-release` for the device matrix; owner for the deploy, store, and photo-storage decisions
- What changed: three independent audits reported, and their findings are fixed.

The one that mattered most: **a suspended account could still browse and swipe.**
Moderation stopped a suspended person being *seen* — the target's suspension was
filtered everywhere — but never stopped them *acting*, because `app.require_user`
did not look at `suspended_at`. The reviewer verified it live by suspending a
profile and recording a new LIKE as that user. The gate is now suspension-aware
by default; an endpoint has to opt out to stay reachable, and the ones that do
opt out are the safety tools — a suspended person can still block, report,
unmatch, and read what they already have. Suspension limits reaching other
people; it must not take away the tools that protect you.

Also fixed from the review:
- `set_active_hotel` was not race-safe on a user's *first* activation: `select
  ... for update` locks nothing when there is no row yet, so two concurrent
  first activations both reached the activation-event insert and one died on a
  raw duplicate-key error. Now serialised by an advisory lock. The existing
  concurrency test raced exactly this path but only asserted final-state
  consistency, so it could pass on timing luck — there is now a dedicated
  section that requires *every* racer to commit.
- `profiles.photo_url` accepted any https URL with no length bound. A card is
  shown in discovery without any interaction, so a self-hosted image is a
  passive beacon: the profile owner learns the IP and timing of everyone who
  merely saw them. Capped as a stop-gap; the real fix is our own storage bucket
  (decision D-014, backlog S-001).
- "Sign in to continue." raised 42501, which the client read as FORBIDDEN. It
  now raises 28000 and maps to UNAUTHENTICATED, so the app can tell "log in"
  apart from "you are not allowed".
- Another vacuous assertion, in the new end-to-end walkthrough: reporting also
  unmatches, so the "he cannot send anything more" step would have passed even
  with the block check broken. The reviewer proved it by reverting the fix and
  watching the test still pass. Now the match is reopened first.

Accessibility (R-004) found two blockers of the same character — things that
looked right and did nothing:
- Error banners were never announced on iOS. `accessibilityLiveRegion` is
  Android-only, and nothing called `announceForAccessibility`, so a failed
  sign-in or a denied location check was a completely silent failure for a
  VoiceOver user.
- Chat bubbles were plain `View`s, which default to `accessible={false}` in
  React Native, so the label naming the sender was never read and a
  conversation could not be followed.
Both fixed in the shared component rather than at each call site.

- Verification: `scripts/check.sh` — 216 pgTAP assertions, 11 concurrency
  checks, contract check, `tsc`, `eslint --max-warnings 0`, 141 jest tests,
  web bundle. All pass.
- Open, and deliberately so: S-001 photo storage, S-002 rate limiting, S-003
  email confirmation on the hosted project, S-004 the match room label, account
  deletion UI, and every device-only scenario in `.studio/device-readiness.md`.
- Not done because they are owner decisions, not engineering steps: no hosted
  project provisioned, no migration run outside a throwaway container, no build
  uploaded anywhere, no store listing, no credential committed.
- Recommended next agent: `mobile-qa-release` against `.studio/device-readiness.md`.

## 2026-07-25 — Whole MVP now runs through the server (`5047903`)

Handoff:
- Date: 2026-07-25
- From agent: `project-orchestrator` with `cross-platform-engineer`
- To agent: `mobile-qa-release` for the device matrix; owner for the deploy and store decisions
- What changed: every product flow moved off fixtures and onto the typed boundary. Rooms renders the server's own reason a room is closed rather than recomputing eligibility; Here Now reads the device's real foreground location; discovery, matching, chat and safety all go through the database.
- Verification: `scripts/check.sh` — 205 pgTAP assertions across 10 suites, 8 concurrency checks racing real connections, client/database contract check, `tsc` clean, `eslint --max-warnings 0` clean, 139 jest tests across 11 suites, web bundle exports.
- Backlog closed: R-001 (server-side 18+), R-002 (unblock and a blocked list), R-003 (rooms refresh at the expiry instant), N-010 (end-to-end evidence).
- Defects found and fixed during the work, worth remembering because each one had a test that was passing for the wrong reason or no test at all:
  - The message-insert policy could not see the other side's block, because a block row is only visible to its author and the helper was SECURITY INVOKER. The test that should have caught it passed because `block_user` also unmatches.
  - `authenticated` held a table-wide UPDATE grant on `profiles`, so a suspended user could clear their own `suspended_at`. Grants are now column-level.
  - `swipe` returned a different error for a block than for anything else, which told someone they had been blocked. Both cases now answer identically.
  - Denying location permission only changed local state; the stored answer kept Here Now open for up to thirty minutes after the user withdrew consent.
- Risks / blockers:
  - No rate limiting on `swipe`, `report_user`, or `record_presence_check`. Fine for an invited pilot, not for open signup.
  - No account-deletion UI. Required before store submission; the schema already cascades correctly.
  - Nothing has been run on a real device. The web bundle proves the code builds, not that the keychain, the permission dialog, backgrounding, or a screen reader work.
- Deliberately not done, and each one is an owner decision rather than a skipped step: no hosted Supabase project provisioned, no migration run anywhere but a throwaway local container, no build uploaded to TestFlight or Play, no store listing, no credential committed.
- Recommended next agent: `mobile-qa-release` against `.studio/device-readiness.md`.

## 2026-07-25 — Backend foundation through safety landed on main (`a6f4b30`)

Handoff:
- Date: 2026-07-25
- From agent: `project-orchestrator` (with api-architect / database-engineer / backend-engineer responsibilities)
- To agent: `cross-platform-engineer` for the remaining screen wiring, then `mobile-qa-release` for device readiness
- What I did: built the whole server side of the MVP in `supabase/` — N-001 through N-009 — plus the typed client boundary in `mobile/src/data/`.
- Key decisions (recorded as D-011, D-012, D-013):
  - Blocking is reversible; unblocking does not restore the match the block ended.
  - One swipe decision per pair, permanent; a repeat swipe is a no-op returning the same outcome, which is what makes the endpoint retry-safe on a flaky connection.
  - Moderation escalates automatically at three distinct reporters; an actioned report suspends the account.
  - The two implementations of `VocationApi` (`SupabaseApi`, `FakeApi`) exist so the app runs and is testable with no URL and no key. Nothing secret is committed; `.env` is ignored and only `.env.example` is tracked.
- Files touched: `supabase/**` (9 migrations, 10 pgTAP suites, concurrency script, harness, seed, README), `mobile/src/data/**`, `mobile/src/domain/age.ts`, `scripts/check.sh`, `.studio/architecture.md` (ADR-009 … ADR-014), `.studio/backlog.md`, `.studio/decisions.md`.
- Verification: `bash supabase/scripts/db-test.sh` — 197 pgTAP assertions across 10 suites, all passing, plus 8 concurrency checks racing 8 connections at hotel switching and at simultaneous likes. The harness itself was verified in both directions: a deliberately failing assertion makes it exit non-zero. Mobile at the time of the commit: `tsc --noEmit` clean, `eslint .` clean, 112 jest tests, `expo export --platform web` bundles.
- Two defects found and fixed during the build, both worth remembering:
  - `app.can_send_message` was SECURITY INVOKER. A block row is only visible to the person who made it, so the message-insert policy could not see that the *other* side had blocked the sender, and let the message through. The test that should have caught it was passing for the wrong reason — `block_user` also unmatches, so the insert was failing on `unmatched_at`. Both fixed; the test now reopens the match so the block is the only thing in the way.
  - `moderation_queue` joined `moderation_actions`, multiplying report rows and inflating the counts a moderator triages on.
- Risks / blockers:
  - No rate limiting on `swipe`, `report_user`, or `record_presence_check`. Acceptable for a pilot, not for open signup.
  - GPS spoofing remains an accepted MVP risk (a client can send any coordinate). The server bounds what that buys: a boolean that expires in 30 minutes, for one hotel at a time.
  - `discovery_feed` evaluates eligibility per candidate row. Fine at pilot scale; revisit before a large hotel.
  - The client still needs a real foreground location read (`expo-location` is deliberately absent); the simulated readings already flow through the same call a real read will use.
- Recommended next agent: `cross-platform-engineer` (screen wiring), then `mobile-qa-release` for R-003, R-004, and the device matrix.

## 2026-07-25 — Four-phase continuous loop authorized

Handoff:
- From: Hami / owner
- To: `project-orchestrator`
- What changed: the backend-only stopping point was replaced with one four-phase MVP systems program.
- Phase order: backend foundation → hotel/presence/discovery → matching/chat/safety → staging/device readiness.
- Execution rule: intermediate phase completion triggers verification, review, a direct-main checkpoint, and immediate transition to the next phase; it must not trigger an owner prompt or completion promise.
- Completion promise: `VOCATION_MVP_SYSTEM_COMPLETE`, only after N-001–N-010 and P0–P5 are verified.
- Files: `CLAUDE.md`, `.studio/agent-plan.md`, `.studio/backlog.md`, `.studio/decisions.md`, `.studio/loop-prompt.md`
- Recommended next agent: `project-orchestrator`, starting at Phase 1.

## 2026-07-25 — Direct-main delivery and Opus loop authorized

Handoff:
- From: Hami / owner
- To: `project-orchestrator`
- What changed: routine Studio checkpoints no longer use pull requests; the runner starts with Opus and verified increments are integrated into and pushed directly to `origin/main`.
- Key decisions: temporary local worktree branches remain allowed for agent isolation; only verified checkpoints may reach `main`; force-push, history rewriting, releases, and production deployment remain forbidden.
- Files: `CLAUDE.md`, `.studio/agent-plan.md`, `.studio/loop-prompt.md`, `.studio/run-loop.sh`, `.studio/git-checkpoint.sh`, `.studio/decisions.md`
- Verification: pending commit and direct `origin/main` push.
- Risks: direct-main delivery removes PR review as a gate, so automated checks and independent code/security review remain mandatory before every push.
- Recommended next agent: `project-orchestrator` for the Supabase backend foundation milestone.

## 2026-07-24 — Owner decisions to Studio

Handoff:
- From: Hami / project setup
- To: `project-orchestrator`
- What changed: strict reservation verification was removed; proximity is enough for Here Now.
- Key decisions:
  - Upcoming is self-declared.
  - Here Now is a recent 500-meter foreground check.
  - Exactly one active hotel.
  - Payment is deferred.
  - No hard identity or reservation data.
- Files: `CLAUDE.md`, `.studio/brief.md`, `.studio/decisions.md`, `.studio/agent-plan.md`, `.studio/backlog.md`
- Risks: copy must not imply hotel/reservation verification; hotel hopping and GPS spoofing are accepted MVP risks to measure.
- Recommended next agent: `mobile-architect`

## 2026-07-25 — MVP foundation complete, ready for backend milestone

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot (director + cross-platform implementation, code-reviewer, security-auditor)
- To agent: `api-architect` / `backend-engineer` / `database-engineer` (next milestone lead: `project-orchestrator`)
- What I did: completed the fixture-driven MVP foundation in `mobile/` — full navigation (onboarding → tabs → rooms → discovery → match → chat → safety), pure domain layer (one-active-hotel, self-declared Upcoming, 500 m / 30 min Here Now, room eligibility, swipe/mutual match), design tokens + accessible shared components, honest trust copy centralized in `src/copy.ts`, and a single wall-clock source in `src/clock.ts`.
- Key decisions:
  - `DECLARE_UPCOMING` derives "today" from the action's own `now` inside the reducer, so the enforcement point cannot disagree with a caller-supplied date.
  - Denying location permission clears any existing Here Now session (no stale "you are in").
  - Report/block is reachable from the discovery deck (pre-match) and from chat — D-008 satisfied from the first usable build.
  - `expo-location` intentionally absent; presence checks are simulated readings flowing through the same domain function a real GPS read will use.
- Files touched: `mobile/` (all of `src/`, `App.tsx`, jest/eslint/tsconfig), `.studio/agent-plan.md`, `.studio/backlog.md`, `.studio/architecture.md`.
- Verification: 55/55 jest tests (7 suites, incl. 3 critical-flow component tests), `npx tsc --noEmit` clean, `npx eslint .` clean, `npx expo export --platform web` bundles. Independent code review + security audit: no critical/high findings; all 5 security checklist items PASS (location minimization, forbidden deps, no PII logging, trust copy, abuse boundaries).
- Risks / blockers: 18+ and one-active-hotel are client-enforced only until the backend (R-001, N-004); no unblock UI (R-002); eligibility recomputes on render, not on a timer (R-003). GPS spoofing / hotel hopping remain accepted MVP risks to measure.
- Recommended next agent: `project-orchestrator` to open the "real backend" milestone (N-001 Supabase structure → N-002 auth/profile RLS).

## Handoff template

```text
Handoff:
- Date:
- From agent:
- To agent:
- What I did:
- Key decisions:
- Files touched:
- Verification:
- Risks / blockers:
- Recommended next agent:
```

## 2026-07-24 — GitHub checkpoint setup

Handoff:
- From: Codex
- To: `project-orchestrator`
- What I did: Authorized `hbektas61/vocation-match` as the project remote and added the verified-increment push contract.
- Key decisions: Push feature branches after checks; never force-push or auto-merge `main`.
- Files touched: `CLAUDE.md`, `.studio/agent-plan.md`, `.studio/handoffs.md`
- Verification: `npm exec tsc -- --noEmit` passed in `mobile/`.
- Risks / blockers: Codex sandbox cannot write `.git/config` or access the macOS Keychain; the owner must run the initial remote/commit/push commands in Terminal.
- Recommended next agent: `cross-platform-engineer`

## 2026-07-25 — H1 profile photos leave the open internet (pilot hardening, phase 1)

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot (`project-orchestrator` + `database-engineer`/`cross-platform-engineer` implementation, `code-reviewer`, `security-auditor`)
- To agent: `backend-engineer` (H2, in-app account deletion)
- What I did: closed backlog S-001 and decision D-014. `profiles.photo_url` is gone
  — the column, both of its stop-gap constraints, and every code path that could
  write a URL. A profile photo is now an object in a private bucket whose path
  begins with the owner's user id, read through a policy and never through a
  permanent URL.
- Key decisions:
  - **Path shape is the ownership boundary.** `<owner uuid>/<24–64 char random
    token>.<jpg|png|webp>`, enforced by two CHECK constraints on `profiles` and by
    the storage policies. The token comes from a CSPRNG, not `Math.random`,
    because a user id is public to everyone in a room — if the second segment
    were predictable the whole path would be.
  - **Ownership is never taken from the row being written.** `storage.objects.owner`
    is written by the storage service and is part of the insert, so the policies
    compare the path prefix to the caller instead. A pgTAP case asserts that
    claiming to be the owner in the row does not help.
  - **Reads: owner, match, or same open room — nothing else.** Blocking, suspension
    and a swipe already made all remove the read. A refused read is indistinguishable
    from "no photo", so it cannot be used to learn who is in a room with whom.
  - **`photo_path` is not a writable column.** It was, until the security audit
    pointed out that a client could PATCH it to any well-shaped string with nothing
    behind it, and that every distinct value fired the cleanup trigger — a free way
    to grow `storage_cleanup_queue` without bound. It now goes through
    `public.set_profile_photo()`, which checks the object exists and counts against
    a 20/hour limit.
  - **EXIF is dropped by re-encoding, and never requested.** A photo taken at the
    hotel carries the exact GPS position — the one thing D-005 says never leaves.
    The picker asks for `exif: false` and the bytes uploaded come from an
    `ImageManipulator` re-render, never from the picked file.
  - **What the database cannot do is stated, not implied.** Deleting a
    `storage.objects` row makes an object unreadable; it does not delete the bytes.
    `public.storage_cleanup_queue` records that outstanding work for a service-role
    job, and the client sweeps its own prefix on every upload and removal so a
    crash mid-upload leaks at most one object per account.
- Files touched: `supabase/migrations/20260725001400_profile_photos.sql`,
  `supabase/migrations/20260725001500_photo_write_path.sql`,
  `supabase/scripts/storage-bootstrap.sql`, `supabase/scripts/db-test.sh`,
  `supabase/tests/011_profile_photos.sql`, `supabase/tests/005_discovery.sql`,
  `scripts/verify-api-contract.js`, `mobile/src/data/{photos,imagePicker,contracts,supabaseApi,fakeApi}.ts`,
  `mobile/src/components/{ProfilePhoto.tsx,ui.tsx}`, `mobile/src/state/usePhotoUrls.ts`,
  `mobile/src/screens/{Settings,Discovery,Inbox,ProfileSetup}Screen.tsx`,
  `mobile/src/{copy.ts,domain/types.ts,state/appReducer.ts}`, `mobile/app.json`,
  `mobile/package.json` (expo-image-picker, expo-image-manipulator, expo-crypto).
- Verification: `bash scripts/check.sh` — 271 pgTAP assertions across 12 SQL suites
  (43 of them new, in `011_profile_photos.sql`), 13 concurrency checks, the
  client/database contract check (now covering the storage bucket and its policies),
  `tsc --noEmit`, `eslint --max-warnings 0`, 173 jest tests, and the web bundle.
  The read policy was negative-controlled: replacing it with a permissive one turns
  five of the new assertions red, so they depend on the policy rather than on
  something else being empty.
- Risks / blockers:
  - **Deferred, needs a device (D-015).** That the native encoder really drops every
    EXIF tag is asserted by the code path, not by inspecting stored bytes. The jest
    suite proves EXIF is never requested and that the original file is never the one
    uploaded; confirming the output is metadata-free needs a GPS-tagged photo on real
    hardware. Recorded in `.studio/device-readiness.md`.
  - **Deferred, needs a hosted project.** Nothing here has run against a real
    storage service. The policies are exercised against the same wide-open grant
    shape production has (`storage-bootstrap.sql` grants ALL to anon/authenticated
    and relies entirely on RLS), but a signed-URL round trip has not been made.
  - Declared MIME type is trusted by the storage service, not verified against the
    file bytes. Low risk while the only consumer is a native `<Image>`; it becomes
    real if a browser-facing surface ever renders this bucket.
  - Signed URLs last five minutes and an already-issued one survives a block for the
    rest of its window. Inherent to signed URLs; the window is short and deliberate.
  - `storage_cleanup_queue` has no drainer yet. It is a record of outstanding work,
    not a mechanism.
- Recommended next agent: `backend-engineer` for H2 — `public.delete_my_account()`,
  the confirmation UX, and local session removal.

## 2026-07-25 — H2 an account can be deleted from inside the app (pilot hardening, phase 2)

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot (`project-orchestrator` + `backend-engineer`/`cross-platform-engineer` implementation, `code-reviewer`, `security-auditor`)
- To agent: `backend-engineer` (H3, email confirmation readiness and S-004)
- What I did: added `public.delete_my_account()` and the confirmation flow around it,
  and — from the audit — removed the second, unguarded way to delete your data that
  had been there since the first migration.
- Key decisions:
  - **The function takes no arguments.** That is the whole security design: there is
    no id to pass, so the account deleted is whichever one the JWT belongs to. A
    pgTAP assertion checks the signature, so a future argument would fail the suite.
  - **It deletes the `auth.users` row, not the profile.** One statement, so a
    failure anywhere in the cascade rolls the whole thing back — there is no
    half-deleted state — and the email stops being registered rather than lingering
    on an account with nothing behind it.
  - **A suspended account can still delete itself.** Suspension is a limit on
    reaching other people, not a reason to trap someone in the product. So the
    function deliberately does not call `app.require_user()`.
  - **MEDIUM, from the audit: `authenticated` still had a table-wide DELETE grant on
    `profiles`.** `from('profiles').delete().eq('id', me)` wiped the profile, hotel,
    stay, swipes, matches and conversations through the cascades — with no
    confirmation, no rate limit, and the auth row left behind, so the person stayed
    signed in to an account that looked freshly onboarded. Revoked, with the policy
    dropped and a structural guard in `000_security_baseline.sql` so no future
    migration can restate it.
  - **LOW, from the audit: a swallowed local sign-out could strand a token.** The
    session key is now named explicitly in `createClient` rather than left to
    supabase-js's project-ref default, so the deletion path can clear it directly
    instead of relying on `signOut()` succeeding.
  - **From the code review: "Nothing was deleted" was a claim the client cannot
    make.** A dropped connection can hide a deletion that committed. There are now
    two messages — one for a refusal the server actually sent, one for an answer
    that never arrived — and a `P0002` on retry is treated as success, because the
    postcondition the caller asked for is true.
  - **From the code review: the deletion tests passed for the wrong reason.** Every
    assertion after `deleteAccount()` failed on the missing session before it ever
    reached the data, so the purge could have been deleted entirely and the suite
    would still have been green. `FakeApi.recordsFor()` is a test seam that looks at
    the stored records instead.
  - **The irreversibility warning is announced.** It carries the `error` tone, which
    is the only one `Notice` announces — someone using VoiceOver can reach the
    delete button without linearly reading the paragraphs above it.
- Files touched: `supabase/migrations/20260725001600_account_deletion.sql`,
  `supabase/migrations/20260725001700_deletion_is_the_only_path.sql`,
  `supabase/tests/{000_security_baseline,001_profiles,012_account_deletion}.sql`,
  `mobile/src/data/{contracts,supabaseApi,fakeApi}.ts`,
  `mobile/src/screens/SettingsScreen.tsx`, `mobile/src/copy.ts`,
  `mobile/src/data/__tests__/deleteAccount.test.ts`,
  `mobile/src/__tests__/deleteAccountUi.test.tsx`.
- Verification: `bash scripts/check.sh` — 296 pgTAP assertions across 13 suites
  (24 of them in `012_account_deletion.sql`), 13 concurrency checks, the
  client/database contract check, `tsc`, `eslint --max-warnings 0`, 185 jest tests,
  the web bundle.
- Risks / blockers:
  - **Known limitation, carried to H-406.** There is no timeout on any request in the
    app. If the deletion request stalls, the card stays on "Deleting…" with no way
    out short of restarting. Systemic rather than specific to this screen, and the
    right place to fix it is the offline/lifecycle pass.
  - **Still open: `storage_cleanup_queue` has no drainer.** A deleted account's photo
    stops being readable immediately, but the bytes stay until a service-role job
    exists to remove them. Carried to H-403/H-411.
  - **Deferred, needs a device (D-015).** The keychain path — that the session really
    is gone from SecureStore after a deletion, and that the app comes back clean on
    the next cold start — is tested against an injected storage adapter, not against
    a real keychain.
  - A deleted account can sign up again with the same email. That is the existing
    open owner decision about suspension being per account rather than per person;
    deletion does not make it worse, but it does not close it either.
- Recommended next agent: `backend-engineer` for H3 — email confirmation
  configuration and the unconfirmed-email states, then S-004 room attribution.

## 2026-07-25 — H3 email confirmation, and a match label that stops depending on who swiped second

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot (`project-orchestrator` + `backend-engineer`/`cross-platform-engineer` implementation, `code-reviewer`, `security-auditor`)
- To agent: `project-orchestrator` (H4, the pilot-hardening pass)
- What I did: turned email confirmation on and made the client survive it, then
  closed backlog S-004 so a pair's match label is the same whichever of them
  swiped second.
- Key decisions:
  - **`enable_confirmations = true`, locally too.** It was off "for local
    development only", which meant every local run exercised a sign-up flow no
    real project has — one that returns a session immediately. The client was
    written against that and threw on the happy path of a correctly configured
    project. No test could have caught it, because no test ran against the real
    configuration. `scripts/verify-auth-config.js` now fails the build if it is
    turned back off, and it runs even in `--mobile` mode because it needs nothing.
  - **`signUp()` returns a union, not a session.** `SIGNED_IN` or
    `CONFIRMATION_REQUIRED`, so a caller cannot forget the second case. The
    confirmation screen has a resend, a way back, and — only when there is no
    backend configured — a labelled stand-in for opening the link, the same
    pattern the simulated location reads already use.
  - **The sign-up form does not say whether an address is registered.** GoTrue
    answers a duplicate sign-up exactly like a fresh one, deliberately, and the
    fake and the copy both match it. On a dating-adjacent product, "that email is
    taken" is a way to find out who has an account here.
  - **MEDIUM, from the audit: nothing bounded the mail.** Sign-up and resend both
    send to an address the caller types in, both are public, and a script could
    point them at a real person's inbox. `[auth.rate_limit]` in `config.toml`,
    a ceiling enforced by the config check, and CAPTCHA plus the hosted limits
    written into `docs/hosted-setup.md`.
  - **S-004: the label comes from the pair's first swipe** — room and hotel, from
    the same row, so they cannot disagree. "First" is a new `seq` identity column
    on `swipes`, not `created_at`: that defaults to `now()`, which is the
    transaction timestamp and ties, the same defect migration 20260725001300
    fixed for messages. Found here the same way — by a test that disagreed with
    itself depending on which row came back first.
  - **LOW, from the audit: `seq` was readable.** The counter is global, so the gap
    between two of your own swipes told you how many swipes everyone else made in
    between. The table-wide SELECT grant became a column list.
  - **From the code review: the resend and the way back were untested.** Both are
    the only exits from a screen someone reaches by accident — an existing account
    tapping "create one" lands there, because the server will not say the address
    is taken. Three tests now cover resend, a failed resend, and going back to
    sign in.
- Files touched: `supabase/config.toml`,
  `supabase/migrations/20260725001800_match_room_attribution.sql`,
  `supabase/tests/{013_match_attribution.sql,concurrency.sh}`,
  `scripts/{verify-auth-config.js,check.sh}`, `docs/hosted-setup.md`,
  `mobile/src/data/{contracts,supabaseApi,fakeApi}.ts`,
  `mobile/src/screens/AuthScreen.tsx`, `mobile/src/copy.ts`,
  `mobile/src/testSupport/onboarding.tsx`, and the six test files whose
  onboarding path changed.
- Verification: `bash scripts/check.sh` — the auth-configuration check (negative
  controlled: turning confirmation off fails it), 311 pgTAP assertions across 14
  suites, 13 concurrency checks including two new ones that race both swipe
  orders from different rooms, the client/database contract check, `tsc`,
  `eslint --max-warnings 0`, 193 jest tests, the web bundle.
- Risks / blockers:
  - **Deferred, needs the hosted project.** Confirmation, the rate limits and the
    CAPTCHA are dashboard settings that do not travel with the migrations.
    `docs/hosted-setup.md` says what to set; nothing here can check that it was
    done, or that it stays done. That is backlog S-003, now written down rather
    than only noted.
  - **Deferred, needs a real mailbox.** No confirmation email has ever been sent
    or opened. The local configuration points at Inbucket; the flow is proved
    against the in-memory implementation only.
  - `seq` numbers pre-existing rows during the ALTER's table rewrite, in physical
    order. For an append-only table that is insertion order, but it is an
    assumption rather than a guarantee, and it only affects matches that already
    existed. Stated in the migration.
- Recommended next agent: `project-orchestrator` for H4 — the pilot-hardening pass
  over security, privacy, abuse resistance, accessibility, lifecycle, offline,
  migration replay, contract drift, dependencies, performance, and documentation.

## 2026-07-25 — H4 the pilot-hardening pass

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot (`project-orchestrator`, with `security-auditor`,
  `accessibility-auditor` and `performance-profiler` running the three passes
  that needed an independent reader)
- To agent: the owner. Everything left needs hardware, a hosted project, or a
  real mailbox.
- What I did: one pass per dimension, each producing a fix or a written reason
  it needed none.
- The findings worth remembering:
  - **A live presence oracle on a named person, in two places (CRITICAL).** Both
    `swipe()` and the photo read answered from the *target's* room eligibility
    at that moment. A user id is public to everyone who has seen a card, so
    either one could be polled: it said "not in this room" while somebody's
    proximity check was stale and stopped saying it the instant they checked in
    near the hotel. The swipe version worked on people the deck had deliberately
    stopped showing you — someone you passed over got a feed on your arrivals.
    The photo version needed no swipe at all, wrote nothing, and
    `createSignedUrls` takes an array, so one request could watch a list.
    Fixed in `20260725002100` and `20260725002200`: a decision already made is
    answered from storage, and a photo read no longer depends on where its owner
    is. Recorded as D-016.
  - **The same line also broke D-012.** "A repeat swipe is a no-op that returns
    the existing outcome" is what makes the endpoint safe to retry over a flaky
    hotel connection — and it raised 42501 instead if the other person had moved
    in between. The existing idempotency test could not have caught it: it kept
    the target eligible throughout, which is the case that works either way.
  - **`swipe` and `discovery_feed` had no rate limit at all**, which is what made
    polling practical rather than theoretical. Both have one now, counted only
    when there is new work to do, so a retry over a bad connection is free.
  - **The discovery deck's dominant scan was bounded by the wrong thing.**
    `user_active_hotel` holds one row per user forever, so filtering it by hotel
    was a sequential scan over lifetime signups across every hotel. Measured at
    25x cost growth for the same 20 cards. One index, and a smoke check that
    fails on the plan shape rather than on a laptop's wall clock.
  - **Four accessibility defects of the same shape as the ones R-004 fixed**: a
    screen replacing itself in place with nothing announced, a resend silent on
    success, a delete warning where only the last of three sentences was spoken,
    and inbox rows collapsing the preview and the closed-conversation caption
    into a label that named only the person.
  - **Nothing had a request timeout.** A connection that is accepted and then
    goes quiet left every busy button disabled forever.
  - **A lapsed session left the app looking signed in**, with every request
    failing and the failures reported as "email or password is incorrect".
  - **33 high dependency advisories**, all one transitive chain, closed by an
    override. The remaining one is written down with the reason it cannot reach
    a phone rather than silenced.
  - **The migrations had only ever been applied one way.** Now applied both ways
    and compared — schema, grants and policies.
  - **The storage cleanup queue had no way to be drained.** It has a contract
    now; the worker that uses it needs the service-role key and so lives outside
    this repository, with the runbook in `docs/hosted-setup.md`.
- What needed no change, and why: no grant drift anywhere (every `add column`
  against a table with a narrow grant restates it, and the baseline suite fails
  if a table-wide DELETE reappears); no coordinate, distance, birthdate or email
  crosses the user boundary; no analytics SDK and no logging in `src/`; no
  secret anywhere; the copy promises nothing the system does not deliver, which
  is now an executable check rather than a rule in a document
  (`mobile/src/__tests__/trustCopy.test.ts`).
- Verification: `bash scripts/check.sh` — auth configuration, dependency gate,
  334 pgTAP assertions across 15 SQL suites, 13 concurrency checks, the
  performance smoke check, the client/database contract check, the
  migration-replay comparison, `tsc`, `eslint --max-warnings 0`, 216 jest tests,
  the web bundle. Four of the new checks are negative-controlled: breaking the
  storage read policy, the migration replay, the dependency threshold or the
  discovery index each turns its check red.
- Risks / blockers, all external:
  - **D-015 stands.** Nothing has run on a device or a simulator. The EXIF bytes,
    the keychain, the permission dialogs, whether an announcement is audible,
    and whether a ten-second deadline behaves the same on a radio as on a
    laptop are all unverified. `.studio/device-readiness.md` lists them.
  - **S-003 stands for the hosted half.** Email confirmation, the mail rate
    limit and the CAPTCHA are dashboard settings that do not travel with the
    migrations, and nothing here can confirm they were set or that they stay
    set. `docs/hosted-setup.md` says what to do.
  - No confirmation email has ever been sent, and no signed URL has ever been
    minted by a real storage service.
  - `storage_cleanup_queue` still has no worker running against it, so a deleted
    photo is unreadable immediately and its bytes are still there.
  - Two owner decisions are now sized rather than only noted: a suspended
    account can delete itself and sign up again with another email, and three
    disposable addresses can force a moderation flag — which is queue priority,
    not a ban, because a human still has to action it.
- Recommended next agent: none. The next useful step is a device and a hosted
  project, both of which are owner actions.

## 2026-07-25 — closing review of the pilot-hardening program

Handoff:
- Date: 2026-07-25
- From agent: `code-reviewer` (independent closing pass over `9b93065..HEAD`),
  findings applied by studio-autopilot
- What the review was asked: not to re-audit, but to answer whether the Studio
  records are true and whether anything now works worse than before.
- Verdict: the central claim reproduces. The reviewer ran `scripts/check.sh`
  themselves and got the numbers the records cite. They hand-traced the two
  closing migrations against the specific wrong-answer states — an unmatched
  pair, a pair where only the other side swiped, a match whose swipe row was
  gone — and found no regression. They confirmed the new assertions fail if the
  fixes are reverted, which is the property that matters about a test.
- Three findings, all valid, all now fixed:
  - **The fake did not mirror the fix.** `FakeApi.swipe` still consulted the
    target before checking for a stored decision — the same ordering the server
    had just stopped doing. Harmless today, because the fixtures never change
    room, and precisely the sort of divergence that produces a confusing failure
    six months later. The fake's header documents what it *cannot* mirror; this
    was not that. Fixed, with parity assertions in `apiContract.test.ts` that
    name the SQL suite holding the other half.
  - **Two Studio documents were stale through the program's most important
    commit.** The release checklist still cited H3-era counts and said nothing
    at all about D-016 — the highest-severity finding of the program — and the
    backlog had no record of H-401 to H-411. Both now say what happened.
  - **The concurrency-check count was wrong.** Written as 14 in two places; the
    script prints 13. A small number, but the plan says a gate is only done with
    "the checks that passed written next to it", and a number that does not
    reproduce is not evidence.
- One thing the reviewer raised that is recorded rather than fixed: the new fast
  path in `swipe()` does less work than a first swipe, so a precise enough
  timing measurement could still distinguish them. That is a much weaker signal
  than the one D-016 closed — it says whether you have swiped on someone, not
  where they are — and closing it would mean making every call pay the slow
  path. Noted against D-016 rather than acted on.
- Verification: `bash scripts/check.sh` — auth configuration, dependency gate,
  334 pgTAP assertions across 15 SQL suites, 13 concurrency checks, performance
  smoke, client/database contract, migration replay, `tsc`,
  `eslint --max-warnings 0`, 223 jest tests, web bundle.

## 2026-07-25 — verification pass on D-016, and the hole it found

Handoff:
- Date: 2026-07-25
- From agent: `security-auditor` (adversarial verification of the D-016 fix
  against the running database), applied by studio-autopilot
- What the pass was asked: not to survey, but to try to break the two fixes.
- What held, proven against the container rather than argued: a decided pair
  cannot be re-probed; `may_view_photo` behaves correctly for a stale owner, a
  suspended viewer and a viewer who switched hotels; the early return gives the
  right answer after a block, after an unmatch, and when the target's account
  has been deleted; `app.rate_limit` itself is correct and scoped per user.
- **What did not hold, and it is the useful kind of finding.** The rate limit
  added to `swipe()` did nothing on the only path that needed it.
  `app.rate_limit` writes a counter row; the check that follows raises when the
  target is not in the room; both are one transaction, so the raise rolls the
  counter back with everything else. Demonstrated: five refused probes in a row
  left no `swipe` row in `rate_limits` at all. A failed probe was free, which is
  precisely what the limit existed to prevent — "has this named person just
  become reachable" could be asked on a loop at no cost.
  Fixed in `20260725002300`: that one branch returns `refused` instead of
  raising, so the statement commits and the counter with it. The client turns it
  back into the same error with the same words, so nothing changes for anyone
  using the app. The auditor's own reproduction now records five attempts where
  it recorded none.
- **The general lesson, which is worth more than the fix:** a rate limit placed
  before a `raise` in the same function is not a rate limit. The other three
  (`report_user`, `record_presence_check`, `discovery_feed`) were checked
  against this and are counted after the last statement that can raise.
- One claim in the report was wrong and is recorded so nobody acts on it: it
  says `app.require_user()` "only checks the profile exists", so a suspended
  attacker could run the probe. It does check `suspended_at` — migration
  `20260725001100` added exactly that, and it was the highest-severity finding
  of the previous program.
- One residual, accepted and written down rather than fixed:
  `app.may_view_photo`'s hotel branch does not require the owner to have ever
  been room-eligible, only to share the viewer's active hotel. Unreachable
  today, because a photo path is an unguessable token disclosed only by
  `discovery_feed` and `my_matches`, both of which require the owner to have
  been genuinely eligible at the moment the card was shown. Tightening it
  without new state would mean tying visibility back to a presence row that
  expires — which is the flicker D-016 removed. Left as it is, deliberately.
- Verification: `bash scripts/check.sh` — auth configuration, dependency gate,
  335 pgTAP assertions across 15 SQL suites, 13 concurrency checks, performance
  smoke, client/database contract, migration replay, `tsc`,
  `eslint --max-warnings 0`, 223 jest tests, web bundle.

## 2026-07-25 — hosted staging provisioned

Handoff:
- Date: 2026-07-25
- From: owner + Codex
- Project: Supabase `vocation-match-staging`
  (`ftdqkhkeluokpdghzubp`, Frankfurt).
- Applied: every migration through `20260725002300`; `supabase migration list`
  reports the local and remote histories as identical.
- Hosted Auth verified through the Management API: email confirmation on,
  `vocationmatch://` site and redirect URL, minimum password length 8,
  refresh-token rotation on, secure password changes on, OTP length 8, and
  hosted email rate limit 2/hour.
- Client connection: ignored `mobile/.env.local` contains only the project URL
  and public publishable key. Auth gateway smoke returns 200. An unauthenticated
  `hotels` read returns the expected permission denial.
- Security: legacy JWT-based API keys are disabled; no backend key is stored in
  the repository. Backend workers must use a dedicated `sb_secret_...` key.
- Still external: CAPTCHA provider/secret, scheduled storage-cleanup worker,
  real mailbox confirmation-link pass, and D-015 real-device matrix.

## 2026-07-25 — the last locally closable checklist line, and what staging changed

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot
- What I did: closed the one item on the release checklist that this repository
  could still close on its own, and corrected the records that the owner's
  staging commit (`da658fe`) had just made stale.
- **The checklist line.** "Logs and analytics contain no sensitive location,
  stay, profile, or message content" had been unticked with the note "no
  analytics SDK is installed, so there is nothing to audit yet — recheck the
  moment one is added". True, and useless: it depended on somebody remembering.
  `mobile/src/__tests__/noTelemetry.test.ts` now fails the build if a telemetry
  dependency or a `console.*` call appears anywhere in the app. It proves
  nothing about how an SDK would be used; it makes adding one impossible to do
  quietly, so the privacy pass happens before the first event is sent.
- **What staging changed, and what it did not.** `da658fe` provisioned
  `vocation-match-staging` with every migration through `20260725002300`
  applied and its history matching the local one. Verified on my side: the full
  suite still passes on top of it, including `verify-auth-config.js` against the
  edited `supabase/config.toml` (the new `max_frequency`, `otp_length`,
  `otp_expiry` and `[auth.mfa.totp]` do not trip it, and `[auth.rate_limit]` is
  untouched).
  The records said "no hosted project is provisioned" in three places. They now
  say what is true: a **staging** project exists, production still does not, and
  the checks that were blocked on a hosted project are no longer blocked —
  only outstanding. That is a different sentence and worth keeping straight.
- Still genuinely external, in order of what would bite first:
  - **A real device (D-015).** Unchanged, and now the only hard blocker for a
    large part of the list. This machine has Command Line Tools without Xcode
    and no Android SDK.
  - **CAPTCHA**, which needs an owner-controlled provider account. Hosted mail
    is limited to 2/hour, which is tighter than the 30 this repository's check
    allows, so the rate-limit half of that mitigation is in place.
  - **The storage cleanup worker.** Its contract exists
    (`claim_storage_cleanup` / `mark_storage_cleanup_purged`); the job that
    calls them needs a secret key and so cannot live here.
  - **A real confirmation link, and a signed-URL round trip.** Both are now
    possible against staging and neither has been done.
- One thing to watch, raised by the owner's own commit comment: `config.toml`
  is the *local* configuration, and `supabase config push` sends it upward. The
  local `email_sent = 10` is looser than the hosted 2/hour, so a push would
  weaken the hosted setting rather than strengthen it. Worth deciding which
  direction is authoritative before anyone runs that command.
- Verification: `bash scripts/check.sh` — auth configuration, dependency gate,
  335 pgTAP assertions across 15 SQL suites, 13 concurrency checks, performance
  smoke, client/database contract, migration replay, `tsc`,
  `eslint --max-warnings 0`, 226 jest tests, web bundle.

## 2026-07-25 — the storage cleanup worker

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot
- To: the owner, for one manual run and a schedule.
- What I did: wrote the worker the queue has been waiting for. Three handoffs
  in a row have said the same sentence — a deleted photo becomes unreadable
  immediately and its bytes are still there — because the database can drop the
  metadata row and nothing else. Now something can.
- Key decisions:
  - **Plain Node, not an Edge Function.** No dependencies, so it runs anywhere a
    schedule can run it: GitHub Actions, a cron box, or wrapped in an Edge
    Function later. It also means the loop could be tested here, which an Edge
    Function could not have been — there is no Deno on this machine.
  - **Marking is a claim, so it is only made on evidence.** The storage API
    reports what it removed, and only those rows are marked purged. A worker
    that marked everything it *claimed* would turn a queue of real work into a
    queue of lies, quietly, on the first afternoon the object store returned
    503. That is the case the check is built around, and it is negative
    controlled: reintroducing that bug turns four assertions red.
  - **A bucket it was not written for is skipped, not guessed at.**
  - **It exits non-zero if anything is left behind**, so a schedule that reports
    green is telling the truth.
  - The service key is read from the environment, never logged, and the script
    refuses to start without it rather than silently doing nothing.
- Files: `scripts/drain-storage-cleanup.js`, `scripts/verify-storage-drain.js`,
  `scripts/check.sh`, `docs/hosted-setup.md`.
- Verification: `bash scripts/check.sh` — now including the drain check. 335
  pgTAP assertions, 13 concurrency checks, performance smoke, migration replay,
  contract check, auth config, dependency gate, `tsc`,
  `eslint --max-warnings 0`, 226 jest tests, web bundle.
- **What is still not verified, and it is the transport.** There is no object
  store in the checks, so the two HTTP calls have never been made. Run it by
  hand against staging once — queue an object, run the script, confirm the
  bytes are actually gone — before putting it on a schedule. Everything either
  side of those two calls is covered.
- Still external and unchanged: a real device (D-015), CAPTCHA (needs a provider
  account), a real confirmation-link pass, and a signed-URL round trip.

## 2026-07-25 — three gaps a pilot would have hit on day one

Handoff:
- Date: 2026-07-25
- From agent: studio-autopilot, with an independent `code-reviewer` pass
- To: the owner, for the manual pass.
- What I did: ordinary feature work, not hardening. The programme is closed and
  everything left in it is external, so this is the next thing a developer would
  actually build: the three places where the product is complete on the server
  and unreachable from the app.
- **Editing your profile.** One screen wrote a profile, and it only rendered
  when you had none. A name typed wrong during onboarding was permanent, on a
  product where the name is most of what a stranger has to go on. The form is
  now shared between the first save and every edit, so validation, copy and the
  18+ message cannot drift apart, and `ProfileSetupScreen` kept its exact
  testIDs so its behaviour is unchanged. No server work: the grants already
  allowed it and the 18+ trigger fires on update as well as insert, which
  `supabase/tests/001_profiles.sql` already proved.
- **Your declared stay.** You could re-declare dates but never see what you had
  said — so "update your stay dates" was a guess — and you could not take it
  back at all, while a presence answer could always be withdrawn. That
  asymmetry is the part worth naming: both are statements about yourself, and
  one was harder to retract than the other for no reason. Again no migration:
  `upcoming_stays` already granted select and delete with own-row policies.
- **A conversation whose match vanished.** Since deletion shipped, the other
  person leaving takes the match and its messages with them, and the cached
  copy kept the screen alive. The screen now asks the server and lets whatever
  it says win.
- **The find that made the review worth running** was not in its findings list
  but in its open question: does a vanished match ever actually produce
  NOT_FOUND from the real client? It does not. A message insert against a match
  that is gone is a foreign key violation, 23503, which fell through to UNKNOWN
  — so on a real project the app would have said "something went wrong" and
  never reached the code that works out the conversation is gone. Mapped, and
  covered in `errorMapping.test.ts`.
- **One finding I did not act on, deliberately.** The reviewer flagged that a
  block now sends someone to the same terminal screen as a deleted account, and
  suggested distinguishing them. That is the opposite of what this product
  wants: `my_matches` already hides a blocked pair, so the screen is simply
  agreeing with the inbox, and telling the blocked person which of the two
  happened is exactly what the blocks table is careful never to reveal. Tested
  in both directions instead — a block ends terminal, an ordinary unmatch keeps
  the history readable — and written down here so the next reader does not have
  to re-derive it.
- Verification: `bash scripts/check.sh` — 340 pgTAP assertions across 15 SQL
  suites, 13 concurrency checks, performance smoke, migration replay, storage
  drain, contract check, auth config, dependency gate, `tsc`,
  `eslint --max-warnings 0`, 239 jest tests, web bundle.
- Unchanged and still external: a real device (D-015), CAPTCHA, one manual run
  of the cleanup worker against staging, a real confirmation link, a signed-URL
  round trip.


## 2026-07-26 — the way in, and the direction it is drawn in

The task was an onboarding wizard, adapting the *structure* of a well-known
onboarding flow — one question per screen, a thin progress line, a bottom action
— without any of its brand, copy or images, and a palette of open-sea blue and
warm sand.

- **Twelve steps, in `mobile/src/onboarding/`.** Welcome, the 18+ promise,
  email, password, the confirmation wait, name, birthdate, bio, interests, one
  photo, hotel, three teaching cards. `AgeGateScreen`, `AuthScreen` and
  `ProfileSetupScreen` are gone; the navigator has one gate.
- **The step is derived, not stored (D-017).** That is what makes "a finished
  onboarding must not reappear" true without writing anything down. The first
  version let the derived step override a tapped one, which quietly skipped
  bio, interests and photo the moment the profile was saved — a step somebody
  walked to now stands until it is impossible.
- **`interests` is the one schema change (D-018).** The domain model had
  carried the field with `[]` behind it since the first milestone, and the step
  that asks for them would otherwise have thrown the answer away.
- **Two of the palette values I was handed failed contrast** on the surfaces
  they are used on and were corrected within the same family. Both are written
  down in `theme.ts` with the measured ratio.
- **Two real bugs, neither of them about looks.** An unrelated profile edit
  emptied the interests list, because the write sent `interests ?? []` — the
  same trap the photo field already had, and the reason `photo_path` is absent
  from that upsert. And signing back in did not restore the active hotel, so a
  returning account was asked to choose a hotel it already had.
- **Six defects only the screenshots found**, listed in `.studio/design.md`.
  The tab-label one is worth naming here: the icon slot flexes by default, took
  the whole item, and squeezed the label's box to 7px, which with
  `overflow: hidden` cut every label in half at every viewport.
- Verification: `bash scripts/check.sh` — 345 pgTAP assertions across 15 SQL
  suites, the concurrency checks, performance smoke, migration replay, storage
  drain, contract check, auth config, dependency gate, `tsc`,
  `eslint --max-warnings 0`, 247 jest tests, web bundle. Plus `expo-doctor`
  (20/20) and a scripted walk of all twelve steps at 375×667 with a screenshot
  of each.
- Two things worth being straight about. The reference page I was pointed at
  could not be read — it serves images, so the inventory came from the written
  brief rather than from the twenty-one screenshots. And the brief asked for
  Expo SDK 54 / RN 0.81; this project is on SDK 57 / RN 0.86, and I kept the
  installed versions rather than downgrading a working toolchain.
- Unchanged and still external: a real device (D-015), CAPTCHA, one manual run
  of the cleanup worker against staging, a real confirmation link, a signed-URL
  round trip.


## 2026-07-26 (later) — the two ways out that were not wired

Picked the onboarding work back up and re-read it against the brief rather than
against the previous note. The wizard itself was there and passing; two of the
brief's device requirements were not met, and neither would have shown up in
any check that was already being run.

- **Android's back button closed the app.** The twelve steps live inside one
  navigator screen, so React Navigation had nothing to pop and declined the
  press — from step four, back meant leaving with the whole draft. The fix is
  not the handler so much as where the answer lives: `backTarget` is now one
  table, read by both the arrow in the corner and the hardware button. Written
  separately they drift, and the one that drifts is the one nobody can see.
  Three steps deliberately return `null` — welcome is the start, and name and
  the teaching cards sit past a point walking backwards cannot undo — so the
  press goes unclaimed exactly where the arrow is absent.
- **Eleven of the twelve steps arrived in silence.**
  `useScreenChangeAnnouncement` already existed, with a comment describing this
  exact defect, and was called on one step. A step swapping in place does not
  move the screen-reader cursor the way a push does, so tapping Continue handed
  a VoiceOver user a new question with nothing said. It now lives in
  `OnboardingScaffold`, and in `TeachingStep` — the only other thing that
  replaces itself — so no step can forget it. The explicit call on the
  confirmation step came out rather than announcing twice.
- Both fixes moved logic *out* of the steps, which is the direction the
  scaffold was already going: a step supplies a question, never a layout, and
  now never a navigation rule either.
- Verification: `tsc`, `eslint --max-warnings 0`, **251 jest tests across 23
  suites** (four new), `expo export --platform web`, `expo-doctor` 20/20. The
  back-button tests stand in for Android by driving what the app registered,
  most-recent-first, the way the platform does — the iOS build under test has a
  `BackHandler` that never fires, so registration is the honest thing to check.
- **Not run this time: the database half of `scripts/check.sh`.** Docker is not
  available in this environment. Nothing in this increment touches SQL, so the
  345 pgTAP assertions in the note above still describe the schema — but they
  were not re-run, and that is a blocker rather than a result.
- Unchanged and still external: a real device (D-015) — now including a real
  Android back press and a real VoiceOver/TalkBack walk, both listed in
  `.studio/device-readiness.md` — CAPTCHA, one manual run of the cleanup worker
  against staging, a real confirmation link, a signed-URL round trip.

## 2026-07-26 — onboarding integrated onto Expo SDK 54

Handoff:
- What I did: cherry-picked `a323d7e` onto the SDK 54 checkpoint `d21f2ad`,
  producing `d3b41f0`, then repaired the React 19 test-driver races and all
  valid independent review findings.
- Key decisions: SDK 54 remains authoritative (`expo ~54.0.0`, React 19.1,
  React Native 0.81.5). A profile without an active hotel resumes at bio so a
  restart cannot silently skip optional onboarding. Plaintext password state
  is cleared after successful sign-up/sign-in or confirmation-required output.
- Files touched after integration: onboarding flow/password step and tests,
  the shared onboarding test driver, the interests migration/test, and Studio
  evidence.
- Verification: `scripts/check.sh` passed end to end — auth/dependency gates;
  346 pgTAP assertions plus concurrency and performance checks; client/database
  contract; fresh-vs-stepped migration replay; storage drain; TypeScript;
  ESLint with zero warnings; 251 Jest tests; Expo SDK 54 web export.
- Reviews: independent code and security reviews reported no critical/high
  findings. Their two medium findings (restart skipping optional steps,
  incoherent active-hotel restoration/plaintext password retention) and the
  null-interest defense-in-depth finding were fixed before the final gate.
- Risks / open questions: real-device verification remains deferred under
  D-015. React 19 emits non-failing `act()` warnings in several older tests;
  the suite is green, but those tests should migrate to async helpers over time.
- Recommended next agent: mobile-qa-release for the D-015 device matrix.

## 2026-07-26 — phone-only account entry on the SDK 54 baseline

Handoff:
- Owner direction: remove email and make a phone number plus SMS code the only
  way into the app for both new and returning travellers. D-019 records that
  product decision; Expo remains `~54.0.0`, React 19.1 and React Native 0.81.5.
- Mobile: the onboarding account steps are now phone → six-digit OTP.
  Supabase uses `signInWithOtp({ phone })` and
  `verifyOtp({ phone, token, type: 'sms' })`; FakeApi preview uses the plainly
  labelled `123456`. E.164 validation happens before the network, resend is
  locked for 60 seconds, lost initial/resend responses are treated as possibly
  accepted, and verify/resend cannot race.
- Lifecycle: a successful OTP stores the session immediately. Profile and
  active-hotel hydration is a separate retryable state, so a dropped profile
  request cannot consume the OTP and throw the person back to sign-in.
- Privacy: phone numbers stay in Supabase Auth and are absent from the public
  database contract. The OTP screen shows only the last four digits, clears
  phone/code state after verification, and the root privacy shield covers the
  whole UI on inactive/background app-state transitions.
- Fail closed: FakeApi is available only with
  `EXPO_PUBLIC_USE_FAKE_API=true`; missing/partial backend configuration throws.
  The config gate rejects email sign-up, fixed OTPs, common provider secrets,
  any built-in SMS provider and the Send SMS Hook before CAPTCHA. Six negative
  mutations prove those failures.
- Reviews: independent code and security re-reviews reported no
  critical/high findings. Their session-hydration, ambiguous resend, provider
  hook and app-switcher privacy findings were repaired. Hosted dashboard drift
  remains a manual release check because repository checks cannot read it.
- Verification: `scripts/check.sh` passed end to end — auth gate and six
  negative controls; 348 pgTAP assertions plus concurrency/performance;
  client/database contract; migration replay; storage drain; TypeScript;
  zero-warning ESLint; 279 Jest tests; Expo SDK 54 web export.
- External security/release gate: real SMS is intentionally not pilot-ready.
  Keep the hosted provider and Send SMS Hook off until a native CAPTCHA flow
  supplies a fresh token on initial send and resend. Then set hosted OTP expiry
  to 600 seconds, bound cost/geography/rates, audit hosted settings, and complete
  real-SMS, CAPTCHA, autofill and app-switcher passes on iOS and Android.
- Existing email-only Auth users are not automatically migrated. Preserving a
  real account UID would require a separately reviewed, phone-verified identity
  migration; staging fixtures can instead be reset by an explicit owner action.


## 2026-07-26 (later) — the owner's brief: base reconciled, first two slices in

Picked up `CLAUDE_UI_ONBOARDING_HANDOFF.md` plus the two reference screenshots.
Before any of it, the base had to be sorted out, and that is the part worth
reading.

**The base.** I had been working in `.claude/worktrees/pilot-hardening`, which
was on Expo 57 / RN 0.86 with email-and-password onboarding — both of them
things the brief forbids. The brief named `5ad8f03` as the authorised base and
that object did not exist locally, which made it look like a mistake; it was
not. `origin/main` had moved and this clone had simply never fetched it. What
was actually on disk was the phone-only OTP work, uncommitted, ~1000 lines,
in the primary checkout. So:

- Verified that working tree (full `scripts/check.sh` green) and committed it,
  rather than leaving a thousand unversioned lines to be lost.
- Then found `5ad8f03` on the remote with a byte-identical tree, dropped my
  duplicate commit, and rebased the real work onto it. No force-push, nothing
  reset, nothing deleted.
- The worktree commit `a323d7e` is superseded and stays where it is. Its two
  fixes — the Android back handler and the per-step screen-reader
  announcement — are already in the phone-only line, so nothing was lost.

**Slice 1, the palette (D-020, D-021).** Both owner rules applied at the token
file: every sand surface white, every blue and green accent `#E1C4FF`. The old
`ocean`/`sea`/`sand` names are gone rather than re-pointed, so nothing reads as
a colour it is not. One measurement drove the rest of the design: the brand
colour is 1.55:1 on white. It therefore cannot be a boundary, cannot carry text
on white, and cannot be a state by itself — so it never appears alone. The
focused border is exactly the hex the owner asked for, plus weight, fill and a
`#7B4FA8` ring, because the colour on its own is a focus state a lot of people
cannot see. `Field` now owns the box rather than the `TextInput`, which is what
lets a single line centre vertically on both platforms while a composer still
starts at the top; it also stops swallowing the caller's `onFocus`, `onBlur`
and `style`. Cards survive white-on-white via an edge and a small lift, and the
two rooms are told apart by word and filled-versus-hollow mark rather than hue.
The theme test computes the ratios from the tokens instead of trusting the
comments, which is what stops the next hex nudge from silently invalidating
them.

**Slice 2, the phone prefix (D-022).** `+90` is drawn beside the box and never
enters the editable value. Ten national digits in, E.164 out, once, at the
call. The Turkey-only parser is its own module and reads the four ways people
really supply a number — plain, trunk zero, `+90`, contact card, spaced or
hyphenated — because rejecting a pasted number reads as the app being broken.
"Not finished" and "not a mobile number" are separate answers, since a landline
typed in full is complete and more digits will never fix it.

Verification for both: `bash scripts/check.sh` entirely green — 348 SQL
assertions, concurrency, performance smoke, migration replay, storage drain,
the client/database contract, `tsc`, `eslint --max-warnings 0`, 321 jest tests
across 29 suites, and the web bundle. Pushed to `origin/main` as `354b5cc`.

**Not started yet, and honestly the larger half of the brief.** Birthdate
`DD/MM/YYYY`; removing the bio step; the new profile order with gender,
orientation and show-me, which is a migration, RLS, column grants, discovery
semantics and an explicit `onboarding_completed_at`; Passions with its counter;
nine ordered photos and the real cause of the upload failure; and taking the
hotel out of onboarding in favour of a gate at first discovery intent. Each of
those is its own vertical slice and none of them is started — no half-applied
schema, no dead UI.

**Still external.** Every device line in `.studio/device-readiness.md`: the
`+90` field with a real keyboard, paste and autofill; the focus ring on a real
screen; VoiceOver and TalkBack; and the photo round trip, which cannot be
diagnosed anywhere but a real runtime.


## 2026-07-26 (later still) — five of the seven slices

Continued straight through. What is on `main` now, each verified by a full
`scripts/check.sh` before it was committed:

1. **Palette and global input** (D-020, D-021) — white ground, one lavender,
   a focus state that does not depend on a 1.55:1 colour, `Field` owning its
   box so a line centres on both platforms.
2. **`+90`** (D-022) — fixed prefix, ten national digits, E.164 at the call.
3. **`DD/MM/YYYY`** — display only; ISO at every boundary, and the 18+ line
   asserted with the process clock moved either side of UTC.
4. **The profile questions** (D-023, D-024, D-025) — bio out; name, birthdate,
   gender, orientation, show-me, passions, photo in; `onboarding_completed_at`
   set only by the server; show-me filtering discovery in both directions; the
   hotel out of onboarding entirely.
5. **Hotel search** — nothing fetched or offered until two characters are
   typed, stale answers discarded by sequence, and four distinct states.

Three things worth carrying forward that the work turned up rather than
implemented:

- Updating another user's row in a pgTAP test is a **silent RLS no-op**. Three
  assertions passed for the wrong reason until each change was made as its own
  owner. Worth remembering the next time a discovery test looks green.
- `verify-migration-replay.sh` seeds rows **partway through** the migration
  list, so `tests.create_member` cannot assume a column that a later migration
  adds. It now sets the identity columns only if they exist — which is also
  what leaves the backfill something real to back-fill.
- Merging rather than replacing on `HOTELS_LOADED` is load-bearing now that
  hotels arrive from a search: replacing dropped the active hotel out of the
  store as soon as somebody searched for anything else, and its name is what
  the switch prompt is built from. A test caught it; the screen looked fine.

### Still to do — the photo slice, and only that

**Nine ordered photos and the upload failure.** Untouched, and deliberately not
half-started: there is no 3×3 grid pretending to be one, and no schema for
photos beyond the single `profiles.photo_path` that has always been there. It
needs an additive ordered-photo model with the private bucket, EXIF strip,
signed URLs and cleanup queue extended to every slot, a primary-photo concept,
and a backward-compatible move of the existing `photo_path`.

The upload bug cannot honestly be closed from here. The suspicion in the brief
— that `fetch(file://…).arrayBuffer()` does not do what it appears to on a real
Expo runtime — is plausible and is exactly the kind of thing a FakeApi test
will report as working. It needs the staged isolation the brief lists, on a
device or simulator. Recorded as an external blocker rather than guessed at.

Also still external: every device line in `.studio/device-readiness.md` — the
`+90` field with a real keyboard and autofill, the focus ring on a real screen,
VoiceOver and TalkBack over the new steps, and reduced motion.


## 2026-07-26 (final) — the brief, finished

All seven slices are on `main`, each verified by a full `scripts/check.sh`
before it was committed. The last four, after the earlier note:

6. **Identity is editable after onboarding.** Gender, orientation and show-me
   were asked once and then unreachable. show_me decides whose cards you are
   shown, so being wrong about it with no way back leaves somebody with an
   empty deck and no explanation. All three now go through the same form as the
   name. A test pins that editing never clears `onboarding_completed_at`, which
   would take somebody out of discovery silently.
7. **The hotel gate.** Removing the hotel from onboarding stopped it blocking
   entry, but reaching for a room still only said "activate a hotel first" —
   naming the problem and leaving somebody to find the fix. The way out is now
   on the blocked screen, and choosing hands them back to what they were
   reaching for. Backing out without choosing is allowed on purpose.
8. **The teaching cards** are deleted rather than left dead. They stopped
   rendering when they left the wizard; the figures, copy and a stale comment
   outlived them. In git if ever re-sited.
9. **Photos.** The largest, and the one with a real diagnosis in it.

### The upload bug, since this is the part worth writing down

`readLocalFile` was `fetch(uri).then(r => r.arrayBuffer())`. That is the
version that looks right, and it fails differently on each platform:

- **Android**: `fetch` goes to the network stack, which is OkHttp, and OkHttp
  has **no handler for the `file` scheme**. Every upload failed with a bare
  "Network request failed". This never worked, on any build.
- **iOS**: the request succeeds, and then `arrayBuffer()` routes through React
  Native's `FileReader`, whose `readAsArrayBuffer` is implemented by asking the
  native module for a **base64 data URL** and decoding it in JS. A whole extra
  copy of a multi-megabyte image, in string form, on the JS thread.

Both are fixed by reading the bytes natively: `expo-file-system`'s `File`
implements `Blob` and has `arrayBuffer()`. Added at `~19.0.23`, the version
`expo` itself pins for SDK 54 — a dependency, not an SDK change. expo-doctor
is 18/18 with it.

I could not prove this on a device, so it is a diagnosis from the platform
source rather than an observed fix, and the device checks in
`.studio/device-readiness.md` say so.

### Nine photos

`profile_photos`, owner-only, no client write at all — the three RPCs are the
only way in. `profiles.photo_path` stays and becomes *derived* from slot 1,
which is what lets the card, the read policy, the cleanup worker and every
existing test carry on unchanged, and reduces the feature to one invariant.
Slots stay contiguous. A removed object goes to the cleanup queue rather than
being orphaned.

Reordering is one statement with a deferred primary key: a CHECK constraint
cannot be deferred, so shuffling everything out to high numbers first — the
usual trick — is not available here.

**Reordering is by explicit controls and the screen does not claim a drag
gesture** (D-027). The brief allowed either; a caption describing a gesture the
app does not have is a caption for a different app, and explicit controls are
the only form of reordering a screen reader can operate.

### Verification

`bash scripts/check.sh` entirely green: 378 SQL assertions across 16 SQL
suites, concurrency, performance smoke, migration replay, storage drain, the
client/database contract, auth config and its negative controls, dependency
gate, `tsc`, `eslint --max-warnings 0`, **374 jest tests across 33 suites**,
and the web bundle. Plus `expo-doctor` 18/18. Expo stayed on `~54.0.0`,
React 19.1.0, RN 0.81.5 throughout.

### What is left, and it is only the device

Nothing in the brief is unimplemented. What cannot be closed from here is every
line in `.studio/device-readiness.md`: the photo round trip on a real Android
device above all, the `+90` field with a real keyboard and autofill, the focus
ring on a real screen, VoiceOver and TalkBack over the new steps, and reduced
motion. Those are recorded as external blockers, not as passes.


## 2026-07-26 — the reviews, and what they found

Both independent reviews ran against `5ad8f03..HEAD`. Six real defects, four of
them introduced in this session. All fixed, each with a test.

**A failed photo add deleted the rest of the set** (security, high). The error
path called `sweepPhotoObjects(userId, null)` — list the owner's prefix, delete
everything not named `keep`. Correct when a profile held one photo; with nine
it destroys every object still attached to a live row. Reachable from an
ordinary rate limit or a dropped connection. No attacker required.

**And Settings would have done it deliberately.** The single-photo component
was still wired there, so changing your photo from Settings swept the prefix
and took slots 2–9. The fix was not to teach the sweep about the set: the
single-photo API is deleted and Settings uses the same grid as onboarding. Two
photo components meant two photo models, and that was the defect rather than a
detail.

**Returning users were told they had no hotel** (code review, high). Rooms and
Discovery decided whether a hotel existed from `state.hotels`, a cache filled
only by visiting the Hotel tab. Nothing on the bootstrap path fills it — and
taking the hotel out of onboarding removed the last thing that used to seed it,
so a latent edge case became every relaunch. Whether there *is* a hotel is the
server's answer; the cache only ever held its name. The regression test was
checked against the old gate and fails there.

Four smaller ones: `promise` was never impossible once the age was confirmed,
so a late session left somebody pinned to a pre-signup screen; add/remove/
reorder shared one 20-an-hour bucket that filling and organising a nine-slot
grid would exhaust; `reorder` accepted duplicate paths, which passed the length
and ownership checks and left the set non-contiguous; and `discovery_feed`
would serve a draft profile a feed even though it refused to show one.

Two things worth keeping from this:

- **The fake cannot see the bug that mattered.** `sweepPhotoObjects` only
  exists in `SupabaseApi`, so no FakeApi test could ever have caught it. The
  regression test now pins the *contract* both owe — a failed add changes
  nothing — and says in its comment that the fake cannot reproduce the
  mechanism. That gap is worth remembering before trusting a green suite about
  storage.
- **The riskiest change was the one that deleted something.** Removing the
  hotel from onboarding was correct and also removed an accidental load-bearing
  side effect nobody had written down. Worth asking, next time something is
  taken out of a flow, what else it was quietly doing.

Verification after the fixes: `bash scripts/check.sh` entirely green — 381 SQL
assertions, migration replay, the contract check, `tsc`,
`eslint --max-warnings 0`, 375 jest tests across 33 suites, the web bundle.


## 2026-07-26 — first hands-on pilot feedback, and a staging drift

The owner opened the app. Two reports, both real.

**"Why does the input background turn purple?"** The focus state filled the
box with `accentSoft` and drew an outer ring, on the reasoning in D-021 — the
border colour alone is 1.55:1 and invisible to many. The owner saw it and
wants the border only. Done: the fill and the ring are gone, and the weight
change (1.5 → 2.5) is now the whole companion cue. D-021 is amended in place
rather than silently contradicted, with the floor stated: never colour alone.

**"Every hotel search says not found."** Not a client bug. Staging was missing
all four of today's migrations — `supabase db push` had never been run for
them — and, separately, the hotels catalogue on staging was **empty**: nothing
in the setup docs said seed.sql had to be applied to the hosted project, and it
never had been. So the schema half of the app was a day behind and the data
half had never existed. Both fixed: migrations pushed (all four applied
cleanly, including the backfill), seed run through the management API since
this machine has no `psql`, verified with `search_hotels('lara')` answering
Lara Shore Resort server-side. The docs now carry both the new high-water mark
and the seed step, so the next environment does not rediscover this.

Worth writing down as a habit: `scripts/check.sh` proves the migrations against
a throwaway container, and nothing in the loop proves them against staging.
Until a staging check exists, "all checks passed" and "staging works" are two
different sentences.


## 2026-07-26 — the catalogue learns to grow

The owner's next question after the seed fix was the right one: "are these
just the hotels we put in the database? we cannot register every hotel by
hand." No — and the schema had been waiting for this. `hotels` has called
itself a provider-fed cache since the day it was created; the seed file was
simply the only provider it ever had.

The provider now exists: a `hotel-search` edge function (D-029). Catalogue
first; when it answers thinly, Nominatim (OSM's geocoder) is asked for
hotel-type places in Turkey, the hits go through `upsert_hotel_from_provider`
— the same single write boundary everything else uses — and the search runs
again. Verified live against staging: "rixos" pulled six real hotels from OSM
on the first call, and the identical second call answered in 334 ms without
leaving the database. The client degrades to the catalogue-only RPC when the
function is unreachable, so a cold or missing function narrows the answer
rather than removing it.

Two choices worth defending later:

- **OSM, not Google Places, and it is not about the money.** ODbL lets us
  store what we fetch (with the attribution line the hotel screen now
  carries). Google's terms forbid caching place data beyond an ID, which is
  incompatible with a product whose whole design is "activate a hotel that
  lives in our table".
- **The bloat fear is answered by laziness, not by limits.** Nothing preloads
  the world. A hotel enters the table when somebody first searches for it,
  so growth is bounded by the set of real hotels people actually look for —
  and a repeated search never leaves Postgres.

Also this session, from the owner's first hands-on run: the focused input's
lavender fill is gone (border-only, D-021 amended), and the "not found for
everything" report turned out to be staging missing the day's migrations plus
a never-seeded catalogue — both fixed and both now written into
`docs/hosted-setup.md`.

Still true: Nominatim's policy is one request a second with a real
User-Agent. Debounce, the two-character minimum and cache-first keep a pilot
under that comfortably; past a pilot, the function is where a queue goes.


## 2026-07-26 — the phone found what the suite could not

Three reports from the owner's hands-on run, all against the preview (FakeApi)
build — which turned out to be the point.

**The photo red screen.** `FakeApi.getPhotoUrls` returned `signed://<path>`, a
made-up scheme. Every jest test was happy because jest never hands a URL to a
real image loader; the phone's `<Image>` handed it to the network stack, which
has no handler for `signed://`, and iOS put up a red screen. The fake's bucket
has always been "path → local uri", so it now returns the uri it already holds
and the picked photo actually renders in preview. Lesson twin to the earlier
sweep bug: the fake can pass where only a runtime fails.

**The discovery card.** The owner sent the reference the brief was adapted
from and the card did not survive the comparison: full-bleed square frame, no
scrim, ink-on-photo name, a giant top-anchored initial when there is no photo,
interests below the fold. It is now a proper card — inset, rounded, one shape
with or without a photo — with a scrim band carrying the ribbon, a white
name, and the interests as translucent tags on the photo's foot, which is
where the reference puts them and where the eye already is.

**The focus fill** was re-reported from the phone and had already been
removed; the phone was running the older bundle.

Verified the way the complaint arrived: scripted the entire way in — welcome →
phone → OTP → profile → hotel gate → upcoming stay → discovery — in a browser
at 375×667 against the preview build, measured the card's inset/radius/fill
from the live DOM, and screenshotted it. Zero console errors on the walk. One
process note for next time: two of the styling edits silently missed (an
unasserted string replace), and only the screenshot caught it — every replace
in that pass now asserts, and the visual check stays part of the loop.


## 2026-07-26 — drag lands, and every tab was under the clock

Two more from the owner's phone.

**Reordering is the gesture now (D-027 amended).** The arrow buttons and the
dark band earned their existence as the honest alternative to a fake caption;
the owner used them and asked for the photos back. Hold a tile ~180 ms and it
lifts and follows the finger; release over a slot and the order changes —
index arithmetic, no measurement, and the server's answer re-renders the grid
so picture and order cannot disagree. The hold delay is load-bearing: the grid
scrolls with the page, and a drag that began on first movement would steal
every swipe that starts on a photo. The screen-reader path survives as
per-tile "move earlier/later" accessibility actions — invisible to sighted
users, which is what the owner asked for, and operable, which D-027 requires.
One test-harness note: RNTL's fireEvent does not dispatch accessibilityAction,
so the tests drive the prop directly.

**Every headerless screen started under the status bar.** `Screen` applied
only the bottom safe-area edge — right for the stack screens, whose native
header consumes the top inset, and wrong for all five tabs and bootstrap,
which have no header. Now a `safeTop` prop, on for exactly the headerless
set; HotelScreen sets it by whether it is the tab or the gate (`onActivated`
is precisely that difference). Off by default on purpose: forgetting it under
a header is invisible, forgetting it on a tab puts the title under the clock —
which is how the prop got here.


## 2026-07-26 — the grab has to be felt

Owner feedback on the drag: it works, but "I can't tell that I've picked it
up." Right — the lift was only a shadow. It is now the platform trio, one
signal per sense: the tile grows a little (the eye), the shadow deepens
(depth), and the device taps back through `expo-haptics` (the hand) — the same
vocabulary the OS's own reorderable grids use, so nobody has to be taught it.
`expo-haptics` added at the version `expo` pins for SDK 54; web and simulators
without an engine no-op through the catch.

Fixing the feel surfaced a real bug the shadow had been hiding: a hold that
matured but never moved never granted the responder, so its release arrived
through no responder callback and the tile stayed floating forever. The
release path now settles the tile whenever the responder was never granted.


## 2026-07-26 — the grid rearranges under the finger

Last drag refinement from the owner: the other photos moved only after
release; they should step aside the moment the held photo crosses a
neighbour's midpoint. They do now. The parent grid tracks the arrangement in
flight — which tile is held, which slot it is over — and every other tile
springs to where that arrangement puts it, while the finger is still down. A
crossing also gives the hand the platform's selection tick.

Two details doing quiet work:

- **The arrangement is pinned to the order it was computed against** (a
  signature of the photo paths). The commit re-renders with new indices before
  the drag state clears, and without the pin that one frame would apply old
  offsets to new positions.
- **On release the held photo settles onto the slot the eye already believes
  it owns**, not back home; when the server's answer lands, each tile zeroes
  its animation on the same render its layout position changes, so the
  handover from animation to layout moves nothing on screen. Clearing the
  arrangement early was the bug the owner originally reported, in different
  clothes — tiles springing home only to jump forward when the data arrived.


## 2026-07-26 — the five inner screens, designed

The owner asked for Rooms, Inbox, Chat, Match and Settings to be designed
rather than repaired, borrowing dating-app conventions where they earn their
keep, with the hotel bond as the identity. The plan is in `design.md`; what
shipped:

- **The signature — the key card.** A rounded panel crossed by one flat
  magstripe band: lavender when the door is open, hollow hairline when
  closed. Exactly two homes — the two rooms, and the match moment — so it
  stays a signature rather than wallpaper. One band, no chip, no hologram:
  a reference, not a costume.
- **Rooms**: state first. DOOR-PLATE room names, a worded OPEN/CLOSED chip
  (word + filled/hollow dot + fill — never colour alone), trust copy kept
  but demoted to caption.
- **Inbox**: the Hinge/Bumble split, borrowed because it is information —
  faces with no conversation yet in a ringed strip, conversations as rows
  with preview, short time-ago, hairline rules, closed matches dimmed but
  readable.
- **Chat**: a bond header that does not scroll away — who this is and which
  room · hotel you know them from. Fixed a real contrast bug while there:
  my bubbles were ink on deep lavender at 3.04:1. Now lavender with ink
  (11.68:1), asymmetric messenger corners.
- **Match**: the moment. Faces, the title once (the modal header was
  printing it twice over a stray back arrow — gone), and the key card
  carrying YOU ARE BOTH AT · hotel, with the ribbon reduced to the room so
  the card does not say the hotel twice.
- **Settings**: the face first — avatar, name, bio — then the sections.

Verified the way the work was judged: full browser walk at 375×720 through
onboarding → rooms → match → chat → inbox → settings, screenshots of each,
two critique passes (the second caught the doubled match title, the
hotel-name repetition, and a ribbon wrapping to two lines). Zero console
errors on the walk. 378 jest tests across 33 suites, all green.


## 2026-07-26 — the app learns Turkish

End-to-end EN/TR (D-030). What made it cheap is what the codebase had already
paid for: every sentence lived in one file. So the language is one live
binding — `COPY` — reassigned by `setLocale`; no call site changed. English
defines the type, Turkish must satisfy it, and the compiler is what stops a
sentence shipping in one language.

The choice is on the first screen (two pills, each labelled in its own
language, because the person who needs to switch is the one who cannot read
the current one), repeatable in Settings, persisted through the same storage
adapter the session uses. The stored preference is applied during bootstrap,
so the only thing that can flash English is the spinner.

Three things worth keeping:

- **A proxy was the obvious mechanism and the wrong one.** `Object.entries`
  sees nothing through a proxy over an empty target — and that is exactly how
  the D-007 trust audit flattens the copy. The audit must be able to see the
  mechanism, so the mechanism is a plain reassigned binding.
- **The trust audit now runs in both languages**, with Turkish stem-matching
  (rezervasyon/doğrulan/kefil…), because a promise that holds in English and
  breaks in Turkish is broken.
- **The browser walk caught four stray hardcoded strings** the type system
  never could — "Rooms" on the empty tab, "Open chat" in an accessibility
  label, the match sentence, and the room name inside the ribbon. Grep found
  three more siblings once the first appeared. All copy now goes through COPY.

Verified: full TR walk in a browser at 375×720 — welcome through rooms,
discovery, and a match, every visible sentence Turkish, zero console errors —
plus 390 jest tests across 33 suites including the bilingual audit.


## 2026-07-26 — five phone findings, and what each one really was

The owner walked the Turkish onboarding on a device and sent five screens.

- **"The labels aren't centred."** They weren't — vertically. Making the wide
  pill a flex row moved `justifyContent` to the horizontal axis and left the
  vertical to its default, so every label sat against the top of its pill on a
  real phone. One `alignItems: 'center'`.
- **"Why is the border black? It should be my colour, and thin."** Two bugs
  wearing one complaint: the wide pill *did* set a lavender border, and the
  idle-state grey overrode it because it came later in the style array — the
  array is the cascade. Reordered, thinned to 1.5, selected keeps the deeper
  edge so the state is more than a fill.
- **"Don't hide the rest behind More — stack them all."** The expander is
  gone. Its implication — that the answers behind it were a different kind of
  answer — was never a good one.
- **"When I type 14 the mask disappears."** True and worth fixing properly: a
  placeholder dies at the first character, taking the format with it. The date
  field is now a drawn mask that never leaves: typed digits fill the template
  from the left in ink, the rest stays in muted — `14/AA/YYYY` — and a real
  but invisible input owns the keyboard and the digits, so backspace always
  deletes a digit and never a template letter.
- **"The phone text isn't centred, and the button label is heavy."** iOS's
  default vertical padding inside the fixed-height shell, zeroed; button
  labels dropped from semibold to medium — the fill is already the emphasis.

One thing the walk exposed that the owner had not named yet: the identity
options were English inside a Turkish flow. The stored values stay canonical
(they are what the database holds and what another user's card carries); the
*labels* are copy and now live with the rest of it — Kadın/Erkek, the gender
list, Heteroseksüel…Sorgulama sürecinde, Kadınlar/Erkekler/Herkes.

Verified on the browser walk in Turkish — the half-typed mask, the stacked
gender list, the show-me pills, all screenshotted — and 390 jest tests across
33 suites.


## 2026-07-26 — the card carries the whole set (D-026 amended, by the owner)

The owner approved what the deck redesign had deliberately left out: the
photo-pager segments, and with them the whole photo set on the card. "One
photo is not believable" — and that is a product judgement the privacy rule
was his to trade against.

What actually changed is small, and why is worth recording: the storage read
policy (`app.may_view_photo`) has always authorised a viewer **per owner**,
not per path. Anyone who could see the first photo could already have read
slots 2–9 had they known the names; the unguessable name was the only
barrier. So the amendment shares names with exactly the people the policy
already admits — `discovery_feed` gains `photo_paths` in the owner's order,
`photo_path` stays as the primary so the inbox and match surfaces move
nothing, and no policy changed.

The card gained the reference's segment bars and tap-left/tap-right photo
navigation, with no wrap at the ends (wrapping makes people lose their
place). The UI test stubs the feed at the API instance, because the fake's
fixture candidates own no photos — what is under test is the card.

Applied to staging with `supabase db push` in the same sitting, since the
owner tests there — the seed-gap lesson from this morning, remembered.


## 2026-07-26 — pushes: the knock, not the letter (D-031)

The owner asked whether notifications existed. They did not; they do now, in
exactly two kinds, and the privacy lines were drawn before the plumbing:

- **MESSAGE** — the sender's name and a fixed sentence. Never the message
  body: lock screens have readers, and this product's one promise is
  discretion.
- **ROOM_NEW** — "somebody new at your hotel", nameless (who arrived is what
  the room itself is for), sent to the room-eligible people at that hotel,
  once per person per hotel per six hours so an arrival day is not a buzz per
  guest.

The shape is queue-and-dispatch, chosen so the *rules* are provable: triggers
write queue rows transactionally in plain SQL — 15 new pgTAP assertions pin
who is told, who never is (the sender, the arriver, the blocked, the
tokenless), and in which language — while pg_cron + pg_net drain the queue to
Expo's push API every minute on the host. The guards let the same migration
apply on a bare test container where neither extension exists.

Tokens are device credentials: owner-only, registered with the device's
language once onboarding completes (the words of a push are fixed at send
time, so changing language re-registers), removed before sign-out because
afterwards the server rightly refuses.

Verified: full scripts/check.sh green — 398 SQL assertions, 393 jest tests
across 34 suites — migration pushed to staging, and on staging itself: the
cron job live and active, both extensions present, and a manual dispatcher
run draining cleanly. What no suite can prove is the last inch: a real push
on a real locked phone needs a development build (Expo Go lost remote push in
SDK 53) — spelled out in device-readiness.


## 2026-07-26 — the hotel dressed as what it is

The owner's review call was right: the centre of the product's identity was
its least designed screen. The slice:

- **The active hotel is a key card now** — the signature object, carrying a
  postcard cover, the ACTIVE HOTEL plate with city beside it, the name, and
  both doors' OPEN/CLOSED states at a glance (refreshed on activation, not
  only on mount — the first screenshot caught that they described the
  previous screen-load).
- **Postcards instead of placeholders.** OSM knows where hotels are, not what
  they look like; instead of a grey box pretending a photo failed, each hotel
  gets a deterministic abstract card — a wash from the pinned palette, its
  initial set large, a postmark ring — seeded by its name so it is stable
  across renders and launches. Deliberately abstract: a generative palm tree
  would be a lie about the hotel.
- **Search results are mini postcards**, whole row tappable, the active one
  wearing its chip instead of an action.
- **The empty state is an invitation**: a hollow dashed key card — the shape
  of what is missing — with one sentence, and the search right under it.
- Two stray English strings died on the way ("Switch to X", "Activate X").

Verified with the usual loop: TR browser walk, three screenshots (empty,
results, active), one defect caught by the screenshot and fixed, 393 jest
tests across 34 suites green.

Left deliberately on the table, each needing an owner decision or a later
phase: room population counts on the hotel card (a privacy decision — small
rooms deanonymise), and real map/photo covers (licensing and a tile-usage
policy).

## 2026-07-26 — the key card learns to count, carefully

Owner: show room headcounts on the hotel card, with a threshold; premium is
their eventual home. The slice:

- `hotel_room_counts()` (migration 20260726000700, staging-applied): exact
  number of *other* eligible people per room at the caller's active hotel —
  at five or more. Below five: null, and null renders as nothing. Not "a
  few", not "somebody" — at one person even "somebody is here" is a presence
  leak. The count ignores show_me both ways, never includes the caller,
  drops suspended/incomplete accounts. D-032.
- 9 pgTAP assertions (tests/017): threshold silence, the fifth person, the
  caller excluded, other hotels not leaking in, suspension silencing the
  count, no-hotel refused, anon refused. 407 SQL assertions total.
- Client: `getRoomCounts()` in both APIs; the fake mirrors the threshold and
  its Lara Shore fixtures straddle it (Upcoming 6, Here Now 3) so one screen
  shows both behaviours — verified in the TR browser walk: "6 kişi" under
  Yaklaşan, deliberate silence under Şu an burada. Jest 394/394.
- Premium: intent recorded in D-032, deliberately NOT built — the project's
  own rule holds entitlement/billing behind an explicit phase advance in
  decisions.md. One owner sentence opens it.

## 2026-07-26 — the first real sign-in, unblocked and lined up

The owner tried the device build and hit two walls; both fell:

- **"Bir şeyler ters gitti" at the phone step.** Reproduced against staging
  directly: `phone_provider_disabled` — hosted auth had phone sign-in off
  and no SMS provider. Enabled phone auth with five test OTP numbers
  (555 111 00 01–05, code 123456, no SMS ever sent, zero cost) and proved
  the full loop by curl: request → verify → session token. Real SMS
  provider remains an owner decision; it is config, not code.
- **"+90 and the number are not on one line", still.** Root cause this
  time: an explicit `lineHeight` on a single-line `TextInput`, which a real
  iPhone draws asymmetrically. Single-line inputs now use the natural line
  box (paragraph composers keep theirs), and the +90 prefix carries the
  same metrics as the digits beside it. Web geometry check: prefix, input
  and box vertical midpoints identical to the pixel.

Also from the same session: the owner's Expo Go "taking much longer than it
should" was the Mac's firewall dropping inbound LAN connections — dev
serving moved to tunnel mode (`npx expo start --tunnel`); `@expo/ngrok` went
in as a devDependency because the global npm cache has root-owned files
(pre-existing; `sudo chown -R 501:20 ~/.npm` is the owner-side fix).

## 2026-07-26 — "bunu yapma iznin yok" at the birthdate

The first real onboarding on staging died at the first profile save with
FORBIDDEN. Reproduced by hand against hosted PostgREST: 42501. The cause is
a shape mismatch three layers deep: `saveOwnProfile` uses PostgREST's
upsert, whose conflict arm writes `SET id = excluded.id, …` — every payload
column *including the key* — and the column-level UPDATE grant list did not
include `id`. Every container test spoke plain INSERT/UPDATE and stayed
green; the app never did.

Fix (migration 20260726000800, staging-applied): `id` joins the UPDATE
grant list, which is safe because the update policy's
`with check (id = app.current_user_id())` makes it worthless — the only
value the column can be "changed" to is the one it already has. The
PostgREST upsert shape itself is now pinned in pgTAP (001): insert arm,
conflict arm, and the hijack attempt that must still fail. The pinned
updatable-column list in 011 gained `id` with the reasoning inline.
Staging re-verified by curl: first save and re-save both land. 411 SQL
assertions green.

Lesson recorded once more: the container proves the SQL, only the hosted
project proves the *client's* SQL.

## 2026-07-26 — closing the app is not signing out (owner's question, pinned)

The owner asked whether reopening the app asks for the phone number again.
It does not, by design that was already in place: the session lives in the
device keychain (expo-secure-store, chunked past the 2 KB limit), supabase-js
restores and refreshes it, and the onboarding wizard derives its step from
what the server knows rather than anything stored locally. What was missing
was proof — nothing pinned the restart behaviour. Two tests now do
(coldStart.test.tsx): a finished account reopens straight into the rooms,
and a half-finished profile reopens at its first unanswered question — in
both cases the phone box must not exist. En route, the test-support helpers
now return their render handle so a test can close and reopen the app
(RNTL's cleanup() mid-test breaks; unmount() is the working path). 396 jest
tests green.

## 2026-07-26 — the red screen after the first onboarding

The first device run crashed with "tried to access a native module that
doesn't exist" out of PushNotificationIOS the moment onboarding completed.
Nobody imports PushNotificationIOS — the trigger was `await
import('react-native')` inside push registration: Metro's dynamic import
materialises the namespace with `importAll`, which executes every lazy
getter on the react-native index, including the PushNotificationIOS one,
whose native module Expo Go does not have. A static `import { Platform }`
touches only the one property and is safe.

Two changes: the static import, and an execution-environment guard — in
Expo Go (`Constants.executionEnvironment === StoreClient`) push
registration returns before anything notification-shaped loads, because
Expo Go cannot receive remote pushes since SDK 53 anyway. Real pushes on a
device therefore still require the dev build (already on the open list).
Full gate green, 396 tests.

Rule worth keeping: never `import('react-native')` dynamically, anywhere.

## 2026-07-26 — the empty room learned to listen (owner's Banani reference)

The owner sent a dark-theme radar design for the empty discovery room. It
came in as HTML/Tailwind; what shipped is the same composition translated
into this app's own language, not the export: white ground instead of
#0d0d1a, the four concentric rings in lavender-deep alphas graduating
toward the centre, the glowing dot in accentDeep with a soft halo standing
in for the CSS box-shadow, and an outward pulse (Animated, native driver)
in place of the conic-gradient sweep RN cannot draw. The pulse stands
still when the platform's reduce-motion is on. Header buttons and the tab
bar from the export were dropped — ours already exist.

Copy is the reference's own Turkish, with an English shape to match
("Henüz kimse yok" / the calm sentence / "Tekrar tara"), replacing the old
emptyDeck string. "Scan again" refetches the deck for real — pinned by a
test that counts the server calls. Verified in the TR browser walk against
an actually empty room (Çeşme's Here Now). 397 jest tests green.

## 2026-07-27 — the designer's hotel cards (second Banani screen)

The owner now works with a designer; screens arrive as Banani exports and
replace ours piece by piece. This one: the hotel cards.

What shipped, translated rather than transplanted: the card shell (hairline
border, 16 radius, soft lift, plain lavender band where a photo would
boast) replaces the KeyCard + generative-postcard treatment on the Hotel
screen; the HotelCover component died with it — a plain band is the
designer's call and it is a calmer one. Room states moved inline (label
beside pill, the two doors sharing one row), and StateChip itself was
restyled globally to the designer's pair: open = filled lavender with
accent-deep dot and words, closed = hollow with a solid muted dot. Search
results wear the same card with a slimmer band, whole card tappable, the
active one carrying the AKTİF OTEL eyebrow. Copy needed nothing — the
designer had drawn our own i18n strings back at us. Headcount (D-032) sits
inline after its pill; the export's tab bar, fonts and wrappers were
dropped as before. Not adopted: the design's per-result room pills (a
search result's doors are meaningless before it is yours) and the "BEKLEME"
eyebrow. Verified by TR browser walk (results + active), 397 jest tests.

Standing note for this collaboration: exports are references, not sources —
our tokens, our components, our privacy semantics win; the geometry and
mood are the designer's.

## 2026-07-27 — discovery before any door is open (designer screen 3)

The case the in-room radar did not cover: Discovery tapped with no eligible
room at all. Was a bare Notice; now the designer's orbit screen — a pale
disc with two orbit rings, satellite dots, three floating bubbles carrying
the ways in (people, a door, a place; lucide-style paths drawn with
react-native-svg, newly added via expo install, Expo Go-safe), a solid
deep-lavender centre. Deliberately static, unlike the radar: nothing is
scanning until a door opens. Under it, the designer's own Turkish
("Henüz bir odaya girmedin"), and both exits as buttons — "Odalara git"
jumps to the Rooms tab, "Yakınlığımı kontrol et" opens the proximity check
directly. The drawing is laid out once at 300pt and scaled (240 here) so
short phones keep both buttons above the tab bar. Also fixed en route:
Discovery's three fallback screens had a hardcoded English "Discovery"
title — now localized. The critical-flow gate test now walks this screen
and through the proximity shortcut. 397 jest tests green.

## 2026-07-27 — the orbit's centre became a door (designer's second pass)

Hours after the orbit screen shipped, the designer replaced its centre: the
solid dot and three bubbles are gone; the door itself now stands ajar at
the middle of the orbit in its own deeper pool of lavender, and an empty
armchair waits in a white bubble on a low stage at the disc's foot. Same
component (OrbitEmpty), same screen wiring, same tests — only the drawing
changed. Verified by TR browser walk screenshot; 397 jest tests green.

## 2026-07-27 — the hotel screen's idle state (designer screen 4)

The reference: a warm nothing-chosen card, quick queries, destination
cards, and a search that looks like a place to start rather than a form.
Shipped, with the translation rules applied and two honesty lines drawn:

- **Nothing-chosen card**: the little SVG hotel in its pale disc, the
  designer's own Turkish ("Henüz bir otel seçmedin"), and the requirement
  worn as a quiet info badge, not an error.
- **Search field** gains the magnifier prefix (same Field, same testID).
- **Idle is not empty**: quick chips (İstanbul, Antalya, plus "Son arama"
  once a different query has run — session-scoped on purpose, a stored
  search history would be a retention decision) and three gradient
  destination cards (İstanbul/Antalya/Kapadokya) that are just pre-typed
  queries. The type-to-search prompt keeps its testID but became the
  magnifier-over-hills drawing.
- **Not adopted, deliberately**: the reference's hotel counts ("2.734
  otel") — the catalogue fills lazily from OSM, so any count would be an
  invention; and "Yakınımdakiler" + the pin button — both need location,
  and location is currently asked only at the proximity check with the
  reason on screen. Widening that is an owner privacy decision, parked in
  the open list. Destination photos became brand-family gradients (no
  rights to photographs; expo-linear-gradient came in for this).
- En route: fixture city "Istanbul" corrected to "İstanbul" — ASCII I
  lowercases to ı in Turkish, so the İstanbul chip matched nothing in the
  fake. The tab-bar restyle in the reference (floating pill) is a separate
  all-tabs slice, not done here.

Verified: TR browser walk (idle state, İstanbul chip → Bosphorus Garden
result), 397 jest tests, full mobile gate green.

## 2026-07-27 — the designer's Rooms screen (screen 5)

The two rooms as full story-cards: tracked plate pill and state chip on the
head row, a flat-SVG drawing (ring-bound calendar with a check; a pin
dropped between the palm and the town — the reference's 3D renders
translated into the app's flat language), the claim in bold with its trust
sentence under it, the server's status line beneath a hairline with a small
icon, and the door's one action as a full-width button. The designer's card
texts turned out to be our own reviewed explainers split in two, so the new
`rooms.upcomingLead/Body` keys are that split — and the trust-copy audit
proved its worth by flagging the split denial sentence in both languages
until it was deliberately allowlisted (`rooms.upcomingBody` in MAY_DENY and
TR_MAY_DENY).

The old "no exact location" caption grew into the reference's privacy
footer — shield, "Gizliliğin bizim için önemli", chevron into Settings —
but with an honest body: the reference's "bilgilerin yalnızca konaklaman
süresince kullanılır" is a retention claim the product does not make
(chats and profiles outlive the trip; that expiry is an open owner
decision), so the footer says what is true instead: exact location never
shown or stored, account and data deletable any time.

All flows and testIDs preserved (open-upcoming, open-here-now,
rooms-choose-hotel, R-003 expiry refresh, permission-denied notice).
Verified by TR browser walk over both cards and the footer; 397 jest
tests, full mobile gate green.

## 2026-07-27 — the declare screen (designer screen 6), and the İ that CSS cannot spell

The Upcoming declare screen is the designer's now: its own back pill
("‹ Odalar") in place of the native header, the big title over the reviewed
explainer, a privacy card with a shield-and-lock drawing ("Rezervasyon
numarası veya kimlik bilgisi gerekmez, kimseyle paylaşılmaz" — a new denial
sentence, allowlisted by name in the trust audit in both languages), the
two date fields as cards with calendar discs, the "Tarihleri daha sonra
güncelleyebilirsin" info strip, and the same save/withdraw machinery
underneath, untouched (existing-stay prefill, withdraw with its warning,
server-echoed validation).

Two bugs died en route. The screen's client-side validation messages had
been hardcoded English since birth — now copy keys in both languages. And
the screenshot caught "GIRIŞ TARIHI": CSS-style textTransform uppercases i
to I, not İ — Turkish has two i's and RN doesn't know. Every tracked label
(field labels, door plates, state chips, section labels, room badges) now
goes through a locale-aware upperCase() in copy.ts, and textTransform is
gone from the codebase. "AKTİF OTEL" had been quietly wrong on every
screen; it is right everywhere now.

Verified: TR browser walk (screen, back pill, İ check by regex against the
DOM), 397 jest tests, full mobile gate green.

## 2026-07-27 — the empty inbox (designer screen 7)

The two speech bubbles leaning toward each other with a heart between them
— the reference's glossy 3D render as flat SVG on the shared pale disc —
under the new subtitle ("Karşılıklı beğeniler ve sohbetlerin burada
görünür"), with "Henüz eşleşme yok", one sentence of why, and both ways
out as real navigation: "Keşfetmeye başla" to the Discovery tab,
"Odaları görüntüle" to Rooms. The bell strip closes the screen with one
honest edit: the reference said "burada bildirilir" (you'll be notified),
but D-031 has exactly two push kinds and match is not one of them — so the
sentence promises the inbox, not the lock screen: "Yeni eşleşmeler
olduğunda burada görünür." The old one-line EmptyState copy key retired.
One full-gate flake noted: the R-003 expiry test missed its real-time
window under parallel load, passed alone and on the gate rerun.
Verified: TR browser walk (empty state + Rooms navigation), 397 jest
tests, full mobile gate green.

## 2026-07-27 — the populated inbox and the floating tab bar (designer screens 8–9)

Two pieces in one slice, as the owner asked:

**The floating tab bar**, everywhere: a rounded card standing off the
bottom edge, five drawn stroke icons (building, door, compass, speech
bubble, gear), the active tab's icon seated in a filled lavender pill.
One custom component replaces the platform bar; each item keeps the
button role, the title and the selected state, so every existing test
and screen reader sees what it saw before. New per-tab testIDs
(tab-Hotel … tab-Settings).

**The populated inbox**: subtitle per the reference ("Eşleşmelerin ve
sohbetlerin."), a working client-side search over names and previews
(the server never sees the query), "Yeni eşleşmeler" with the gradient
ring and the heart badge resting on its foot, and conversations as white
cards with the designer's time column — today as a clock time, yesterday
as a word, older as days.

Not adopted, deliberately: the green online dots (no presence data
exists, and inventing "online" is a privacy decision, not a style);
the unread-count badges (no read state on the server — a real feature,
parked in the backlog); the filter button and the "Tümünü gör" links
(nothing behind them yet). Verified: TR browser walk — match made, fresh
ring seen, message sent, chat card with clock time seen; 397 jest tests,
full mobile gate green.

## 2026-07-27 — account deletion vs the hosted storage guard

The owner tried to delete their account to retest from scratch; it failed
with 42501 — but only on staging, and only for accounts that had ever
uploaded a photo. Hosted Supabase now refuses direct SQL deletes on
storage tables, and `app.queue_photo_cleanup`'s DELETE branch did exactly
that inside the profile-delete cascade. The local container has no such
guard, which is why 411 green assertions disagreed with reality — the
third staging-only failure this pilot has caught (SMS provider, PostgREST
upsert grant, now this).

Fix (migration 20260727000100, staging-applied): the trigger only queues;
the storage-API worker owns removal of row and bytes together, which was
already its design. Nothing is readable in the gap — every photo read
goes through `app.may_view_photo`, which answers false for everyone once
the profile row is gone, and both pgTAP suites now pin the new contract
(row waits for the worker; the matched viewer can no longer read it).
Verified on staging with the owner's real account: delete succeeded,
re-signing in mints a fresh empty account. 412 SQL assertions, full gate
green.

## 2026-07-27 — a deleted account's ghost session

After the staging deletion, the owner's phone reopened onto the *name*
step: the keychain still held the old session, and a JWT stays
cryptographically valid for its whole hour after the account behind it is
deleted — reads just come back empty, so the wizard read "session, no
profile" and resumed politely inside a corpse. Manually deleting rows in
the dashboard has the same shape: the server changes, the device's token
does not.

Fix: `currentSession` now validates a restored token against the auth
server once per cold start (`auth.getUser`). A definite 4xx — deleted,
revoked — clears the keychain and lands on the welcome screen; a network
failure keeps the session, because signing somebody out for being offline
would cost them a paid SMS. The deletion suite's mock had to learn the
difference (its blanket "user does not exist" now applies only where the
user really is gone), and a new unit test pins the exact bug: restored
session + auth-server 403 → null session, cleared storage. 398 jest
tests, full mobile gate green.

## 2026-07-27 — the two no-hotel screens (designer screens 10–11)

Rooms and Discovery before any hotel is chosen, from the references: one
shared card (NoHotelCard) whose slots the two screens fill differently.
Rooms carries the door scene — the numbered door standing beside the hotel
that holds it, a plant keeping it company — with "Önce bir otel seç",
"Otel seç" into the choose-hotel gate, and "Otelleri görüntüle" to the
Hotel tab. Discovery carries the compass over the ground it would search —
hotel, hills, a pin, a dashed path — with "Keşfet için önce otel seç" and
a "Nasıl çalışır?" secondary that actually answers: it reveals a
three-sentence explainer of the two rooms inline (a control with nothing
behind it is a small lie, so it got something behind it). The one-hotel
rule rides both cards as the same quiet info pill, straight from
trust.oneHotel. The door plate in the drawing stays blank on purpose — a
readable "201" would be a claim about a room nobody has. Both primaries
keep their old testIDs; the two secondaries are new (rooms-view-hotels,
discovery-how). Verified by TR browser walk over both screens, the reveal
and the tab jump; 398 jest tests, full mobile gate green.

## 2026-07-27 — the first screen, and the brand's missing letter (designer screen 12)

The welcome screen is the designer's: the language toggle floating over a
lavender resort skyline that ends in a soft curve, the app's mark as a
tile — a hotel doorway holding a speech bubble with a two-tone heart —
the wordmark under it, the headline whose full stop is a small heart, the
reviewed one-hotel/no-reservation body, a trust card (shield, "Güvenli ve
gizli", lock) whose denial sentence joined the trust-audit allowlist in
both languages, the phone CTA, and a "Nasıl çalışır?" that reveals the
two-room explainer inline.

And the open brand question is closed: **Vacation Match**, with an a —
D-033. Every user-visible string, the app display name and both permission
prompts renamed; repo, slug and staging ref keep the old spelling on
purpose (renaming infrastructure buys nothing and risks the pipeline).
The headline tests learned that the full stop is a heart now. Verified by
TR browser walk (hero, brand, reveal); 398 jest tests, full gate pending
this note's commit.

## 2026-07-27 — why "voyage" found no Voyage

The owner searched a brand name and got only the seeded catalogue. Cause,
found by asking Nominatim directly: a big resort in OSM is several
objects — the grounds tagged as a park, the buildings, the hotel node —
and for a bare brand name Nominatim ranks the park polygons on top, which
our hotel-type filter then rightly discards, leaving nothing. Asking
"voyage hotel" instead surfaces the actual hotel objects: all six Voyage
properties, typed `hotel`.

The edge function now asks with " hotel" appended first and falls back to
the bare query only when the biased one is empty (one extra Nominatim
call at most, only in the miss case). Verified deployed against staging:
voyage → 6 hotels, rixos → 6, hilton → 6. Known limit, stated: there is
no fuzzy matching in Nominatim — a typo like "vyaga" finds nothing, and
pretending otherwise would need a search service we do not have.
