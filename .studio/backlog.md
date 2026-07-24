# Backlog

Agents must move an item only after recording verification evidence.

## Now — MVP foundation (completed 2026-07-25)

Evidence: 55/55 jest tests (incl. critical-flow component test), `tsc --noEmit` clean, `eslint .` clean, `expo export --platform web` bundles; independent code + security review passed with no critical/high finding. Branch `worktree-mvp-foundation`.

- [x] B-001 Record architecture decisions for Expo layout, navigation, state, fixtures, and tests. (`.studio/architecture.md`)
- [x] B-002 Initialize `mobile/` as an Expo React Native TypeScript app.
- [x] B-003 Add design tokens and accessible shared components. (`src/theme.ts`, `src/components/ui.tsx`)
- [x] B-004 Implement onboarding, 18+ gate, auth placeholder, and profile flow.
- [x] B-005 Implement hotel search fixtures, hotel card, and one-active-hotel activation.
- [x] B-006 Implement self-declared Upcoming dates and room eligibility.
- [x] B-007 Implement simulated foreground distance result and 500-meter Here Now eligibility.
- [x] B-008 Implement discovery deck, swipe decisions, mutual match, inbox, and chat fixtures.
- [x] B-009 Implement block/report/settings placeholders and honest trust copy. (report/block reachable from discovery deck and chat)
- [x] B-010 Add domain unit tests, lint, typecheck, and build verification.
- [x] B-011 Run code, security, accessibility, and mobile QA review; fix valid findings. (code + security done; medium finding fixed; accessibility/mobile-QA deep pass deferred to pre-release gate)
- [x] B-012 Record handoff and prepare backend milestone. (`.studio/handoffs.md` 2026-07-25)

### Review follow-ups carried to next milestones

- [x] R-001 Closed by the `profiles_enforce_adult` trigger in `20260725000200_profiles.sql`; `supabase/tests/001_profiles.sql` proves an underage insert is refused server-side.
- [ ] R-002 Server side done: `unblock_user()` and `my_blocks()` exist and are tested (`supabase/tests/007_safety.sql`), and the product call is recorded as decision D-011. Remaining: the Settings blocked-list UI.
- [ ] R-003 Optional polish: periodic re-render (timer) so an open Rooms/Discovery screen drops stale Here Now/Upcoming eligibility exactly at the freshness boundary.
- [ ] R-004 Accessibility + mobile QA deep pass (lifecycle, permission-denial variants, screen readers) before any device/store milestone.

## Phase 1 — backend foundation

Evidence command: `bash supabase/scripts/db-test.sh` — fresh container, migrations
applied in order, pgTAP suites plus multi-connection concurrency checks.

- [x] N-001 Supabase project structure and local migrations. (`supabase/migrations/`, `supabase/config.toml`, `supabase/scripts/db-test.sh`; harness verified in both directions — a deliberately failing assertion exits non-zero.)
- [x] N-002 Auth and profile RLS. (`20260725000200_profiles.sql`; 18+ enforced by trigger, not by the client — closes R-001. Typed mobile boundary in `mobile/src/data/` with a credential-free in-memory implementation.)

## Phase 2 — hotel, presence, and discovery

- [x] N-003 Hotel provider integration and cached hotel catalog. (`20260725000300_hotels.sql`; single `upsert_hotel_from_provider` write boundary restricted to service_role; `location` not granted to any client role.)
- [x] N-004 Transactional one-active-hotel enforcement. (`20260725000500_hotel_state_functions.sql`; primary key + row lock, raced by `supabase/tests/concurrency.sh`.)
- [x] N-005 Ephemeral location check and server-side PostGIS distance. (`record_presence_check`; coordinates are arguments only, one boolean answer per user, 30-minute freshness, no distance ever returned.)
- [x] N-006 Discovery eligibility endpoint. (`20260725000600_discovery.sql`; `my_rooms()` and `discovery_feed()`, both rooms independent.)

## Phase 3 — matching, chat, and safety

- [x] N-007 Idempotent swipe/match. (`swipe()`; primary key on the pair absorbs retries, advisory pair lock makes simultaneous likes produce exactly one match — raced in `concurrency.sh`.)
- [x] N-008 Realtime persistent chat. (`20260725000900_chat.sql`; one insert policy carries every rule and Realtime applies the same select policy.)
- [x] N-009 Block/report/moderation pipeline. (`block_user`/`unblock_user`/`report_user`, automatic flagging at three distinct reporters, service_role-only `moderation_queue` and `resolve_report`, suspension removes the account from every room.)

## Phase 4 — staging and device readiness

- [ ] N-010 Staging E2E and device test.

## Later — monetization

- [ ] L-001 Define premium value and price.
- [ ] L-002 Add store products and RevenueCat.
- [ ] L-003 Decide free versus premium room access.
- [ ] L-004 Purchase restore, webhook, entitlement, and paywall tests.

## Explicitly excluded

- Reservation upload or reservation number.
- Passport/ID.
- Hotel staff approval.
- Background tracking.
- Exact distance display.
- Live user map.
- Production deploy or store submission.
