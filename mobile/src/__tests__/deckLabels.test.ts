/**
 * V-011 — what a neighbour's venue name is allowed to cost.
 *
 * The rule this file protects is easy to break by accident and invisible when
 * broken: a Place Details call per card render looks identical on screen to
 * one call per deck. The only way it shows up is on a bill, so it is asserted
 * as a call count.
 */
import { FakeApi, setApi } from '../data';
import { MAX_DECK_LABELS, resetDeckLabels, resolveDeckLabels } from '../data/venueLabels';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

const BIBLOS = 'gp-venue-biblos';
const SUNSET = 'gp-venue-before-sunset';
const MARINA = 'gp-venue-alacati-marina';
const ILICA = 'gp-venue-ilica';
const MARBELLA = 'gp-venue-biblos-marbella';

let fake: FakeApi;
let resolve: jest.SpyInstance;

beforeEach(async () => {
  resetDeckLabels();
  fake = new FakeApi({ now: () => FIXED });
  setApi(fake);
  await fake.requestPhoneOtp('+905551119100');
  await fake.verifyPhoneOtp('+905551119100', '123456');
  await fake.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });
  resolve = jest.spyOn(fake, 'resolveGooglePlace');
});

afterEach(() => {
  resolve.mockRestore();
});

describe('resolving the labels a deck needs', () => {
  it('never asks about the venue the viewer is already in', async () => {
    const labels = await resolveDeckLabels([BIBLOS, BIBLOS], BIBLOS);

    expect(resolve).not.toHaveBeenCalled();
    expect(labels.size).toBe(0);
  });

  it('asks once for a Place ID however many cards carry it', async () => {
    const labels = await resolveDeckLabels([SUNSET, SUNSET, SUNSET, SUNSET], BIBLOS);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(labels.get(SUNSET)).toBe('Before Sunset Beach');
  });

  it('does not ask again when the deck reloads', async () => {
    await resolveDeckLabels([SUNSET], BIBLOS);
    const again = await resolveDeckLabels([SUNSET, SUNSET], BIBLOS);

    // A swipe, a refresh, a tab switch: the same deck session to the person
    // looking at it, so the same one call.
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(again.get(SUNSET)).toBe('Before Sunset Beach');
  });

  it('stops at three distinct venues, and the rest stay generic', async () => {
    const labels = await resolveDeckLabels([SUNSET, MARINA, ILICA, MARBELLA], BIBLOS);

    expect(resolve).toHaveBeenCalledTimes(MAX_DECK_LABELS);
    expect(labels.size).toBe(MAX_DECK_LABELS);
    // The fourth is not an error and not a wrong name — it is simply absent,
    // and the card says "nearby".
    expect(labels.has(MARBELLA)).toBe(false);
  });

  it('keeps the budget across reloads rather than starting again', async () => {
    await resolveDeckLabels([SUNSET, MARINA], BIBLOS);
    await resolveDeckLabels([ILICA, MARBELLA], BIBLOS);

    expect(resolve).toHaveBeenCalledTimes(MAX_DECK_LABELS);
  });

  it('settles a venue Google cannot name, and never retries it', async () => {
    fake.breakGoogleResolution(true);
    const first = await resolveDeckLabels([SUNSET], BIBLOS);
    expect(first.size).toBe(0);
    expect(resolve).toHaveBeenCalledTimes(1);

    fake.breakGoogleResolution(false);
    const second = await resolveDeckLabels([SUNSET], BIBLOS);

    // Settled is settled: a deck that asked and got nothing does not ask again
    // when the next card scrolls past.
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(second.size).toBe(0);
  });

  it('leaves the budget intact when a venue could not be named', async () => {
    fake.breakGoogleResolution(true);
    await resolveDeckLabels([SUNSET], BIBLOS);
    fake.breakGoogleResolution(false);

    await resolveDeckLabels([MARINA, ILICA, MARBELLA], BIBLOS);

    // The failure cost a call but not one of the three names the deck may
    // show, so all three of the next venues get one.
    const labels = await resolveDeckLabels([MARINA, ILICA, MARBELLA], BIBLOS);
    expect(labels.size).toBe(MAX_DECK_LABELS);
  });

  it('never rejects, whatever the provider does', async () => {
    resolve.mockRejectedValue(new Error('provider down'));

    await expect(resolveDeckLabels([SUNSET], BIBLOS)).resolves.toBeInstanceOf(Map);
  });

  it('spends nothing when the month\u2019s ceiling is gone', async () => {
    fake.setGoogleCeiling(0);

    const labels = await resolveDeckLabels([SUNSET, MARINA], BIBLOS);

    expect(labels.size).toBe(0);
  });
});
