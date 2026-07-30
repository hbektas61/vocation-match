/**
 * Behaviour every `VocationApi` implementation must show. The in-memory fake
 * runs it here; the same rules are asserted against the real database by
 * `supabase/tests/001_profiles.sql`.
 */
import { ApiError } from '../contracts';
import { FAKE_PHONE_OTP, FakeApi } from '../fakeApi';

const NOW = Date.parse('2026-07-25T10:00:00Z');
const ADULT_BIRTHDATE = '1994-03-01';
const MINOR_BIRTHDATE = '2015-03-01';

function expectApiError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
}

describe('VocationApi contract (in-memory implementation)', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi({ now: () => NOW });
  });

  async function register(phone = '+905551110001') {
    await api.requestPhoneOtp(phone);
    return api.verifyPhoneOtp(phone, FAKE_PHONE_OTP);
  }

  describe('auth', () => {
    it('starts signed out', async () => {
      await expect(api.currentSession()).resolves.toBeNull();
    });

    it('does not sign anyone in merely because an SMS was requested', async () => {
      await api.requestPhoneOtp('+905551110001');
      await expect(api.currentSession()).resolves.toBeNull();
    });

    it('refuses a wrong or expired code with an OTP-specific error', async () => {
      await api.requestPhoneOtp('+905551110001');
      await api.verifyPhoneOtp('+905551110001', '000000').then(
        () => {
          throw new Error('expected the OTP gate to refuse this');
        },
        (error) => expectApiError(error, 'OTP_INVALID'),
      );
    });

    it('creates or restores a session after the six-digit code is confirmed', async () => {
      const session = await register();
      expect(session.userId).toBeTruthy();
      await expect(api.currentSession()).resolves.toMatchObject({ userId: session.userId });
    });

    it('rejects a phone number without its country code', async () => {
      await expect(api.requestPhoneOtp('0555 111 22 33')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('will not say whether a phone number is already registered', async () => {
      const first = await register();
      await api.signOut();

      await expect(api.requestPhoneOtp('+90 (555) 111-00-01')).resolves.toBeUndefined();
      const restored = await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
      expect(restored.userId).toBe(first.userId);
    });

    it('clears the session on sign out', async () => {
      await register();
      await api.signOut();
      await expect(api.currentSession()).resolves.toBeNull();
    });
  });

  describe('profile', () => {
    beforeEach(async () => {
      await register();
    });

    it('has no profile before one is saved', async () => {
      await expect(api.getOwnProfile()).resolves.toBeNull();
    });

    it('saves and returns the profile with a derived age', async () => {
      const saved = await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE });
      expect(saved).toMatchObject({ displayName: 'Ada', age: 32 });
      await expect(api.getOwnProfile()).resolves.toMatchObject({ displayName: 'Ada' });
    });

    it('refuses an underage birthdate', async () => {
      await api.saveOwnProfile({ displayName: 'Kid', birthdate: MINOR_BIRTHDATE }).then(
        () => {
          throw new Error('expected the 18+ rule to reject this');
        },
        (error) => expectApiError(error, 'UNDER_AGE'),
      );
    });

    it.each([
      ['a one-character name', { displayName: 'A', birthdate: ADULT_BIRTHDATE }],
      ['an over-long bio', { displayName: 'Ada', birthdate: ADULT_BIRTHDATE, bio: 'x'.repeat(301) }],
      ['an invalid birthdate', { displayName: 'Ada', birthdate: '25-07-2026' }],
    ])('rejects %s', async (_label, input) => {
      await expect(api.saveOwnProfile(input)).rejects.toBeInstanceOf(ApiError);
    });

    it('requires a session', async () => {
      await api.signOut();
      await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE }).then(
        () => {
          throw new Error('expected an auth failure');
        },
        (error) => expectApiError(error, 'UNAUTHENTICATED'),
      );
    });

    it('keeps profiles separate per user', async () => {
      await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE });
      await api.signOut();
      await register('+905551110002');
      await expect(api.getOwnProfile()).resolves.toBeNull();
    });
  });

  describe('hotel, rooms, and discovery', () => {
    const LARA = 'hotel-lara-shore';
    const BOSPHORUS = 'hotel-bosphorus-garden';
    // Lara Shore sits at 36.8531 / 30.7995. 0.002 degrees is roughly 220 m.
    const NEAR: [number, number] = [36.8549, 30.7995];
    const FAR: [number, number] = [36.8631, 30.7995];

    beforeEach(async () => {
      await register();
      await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE });
    });

    it('returns hotel cards without coordinates', async () => {
      const [hotel] = await api.searchHotels('lara');
      expect(hotel).toMatchObject({ id: LARA });
      expect(Object.keys(hotel)).toEqual(
        expect.not.arrayContaining(['latitude', 'longitude', 'location']),
      );
    });

    it('starts with no active hotel and no open room', async () => {
      await expect(api.getActiveHotel()).resolves.toBeNull();
      await expect(api.getRooms()).resolves.toEqual([
        { room: 'UPCOMING', eligible: false, reason: 'NO_ACTIVE_HOTEL', validUntil: null },
        { room: 'HERE_NOW', eligible: false, reason: 'NO_ACTIVE_HOTEL', validUntil: null },
      ]);
    });

    it('refuses a stay or a location check before a hotel is chosen', async () => {
      await expect(api.declareUpcomingStay('2026-08-01', '2026-08-04')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(api.recordPresenceCheck(...NEAR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('opens Upcoming from a declaration alone, with no location check', async () => {
      await api.setActiveHotel(LARA);
      await api.declareUpcomingStay('2026-08-01', '2026-08-04');
      await expect(api.getRooms()).resolves.toEqual([
        { room: 'UPCOMING', eligible: true, reason: 'ELIGIBLE', validUntil: null },
        { room: 'HERE_NOW', eligible: false, reason: 'NO_RECENT_CHECK', validUntil: null },
      ]);
    });

    it('opens Here Now from proximity alone, with no declaration', async () => {
      await api.setActiveHotel(LARA);
      await expect(api.recordPresenceCheck(...NEAR)).resolves.toMatchObject({ withinRange: true });
      const rooms = await api.getRooms();
      expect(rooms).toContainEqual({
        room: 'HERE_NOW',
        eligible: true,
        reason: 'ELIGIBLE',
        // Backlog R-003: the screen refreshes at this instant rather than polling.
        validUntil: NOW + 30 * 60 * 1000,
      });
      expect(rooms).toContainEqual({
        room: 'UPCOMING',
        eligible: false,
        reason: 'NO_DECLARATION',
        validUntil: null,
      });
    });

    it('answers a distant reading with no, and says why the room is closed', async () => {
      await api.setActiveHotel(LARA);
      await expect(api.recordPresenceCheck(...FAR)).resolves.toMatchObject({ withinRange: false });
      await expect(api.getRooms()).resolves.toContainEqual({
        room: 'HERE_NOW',
        eligible: false,
        reason: 'TOO_FAR',
        validUntil: null,
      });
    });

    it('clears the presence answer when the user stops sharing', async () => {
      await api.setActiveHotel(LARA);
      await api.recordPresenceCheck(...NEAR);
      await api.clearPresenceCheck();
      await expect(api.getRooms()).resolves.toContainEqual({
        room: 'HERE_NOW',
        eligible: false,
        reason: 'NO_RECENT_CHECK',
        validUntil: null,
      });
    });

    it('never returns a distance with the presence answer', async () => {
      await api.setActiveHotel(LARA);
      const answer = await api.recordPresenceCheck(...NEAR);
      expect(Object.keys(answer).sort()).toEqual(['expiresAt', 'withinRange']);
    });

    it('rejects an impossible reading instead of treating it as far away', async () => {
      await api.setActiveHotel(LARA);
      await expect(api.recordPresenceCheck(91, 30)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('closes Here Now the moment the user switches hotel', async () => {
      await api.setActiveHotel(LARA);
      await api.recordPresenceCheck(...NEAR);
      const result = await api.setActiveHotel(BOSPHORUS);
      expect(result).toMatchObject({ previousHotelId: LARA, presenceCleared: true });
      await expect(api.getRooms()).resolves.toContainEqual({
        room: 'HERE_NOW',
        eligible: false,
        reason: 'NO_RECENT_CHECK',
        validUntil: null,
      });
    });

    it('treats re-activating the current hotel as a no-op', async () => {
      await api.setActiveHotel(LARA);
      await api.recordPresenceCheck(...NEAR);
      await expect(api.setActiveHotel(LARA)).resolves.toMatchObject({ presenceCleared: false });
      await expect(api.getRooms()).resolves.toContainEqual({
        room: 'HERE_NOW',
        eligible: true,
        reason: 'ELIGIBLE',
        validUntil: NOW + 30 * 60 * 1000,
      });
    });

    it('refuses an unknown hotel', async () => {
      await expect(api.setActiveHotel('hotel-nowhere')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it.each([
      ['dates in the wrong order', '2026-08-04', '2026-08-01'],
      ['a zero-night stay', '2026-08-04', '2026-08-04'],
      ['a stay that already ended', '2020-01-01', '2020-01-04'],
      ['a stay more than two years out', '2029-08-01', '2029-08-04'],
    ])('rejects %s', async (_label, start, end) => {
      await api.setActiveHotel(LARA);
      await expect(api.declareUpcomingStay(start, end)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('refuses a room the user has not unlocked', async () => {
      await api.setActiveHotel(LARA);
      await expect(api.getDiscoveryFeed('HERE_NOW')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('shows only candidates in the active hotel and room', async () => {
      await api.setActiveHotel(LARA);
      await api.recordPresenceCheck(...NEAR);
      const feed = await api.getDiscoveryFeed('HERE_NOW');
      expect(feed.length).toBeGreaterThan(0);
      feed.forEach((card) => {
        expect(Object.keys(card).sort()).toEqual([
          'age',
          'bio',
          'displayName',
          'gender',
          'interests',
          'orientations',
          'photoPath',
          'photoPaths',
          'sameVenue',
          'userId',
          'venueName',
          // V-011: a neighbour at a Google venue is labelled by Place ID,
          // because a Google venue has no name of ours to carry.
          'venuePlaceId',
        ]);
        expect(card.age).toBeGreaterThanOrEqual(18);
      });
    });
  });

  describe('matching, chat, and safety', () => {
    const LARA = 'hotel-lara-shore';
    const NEAR: [number, number] = [36.8549, 30.7995];
    // Derya has already liked the current user in the fixtures; Mert has not.
    const RECIPROCATES = 'cand-derya';
    const DOES_NOT = 'cand-mert';

    beforeEach(async () => {
      await register();
      await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE });
      await api.setActiveHotel(LARA);
      await api.recordPresenceCheck(...NEAR);
    });

    it('does not match on a one-way like', async () => {
      await expect(api.swipe(DOES_NOT, 'HERE_NOW', 'LIKE')).resolves.toEqual({
        matched: false,
        matchId: null,
      });
    });

    it('matches when the like is reciprocated', async () => {
      const result = await api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE');
      expect(result.matched).toBe(true);
      expect(result.matchId).toBeTruthy();
    });

    it('is idempotent: a retried swipe returns the same match', async () => {
      const first = await api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE');
      const second = await api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE');
      expect(second).toEqual(first);
      await expect(api.getMatches()).resolves.toHaveLength(1);
    });

    it('never matches on a pass', async () => {
      await expect(api.swipe(RECIPROCATES, 'HERE_NOW', 'PASS')).resolves.toMatchObject({
        matched: false,
      });
    });

    it('refuses a swipe in a room the user has not unlocked', async () => {
      await expect(api.swipe(RECIPROCATES, 'UPCOMING', 'LIKE')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('refuses a swipe on somebody outside the room', async () => {
      await expect(api.swipe('cand-nobody', 'HERE_NOW', 'LIKE')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    describe('once matched', () => {
      let matchId: string;

      beforeEach(async () => {
        const result = await api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE');
        matchId = result.matchId as string;
      });

      it('carries a conversation', async () => {
        await api.sendMessage(matchId, 'Hello!');
        const messages = await api.getMessages(matchId);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ body: 'Hello!', matchId });
      });

      it('shows the last message in the inbox', async () => {
        await api.sendMessage(matchId, 'first');
        await api.sendMessage(matchId, 'second');
        const [summary] = await api.getMatches();
        expect(summary.lastMessageBody).toBe('second');
      });

      it('pushes new messages to a subscriber', async () => {
        const seen: string[] = [];
        const unsubscribe = api.subscribeToMessages(matchId, (message) => seen.push(message.body));
        await api.sendMessage(matchId, 'live');
        unsubscribe();
        await api.sendMessage(matchId, 'after unsubscribe');
        expect(seen).toEqual(['live']);
      });

      it.each([[''], ['   '], ['x'.repeat(2001)]])('refuses the message %p', async (body) => {
        await expect(api.sendMessage(matchId, body)).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
      });

      it('keeps the history but closes the conversation after an unmatch', async () => {
        await api.sendMessage(matchId, 'bye');
        await api.unmatch(matchId);
        await expect(api.getMessages(matchId)).resolves.toHaveLength(1);
        await expect(api.sendMessage(matchId, 'still here?')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });

      it('refuses to unmatch twice', async () => {
        await api.unmatch(matchId);
        await expect(api.unmatch(matchId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      });

      it('blocking ends the match and hides the conversation', async () => {
        await api.blockUser(RECIPROCATES);
        await expect(api.getMatches()).resolves.toHaveLength(0);
        await expect(api.sendMessage(matchId, 'hello?')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });

      it('answers a repeat swipe on a blocked person from the stored decision', async () => {
        // They are already matched here, so this swipe has been made before.
        // The answer comes from storage and never looks at the other person —
        // which is what makes a retry safe (D-012) and what stops a repeat
        // swipe reporting where somebody is (D-016). What the caller learns is
        // that the match is gone, exactly as an ordinary unmatch would say.
        await api.blockUser(RECIPROCATES);
        await expect(api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE')).resolves.toEqual({
          matched: false,
          matchId: null,
        });
      });

      it('still refuses a first swipe on somebody blocked', async () => {
        // `DOES_NOT` has never been swiped on in this block, so this is the
        // path where the target's state is still consulted — and a block gives
        // the same answer a stranger gets, so nothing reveals it happened.
        await api.blockUser(DOES_NOT);
        await expect(api.swipe(DOES_NOT, 'HERE_NOW', 'LIKE')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    it('lists and reverses a block', async () => {
      await api.blockUser(RECIPROCATES);
      const blocked = await api.getBlockedUsers();
      expect(blocked).toHaveLength(1);
      expect(blocked[0]).toMatchObject({ userId: RECIPROCATES });
      await api.unblockUser(RECIPROCATES);
      await expect(api.getBlockedUsers()).resolves.toHaveLength(0);
    });

    it('refuses to block yourself', async () => {
      const session = await api.currentSession();
      await expect(api.blockUser(session?.userId as string)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('blocks by default when reporting, and honours opting out', async () => {
      await api.reportUser({ userId: RECIPROCATES, reason: 'HARASSMENT' });
      await expect(api.getBlockedUsers()).resolves.toHaveLength(1);

      await api.reportUser({ userId: DOES_NOT, reason: 'SPAM', alsoBlock: false });
      await expect(api.getBlockedUsers()).resolves.toHaveLength(1);
    });

    it('refuses to report yourself', async () => {
      const session = await api.currentSession();
      await expect(
        api.reportUser({ userId: session?.userId as string, reason: 'SPAM' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });
});

/**
 * The two implementations have to agree about a repeat swipe, because every
 * component test runs against the fake and the real rule lives in SQL. This is
 * the shape of the agreement, asserted here so a future change to one has to
 * notice the other.
 *
 * The server's half is `supabase/tests/014_swipe_idempotence.sql`.
 */
describe('a decision already made', () => {
  const LARA = 'hotel-lara-shore';
  const NEAR: [number, number] = [36.8549, 30.7995];
  const RECIPROCATES = 'cand-derya';
  const PASSES = 'cand-mert';

  let api: FakeApi;

  beforeEach(async () => {
    api = new FakeApi({ now: () => NOW });
    await api.requestPhoneOtp('+905551110001');
    await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
    await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE });
    await api.setActiveHotel(LARA);
    await api.recordPresenceCheck(...NEAR);
  });

  it('is answered without the caller needing a room any more', async () => {
    await api.swipe(PASSES, 'HERE_NOW', 'PASS');
    // The room closes under them — a presence answer lapses after 30 minutes,
    // which is the ordinary case, not an edge one.
    await api.clearPresenceCheck();

    await expect(api.swipe(PASSES, 'HERE_NOW', 'PASS')).resolves.toEqual({
      matched: false,
      matchId: null,
    });
  });

  it('does not overwrite the first decision, whatever the retry says', async () => {
    await api.swipe(PASSES, 'HERE_NOW', 'PASS');
    await expect(api.swipe(PASSES, 'HERE_NOW', 'LIKE')).resolves.toEqual({
      matched: false,
      matchId: null,
    });
  });

  it('keeps reporting a match that already exists', async () => {
    const first = await api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE');
    expect(first.matched).toBe(true);
    await api.clearPresenceCheck();

    await expect(api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE')).resolves.toEqual(first);
  });

  it('still checks the room for somebody new', async () => {
    await api.clearPresenceCheck();
    await expect(api.swipe(RECIPROCATES, 'HERE_NOW', 'LIKE')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
