/**
 * D-036 — the client mirror of the premium rules.
 *
 * The server owns every rule (supabase/tests/018_premium.sql exercises the
 * full set there, including the 5-pass allowance the fixture deck is too
 * small to walk here). This file guards the fake's mirror of the same
 * behaviour, so the credential-free preview and the UI tests meet the same
 * refusals a device would.
 */
import { ApiError, FAKE_PHONE_OTP, FakeApi } from '..';

const ADULT_BIRTHDATE = '1994-03-01';
const LARA = 'hotel-lara-shore';
/** Lara Shore Resort's fixture coordinates — an in-range reading. */
const AT_LARA = [36.8531, 30.7995, 10] as const;

const iso = (date: Date) => date.toISOString().slice(0, 10);

async function memberAtLara(): Promise<FakeApi> {
  const api = new FakeApi();
  await api.requestPhoneOtp('+905551110001');
  await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
  await api.saveOwnProfile({
    displayName: 'Ada',
    birthdate: ADULT_BIRTHDATE,
    gender: 'WOMAN',
    showMe: 'EVERYONE',
  });
  await api.completeOnboarding();
  await api.setActiveHotel(LARA);
  const today = new Date();
  await api.declareUpcomingStay(iso(today), iso(new Date(today.getTime() + 7 * 86400000)));
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

describe('the Here Now door (D-036)', () => {
  it('a fake account starts premium, so the preview keeps every room walkable', async () => {
    const api = await memberAtLara();
    expect((await api.getOwnProfile())?.isPremium).toBe(true);
  });

  it('tells a free member the true reason the room is closed', async () => {
    const api = await memberAtLara();
    await api.setPremium(false);
    const hereNow = (await api.getRooms()).find((room) => room.room === 'HERE_NOW');
    expect(hereNow).toMatchObject({ eligible: false, reason: 'PREMIUM_ONLY' });
  });

  it('never takes a free member’s location', async () => {
    const api = await memberAtLara();
    await api.setPremium(false);
    expect(await code(api.recordPresenceCheck(...AT_LARA))).toBe('PREMIUM_REQUIRED');
  });

  it('a fresh presence answer does not outlive the entitlement', async () => {
    const api = await memberAtLara();
    await api.recordPresenceCheck(...AT_LARA);
    await api.setPremium(false);
    const hereNow = (await api.getRooms()).find((room) => room.room === 'HERE_NOW');
    expect(hereNow).toMatchObject({ eligible: false, reason: 'PREMIUM_ONLY' });
  });
});

describe('the free Upcoming allowance (D-036)', () => {
  it('refuses the fourth like, before it even looks at the target', async () => {
    const api = await memberAtLara();
    await api.setPremium(false);
    await api.swipe('cand-derya', 'UPCOMING', 'LIKE');
    await api.swipe('cand-selin', 'UPCOMING', 'LIKE');
    await api.swipe('cand-nur', 'UPCOMING', 'LIKE');
    // The allowance is checked before the target-in-room check, exactly as
    // on the server — so the refusal is the same whoever the fourth is.
    expect(await code(api.swipe('cand-mert', 'UPCOMING', 'LIKE'))).toBe('PREMIUM_REQUIRED');
  });

  it('a retry of a stored like is a replay, not a new like', async () => {
    const api = await memberAtLara();
    await api.setPremium(false);
    await api.swipe('cand-derya', 'UPCOMING', 'LIKE');
    await api.swipe('cand-selin', 'UPCOMING', 'LIKE');
    await api.swipe('cand-nur', 'UPCOMING', 'LIKE');
    await expect(api.swipe('cand-derya', 'UPCOMING', 'LIKE')).resolves.toMatchObject({
      matched: true,
    });
  });

  it('likes do not eat the pass allowance', async () => {
    const api = await memberAtLara();
    await api.setPremium(false);
    await api.swipe('cand-derya', 'UPCOMING', 'LIKE');
    await api.swipe('cand-selin', 'UPCOMING', 'LIKE');
    await api.swipe('cand-nur', 'UPCOMING', 'PASS');
    // Two likes and one pass stored: a further pass is still inside the
    // five-pass allowance and fails only on the target, never the allowance.
    expect(await code(api.swipe('cand-unknown', 'UPCOMING', 'PASS'))).toBe('FORBIDDEN');
  });

  it('premium removes the limit', async () => {
    const api = await memberAtLara();
    await api.swipe('cand-derya', 'UPCOMING', 'LIKE');
    await api.swipe('cand-selin', 'UPCOMING', 'LIKE');
    await api.swipe('cand-nur', 'UPCOMING', 'LIKE');
    // The fourth like fails on the target being absent from the room — the
    // allowance never speaks for a premium member.
    expect(await code(api.swipe('cand-mert', 'UPCOMING', 'LIKE'))).toBe('FORBIDDEN');
  });
});
