# Decisions

These decisions are owner-approved and must not be silently changed.

| ID | Date | Decision | Reason | Revisit when |
| --- | --- | --- | --- | --- |
| D-001 | 2026-07-24 | Upcoming access uses self-declared hotel and stay dates; no reservation proof is collected. | The owner wants minimum friction and minimum sensitive data. | Fraud or hotel-hopping data shows material harm. |
| D-002 | 2026-07-24 | Here Now access requires only a recent foreground check within 500 meters of the selected hotel. | Proximity is sufficient for the intended room. | Abuse data justifies stronger controls. |
| D-003 | 2026-07-24 | A user can have exactly one active hotel at any moment. | This is the primary scope and abuse constraint. | Never silently; owner decision required. |
| D-004 | 2026-07-24 | Changing hotels immediately closes discovery access in the previous hotel. Existing matches/chats may remain. | Preserve the one-hotel rule without destroying social connections. | User safety evidence suggests chat expiry. |
| D-005 | 2026-07-24 | Exact coordinates and exact live distances are never shown to users or placed in analytics. | Privacy and stalking-risk reduction. | Never loosen without explicit privacy review. |
| D-006 | 2026-07-24 | Payments and premium access are deferred to the next product phase. | Validate the core loop before monetization. | Core pilot flow is working and measured. |
| D-007 | 2026-07-24 | Product copy must say “self-declared upcoming” and “near the hotel now,” not “verified reservation/guest.” | Prevent misleading trust claims. | A real hotel or reservation integration exists. |
| D-008 | 2026-07-24 | MVP is 18+ and includes block/report from the first usable build. | Social matching requires baseline safety. | Never remove. |
| D-009 | 2026-07-24 | Claude Studio may commit and push verified feature-branch increments to `hbektas61/vocation-match` without asking again. | The owner wants continuous GitHub checkpoints during the loop. | Owner explicitly revokes authorization. |

## Open owner decisions

- Final brand: Vocation Match or Vacation Match.
- First pilot city and hotels.
- Whether existing chats expire after the trip.
- Premium package and price in the next phase.
