/**
 * D-053 §3 — the month's Google ceiling runs out, and the product does not.
 *
 * The cost ceiling and the user's entitlement are different things, and this is
 * the file that keeps them different. The entitlement (three finds a month, ten
 * on Premium) is the user's; the ceiling (9,000 Autocomplete requests, 4,500
 * label resolutions) is ours, and when ours is gone it is not the user's fault.
 *
 * So a spent ceiling must do exactly one thing: close the Google door. The
 * catalogue list, the written search, and "Buradayım" are the three paths that
 * carry the feature on their own, and none of them may notice. Nor may a
 * refused search quietly eat one of the user's finds.
 *
 * A spent ceiling reaches the app as `null` from `googlePlaceSearch` — the same
 * shape as no key at all, deliberately, because the screen's job is identical
 * in both cases and one code path is easier to keep honest than two.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, screen } from '@testing-library/react-native';

import { COPY } from '../copy';
import { FakeApi, setApi, type GooglePlaceAnswer, type HotelCard } from '../data';
import { en } from '../i18n/en';
import { tr } from '../i18n/tr';
import { onboard, onboardToSettings } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
/** A café that opened last week: in nobody's catalogue, and right under you. */
const SPOT = { latitude: 47.5391, longitude: 19.0489 };

/**
 * The backend with its month spent: 429 `allowance_spent`, which the data layer
 * turns into `null`. It counts the asks so a test can prove the *upstream* call
 * is what stopped, rather than the button.
 */
class CeilingSpentApi extends FakeApi {
  asks = 0;

  override async googlePlaceSearch(
    _query: string,
    _latitude: number,
    _longitude: number,
    _sessionId?: string,
  ): Promise<GooglePlaceAnswer | null> {
    this.asks += 1;
    return null;
  }

  /** Nothing mapped here, so the picker reaches its third step at all. */
  override async nearbyVenues(_latitude: number, _longitude: number): Promise<HotelCard[]> {
    return [];
  }
}

describe('when the month’s Google ceiling is spent', () => {
  it('still checks in through the here-anchor, which owes Google nothing', async () => {
    const api = new CeilingSpentApi({ now: () => FIXED });
    setApi(api);
    await api.requestPhoneOtp('+905551119030');
    await api.verifyPhoneOtp('+905551119030', '123456');
    await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });

    expect(await api.googlePlaceSearch('esslab', SPOT.latitude, SPOT.longitude)).toBeNull();

    const answer = await api.checkinHere(SPOT.latitude, SPOT.longitude);
    expect(answer.withinRange).toBe(true);
    expect((await api.getCheckin())?.kind).toBe('cell');
  });

  it('leaves the written search over our own catalogue working', async () => {
    const api = new CeilingSpentApi({ now: () => FIXED });
    setApi(api);
    await api.requestPhoneOtp('+905551119031');
    await api.verifyPhoneOtp('+905551119031', '123456');
    await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });

    await api.googlePlaceSearch('lara', SPOT.latitude, SPOT.longitude);

    // D-051's second search — Overture/OSM rows, asked by name, no provider
    // involved. This is the path that has to survive, and it does.
    const found = await api.searchVenues('lara');
    expect(found.length).toBeGreaterThan(0);

    // Standing at the bar it found, and checking in to it: the whole path, end
    // to end, with the provider door shut.
    const marina = found.find((venue) => venue.id === 'hotel-lara-marina');
    expect(marina).toBeTruthy();
    const checkin = await api.recordCheckin(marina!.id, 36.858, 30.803);
    expect(checkin.withinRange).toBe(true);
  });

  it('spends none of the user’s finds on a search we could not make', async () => {
    const api = new CeilingSpentApi({ now: () => FIXED });
    setApi(api);
    await api.requestPhoneOtp('+905551119032');
    await api.verifyPhoneOtp('+905551119032', '123456');
    await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });
    await api.setPremium(false);

    expect(await api.googleFindsRemaining()).toBe(3);
    for (const word of ['esslab', 'espressolab', 'kral']) {
      expect(await api.googlePlaceSearch(word, SPOT.latitude, SPOT.longitude)).toBeNull();
    }
    // Our ceiling, our problem. The entitlement is only ever spent by a
    // completed labelled check-in (D-053 §2).
    expect(await api.googleFindsRemaining()).toBe(3);
    expect(api.asks).toBe(3);
  });
});

describe('the screen with the ceiling spent', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FAKE_API = 'true';
  });
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USE_FAKE_API;
  });

  it('says the option is unavailable, and keeps the here-anchor working', async () => {
    const api = new CeilingSpentApi({ now: () => FIXED });
    setApi(api);
    await onboard('Deniz', '+905551119033');

    await act(async () => {
      fireEvent.press(await screen.findByTestId('tab-Nearby'));
    });
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-simulate-shore'));
    });

    // A typed name with nothing in the catalogue behind it: the state where
    // D-053 allows the third step to be offered at all.
    await act(async () => {
      fireEvent.changeText(await screen.findByTestId('checkin-search'), 'esslab');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });

    // The honest "no": the option is closed, not the street empty.
    expect(await screen.findByText(COPY.checkin.googleUnavailable)).toBeTruthy();
    expect(screen.queryByTestId('checkin-google-list')).toBeNull();

    // And the guaranteed path is still right there, still works.
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-here'));
    });
    expect(await screen.findByText(COPY.checkin.hereLabel)).toBeTruthy();
  });
});

/**
 * The refusal, read as text.
 *
 * An exhausted ceiling is only safe if the refusal happens *before* the paid
 * request and returns without making it. That ordering is not something a mock
 * over a provider we cannot call would prove, so it is pinned in the source.
 */
describe('the refusal path', () => {
  const fn = readFileSync(
    join(__dirname, '../../../supabase/functions/places-google/index.ts'),
    'utf8',
  );
  const sql = readFileSync(
    join(__dirname, '../../../supabase/migrations/20260730000600_claim_actually_refuses.sql'),
    'utf8',
  );

  it('returns on a spent allowance instead of calling upstream', () => {
    const refusal = fn.indexOf('if (!allowance.allowed)');
    const request = fn.indexOf('fetch(PLACES_AUTOCOMPLETE');
    expect(refusal).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(refusal);
    expect(fn).toContain('allowance_spent');
  });

  it('refuses both operations, not just the cheap one', () => {
    expect(fn.match(/if \(!allowance\.allowed\)/g)).toHaveLength(2);
  });

  it('treats an unreachable counter as a refusal, so failure is closed', () => {
    // If the claim itself errors we cannot know what is left, and a paid call
    // made on a guess is the one mistake a ceiling exists to prevent.
    expect(fn).toMatch(/if \(error\) return \{ allowed: false/);
  });

  it('counts in the statement that decides, so the ceiling cannot be raced', () => {
    expect(sql).toContain('and m.used < m.allowance');
    expect(sql).toMatch(/update app\.metered_calls m[\s\S]*?set used = m\.used \+ 1/);
  });

  it('reports what is left rather than raising, because there are other paths', () => {
    expect(sql).toContain('return query');
    expect(sql).not.toMatch(/raise exception[^\n]*allowance/i);
  });
});

/**
 * D-053 §6 — the disclosure, and what it is allowed to say.
 *
 * A privacy sentence is a promise the code has to keep, so these assert both
 * halves: that the disclosure exists where somebody would look for it, and that
 * it describes the arrangement we actually built — a Place ID and no name, a
 * coarse cell and no raw reading, a call only on a press.
 */
describe('the provider disclosure', () => {
  it('is on the Settings screen, in both languages', async () => {
    setApi(new FakeApi({ now: () => FIXED }));
    await onboardToSettings();
    expect(await screen.findByTestId('settings-providers')).toBeTruthy();
    expect(screen.getByText(COPY.settings.providersGoogleStorage)).toBeTruthy();
  });

  it.each([
    ['English', en.settings],
    ['Turkish', tr.settings],
  ])('says in %s that the name is not stored and the id is', (_language, settings) => {
    expect(settings.providersGoogleStorage).toMatch(/place id/i);
    // Both languages have to carry the storage denial, not just the one the
    // reviewer happens to read.
    expect(settings.providersGoogleStorage).toMatch(/never store|saklamayız|hiç saklamayız/i);
  });

  it.each([
    ['English', en.settings],
    ['Turkish', tr.settings],
  ])('credits the open data behind the list in %s', (_language, settings) => {
    expect(settings.providersOpen).toMatch(/OpenStreetMap/);
    expect(settings.providersOpen).toMatch(/ODbL/);
    expect(settings.providersOpen).toMatch(/Overture/);
  });

  it.each([
    ['English', en.settings],
    ['Turkish', tr.settings],
  ])('names the retention window in %s, rather than gesturing at one', (_language, settings) => {
    expect(settings.providersRetention).toMatch(/3 (hours|saat)/);
  });
});
