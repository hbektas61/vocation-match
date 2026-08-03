/**
 * V-011 — what a neighbour's venue is allowed to cost.
 *
 * A Google venue has no stored name (D-054), so a region card can only be
 * labelled by asking Google. Doing that per render would be a paid call every
 * time a card scrolled back into view, which is not a label — it is a meter
 * attached to a scroll gesture.
 *
 * So the owner's rules, all of them enforced here rather than by convention:
 *
 *   - a card at the viewer's *own* venue is never resolved; they already know
 *     where they are, and the screen says so above the deck,
 *   - a Place ID is resolved at most once per deck session, however many cards
 *     carry it and however often the deck reloads,
 *   - at most three distinct Google labels per deck session,
 *   - the answer lives in memory and is never written to the database,
 *   - a ceiling, a provider failure, or the fourth distinct venue all fall back
 *     to the generic "nearby" label,
 *   - and nothing here can make a card, a swipe or a match fail: every path
 *     resolves, none rejects.
 *
 * The cache is deliberately module-scoped rather than per component: a deck
 * that reloads — after a swipe, after a refresh, after a tab switch — is the
 * same deck session to the person looking at it, and asking again because a
 * component remounted would be exactly the cost this file exists to stop.
 */
import { getApi } from './index';

/** At most this many distinct Google venues get a real name per deck session. */
export const MAX_DECK_LABELS = 3;

/** Place ID → the name, or null meaning "settled: no label for this one". */
const resolved = new Map<string, string | null>();
/** In-flight resolutions, so two cards with one Place ID make one call. */
const pending = new Map<string, Promise<string | null>>();

function distinctResolved(): number {
  let count = 0;
  for (const name of resolved.values()) {
    if (name !== null) count += 1;
  }
  return count;
}

/**
 * Clears the deck session. Called when the account changes — a new person is
 * a new session, and one person's resolved labels are not another's budget.
 */
export function resetDeckLabels(): void {
  resolved.clear();
  pending.clear();
}

/** What has already been settled, for a render that must not wait. */
export function knownVenueLabel(placeId: string): string | null {
  return resolved.get(placeId) ?? null;
}

/**
 * Resolves at most `MAX_DECK_LABELS` distinct Google venues from a deck.
 *
 * Returns the labels it has, including ones settled by an earlier call. Never
 * throws: a provider that cannot answer produces a generic card, not an error
 * screen.
 */
/**
 * The caller's own venue's live name, from the same cache the deck labels
 * use — one details call per session per place, shared across screens, and
 * exempt from the deck's label budget because it is not a deck label.
 */
export async function resolveOwnVenueLabel(placeId: string): Promise<string | null> {
  if (resolved.has(placeId)) return resolved.get(placeId) ?? null;
  let attempt = pending.get(placeId);
  if (!attempt) {
    attempt = getApi()
      .resolveGooglePlace(placeId)
      .catch(() => null)
      .then((identity) => {
        const name = identity?.name ?? null;
        resolved.set(placeId, name);
        pending.delete(placeId);
        return name;
      });
    pending.set(placeId, attempt);
  }
  return attempt;
}

export async function resolveDeckLabels(
  placeIds: readonly (string | null | undefined)[],
  /** The caller's own venue, which is never worth a paid call. */
  ownPlaceId: string | null,
): Promise<Map<string, string>> {
  const wanted: string[] = [];
  for (const placeId of placeIds) {
    if (!placeId) continue;
    if (placeId === ownPlaceId) continue;
    if (resolved.has(placeId) || wanted.includes(placeId)) continue;
    wanted.push(placeId);
  }

  for (const placeId of wanted) {
    // The budget counts *labels obtained*, not attempts: a venue Google could
    // not name has cost its call already and must not be retried, but it has
    // not used up one of the three names the deck is allowed to show.
    if (distinctResolved() >= MAX_DECK_LABELS) break;

    let attempt = pending.get(placeId);
    if (!attempt) {
      attempt = getApi()
        .resolveGooglePlace(placeId)
        .catch(() => null)
        .then((identity) => {
          const name = identity?.name ?? null;
          resolved.set(placeId, name);
          pending.delete(placeId);
          return name;
        });
      pending.set(placeId, attempt);
    }
    await attempt;
  }

  const labels = new Map<string, string>();
  for (const [placeId, name] of resolved) {
    if (name !== null) labels.set(placeId, name);
  }
  return labels;
}
