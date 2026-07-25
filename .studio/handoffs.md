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
  (43 of them new, in `011_profile_photos.sql`), 12 concurrency checks, the
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
  (24 of them in `012_account_deletion.sql`), 12 concurrency checks, the
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
