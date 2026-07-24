import type { Candidate, SwipeDecision } from '../domain/types';

export const SELF_ID = 'me';

/**
 * Fixture candidates per hotel. `likesYou` seeds a reciprocal LIKE so a
 * tester can produce a mutual match deterministically.
 */
export const CANDIDATES: Candidate[] = [
  {
    id: 'cand-derya',
    displayName: 'Derya',
    age: 29,
    bio: 'Sunrise swimmer, coffee before conversation.',
    interests: ['swimming', 'photography', 'jazz'],
    hotelId: 'hotel-lara-shore',
    rooms: ['UPCOMING', 'HERE_NOW'],
    likesYou: true,
  },
  {
    id: 'cand-mert',
    displayName: 'Mert',
    age: 34,
    bio: 'Here for the food, staying for the pool.',
    interests: ['food', 'diving', 'board games'],
    hotelId: 'hotel-lara-shore',
    rooms: ['HERE_NOW'],
    likesYou: false,
  },
  {
    id: 'cand-selin',
    displayName: 'Selin',
    age: 26,
    bio: 'Planning beach days and long walks.',
    interests: ['running', 'books', 'tennis'],
    hotelId: 'hotel-lara-shore',
    rooms: ['UPCOMING'],
    likesYou: true,
  },
  {
    id: 'cand-arda',
    displayName: 'Arda',
    age: 31,
    bio: 'Rooftop views and live music.',
    interests: ['music', 'history', 'sailing'],
    hotelId: 'hotel-bosphorus-garden',
    rooms: ['UPCOMING', 'HERE_NOW'],
    likesYou: true,
  },
  {
    id: 'cand-zeynep',
    displayName: 'Zeynep',
    age: 28,
    bio: 'Wine tasting and gallery hopping.',
    interests: ['art', 'wine', 'cycling'],
    hotelId: 'hotel-bosphorus-garden',
    rooms: ['HERE_NOW'],
    likesYou: false,
  },
  {
    id: 'cand-can',
    displayName: 'Can',
    age: 37,
    bio: 'Windsurf mornings, backgammon evenings.',
    interests: ['windsurf', 'backgammon', 'grill'],
    hotelId: 'hotel-cesme-breeze',
    rooms: ['UPCOMING'],
    likesYou: true,
  },
  {
    id: 'cand-elif',
    displayName: 'Elif',
    age: 25,
    bio: 'Balloon rides and cave cafés.',
    interests: ['hiking', 'pottery', 'astronomy'],
    hotelId: 'hotel-cappadocia-stone',
    rooms: ['UPCOMING', 'HERE_NOW'],
    likesYou: false,
  },
];

/**
 * Seed swipes representing candidates who already liked the tester.
 * These flow through the same mutual-match rule as real swipes.
 */
export function seedCandidateSwipes(now: number): SwipeDecision[] {
  return CANDIDATES.filter((c) => c.likesYou).map((c) => ({
    fromUserId: c.id,
    toUserId: SELF_ID,
    hotelId: c.hotelId,
    room: c.rooms[0],
    direction: 'LIKE' as const,
    at: now,
  }));
}

export function getCandidateById(candidateId: string): Candidate | null {
  return CANDIDATES.find((c) => c.id === candidateId) ?? null;
}
