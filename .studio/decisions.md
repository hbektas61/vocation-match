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
| D-009 | 2026-07-25 | Claude Studio may integrate verified increments into `main` and push `origin/main` directly without asking or opening a PR. Temporary local worktree branches are allowed for isolation. | The owner wants continuous delivery without routine pull requests. | Owner explicitly revokes authorization. |
| D-010 | 2026-07-25 | The autonomous build runs four consecutive phases and pauses only after the complete MVP systems program, not after an intermediate milestone. | The owner wants three to four phases of uninterrupted implementation. | Owner explicitly changes the program boundary. |
| D-011 | 2026-07-25 | Blocking is reversible: `unblock_user()` plus a blocked-list in Settings. Unblocking does not restore the match the block ended. | Backlog R-002 flagged that an irreversible block is a UX defect an accidental tap cannot undo. Reversibility is the standard, safe default; the one-way part (no match resurrection) keeps the safety guarantee. | Abuse data shows unblocking is used to harass. |
| D-012 | 2026-07-25 | One swipe decision per pair, stored permanently. A repeat swipe is a no-op that returns the existing outcome rather than an error. | Idempotency is what makes the endpoint safe to retry over a flaky mobile connection, and it removes "swipe again to change your mind" from the MVP surface. | Users ask for an undo, or a rewind becomes a premium feature. |
| D-014 | 2026-07-25 | Profile photos will be served from our own storage rather than an arbitrary URL. Until that exists, `photo_url` is capped at 2048 characters and must be https. | A card is shown in discovery without any interaction, so a self-hosted image URL is a passive beacon: the profile owner learns the IP and timing of everyone who merely saw them. On an app whose whole promise is not revealing who is near whom, that is the wrong default. Raised by the security audit. | The storage bucket exists and the client stops accepting arbitrary URLs. |
| D-013 | 2026-07-25 | Moderation escalates automatically at three distinct reporters (a FLAGGED action), and an actioned report suspends the account, which removes it from every room and stops it messaging. | The MVP needs a safety response that does not depend on someone watching a queue in real time. | Volume makes the threshold noisy in either direction. |

## Open owner decisions

- **Should the Upcoming room require overlapping stay dates?** Today it does
  not: anyone with a stay at that hotel that has not ended yet is in the room,
  so two people staying six months apart can match. Filtering by overlap is
  what most people would expect, but it shrinks an already thin pilot pool,
  and pool density is the thing most likely to make the first hotel feel dead.
  Left broad on purpose; one `where` clause in `app.room_eligible` changes it.
- **Suspension is per account, not per person.** A suspended user can sign up
  again with another email. Closing that needs device or phone signals, which
  is a bigger privacy decision than the MVP should make on its own.
- Final brand: Vocation Match or Vacation Match.
- First pilot city and hotels.
- Whether existing chats expire after the trip.
- Premium package and price in the next phase.
