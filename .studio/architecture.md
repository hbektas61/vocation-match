# Architecture Decision Record — MVP Foundation (B-001 / Gate G1)

Date: 2026-07-24
Author: project-orchestrator (with mobile-architect responsibilities)
Status: accepted for the MVP foundation milestone

## ADR-001 App scaffold

- `mobile/` is an Expo React Native app, TypeScript strict, created from the
  `blank-typescript` template (no expo-router).
- Rationale: smallest dependency surface, deterministic tests with `jest-expo`,
  no file-system routing magic while flows are still fixture-driven.

## ADR-002 Navigation

- `@react-navigation/native` with one native stack.
- Root stack decides between the Onboarding flow (age gate → auth placeholder →
  profile) and the Main flow based on session state.
- Main flow is a bottom tab navigator: Hotel, Rooms (Upcoming / Here Now entry),
  Discovery, Inbox, Settings. Match celebration, chat, and report/block are
  stack screens above the tabs.
- Rationale: matches the required screen list in `.studio/agent-plan.md`
  without premature deep-link work; expo-router can be adopted in the backend
  milestone if needed.

## ADR-003 State

- One `AppStore` implemented with React Context + `useReducer`.
- The reducer delegates every product rule to pure functions in `src/domain/`.
  The reducer itself only wires actions to domain results.
- No Redux/zustand dependency in this milestone.
- Rationale: the domain layer is the durable asset; the store is disposable
  once Supabase arrives. Pure functions keep rules unit-testable without
  rendering.

## ADR-004 Domain layer (pure, no I/O)

Files under `mobile/src/domain/`:

- `types.ts` — `Profile`, `Hotel`, `ActiveHotelState`, `UpcomingDeclaration`,
  `HereNowCheck`, `RoomKey` (`UPCOMING` | `HERE_NOW`), `SwipeDecision`,
  `Match`, `Conversation`.
- `hotel.ts` — `activateHotel` enforces exactly one active hotel and returns
  which hotel was deactivated so discovery access is closed immediately
  (owner decisions D-003, D-004).
- `upcoming.ts` — self-declared stay dates only; validates date order and
  that the stay has not already ended (D-001). No proof fields exist.
- `hereNow.ts` — eligibility requires a foreground check result whose
  distance is ≤ 500 m and whose timestamp is within a freshness window
  (30 minutes) for the currently active hotel (D-002). Distance is computed
  with the haversine formula from coordinates that never leave the function's
  scope; callers only receive `{ withinRange, distanceBucket }`
  (`NEAR` | `FAR`), never meters or coordinates (D-005).
- `rooms.ts` — room eligibility: `UPCOMING` needs a valid declaration for the
  active hotel; `HERE_NOW` needs a fresh in-range check. Neither requires the
  other (proximity alone is sufficient).
- `matching.ts` — swipe decisions, mutual-like match creation, dedupe, and
  unmatch; discovery pool filtering per room and active hotel.
- `location.ts` — haversine distance + `distanceBucket`. Exact meters are an
  internal intermediate value only.

## ADR-005 Fixtures and simulated location

- `mobile/src/fixtures/` holds hotels and candidate profiles.
- The Here Now screen uses a simulated foreground check: the tester picks
  "I am at the hotel" / "I am far away" / "Deny permission", which produces a
  `HereNowCheck` through the same domain function a real GPS read would use.
  `expo-location` is intentionally NOT installed in this milestone — there is
  no real location, no background mode, and nothing sensitive to leak.

## ADR-006 Copy and trust surface

- All status copy comes from `src/copy.ts` so wording is reviewable in one
  place. Allowed vocabulary: "self-declared upcoming stay", "near the hotel
  now". Forbidden: "verified", "reservation confirmed", "hotel approved"
  (D-007). The UI shows at most the coarse bucket "within 500 m", never a
  live distance (D-005).

## ADR-007 Tests and checks

- `jest-expo` preset; unit tests target `src/domain/**` and the store reducer.
- Critical-flow component test: onboarding → hotel activation → room →
  swipe → match happy path with `@testing-library/react-native`.
- Checks required by Gate G4: `npm test`, `npx tsc --noEmit`,
  `npx eslint .` (eslint-config-expo), and `npx expo export --platform web`
  as the local build proof.

## ADR-008 Explicit absences (Gate G5 guard)

The dependency tree and source must contain none of: payment/RevenueCat,
reservation/ID capture, background location, analytics SDKs, maps SDKs.
`security-auditor` verifies this by grep and `package.json` inspection.
