import type { Candidate, Match, RoomKey, SwipeDecision } from './types';

/**
 * First decision wins: a repeated swipe on the same person in the same
 * hotel is ignored so a double-tap cannot flip LIKE to PASS.
 */
export function recordSwipe(swipes: SwipeDecision[], decision: SwipeDecision): SwipeDecision[] {
  const exists = swipes.some(
    (s) =>
      s.fromUserId === decision.fromUserId &&
      s.toUserId === decision.toUserId &&
      s.hotelId === decision.hotelId,
  );
  return exists ? swipes : [...swipes, decision];
}

/**
 * A mutual match exists when the swiped person has an earlier LIKE toward
 * the swiper in the same hotel. The rooms may differ: someone browsing
 * Upcoming can match someone browsing Here Now in the same hotel.
 */
export function findMutualMatch(
  swipes: SwipeDecision[],
  decision: SwipeDecision,
  existingMatches: Match[],
): Match | null {
  if (decision.direction !== 'LIKE') return null;
  const reciprocal = swipes.some(
    (s) =>
      s.fromUserId === decision.toUserId &&
      s.toUserId === decision.fromUserId &&
      s.hotelId === decision.hotelId &&
      s.direction === 'LIKE',
  );
  if (!reciprocal) return null;
  const pair = pairKey(decision.fromUserId, decision.toUserId);
  const alreadyMatched = existingMatches.some(
    (m) => pairKey(m.userIds[0], m.userIds[1]) === pair && m.hotelId === decision.hotelId,
  );
  if (alreadyMatched) return null;
  return {
    id: `match-${decision.hotelId}-${pair}`,
    userIds: sortPair(decision.fromUserId, decision.toUserId),
    hotelId: decision.hotelId,
    room: decision.room,
    createdAt: decision.at,
  };
}

export function unmatch(matches: Match[], matchId: string): Match[] {
  return matches.filter((m) => m.id !== matchId);
}

export function matchesInvolving(matches: Match[], userId: string): Match[] {
  return matches.filter((m) => m.userIds.includes(userId));
}

export interface DiscoveryFilter {
  selfId: string;
  hotelId: string;
  room: RoomKey;
  swipes: SwipeDecision[];
  blockedUserIds: string[];
}

/**
 * The visible deck for one room of one hotel. Excludes self, minors,
 * blocked users, and anyone already swiped in this hotel.
 */
export function discoveryPool(candidates: Candidate[], filter: DiscoveryFilter): Candidate[] {
  const swipedIds = new Set(
    filter.swipes
      .filter((s) => s.fromUserId === filter.selfId && s.hotelId === filter.hotelId)
      .map((s) => s.toUserId),
  );
  const blocked = new Set(filter.blockedUserIds);
  return candidates.filter(
    (c) =>
      c.id !== filter.selfId &&
      c.age >= 18 &&
      c.hotelId === filter.hotelId &&
      c.rooms.includes(filter.room) &&
      !swipedIds.has(c.id) &&
      !blocked.has(c.id),
  );
}

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairKey(a: string, b: string): string {
  const [first, second] = sortPair(a, b);
  return `${first}:${second}`;
}
