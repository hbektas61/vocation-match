# Agent Plan

## Current program

- Program: Overnight pilot hardening
- Lead: `project-orchestrator`
- Started from: `origin/main` at `df46908`, immediately after the MVP systems
  program closed.
- Goal: Close the four items the MVP program left open, then harden everything
  a pilot with real people would expose. Four consecutive verified phases, no
  pause at an intermediate boundary.
- Completion promise: `VOCATION_OVERNIGHT_HARDENING_COMPLETE`

The previous program (`VOCATION_MVP_SYSTEM_COMPLETE`) is closed. Its record is
kept below under **Closed program — MVP systems build** so the P0–P5 evidence
is not lost.

### What this program does *not* change

The real-device pass stays externally deferred under **D-015**. This machine has
Command Line Tools without Xcode and no Android SDK, so no build can run on a
simulator or a phone here. Installing a toolchain is owner work. Every scenario
that needs real hardware is listed in `.studio/device-readiness.md`; this
program adds to that list rather than pretending to work off it.

## Ordered phases

### Phase 1 — profile photos leave the open internet (backlog S-001, decision D-014)

Today `profiles.photo_url` accepts any https URL up to 2048 characters. A
discovery card renders without any interaction, so a URL the profile owner
controls is a passive beacon: they learn the IP and the timing of everyone who
merely saw them. On an app whose promise is not revealing who is near whom, that
is the wrong default. The length cap shipped as a stop-gap and is still a
stop-gap.

- H-101 A private Supabase Storage bucket for profile photos, created by
  migration, with the object path bound to the owner's user id.
- H-102 Owner-controlled writes: a user may write, replace, and delete objects
  only under their own prefix. Enforced by storage RLS, not by the client.
- H-103 Safe authenticated reads: a photo is readable by its owner, by someone
  who can currently see that person in a room, and by a match — nobody else,
  and never anonymously. No public bucket, no permanent public URL.
- H-104 Cleanup: replacing a photo removes the previous object, deleting the
  photo removes it, and deleting the account removes every object under the
  user's prefix. What cleanup a database function genuinely cannot do
  (byte-level removal in the object store) is stated, not implied.
- H-105 The client stops accepting an arbitrary URL anywhere. `photo_url` is
  replaced by an owner-scoped storage path; the mobile UI picks an image,
  uploads it, shows it, and can remove it.
- H-106 Focused tests: pgTAP over the storage policies and the path rule, plus
  mobile tests over the upload/remove/failure paths.

### Phase 2 — in-app account deletion

There is no way to delete an account from inside the app. For a
dating-adjacent product that is both a privacy failure and a store-review
failure.

- H-201 `public.delete_my_account()`: server-side, ownership enforced from the
  JWT and never from an argument, deleting the caller's `auth.users` row so
  every cascade fires.
- H-202 Data cleanup that the cascades do not cover, and an explicit written
  answer for the records that deliberately survive (moderation history is
  `on delete set null` on purpose — deleting an account must not erase the
  reports filed about it).
- H-203 Confirmation UX in Settings: destructive, irreversible, and explicit
  about what is and is not deleted. Not a single tap.
- H-204 Local session removal: the SecureStore session is gone afterwards, so
  the app cannot come back holding a token for a user that no longer exists.
- H-205 Honest failure handling: a failed deletion says so and leaves the user
  signed in. It never reports success it did not get.
- H-206 Tests: pgTAP (own account only, cascades, unauthenticated refused,
  moderation trail survives) and mobile tests over the confirm/succeed/fail
  paths.

### Phase 3 — email confirmation readiness, then S-004

- H-301 `supabase/config.toml` configured so a local run actually exercises
  email confirmation instead of skipping it.
- H-302 Unconfirmed-email states in the app. Sign-up currently throws when the
  server returns no session, which is exactly what a confirmation-required
  project does on every successful sign-up. That is a hard failure on the happy
  path.
- H-303 A configuration check that fails loudly if confirmation is off, so this
  cannot silently regress.
- H-304 Written instructions for the hosted project, since the setting does not
  travel with the migrations (backlog S-003).
- H-305 S-004: unambiguous room attribution. `matches.room` is currently taken
  from whichever swipe closed the match, so the same pair produces a different
  label depending on who swiped second. A safe migration makes it the room of
  the pair's *first* swipe, deterministic under concurrency, with a backfill.
- H-306 Typed client updates, concurrency checks racing both swipe orders, and
  regression tests over the existing matching suites.

### Phase 4 — pilot-hardening pass

One pass per dimension, each producing either a fix or a written reason it
needs nothing:

- H-401 Security: authorization on every new surface, grant/policy drift,
  `security definer` search paths, secret handling.
- H-402 Privacy: no coordinates, no distances, no birthdates, no emails
  crossing the user boundary; storage paths are not an enumeration oracle.
- H-403 Abuse resistance: rate limits over the new endpoints, deletion and
  upload as amplification vectors.
- H-404 Accessibility over every screen changed in phases 1–3.
- H-405 Lifecycle: backgrounding, permission revocation, session expiry,
  deletion mid-session.
- H-406 Offline behaviour that can be simulated locally: request failure paths,
  no silent success, no stuck spinners.
- H-407 Migration replay: a fresh database reaches the same schema as an
  incrementally migrated one.
- H-408 Client/database contract drift, including storage.
- H-409 Dependency health.
- H-410 Performance smoke checks over the queries a pilot actually runs.
- H-411 Documentation: README, `.studio/*`, device-readiness additions.

## Program definition of done

- Every H-1xx through H-4xx item is complete with reproducible evidence, or
  recorded as externally deferred with the exact missing dependency named.
- Arbitrary profile photo URLs are gone from every write path.
- An account can be deleted from inside the app, and the deletion is enforced
  by the server.
- Email confirmation is configured, verified by a check, and handled in the UI.
- `matches.room` is deterministic for a pair regardless of swipe order.
- `scripts/check.sh` passes end to end: migrations, pgTAP, concurrency, the
  contract check, `tsc`, `eslint --max-warnings 0`, jest, and the web bundle.
- Independent code and security review pass with no unresolved critical or high
  finding.
- Studio decisions, backlog, handoffs, release checklist, and device-readiness
  records are current and honest about what was not verified.

## Automatic phase transition contract

- At the end of each phase: run every relevant check, repair failures, obtain
  independent review, fix valid critical/high findings, update Studio records,
  commit, integrate into `main`, push `origin/main`.
- Immediately begin the next numbered phase in the same loop.
- Do not ask the owner to continue and do not output the program completion
  promise at an intermediate boundary.
- A missing external dependency must not stop unrelated local work. Record the
  exact deferred verification, finish every safe unblocked item, retry later.
- Stop only when the whole four-phase program is verified, the iteration limit
  is reached, or an external dependency blocks all remaining meaningful work.

## Agent routing

1. `project-orchestrator` — phase transitions, integration, evidence, delivery.
2. `database-engineer` + `backend-engineer` — storage policies, deletion,
   migrations, SQL tests.
3. `cross-platform-engineer` + `frontend-ux` — typed client boundary, upload and
   deletion UI, unconfirmed-email states.
4. `test-engineer` + `accessibility-auditor` — focused, concurrency, regression,
   and accessibility coverage.
5. `code-reviewer` + `security-auditor` — independent review at every phase
   boundary.

Use at most 3–5 active specialists. Assign non-overlapping files.

## Program gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| H1 Profile photo storage | H-101–H-106 | **done** — `scripts/check.sh` green: 271 pgTAP assertions (43 new), 12 concurrency checks, contract check incl. storage, tsc, eslint, 173 jest tests, web bundle. Independent code review + security audit run; every finding above low either fixed (`20260725001500_photo_write_path.sql`, signed-URL refresh, orphan sweep) or recorded. |
| H2 Account deletion | H-201–H-206, pgTAP + mobile tests, review | not started |
| H3 Email confirmation + S-004 | H-301–H-306, config check, concurrency evidence, review | not started |
| H4 Pilot hardening | H-401–H-411, full `scripts/check.sh`, final review | not started |

A gate moves to `done` only with a commit SHA and the checks that passed
written next to it. No gate is marked from generated files alone.

## Loop contract

- Input: this plan, the backlog, decisions, repository state, verification output.
- Action: implement, test, diagnose, repair, review, update Studio records.
- Success: every Definition of Done item and every H1–H4 gate is true and verified.
- Stop: maximum 100 iterations; or two consecutive iterations produce no new
  evidence because an external dependency blocks all remaining work. Record the
  blocker rather than claiming success.

## GitHub checkpoint contract

- Repository: `hbektas61/vocation-match`
- Delivery branch: `main`
- Checkpoint: after each coherent increment passes its relevant checks,
  integrate it into local `main` and push `origin/main`.
- The owner has permanently authorized normal commits, `origin` setup, local
  integration, and direct pushes to `main` without confirmation (D-009).
- Temporary worktree branches are allowed for isolation; routine pull requests
  must not be created.
- Never push a failing checkpoint, force-push, rewrite history, deploy
  production, or publish a release.
- Retry temporary auth/network failures on the next iteration without asking.
- Record commit SHA, checks, and next item in `.studio/handoffs.md`.

---

# Closed program — MVP systems build

- Completion promise: `VOCATION_MVP_SYSTEM_COMPLETE` (met 2026-07-25)

## Phases delivered

1. Backend foundation — N-001 Supabase local structure and migrations; N-002
   authentication, 18+ profile constraints, profile persistence, RLS, typed
   mobile boundary.
2. Hotel, presence, discovery — N-003 cached hotel catalog/provider boundary;
   N-004 transactional one-active-hotel enforcement; N-005 ephemeral 500-metre
   foreground presence check without exact-location exposure; N-006 discovery
   eligibility for self-declared Upcoming and Here Now.
3. Matching, chat, safety — N-007 idempotent swipe and mutual-match
   transactions; N-008 persistent realtime chat; N-009 block, report, and
   moderation pipeline.
4. Staging and device readiness — N-010 local end-to-end verification;
   R-002–R-004 resolved; production/store handoff recorded without deploying.

## Gates as closed

| Gate | Status |
| --- | --- |
| P0 Mobile foundation | done — commit `2fa8bfe` |
| P1 Backend foundation | done |
| P2 Hotel/presence/discovery | done |
| P3 Matching/chat/safety | done |
| P4 Staging/device readiness | done, with the device pass **deferred as an accepted risk** (D-015) |
| P5 Final handoff | done |

Evidence, reproducible in one command — `scripts/check.sh`: 228 pgTAP
assertions across 11 SQL suites, 12 concurrency checks racing real connections,
the client/database contract check, `tsc`, `eslint --max-warnings 0`, jest, and
a web bundle.

Six defects were found and fixed during that program, which is the part worth
remembering:

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
