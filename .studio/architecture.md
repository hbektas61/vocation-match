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

# Architecture Decision Record — Backend (N-001 … N-009)

Date: 2026-07-25
Author: project-orchestrator (with api-architect / database-engineer responsibilities)
Status: accepted for the MVP systems program

## ADR-009 The database is the enforcement point

Every product rule that matters lives in SQL: row level security decides what a
row read may return, and each write that carries a rule goes through a
`SECURITY DEFINER` function that derives the acting user from the JWT rather
than from an argument. The client is treated as untrusted and hostile.

The client-side rules in `mobile/src/domain/` stay, but only as fast feedback.
Backlog item R-001 (server-side 18+) is closed by the trigger
`app.enforce_adult_profile`, not by the age-gate screen.

## ADR-010 Verification without a hosted project

`supabase/scripts/db-test.sh` starts the same Postgres image Supabase runs
locally, applies `supabase/migrations/` in order, and runs pgTAP suites plus a
multi-connection concurrency script. No hosted project, API key, or secret is
involved, so the checks run in CI and on a laptop identically.

Two harness details were forced by reality:
- The image answers `pg_isready` over the unix socket while it is still running
  its own init scripts, and DDL issued in that window trips the pg_graphql event
  trigger. The harness waits for the TCP listener instead.
- Applied migrations are tracked in `app.schema_migrations`, so `--keep` re-runs
  only what is new.

## ADR-011 Shapes carry the invariants

Where a constraint can express a rule, it does, because a constraint cannot be
forgotten by a future code path:

- `user_active_hotel` has a primary key on `user_id` — that *is* the
  one-active-hotel rule (D-003).
- `swipes` has a primary key on `(actor_id, target_id)` — one decision per pair,
  which is what makes the swipe endpoint safe to retry.
- `matches` stores the pair normalised (`user_a < user_b`) with a unique
  constraint, so two simultaneous likes cannot produce two matches.
- `presence_checks` has a primary key on `user_id` — one answer per person is
  the absence of location history (D-005).

Races that a constraint cannot settle are settled by locks: `set_active_hotel`
takes a row lock on the user, and `swipe` takes a transaction-scoped advisory
lock keyed on the ordered pair. `supabase/tests/concurrency.sh` races both.

## ADR-012 Coordinates never reach a client

`hotels.location` is not granted to `anon` or `authenticated` at the column
level, so the app cannot read venue geometry even with a valid token. The
proximity check takes a reading as a function argument, computes
`ST_DWithin(..., 500)` on the server, stores the boolean, and returns
`{within_range, expires_at}`. There is no code path that returns meters, which
means there is no distance oracle to build.

`supabase/tests/000_security_baseline.sql` fails the build if any public
function's result type ever mentions a location, coordinate, or distance, and if
any table outside `hotels` grows a geometry or latitude/longitude column.

## ADR-013 The typed boundary has two implementations

`mobile/src/data/contracts.ts` declares the whole API surface. `SupabaseApi`
talks to a real project; `FakeApi` is an in-memory implementation that mirrors
the same rules. Without `EXPO_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` the app
runs on the fake, so the build stays usable and testable with no credentials
present and nothing secret is ever committed.

## ADR-014 Moderation is a pipeline, not a table

`report_user` files a report and blocks by default. Three distinct reporters
raise a `FLAGGED` row automatically. A moderator (service_role only) reads
`moderation_queue` and calls `resolve_report`; actioning it sets
`profiles.suspended_at`, which removes the account from every room and stops it
sending messages. Reports survive account deletion (`on delete set null`) so the
history cannot be erased by deleting the account.

## ADR-015 The vacation venue is a Google Place ID (D-054)

The trip tab no longer searches our catalogue. It asks Google Places (New) in
two steps — a destination, then a place inside that destination's own area —
and what comes back is a Place ID.

**Identity.** A Google venue is an ordinary `public.hotels` row with
`provider = 'google'` and `provider_hotel_id = <place id>`. The table's existing
`unique (provider, provider_hotel_id)` is exactly the canonical key the product
needs, so there is no parallel "venue" concept: two users who select the same
Place ID reach the same row because the index says so, and
`upsert_google_venue` settles a concurrent first selection in a single
`insert … on conflict … returning`.

**Emptiness.** That row may hold nothing of Google's. `hotels.location` is
nullable *for this provider only* (`hotels_location_present` keeps every other
provider as strict as before); the name is the `(google)` placeholder, the same
shape as `(cell)`; and `app.search_places` excludes `provider = 'google'`, so a
placeholder can never be an answer to a name search. The real name is resolved
from the Place ID by whichever screen is about to draw it and lives in that
screen's memory alone.

**A destination is session state.** `app.search_sessions` gained a `kind`
(`checkin` | `destination` | `venue`) and the chosen destination's viewport.
The box never reaches the client — a client-supplied rectangle would be a
client-supplied search area — and sessions older than a day are deleted, which
is what keeps a viewport from quietly becoming a destination catalogue.

**Here Now without a stored coordinate.** `record_presence_check` refuses a
Google venue with `P0004` rather than measuring against a null. The edge
function resolves the venue's current position from Google, hands it to
`record_presence_verified`, and the same `ST_DWithin(..., 500)`, the same
30-minute freshness and the same premium gate run there. The coordinate is an
argument and is never written down, so ADR-012's promise is unchanged — and
`000_security_baseline.sql` now enforces it as an ACL test: a function may
mention a coordinate in its result type only if no client role can execute it.

**Two consequences, recorded rather than hidden.** A Google venue has no stored
coordinate, so it cannot join the D-038 15 km region pool; and another user's
card can only carry a venue name the viewer's own session resolved, which costs
a Place Details call per screen rather than a column read.

## ADR-016 A venue learns roughly where it is (D-055, V-010)

ADR-015 left a Google venue with no position of ours, and therefore outside the
D-038 region pool. It now earns one, from the app's own users.

**The cell.** `app.region_cell_of` snaps a reading to a ~1.5 km cell —
deliberately far coarser than D-048's ~200 m check-in cell, because this
answers "roughly where is this venue" rather than "who is standing with me".
`record_presence_verified` records one on a *successful* Here Now check at a
Google venue, when the device reported a fix of 100 m or better, inside the
same transaction that consumed the reading. The reading is never written down.

**Whose it is.** `app.venue_region_votes` is `primary key (venue_id, user_id)`
and insert-only, so a person contributes once to a venue and no amount of
repeat checking moves it. `app.consolidate_region_cell` lets a rival cell
replace the incumbent only with at least two distinct contributors *and*
strictly more of them — outliers do not win, and a genuine correction still
can.

**What is stored.** `hotels.coarse_region_cell` (a key) and
`hotels.coarse_region_point` (GENERATED from that key). Generated is the whole
guarantee: the most precise thing the column can hold is the centre of a
~1.5 km square, because nothing writes it. Neither column is granted to a
client.

**What it is for, and not for.** `discovery_feed` and `swipe` read
`coalesce(location, coarse_region_point)` — one anchor, both endpoints, so a
labelled card cannot invite a like the swipe then refuses. Null means "we do
not know", which reads as "not a neighbour" rather than "everywhere". The
500 m check still measures against the coordinate the backend resolved from
Google seconds earlier; `022_region_cell.sql` puts a venue's cell two
kilometres from the venue and proves standing in the cell is not standing at
the venue.

## ADR-017 A neighbour's name is bounded (D-055, V-011)

`discovery_feed` hands back `venue_place_id` for a *neighbour's* Google venue —
the same disclosure D-038 already makes as a name, in another encoding.
`data/venueLabels.ts` turns it into a name under four rules the code enforces
rather than documents: never for the viewer's own venue, once per Place ID per
deck session however many cards carry it, at most three distinct labels per
session, and memory only. A ceiling, a provider failure or a fourth venue all
produce the generic "nearby" label; nothing in the path can reject, so no card,
swipe or match ever waits on Google.

## ADR-018 Measured, not forecast (D-055, V-012)

`app.provider_events` gained a `quantity`, so a deck can report three counts
rather than one row per card, and `public.venue_operations_view()` returns the
eight numbers the owner asked for. It derives no cost and changes no ceiling.
`023_nothing_persisted.sql` walks every column in `public` and `app` and fails
if a coordinate, a location history or a Google-content-shaped column appears
anywhere outside the three places argued for in writing.
