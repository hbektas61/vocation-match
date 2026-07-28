/**
 * D-038 — the region pool, mirrored in the fake.
 *
 * The server's rules live in supabase/tests/019_region_pool.sql. This file
 * guards the mirror: a thin own-venue deck continues with labelled cards
 * from venues within 15 km, and only there.
 */
import { FAKE_PHONE_OTP, FakeApi } from '..';

const iso = (date: Date) => date.toISOString().slice(0, 10);

async function memberAtLara(): Promise<FakeApi> {
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
  await api.setActiveHotel('hotel-lara-shore');
  const today = new Date();
  await api.declareUpcomingStay(iso(today), iso(new Date(today.getTime() + 7 * 86400000)));
  return api;
}

describe('the region pool (D-038)', () => {
  it('continues a thin deck with labelled neighbours, own venue first', async () => {
    const api = await memberAtLara();
    const feed = await api.getDiscoveryFeed('UPCOMING');

    const own = feed.filter((card) => card.sameVenue);
    const region = feed.filter((card) => !card.sameVenue);
    expect(own.length).toBeGreaterThan(0);
    expect(region.map((card) => card.displayName)).toEqual(['Ece']);
    expect(region[0].venueName).toBe('Lara Dunes Club');
    // Own-venue cards come first; the labelled region rows only ever follow.
    expect(feed.findIndex((card) => !card.sameVenue)).toBe(own.length);
    // Own-venue cards carry no redundant label.
    own.forEach((card) => expect(card.venueName).toBeNull());
  });

  it('never reaches across to another city', async () => {
    const api = await memberAtLara();
    const feed = await api.getDiscoveryFeed('UPCOMING');
    // Arda (İstanbul) and Can (Çeşme) overlap in dates but not in geography.
    expect(feed.map((card) => card.displayName)).not.toContain('Arda');
    expect(feed.map((card) => card.displayName)).not.toContain('Can');
  });

  it('a labelled card accepts the like it invited, across the region', async () => {
    const api = await memberAtLara();
    await expect(api.swipe('cand-ece', 'UPCOMING', 'LIKE')).resolves.toMatchObject({
      matched: true,
    });
  });

  it('another city cannot be swiped by id', async () => {
    const api = await memberAtLara();
    await expect(api.swipe('cand-arda', 'UPCOMING', 'LIKE')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
