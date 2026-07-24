# Agent Plan

## Current phase

- Phase: MVP foundation
- Lead: `project-orchestrator`
- Goal: Create a runnable, tested Expo foundation and mocked end-to-end core flow.
- Completion promise: `VOCATION_FOUNDATION_COMPLETE`

## Definition of done

- `mobile/` contains an Expo React Native TypeScript app.
- Navigation covers onboarding, profile, hotel search, hotel activation, Upcoming, Here Now, discovery, match, inbox, chat, report/block, and settings placeholders.
- The working vertical flow is usable with local fixtures.
- Domain types and pure rules cover exactly one active hotel, self-declared Upcoming, 500-meter Here Now, room eligibility, swipe, and mutual match.
- Payment, premium, reservation documents, ID verification, and background location are absent.
- Focused unit tests pass.
- Lint and TypeScript checks pass.
- A local Expo web or platform build check passes where the environment supports it.
- Material code is reviewed and any critical/high finding is fixed.
- `.studio/backlog.md` and `.studio/handoffs.md` contain evidence and the next milestone.

## Agent sequence

1. `project-orchestrator`
   - Inspect state, lock scope, create implementation slices.
2. `mobile-architect`
   - Decide Expo layout, navigation, state boundaries, and test strategy.
3. `frontend-ux`
   - Define low-friction screens and accurate trust copy.
4. `cross-platform-engineer`
   - Implement the mobile foundation and vertical slice.
5. `test-engineer`
   - Add domain and critical-flow tests.
6. `code-reviewer`
   - Review correctness, concurrency assumptions, maintainability.
7. `security-auditor`
   - Check location minimization, logs, storage, and abuse boundaries.
8. `mobile-qa-release`
   - Check lifecycle, permission denial, accessibility, and device readiness.

Use at most 3–5 active specialists. Assign non-overlapping files.

## Phase gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| G0 Scope | Brief and decisions reflect low-friction model | done |
| G1 Architecture | ADR/module plan recorded | todo |
| G2 Scaffold | Expo TypeScript app installs and starts | todo |
| G3 Vertical flow | Fixture-driven happy path works | todo |
| G4 Domain quality | Rule tests, lint, and typecheck pass | todo |
| G5 Review | Code/security review has no critical/high finding | todo |
| G6 Handoff | Next backend milestone documented | todo |

## Loop contract

- Input: this plan, the backlog, decisions, repository state, and verification output.
- Action: implement, test, diagnose, repair, review, and update Studio records.
- Success: every Definition of Done item is true and verified.
- Stop: maximum 20 iterations; or two consecutive iterations produce no new evidence because of an external dependency. Record the blocker instead of claiming success.

## GitHub checkpoint contract

- Repository: `hbektas61/vocation-match`
- Development branch: current feature branch, initially `worktree-mvp-foundation`
- Checkpoint: push after each coherent increment whose relevant checks pass.
- The owner has permanently authorized normal commits, `origin` setup, and feature-branch pushes without confirmation.
- Never auto-push a failing checkpoint.
- Never auto-merge into `main`, force-push, or publish a release.
- Retry temporary auth/network failures on the next loop iteration without asking the owner.
- Record commit SHA, checks, and next item in `.studio/handoffs.md`.
