/**
 * When the monthly check-in allowance rolls over.
 *
 * This file exists because a test that had nothing to do with the calendar
 * failed on the calendar. `fourFeatureIA` asserted `resetsAt > Date.now()`
 * while the fake ran on an injected clock pinned to 25 July 2026 — true every
 * day for a week, and false the moment the wall clock crossed into August. A
 * unit test that depends on the day it is run is a test that will lie to
 * somebody eventually, and it did.
 *
 * So: every clock here is injected, every expectation is an exact instant, and
 * the interesting instants are the boundaries — the last millisecond of a
 * month, of a year, and of February in a leap year, which is the one people
 * get wrong by hand.
 */
import { FAKE_PHONE_OTP, FakeApi, getApi, setApi } from '../data';

/** Signs an account in against a fake pinned to one instant. */
async function entitlementAt(iso: string) {
  const at = Date.parse(iso);
  const api = new FakeApi({ now: () => at });
  setApi(api);
  await api.requestPhoneOtp('+905551110001');
  await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
  await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });
  return getApi().googleCheckinEntitlement();
}

describe('the allowance resets at the top of the next UTC month', () => {
  it.each([
    ['mid-month', '2026-07-25T10:00:00Z', '2026-08-01T00:00:00Z'],
    // The last millisecond of a month still belongs to that month.
    ['the last instant of a month', '2026-07-31T23:59:59.999Z', '2026-08-01T00:00:00Z'],
    // The first instant of a month resets at the end of *that* month, not
    // immediately — an off-by-one here would hand out a second allowance.
    ['the first instant of a month', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00Z'],
    // A month with 31 days followed by one with 30.
    ['the end of a 31-day month', '2026-08-31T23:59:59.999Z', '2026-09-01T00:00:00Z'],
    // Year end, where the month arithmetic has to carry.
    ['the last instant of a year', '2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00Z'],
    // February in a leap year: 29 days, and the next month still starts on the
    // first. Computed by adding a month rather than by adding days, which is
    // why this passes — worth pinning so it stays that way.
    ['the end of a leap February', '2028-02-29T23:59:59.999Z', '2028-03-01T00:00:00Z'],
  ])('%s', async (_name, at, expected) => {
    const summary = await entitlementAt(at);
    expect(summary.resetsAt).toBe(Date.parse(expected));
    // Always ahead of the clock it was computed from — the injected one.
    expect(summary.resetsAt).toBeGreaterThan(Date.parse(at));
  });

  it('does not consult the wall clock', async () => {
    // The proof that the reset comes from the injected clock: two runs of the
    // same code, minutes apart in real time, against clocks a year apart.
    const first = await entitlementAt('2026-07-25T10:00:00Z');
    const second = await entitlementAt('2027-07-25T10:00:00Z');
    expect(first.resetsAt).toBe(Date.parse('2026-08-01T00:00:00Z'));
    expect(second.resetsAt).toBe(Date.parse('2027-08-01T00:00:00Z'));
  });
});
