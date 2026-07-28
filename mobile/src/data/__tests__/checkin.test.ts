/**
 * D-039 — "Çevremde", mirrored in the fake.
 *
 * The server's rules live in supabase/tests/020_checkins.sql. This guards
 * the mirror: venue-anchored, verified within 500 m, mutual, 1 km reach,
 * and free — premium appears nowhere in it.
 */
import { ApiError, FAKE_PHONE_OTP, FakeApi } from '..';

/** Lara Shore Resort and Lara Marina Bar — ~600 m apart in the fixtures. */
const SHORE = 'hotel-lara-shore';
const AT_SHORE = [36.8531, 30.7995] as const;

async function member(): Promise<FakeApi> {
  const api = new FakeApi();
  await api.requestPhoneOtp('+905551110001');
  await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
  await api.saveOwnProfile({
    displayName: 'Ada',
    birthdate: '1994-03-01',
    gender: 'WOMAN',
    showMe: 'EVERYONE',
  });
  await api.completeOnboarding();
  return api;
}

async function code(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : 'NOT_AN_API_ERROR';
  }
}

describe('Çevremde (D-039)', () => {
  it('is mutual: no check-in, no looking', async () => {
    const api = await member();
    expect(await code(api.getDiscoveryFeed('NEARBY'))).toBe('NOT_FOUND');
  });

  it('refuses a check-in from across town and stores nothing', async () => {
    const api = await member();
    const answer = await api.recordCheckin(SHORE, 36.9, 30.7995);
    expect(answer.withinRange).toBe(false);
    expect(await api.getCheckin()).toBeNull();
  });

  it('checks in at the venue and answers with its name and a clock', async () => {
    const api = await member();
    const answer = await api.recordCheckin(SHORE, ...AT_SHORE);
    expect(answer.withinRange).toBe(true);
    const current = await api.getCheckin();
    expect(current?.venueName).toBe('Lara Shore Resort');
    expect(current?.expiresAt).toBe(answer.expiresAt);
  });

  it('needs no active hotel and no premium — the free tier in full', async () => {
    const api = await member();
    await api.setPremium(false);
    await api.recordCheckin(SHORE, ...AT_SHORE);
    const feed = await api.getDiscoveryFeed('NEARBY');
    expect(feed.length).toBeGreaterThan(0);
    await expect(api.swipe('cand-mert', 'NEARBY', 'LIKE')).resolves.toMatchObject({
      matched: false,
    });
  });

  it('shows the street: same venue unlabelled and first, 600 m labelled, 2 km absent', async () => {
    const api = await member();
    await api.recordCheckin(SHORE, ...AT_SHORE);
    const feed = await api.getDiscoveryFeed('NEARBY');
    expect(feed.map((card) => card.displayName)).toEqual(['Mert', 'Lale']);
    expect(feed[0]).toMatchObject({ sameVenue: true, venueName: null });
    expect(feed[1]).toMatchObject({ sameVenue: false, venueName: 'Lara Marina Bar' });
  });

  it('a mutual like across the street is a NEARBY match', async () => {
    const api = await member();
    await api.recordCheckin(SHORE, ...AT_SHORE);
    await expect(api.swipe('cand-lale', 'NEARBY', 'LIKE')).resolves.toMatchObject({
      matched: true,
    });
    const matches = await api.getMatches();
    expect(matches.find((m) => m.displayName === 'Lale')?.room).toBe('NEARBY');
  });

  it('cannot reach someone who is not out on this street', async () => {
    const api = await member();
    await api.recordCheckin(SHORE, ...AT_SHORE);
    // Ece exists 2 km away — in the region pool's world, not the street's.
    expect(await code(api.swipe('cand-ece', 'NEARBY', 'LIKE'))).toBe('FORBIDDEN');
  });

  it('checking out closes the street both ways', async () => {
    const api = await member();
    await api.recordCheckin(SHORE, ...AT_SHORE);
    await api.clearCheckin();
    expect(await api.getCheckin()).toBeNull();
    expect(await code(api.getDiscoveryFeed('NEARBY'))).toBe('NOT_FOUND');
  });
});
