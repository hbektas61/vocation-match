import { appReducer, initialAppState, type AppState } from '../appReducer';
import { CANDIDATES, SELF_ID } from '../../fixtures/candidates';
import { HOTELS } from '../../fixtures/hotels';

const NOW = 1_000_000;
const LARA = HOTELS[0]; // hotel-lara-shore
const TODAY = '2026-07-25';

function onboardedState(): AppState {
  let state = initialAppState(NOW);
  state = appReducer(state, { type: 'CONFIRM_AGE' });
  state = appReducer(state, { type: 'SIGN_IN' });
  state = appReducer(state, {
    type: 'SAVE_PROFILE',
    profile: { id: SELF_ID, displayName: 'Test', age: 30, bio: '', interests: [] },
  });
  return appReducer(state, { type: 'ACTIVATE_HOTEL', hotelId: LARA.id, now: NOW });
}

function declareUpcoming(state: AppState): AppState {
  return appReducer(state, {
    type: 'DECLARE_UPCOMING',
    checkInDate: '2026-08-01',
    checkOutDate: '2026-08-08',
    todayIsoDate: TODAY,
    now: NOW,
  });
}

describe('appReducer hotel switching (D-003/D-004)', () => {
  it('activating a new hotel clears upcoming and here-now access', () => {
    let state = declareUpcoming(onboardedState());
    state = appReducer(state, {
      type: 'RECORD_PRESENCE_CHECK',
      hotel: LARA,
      reading: { latitude: LARA.latitude, longitude: LARA.longitude, timestamp: NOW },
    });
    expect(state.upcoming).not.toBeNull();
    expect(state.hereNow).not.toBeNull();

    state = appReducer(state, { type: 'ACTIVATE_HOTEL', hotelId: HOTELS[1].id, now: NOW + 1 });
    expect(state.activeHotel.activeHotelId).toBe(HOTELS[1].id);
    expect(state.upcoming).toBeNull();
    expect(state.hereNow).toBeNull();
  });

  it('rejects invalid upcoming declarations', () => {
    const state = onboardedState();
    const after = appReducer(state, {
      type: 'DECLARE_UPCOMING',
      checkInDate: '2026-08-08',
      checkOutDate: '2026-08-01',
      todayIsoDate: TODAY,
      now: NOW,
    });
    expect(after.upcoming).toBeNull();
  });

  it('ignores a presence check for a hotel that is not active', () => {
    const state = onboardedState();
    const after = appReducer(state, {
      type: 'RECORD_PRESENCE_CHECK',
      hotel: HOTELS[1],
      reading: { latitude: HOTELS[1].latitude, longitude: HOTELS[1].longitude, timestamp: NOW },
    });
    expect(after.hereNow).toBeNull();
  });

  it('stores no coordinates from a presence check (D-005)', () => {
    const state = appReducer(onboardedState(), {
      type: 'RECORD_PRESENCE_CHECK',
      hotel: LARA,
      reading: { latitude: LARA.latitude, longitude: LARA.longitude, timestamp: NOW },
    });
    expect(JSON.stringify(state)).not.toContain(String(LARA.latitude));
  });
});

describe('appReducer swipe and match', () => {
  it('a like on a seeded liker creates a mutual match', () => {
    // cand-derya likes the tester in the fixtures.
    const state = appReducer(onboardedState(), {
      type: 'SWIPE',
      toUserId: 'cand-derya',
      room: 'HERE_NOW',
      direction: 'LIKE',
      now: NOW,
    });
    expect(state.matches).toHaveLength(1);
    expect(state.lastMatchId).toBe(state.matches[0].id);
  });

  it('a pass never creates a match and repeat swipes are ignored', () => {
    let state = appReducer(onboardedState(), {
      type: 'SWIPE',
      toUserId: 'cand-derya',
      room: 'HERE_NOW',
      direction: 'PASS',
      now: NOW,
    });
    expect(state.matches).toHaveLength(0);
    const swipeCount = state.swipes.length;
    state = appReducer(state, {
      type: 'SWIPE',
      toUserId: 'cand-derya',
      room: 'HERE_NOW',
      direction: 'LIKE',
      now: NOW + 1,
    });
    expect(state.swipes).toHaveLength(swipeCount);
    expect(state.matches).toHaveLength(0);
  });
});

describe('appReducer chat and safety', () => {
  function matchedState(): AppState {
    return appReducer(onboardedState(), {
      type: 'SWIPE',
      toUserId: 'cand-derya',
      room: 'HERE_NOW',
      direction: 'LIKE',
      now: NOW,
    });
  }

  it('sending the first message produces one canned reply', () => {
    let state = matchedState();
    const matchId = state.matches[0].id;
    state = appReducer(state, { type: 'SEND_MESSAGE', matchId, text: 'Hi!', now: NOW + 10 });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].senderId).toBe(SELF_ID);
    expect(state.messages[1].senderId).toBe('cand-derya');

    state = appReducer(state, { type: 'SEND_MESSAGE', matchId, text: 'Again', now: NOW + 20 });
    expect(state.messages).toHaveLength(3);
  });

  it('ignores empty messages and messages to unknown matches', () => {
    let state = matchedState();
    const matchId = state.matches[0].id;
    expect(appReducer(state, { type: 'SEND_MESSAGE', matchId, text: '   ', now: NOW }).messages)
      .toHaveLength(0);
    expect(
      appReducer(state, { type: 'SEND_MESSAGE', matchId: 'nope', text: 'x', now: NOW }).messages,
    ).toHaveLength(0);
  });

  it('unmatch removes the match and its messages', () => {
    let state = matchedState();
    const matchId = state.matches[0].id;
    state = appReducer(state, { type: 'SEND_MESSAGE', matchId, text: 'Hi!', now: NOW + 10 });
    state = appReducer(state, { type: 'UNMATCH', matchId });
    expect(state.matches).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
  });

  it('blocking removes matches, messages, and hides the user from discovery', () => {
    let state = matchedState();
    const matchId = state.matches[0].id;
    state = appReducer(state, { type: 'SEND_MESSAGE', matchId, text: 'Hi!', now: NOW + 10 });
    state = appReducer(state, { type: 'BLOCK_USER', userId: 'cand-derya' });
    expect(state.blockedUserIds).toContain('cand-derya');
    expect(state.matches).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
    expect(state.lastMatchId).toBeNull();
  });

  it('reports are recorded', () => {
    const state = appReducer(matchedState(), {
      type: 'REPORT_USER',
      userId: 'cand-derya',
      reason: 'Inappropriate messages',
      now: NOW,
    });
    expect(state.reports).toEqual([
      { reportedUserId: 'cand-derya', reason: 'Inappropriate messages', at: NOW },
    ]);
  });

  it('reset returns to the initial state', () => {
    const state = appReducer(matchedState(), { type: 'RESET', now: NOW + 100 });
    expect(state).toEqual(initialAppState(NOW + 100));
  });
});

describe('fixture sanity', () => {
  it('all fixture candidates are adults', () => {
    expect(CANDIDATES.every((c) => c.age >= 18)).toBe(true);
  });
});
