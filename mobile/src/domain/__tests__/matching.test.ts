import { discoveryPool, findMutualMatch, recordSwipe, unmatch } from '../matching';
import type { Candidate, SwipeDecision } from '../types';

const NOW = 1_000_000;

function swipe(overrides: Partial<SwipeDecision>): SwipeDecision {
  return {
    fromUserId: 'me',
    toUserId: 'them',
    hotelId: 'hotel-a',
    room: 'UPCOMING',
    direction: 'LIKE',
    at: NOW,
    ...overrides,
  };
}

describe('recordSwipe', () => {
  it('appends a new decision', () => {
    const result = recordSwipe([], swipe({}));
    expect(result).toHaveLength(1);
  });

  it('ignores a repeated swipe on the same person in the same hotel', () => {
    const first = recordSwipe([], swipe({ direction: 'LIKE' }));
    const second = recordSwipe(first, swipe({ direction: 'PASS' }));
    expect(second).toBe(first);
    expect(second[0].direction).toBe('LIKE');
  });

  it('allows swiping the same person in a different hotel', () => {
    const first = recordSwipe([], swipe({}));
    const second = recordSwipe(first, swipe({ hotelId: 'hotel-b' }));
    expect(second).toHaveLength(2);
  });
});

describe('findMutualMatch', () => {
  it('creates a match when the other person liked first in the same hotel', () => {
    const theirLike = swipe({ fromUserId: 'them', toUserId: 'me' });
    const myLike = swipe({});
    const swipes = recordSwipe(recordSwipe([], theirLike), myLike);
    const match = findMutualMatch(swipes, myLike, []);
    expect(match).not.toBeNull();
    expect(match?.userIds).toEqual(['me', 'them']);
    expect(match?.hotelId).toBe('hotel-a');
  });

  it('matches across rooms in the same hotel', () => {
    const theirLike = swipe({ fromUserId: 'them', toUserId: 'me', room: 'HERE_NOW' });
    const myLike = swipe({ room: 'UPCOMING' });
    const swipes = recordSwipe(recordSwipe([], theirLike), myLike);
    expect(findMutualMatch(swipes, myLike, [])).not.toBeNull();
  });

  it('does not match on PASS, without reciprocity, or across hotels', () => {
    const pass = swipe({ direction: 'PASS' });
    expect(findMutualMatch([pass], pass, [])).toBeNull();

    const lonelyLike = swipe({});
    expect(findMutualMatch([lonelyLike], lonelyLike, [])).toBeNull();

    const theirLikeElsewhere = swipe({ fromUserId: 'them', toUserId: 'me', hotelId: 'hotel-b' });
    const myLike = swipe({});
    expect(findMutualMatch([theirLikeElsewhere, myLike], myLike, [])).toBeNull();
  });

  it('does not duplicate an existing match for the same pair and hotel', () => {
    const theirLike = swipe({ fromUserId: 'them', toUserId: 'me' });
    const myLike = swipe({});
    const swipes = [theirLike, myLike];
    const first = findMutualMatch(swipes, myLike, []);
    expect(first).not.toBeNull();
    expect(findMutualMatch(swipes, myLike, [first!])).toBeNull();
  });
});

describe('unmatch', () => {
  it('removes only the given match', () => {
    const theirLike = swipe({ fromUserId: 'them', toUserId: 'me' });
    const myLike = swipe({});
    const match = findMutualMatch([theirLike, myLike], myLike, [])!;
    expect(unmatch([match], match.id)).toEqual([]);
    expect(unmatch([match], 'other-id')).toEqual([match]);
  });
});

describe('discoveryPool', () => {
  const base: Omit<Candidate, 'id'> = {
    displayName: 'X',
    age: 30,
    bio: '',
    interests: [],
    hotelId: 'hotel-a',
    rooms: ['UPCOMING'],
    likesYou: false,
    gender: 'WOMAN',
    showGender: false,
    orientations: [],
    showOrientation: false,
  };
  const candidates: Candidate[] = [
    { ...base, id: 'a' },
    { ...base, id: 'b', rooms: ['HERE_NOW'] },
    { ...base, id: 'c', hotelId: 'hotel-b' },
    { ...base, id: 'd', age: 17 },
    { ...base, id: 'e' },
    { ...base, id: 'me' },
  ];

  it('filters by hotel, room, age, self, swiped, and blocked', () => {
    const pool = discoveryPool(candidates, {
      selfId: 'me',
      hotelId: 'hotel-a',
      room: 'UPCOMING',
      swipes: [swipe({ toUserId: 'a' })],
      blockedUserIds: ['e'],
    });
    expect(pool.map((c) => c.id)).toEqual([]);

    const freshPool = discoveryPool(candidates, {
      selfId: 'me',
      hotelId: 'hotel-a',
      room: 'UPCOMING',
      swipes: [],
      blockedUserIds: [],
    });
    expect(freshPool.map((c) => c.id)).toEqual(['a', 'e']);
  });
});
