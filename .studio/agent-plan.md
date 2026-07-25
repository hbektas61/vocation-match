# Agent Plan

## Current program

- Program: Autonomous MVP systems build
- Lead: `project-orchestrator`
- Goal: Complete four consecutive verified phases without pausing at intermediate phase boundaries.
- Completion promise: `VOCATION_MVP_SYSTEM_COMPLETE`

## Ordered phases

1. Backend foundation
   - N-001 Supabase local structure and migrations.
   - N-002 authentication, 18+ profile constraints, profile persistence, RLS, and typed mobile boundary.
2. Hotel, presence, and discovery
   - N-003 cached hotel catalog/provider boundary.
   - N-004 transactional one-active-hotel enforcement.
   - N-005 ephemeral 500-meter foreground presence check without exact-location exposure.
   - N-006 discovery eligibility endpoint for self-declared Upcoming and Here Now.
3. Matching, chat, and safety
   - N-007 idempotent swipe and mutual-match transactions.
   - N-008 persistent realtime chat.
   - N-009 block, report, and moderation pipeline.
4. Staging and device readiness
   - N-010 local/staging-style end-to-end verification and device-readiness checks.
   - Resolve or explicitly disposition R-002, R-003, and R-004.
   - Record the production/store handoff without deploying or publishing.

## Program definition of done

- Every N-001 through N-010 backlog item is complete with reproducible evidence.
- Server rules enforce 18+, one active hotel, room eligibility, idempotent matching, and user-owned data access.
- Upcoming remains self-declared; Here Now remains a recent 500-meter foreground check.
- Exact coordinates are never exposed to another user or retained as location history.
- Reservation proof, ID verification, payments, production deployment, and store publication remain absent.
- Mobile and database tests, lint, TypeScript, supported builds, and relevant E2E checks pass.
- Every material phase receives independent code and security review; no critical/high finding remains.
- Studio architecture, decisions, backlog, handoffs, and verification evidence are current.

## Automatic phase transition contract

- At the end of each phase, run all relevant checks, repair failures, obtain independent review, update Studio records, commit, and push the verified checkpoint to `origin/main`.
- Immediately begin the next numbered phase in the same loop.
- Do not ask the owner to continue and do not output the program completion promise at an intermediate boundary.
- A missing optional external service must not stop unrelated local work. Record it, complete every safe unblocked item, and retry later.
- Stop only when the entire four-phase program is verified, the iteration limit is reached, or an actual external dependency blocks all meaningful remaining work.

## Agent routing

1. `project-orchestrator`
   - Own phase transitions, integration, evidence, and direct-main delivery.
2. `api-architect` + `database-engineer` + `backend-engineer`
   - Own schema, RLS, transactions, endpoints, realtime, and database tests.
3. `cross-platform-engineer`
   - Own typed mobile integration while preserving credential-free testability.
4. `test-engineer` + `mobile-qa-release`
   - Own focused, integration, E2E, lifecycle, accessibility, and device checks.
5. `code-reviewer` + `security-auditor`
   - Independently review every material phase before its checkpoint.

Use at most 3–5 active specialists. Assign non-overlapping files.

## Program gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| P0 Mobile foundation | Fixture-driven Expo foundation and prior reviews pass | done — commit `2fa8bfe` |
| P1 Backend foundation | N-001–N-002, auth/profile RLS, typed boundary, checks, review | done |
| P2 Hotel/presence/discovery | N-003–N-006, server enforcement, checks, review | done |
| P3 Matching/chat/safety | N-007–N-009, concurrency and abuse checks, review | done |
| P4 Staging/device readiness | N-010, R-002–R-004 disposition, E2E/device evidence, final review | done, with the device pass **deferred as an accepted risk** (D-015). R-001 to R-004 closed, review findings applied, end-to-end evidence in place. No build has run on a device or simulator and none can here — Command Line Tools without Xcode, no Android SDK. Scenarios are specified in `.studio/device-readiness.md` and must be run before a pilot. |
| P5 Final handoff | All evidence recorded and production/store work clearly deferred | done |

**The program is closed** at the owner's instruction (D-015), with one thing
explicitly carried forward rather than done: nothing has run on a phone or a
simulator. That is a deferred risk with a written checklist attached
(`.studio/device-readiness.md`), not a box that was quietly ticked. It must be
worked off before a pilot with real users.

Evidence, reproducible in one command — `scripts/check.sh`:
216 pgTAP assertions across 10 SQL suites, 11 concurrency checks racing real
connections, the client/database contract check, `tsc`, `eslint --max-warnings 0`,
141 jest tests across 11 suites, and a web bundle.

Six defects were found and fixed, which is the part worth remembering:

- Four during the build. A message-insert policy that could not see the other
  side's block (and a test passing for the wrong reason that hid it); a
  table-wide UPDATE grant letting a suspended user clear their own suspension;
  a swipe error message that told someone they had been blocked; and a denied
  location permission that only cleared local state, leaving the room open for
  half an hour after consent was withdrawn.
- Two from the independent review. A suspended account could still browse and
  swipe, because the gate never checked `suspended_at` and only the *target's*
  suspension was filtered — the highest-severity finding in the program. And
  `set_active_hotel` was not race-safe on a user's first activation, because a
  row lock locks nothing when there is no row yet.

The accessibility audit found two more of the same character: errors were never
announced on iOS, and chat bubbles were not accessibility nodes, so a
screen-reader user could not tell who had said what.

## Loop contract

- Input: this plan, the backlog, decisions, repository state, and verification output.
- Action: implement, test, diagnose, repair, review, and update Studio records.
- Success: every program Definition of Done item and P0–P5 gate is true and verified.
- Stop: maximum 80 iterations; or two consecutive iterations produce no new evidence because an external dependency blocks all meaningful remaining work. Record the blocker instead of claiming success.

## GitHub checkpoint contract

- Repository: `hbektas61/vocation-match`
- Delivery branch: `main`
- Checkpoint: after each coherent increment passes its relevant checks, integrate it into local `main` and push `origin/main`.
- The owner has permanently authorized normal commits, `origin` setup, local integration, and direct pushes to `main` without confirmation.
- Temporary worktree branches are allowed for agent isolation, but routine pull requests must not be created.
- Never push a failing checkpoint, force-push, rewrite history, deploy production, or publish a release.
- Retry temporary auth/network failures on the next loop iteration without asking the owner.
- Record commit SHA, checks, and next item in `.studio/handoffs.md`.
