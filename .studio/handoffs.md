# Handoffs

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
