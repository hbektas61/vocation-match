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
| D-015 | 2026-07-25 | The on-device test pass is deferred to the next phase as an accepted, recorded risk. The MVP systems program closes without it. | No simulator or device toolchain exists on the build machine, and installing one is owner work. Everything a bundle can prove is proven; keeping the program open changed nothing. | The owner installs Xcode / the Android SDK, or connects a phone with Expo Go. Do this before any pilot with real users, not before the next code milestone. |
| D-014 | 2026-07-25 | Profile photos will be served from our own storage rather than an arbitrary URL. Until that exists, `photo_url` is capped at 2048 characters and must be https. | A card is shown in discovery without any interaction, so a self-hosted image URL is a passive beacon: the profile owner learns the IP and timing of everyone who merely saw them. On an app whose whole promise is not revealing who is near whom, that is the wrong default. Raised by the security audit. | The storage bucket exists and the client stops accepting arbitrary URLs. |
| D-013 | 2026-07-25 | Moderation escalates automatically at three distinct reporters (a FLAGGED action), and an actioned report suspends the account, which removes it from every room and stops it messaging. | The MVP needs a safety response that does not depend on someone watching a queue in real time. | Volume makes the threshold noisy in either direction. |

| D-016 | 2026-07-25 | A repeat swipe, and a photo read, never depend on where the other person is at that moment. A decision already made is answered from storage; a photo stays visible to someone who was already shown the card, whether or not its owner is checked in right now. | The pilot-hardening audit found that both endpoints answered from the target's *live* room eligibility, and a user id is public to everyone who has seen a card. Polling either one told you the moment a specific person arrived near the hotel and the moment they left — a live presence feed on someone who, in the swipe case, you had already been removed from the deck of. That is the behaviour D-005 exists to prevent, and it also broke D-012: a retry after a dropped response failed if the other person had moved in between. | Never loosen without a privacy review. Note what this does not close: the fast path does measurably less work than a first swipe, so a precise enough timing measurement could still tell the two apart. That is a far weaker signal than the one it replaced — it says whether you have swiped on someone, not where they are — and closing it would mean making every call do the slow path's work. Worth knowing before this ever faces a more adversarial setting than an invited pilot. |

| D-017 | 2026-07-26 | The way into the app is one onboarding wizard whose current step is *derived* from real state — session, profile, active hotel — rather than stored anywhere. Only the "show the teaching cards" flag lives in memory, and a cold start begins with it false. A profile without an active hotel resumes conservatively at bio: repeating optional steps is preferable to silently dropping them. | Storing a cursor means two sources of truth about where somebody is, and the one on the device is the one that can be wrong. Deriving it also gives the requirement "a finished onboarding must not reappear" for free, with nothing written to disk. | A step is ever added that the server has no way to observe. |
| D-018 | 2026-07-26 | `profiles.interests` exists: up to five self-chosen entries of 1–24 characters, readable on a discovery card and never used as a filter. Omitting the field from a profile write means "leave it alone", not "clear it". | The domain model has carried `interests` since the first milestone with nothing behind it, and the onboarding step that asks for them would otherwise throw the answer away. Bounded because the column is free text, and an unbounded array of unbounded strings is a place to put a payload. Not searchable, because something to read on a card is not the same as a facet to be targeted with. | Interests are ever wanted as a matching signal — that is a different privacy question. |

## Open owner decisions

- **Should the Upcoming room require overlapping stay dates?** Today it does
  not: anyone with a stay at that hotel that has not ended yet is in the room,
  so two people staying six months apart can match. Filtering by overlap is
  what most people would expect, but it shrinks an already thin pilot pool,
  and pool density is the thing most likely to make the first hotel feel dead.
  Left broad on purpose; one `where` clause in `app.room_eligible` changes it.
- **Suspension is per account, not per person.** A suspended user can sign up
  again with another email — and, since H2, can delete the suspended account
  first, so nothing is even left behind. Closing that needs device or phone
  signals, which is a bigger privacy decision than the MVP should make on its
  own. Worth sizing honestly before the pilot: at one hotel with tens of
  people, the friction to come back is "use a different email", which is close
  to none.
- **A coordinated pile-on can force a moderation flag.** Three distinct
  reporters raise a `FLAGGED` row automatically (D-013), and three disposable
  addresses are not hard to get. What it cannot do is suspend anyone —
  `resolve_report` is service_role only, so a human still stands between the
  flag and any consequence. The flag is queue priority, not a ban. Whoever
  watches the queue during the pilot should know it is a lever.
- Final brand: Vocation Match or Vacation Match.
- First pilot city and hotels.
- Whether existing chats expire after the trip.
- Premium package and price in the next phase.
