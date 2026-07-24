# Studio Brief

## App

- Name: Vocation Match
- Possible English brand correction: Vacation Match; do not rename without owner approval
- Status: pre-MVP
- Owner: Hami
- Platform: iOS and Android
- Stack preference: React Native, Expo, TypeScript

## Product promise

The app helps adults meet people connected to the same hotel, before arrival or while they are within 500 meters of that hotel.

## Core workflow

1. User signs in and completes a profile.
2. User searches for a hotel.
3. User activates one hotel; activation deactivates any previous hotel.
4. User chooses or becomes eligible for one of two rooms:
   - `UPCOMING`: self-declared future stay dates.
   - `HERE_NOW`: foreground location proves the user is within 500 meters.
5. User swipes profiles in the eligible hotel room.
6. Mutual likes create a match.
7. Matched users can chat, unmatch, block, or report.

## Trust model

This MVP intentionally uses low-friction trust:

- No reservation proof.
- No reservation number.
- No ID/passport.
- No room number.
- No hotel staff approval.
- No continuous background location.
- One active hotel is the primary product constraint.
- `HERE_NOW` relies only on a recent 500-meter foreground location check.
- `UPCOMING` relies on user-declared hotel and dates.

The UI must describe these statuses accurately. Do not label users as “reservation verified” or “hotel verified.”

## Must-have

- 18+ age gate.
- Auth and profile.
- Hotel search and activation.
- Exactly one active hotel.
- Self-declared upcoming dates.
- Recent 500-meter here-now session.
- Separate Upcoming and Here Now discovery pools.
- Swipe, mutual match, chat.
- Block and report.
- Exact location never shown.
- Loading, empty, error, offline, and permission-denied states.

## Non-goals for the current phase

- Billing, subscription, paywall, RevenueCat, or premium.
- Reservation documents or hotel integration.
- Strong identity verification.
- Live map or exact distance.
- Background location.
- Production deployment or store submission.
- AI ranking.
- Multiple active hotels.

## First milestone

Create a runnable Expo foundation with the main navigation and a mocked end-to-end product flow, domain rules, and tests. The first milestone may use local fixtures; backend integration is the next milestone.

## Constraints

- Minimize sensitive data.
- Keep exact coordinates ephemeral and out of analytics/logging.
- Enforce one-active-hotel server-side when the backend is added.
- Keep app copy honest about self-declared and proximity-based status.

## Success signal

A test user can complete profile setup, activate a hotel, enter Upcoming through self-declared dates or Here Now through a simulated location result, swipe, create a mock mutual match, and open chat.

