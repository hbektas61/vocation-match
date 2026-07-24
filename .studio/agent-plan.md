# Agent Plan

## Current phase

- Phase: Backend foundation
- Lead: `project-orchestrator`
- Goal: Add a locally reproducible Supabase foundation with authentication, profile persistence, RLS, and safe mobile integration boundaries.
- Completion promise: `VOCATION_BACKEND_FOUNDATION_COMPLETE`

## Definition of done

- `supabase/` contains reproducible local configuration, ordered migrations, and database test/seed support without committed secrets.
- Authentication owns the user identity; a profile row is tied to `auth.users` and enforces the 18+ and required-profile rules at the server boundary.
- Row Level Security lets an authenticated user create/read/update only their own profile and denies anonymous or cross-user writes.
- Mobile code uses a typed backend boundary with safe environment handling; existing fixture-driven tests remain usable without production credentials.
- Service-role keys, exact location history, reservation proof, ID verification, payments, and production deployment are absent.
- Database-focused checks pass when the supported local environment is available; any unavailable external dependency is reported honestly rather than simulated.
- Mobile unit tests, lint, TypeScript, and Expo build checks pass.
- Material changes receive code and security review; every critical/high finding is fixed.
- `.studio/backlog.md` and `.studio/handoffs.md` contain verification evidence and the next milestone.

## Agent sequence

1. `project-orchestrator`
   - Inspect the completed mobile foundation, lock backend scope, and create non-overlapping slices.
2. `api-architect` + `database-engineer`
   - Define the Supabase boundary, schema, migrations, constraints, and RLS policy matrix.
3. `backend-engineer`
   - Implement local Supabase structure, auth/profile persistence, policies, and database tests.
4. `cross-platform-engineer`
   - Add the typed mobile client boundary and preserve credential-free fixture tests.
5. `test-engineer` + `code-reviewer` + `security-auditor`
   - Verify behavior and independently review auth, RLS, secret handling, and regressions.

Use at most 3–5 active specialists. Assign non-overlapping files.

## Phase gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| B0 Handoff | Mobile foundation evidence and backend scope are recorded | done — `.studio/handoffs.md` 2026-07-25 |
| B1 Architecture | Supabase schema, auth flow, RLS matrix, and mobile boundary are recorded | todo |
| B2 Database | Local migrations and auth/profile RLS are implemented | todo |
| B3 Integration | Typed mobile backend boundary works without committed credentials | todo |
| B4 Verification | Database checks plus mobile test/lint/typecheck/build pass | todo |
| B5 Review | Code/security review has no unresolved critical/high finding | todo |
| B6 Handoff | Evidence and the next hotel/presence milestone are recorded | todo |

## Loop contract

- Input: this plan, the backlog, decisions, repository state, and verification output.
- Action: implement, test, diagnose, repair, review, and update Studio records.
- Success: every Definition of Done item is true and verified.
- Stop: maximum 20 iterations; or two consecutive iterations produce no new evidence because of an external dependency. Record the blocker instead of claiming success.

## GitHub checkpoint contract

- Repository: `hbektas61/vocation-match`
- Delivery branch: `main`
- Checkpoint: after each coherent increment passes its relevant checks, integrate it into local `main` and push `origin/main`.
- The owner has permanently authorized normal commits, `origin` setup, local integration, and direct pushes to `main` without confirmation.
- Temporary worktree branches are allowed for agent isolation, but routine pull requests must not be created.
- Never push a failing checkpoint, force-push, rewrite history, deploy production, or publish a release.
- Retry temporary auth/network failures on the next loop iteration without asking the owner.
- Record commit SHA, checks, and next item in `.studio/handoffs.md`.
