# Metrics

## North star

Weekly users who activate one hotel, create a mutual match, and exchange messages in both directions.

## MVP funnel

| Step | Event | Initial target |
| --- | --- | --- |
| Signup | `signup_completed` | Baseline |
| Profile | `profile_completed` | ≥ 70% of signups |
| Hotel | `hotel_activated` | ≥ 60% of completed profiles |
| Room | `room_opened` | ≥ 70% of activated hotels |
| Discovery | `first_swipe` | ≥ 70% of room opens |
| Match | `match_created` | Measure by hotel density |
| Conversation | `two_way_chat_started` | ≥ 35% of matches |

## Guardrails

- Report rate.
- Block rate.
- Rapid hotel-switch rate.
- Location permission denial rate.
- Here Now check failure rate.
- Crash-free sessions.
- API/RLS authorization failures.

## Data minimization

Never send exact coordinates, exact distance, exact self-declared stay dates, message text, profile bio, photo URLs, or hotel name to analytics.

