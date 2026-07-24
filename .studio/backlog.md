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

- [ ] R-001 Server-side re-check of the 18+ rule when the backend exists (client-only today; goes with N-002 RLS work).
- [ ] R-002 Product call: unblock UI (blocked-users list in Settings) — blocking is currently irreversible in-app.
- [ ] R-003 Optional polish: periodic re-render (timer) so an open Rooms/Discovery screen drops stale Here Now/Upcoming eligibility exactly at the freshness boundary.
- [ ] R-004 Accessibility + mobile QA deep pass (lifecycle, permission-denial variants, screen readers) before any device/store milestone.

## Now — backend foundation

- [ ] N-001 Supabase project structure and local migrations.
- [ ] N-002 Auth and profile RLS.

## Next — hotel, presence, and matching backend

- [ ] N-003 Hotel provider integration and cached hotel catalog.
- [ ] N-004 Transactional one-active-hotel enforcement.
- [ ] N-005 Ephemeral location check and server-side PostGIS distance.
- [ ] N-006 Discovery eligibility endpoint.
- [ ] N-007 Idempotent swipe/match.
- [ ] N-008 Realtime persistent chat.
- [ ] N-009 Block/report/moderation pipeline.
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
