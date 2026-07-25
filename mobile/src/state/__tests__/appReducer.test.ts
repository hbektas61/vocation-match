import { appReducer, initialAppState, type AppState } from '../appReducer';

const NOW = 1_000_000;
const SELF_ID = 'user-1';

function onboardedState(): AppState {
  let state = initialAppState();
  state = appReducer(state, { type: 'CONFIRM_AGE' });
  state = appReducer(state, {
    type: 'AUTH_SUCCESS',
    session: { userId: SELF_ID, expiresAt: NOW + 60_000 },
    profile: null,
  });
  return appReducer(state, {
    type: 'SAVE_PROFILE',
    profile: { id: SELF_ID, displayName: 'Test', age: 30, bio: '', interests: [] },
  });
}

describe('appReducer auth lifecycle', () => {
  it('a restored session with no profile still requires profile setup', () => {
    const state = appReducer(initialAppState(), {
      type: 'BOOTSTRAP_RESOLVED',
      session: { userId: SELF_ID, expiresAt: NOW + 60_000 },
      profile: null,
    });
    expect(state.bootstrapStatus).toBe('ready');
    expect(state.ageConfirmed).toBe(true);
    expect(state.session).not.toBeNull();
    expect(state.profile).toBeNull();
  });

  it('a restored session with a saved profile is ready for the main tabs', () => {
    const profile = { id: SELF_ID, displayName: 'Test', age: 30, bio: '', interests: [] };
    const state = appReducer(initialAppState(), {
      type: 'BOOTSTRAP_RESOLVED',
      session: { userId: SELF_ID, expiresAt: NOW + 60_000 },
      profile,
    });
    expect(state.ageConfirmed).toBe(true);
    expect(state.profile).toEqual(profile);
  });

  it('no session at bootstrap leaves the age gate in front of onboarding', () => {
    const state = appReducer(initialAppState(), {
      type: 'BOOTSTRAP_RESOLVED',
      session: null,
      profile: null,
    });
    expect(state.bootstrapStatus).toBe('ready');
    expect(state.ageConfirmed).toBe(false);
  });

  it('sign-out clears session, profile, and every cached hotel/match/block state', () => {
    let state = onboardedState();
    state = appReducer(state, {
      type: 'HOTEL_ACTIVATED',
      activeHotel: { hotelId: 'hotel-lara-shore', activatedAt: NOW },
    });
    state = appReducer(state, {
      type: 'MATCH_UPSERTED',
      match: {
        matchId: 'match-1',
        otherUserId: 'cand-derya',
        displayName: 'Derya',
        age: 29,
        photoPath: null,
        room: 'HERE_NOW',
        createdAt: NOW,
        unmatchedAt: null,
        lastMessageAt: null,
        lastMessageBody: null,
      },
    });
    expect(state.matches).toHaveLength(1);

    state = appReducer(state, { type: 'SIGN_OUT' });
    expect(state.session).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.matches).toHaveLength(0);
    expect(state.activeHotel).toBeNull();
    expect(state.bootstrapStatus).toBe('ready');
  });
});

describe('appReducer hotel and rooms', () => {
  it('activating a hotel clears the cached room eligibility and location permission (D-004)', () => {
    let state = onboardedState();
    state = appReducer(state, {
      type: 'ROOMS_LOADED',
      rooms: [
        { room: 'UPCOMING', eligible: true, reason: 'ELIGIBLE' },
        { room: 'HERE_NOW', eligible: true, reason: 'ELIGIBLE' },
      ],
    });
    state = appReducer(state, { type: 'SET_LOCATION_PERMISSION', permission: 'granted' });

    state = appReducer(state, {
      type: 'HOTEL_ACTIVATED',
      activeHotel: { hotelId: 'hotel-bosphorus-garden', activatedAt: NOW },
    });
    expect(state.activeHotel).toEqual({ hotelId: 'hotel-bosphorus-garden', activatedAt: NOW });
    expect(state.rooms).toEqual([]);
    expect(state.locationPermission).toBe('unknown');
  });

  it('denying location permission clears any cached Here Now eligibility', () => {
    let state = appReducer(onboardedState(), {
      type: 'ROOMS_LOADED',
      rooms: [
        { room: 'UPCOMING', eligible: false, reason: 'NO_DECLARATION' },
        { room: 'HERE_NOW', eligible: true, reason: 'ELIGIBLE' },
      ],
    });
    state = appReducer(state, { type: 'SET_LOCATION_PERMISSION', permission: 'denied' });
    expect(state.locationPermission).toBe('denied');
    expect(state.rooms).toEqual([
      { room: 'UPCOMING', eligible: false, reason: 'NO_DECLARATION' },
      { room: 'HERE_NOW', eligible: false, reason: 'NO_RECENT_CHECK' },
    ]);
  });
});

describe('appReducer matches', () => {
  const match = {
    matchId: 'match-1',
    otherUserId: 'cand-derya',
    displayName: 'Derya',
    age: 29,
    photoPath: null,
    room: 'HERE_NOW' as const,
    createdAt: NOW,
    unmatchedAt: null,
    lastMessageAt: null,
    lastMessageBody: null,
  };

  it('upserting a new match adds it and sets it as the last match', () => {
    const state = appReducer(onboardedState(), { type: 'MATCH_UPSERTED', match });
    expect(state.matches).toEqual([match]);
    expect(state.lastMatchId).toBe('match-1');
  });

  it('upserting an existing match id replaces it instead of duplicating', () => {
    let state = appReducer(onboardedState(), { type: 'MATCH_UPSERTED', match });
    const updated = { ...match, lastMessageBody: 'hi' };
    state = appReducer(state, { type: 'MATCH_UPSERTED', match: updated });
    expect(state.matches).toEqual([updated]);
  });

  it('clearing the last match id leaves the match list untouched', () => {
    let state = appReducer(onboardedState(), { type: 'MATCH_UPSERTED', match });
    state = appReducer(state, { type: 'CLEAR_LAST_MATCH' });
    expect(state.lastMatchId).toBeNull();
    expect(state.matches).toEqual([match]);
  });

  it('unmatching keeps the match but marks it closed', () => {
    let state = appReducer(onboardedState(), { type: 'MATCH_UPSERTED', match });
    state = appReducer(state, { type: 'MATCH_UNMATCHED', matchId: 'match-1', unmatchedAt: NOW + 1 });
    expect(state.matches[0].unmatchedAt).toBe(NOW + 1);
  });
});

describe('appReducer blocking', () => {
  const blockedUser = { userId: 'cand-derya', displayName: 'Derya', blockedAt: NOW };

  it('blocking someone with an open match closes that match (D-008)', () => {
    let state = appReducer(onboardedState(), {
      type: 'MATCH_UPSERTED',
      match: {
        matchId: 'match-1',
        otherUserId: 'cand-derya',
        displayName: 'Derya',
        age: 29,
        photoPath: null,
        room: 'HERE_NOW',
        createdAt: NOW,
        unmatchedAt: null,
        lastMessageAt: null,
        lastMessageBody: null,
      },
    });
    state = appReducer(state, { type: 'USER_BLOCKED', blockedUser });
    expect(state.blockedUsers).toEqual([blockedUser]);
    expect(state.matches[0].unmatchedAt).toBe(NOW);
  });

  it('blocking the same person twice does not duplicate the blocked list', () => {
    let state = appReducer(onboardedState(), { type: 'USER_BLOCKED', blockedUser });
    state = appReducer(state, { type: 'USER_BLOCKED', blockedUser });
    expect(state.blockedUsers).toHaveLength(1);
  });

  it('unblocking removes the person from the blocked list', () => {
    let state = appReducer(onboardedState(), { type: 'USER_BLOCKED', blockedUser });
    state = appReducer(state, { type: 'USER_UNBLOCKED', userId: 'cand-derya' });
    expect(state.blockedUsers).toEqual([]);
  });

  it('BLOCKED_USERS_LOADED replaces the whole cached list', () => {
    let state = appReducer(onboardedState(), { type: 'USER_BLOCKED', blockedUser });
    state = appReducer(state, { type: 'BLOCKED_USERS_LOADED', blockedUsers: [] });
    expect(state.blockedUsers).toEqual([]);
  });
});
