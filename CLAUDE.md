# Vocation Match — Claude Studio Project Instructions

This repository is a Claude Studio project. Read the global Studio playbook and all `.studio/` files before substantive work.

## Product truth

Vocation Match is a React Native/Expo mobile app that lets adults discover and match with people connected to one hotel.

- A user can have exactly one active hotel at a time.
- `UPCOMING` means the user self-declared a future stay at the active hotel.
- `HERE_NOW` means a foreground location check placed the user within 500 meters of the active hotel.
- Do not request or store reservation documents, reservation numbers, passport/ID data, hotel confirmation, room number, or strict identity verification in the MVP.
- Do not require an upcoming declaration before `HERE_NOW`; proximity is sufficient.
- Never expose exact coordinates or live distance to another user.
- Switching hotels immediately deactivates discovery in the previous hotel.
- Payment and premium features are a later phase. Do not add billing, paywalls, RevenueCat, or premium entitlement until `.studio/decisions.md` explicitly advances that phase.

## Current milestone

Build the local, testable MVP foundation described in `.studio/agent-plan.md` and `.studio/backlog.md`.

Source layout:

- `mobile/`: Expo React Native application.
- `supabase/`: database migrations and local backend configuration when introduced.
- `.studio/`: durable project state, decisions, backlog, and handoffs.
- `outputs/`: owner-facing planning artifacts; do not treat as application source.

## Autonomous execution

Use `studio-autopilot` with `project-orchestrator`. Route bounded work to at most 3–5 useful specialists at once:

- `mobile-architect`
- `cross-platform-engineer`
- `frontend-ux`
- `api-architect`
- `backend-engineer`
- `database-engineer`
- `test-engineer`
- `code-reviewer`
- `security-auditor`
- `mobile-qa-release`

Proceed without asking for routine project-local edits, dependency installation, tests, formatting, linting, typechecking, local builds, non-destructive migrations, documentation, refactors, and repairs.

Do not deploy to production, submit to stores, spend money, publish externally, use real customer data, change third-party production access, delete production data, or run destructive system-wide operations. Record an external blocker instead.

## Delivery loop

For every increment:

1. Read the current Studio state.
2. Select the highest-priority unblocked backlog item.
3. Define observable acceptance checks.
4. Implement the smallest complete vertical slice.
5. Run focused tests, lint, typecheck, and relevant build checks.
6. Run independent code/security review for material changes.
7. Fix valid findings.
8. Update `.studio/backlog.md`, `.studio/handoffs.md`, and `.studio/decisions.md`.
9. Continue until the current milestone completion promise is true or the loop reaches its explicit iteration limit.

Do not mark work complete based only on generated files. Verification evidence is required.

## GitHub sync

The authorized repository is `https://github.com/hbektas61/vocation-match.git`.

- Work on a feature branch; never develop directly on `main`.
- After a coherent increment passes its relevant tests, lint, and typecheck, create a terse commit and push the current branch to `origin`.
- The owner has permanently authorized these normal commits and feature-branch pushes. Do not ask for confirmation.
- If `origin` is missing, add `https://github.com/hbektas61/vocation-match.git` automatically.
- Push at milestone boundaries or after a meaningful verified increment, not after every individual file edit.
- Never force-push, rewrite shared history, auto-merge into `main`, or mark a draft PR ready without owner approval.
- If push authentication or network access is temporarily unavailable, keep the commit locally, record the blocker in `.studio/handoffs.md`, continue safe local work, and retry in the next iteration without asking.
