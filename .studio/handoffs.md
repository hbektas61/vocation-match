# Handoffs

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
