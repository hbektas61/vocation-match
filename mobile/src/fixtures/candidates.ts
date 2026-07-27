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
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
    age: 29,
    bio: 'Sunrise swimmer, coffee before conversation.',
    interests: ['swimming', 'photography', 'jazz'],
    hotelId: 'hotel-lara-shore',
    rooms: ['UPCOMING', 'HERE_NOW'],
    likesYou: true,
    stay: { startDate: '2026-07-20', endDate: '2026-08-20' },
  },
  {
    id: 'cand-mert',
    displayName: 'Mert',
    gender: 'MAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
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
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
    age: 26,
    bio: 'Planning beach days and long walks.',
    interests: ['running', 'books', 'tennis'],
    hotelId: 'hotel-lara-shore',
    rooms: ['UPCOMING'],
    likesYou: true,
    stay: { startDate: '2026-07-25', endDate: '2026-08-25' },
  },
  {
    id: 'cand-arda',
    displayName: 'Arda',
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
    age: 31,
    bio: 'Rooftop views and live music.',
    interests: ['music', 'history', 'sailing'],
    hotelId: 'hotel-bosphorus-garden',
    rooms: ['UPCOMING', 'HERE_NOW'],
    likesYou: true,
    stay: { startDate: '2026-07-20', endDate: '2026-08-20' },
  },
  {
    id: 'cand-zeynep',
    displayName: 'Zeynep',
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
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
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
    age: 37,
    bio: 'Windsurf mornings, backgammon evenings.',
    interests: ['windsurf', 'backgammon', 'grill'],
    hotelId: 'hotel-cesme-breeze',
    rooms: ['UPCOMING'],
    likesYou: true,
    stay: { startDate: '2026-07-20', endDate: '2026-08-20' },
  },
  {
    id: 'cand-elif',
    displayName: 'Elif',
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
    age: 25,
    bio: 'Balloon rides and cave cafés.',
    interests: ['hiking', 'pottery', 'astronomy'],
    hotelId: 'hotel-cappadocia-stone',
    rooms: ['UPCOMING', 'HERE_NOW'],
    likesYou: false,
    stay: { startDate: '2026-07-20', endDate: '2026-08-20' },
  },
  {
    /** D-035 fixture: at Lara Shore, but long after everyone else has left. */
    id: 'cand-nur',
    displayName: 'Nur',
    gender: 'WOMAN',
    showGender: true,
    orientations: [],
    showOrientation: false,
    age: 27,
    bio: 'December person. Quiet season, warm pools.',
    interests: ['spa', 'reading', 'yoga'],
    hotelId: 'hotel-lara-shore',
    rooms: ['UPCOMING'],
    likesYou: false,
    stay: { startDate: '2026-12-01', endDate: '2026-12-08' },
  },
];

/**
 * People who are in the rooms but not in the tester's deck.
 *
 * The headcount (D-032) counts every eligible person at the hotel — it
 * ignores show_me in both directions, exactly like the server — so the fake
 * needs a crowd larger than the handful of swipeable fixtures without
 * flooding discovery with cards. Lara Shore's Upcoming crosses the
 * five-person threshold while its Here Now stays under it, so the preview
 * shows both behaviours on one screen: a number, and a deliberate silence.
 */
export const ROOM_CROWD: Record<string, { UPCOMING: number; HERE_NOW: number }> = {
  'hotel-lara-shore': { UPCOMING: 4, HERE_NOW: 1 },
};

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
