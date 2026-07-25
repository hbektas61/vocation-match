# Handoffs

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
