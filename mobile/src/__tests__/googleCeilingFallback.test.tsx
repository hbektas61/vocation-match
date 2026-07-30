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
import {
  FakeApi,
  setApi,
  type GooglePlaceAnswer,
  type GooglePlaceHit,
  type HotelCard,
} from '../data';
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

  it('guards every claim, not just the cheap one', () => {
    // Counting the guards against the claims rather than against a fixed
    // number: D-054 added three more paid call sites, and a rule that says
    // "two" would have had to be edited rather than enforced. Every claim must
    // be followed by its refusal, whatever the total is.
    const claims = fn.match(/await claim\(/g) ?? [];
    const guards = fn.match(/if \(!allowance\.allowed\)/g) ?? [];
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(guards).toHaveLength(claims.length);
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

  it.each([
    ['English', en.settings],
    ['Turkish', tr.settings],
  ])('admits in %s that choosing a venue goes through Google too (D-054)', (_language, settings) => {
    // Before D-054 the disclosure could honestly say Google was reached only
    // on a check-in press. It is now the whole venue-selection path, and a
    // privacy note that describes the previous version of the product is not
    // a privacy note.
    expect(settings.providersVenue).toMatch(/Google/);
    expect(settings.providersVenue).toMatch(/identifier|kimliği/i);
    expect(settings.providersVenue).toMatch(/never|asla/i);
  });
});

/**
 * D-053 §3 — a second name deserves a second try.
 *
 * The bug these pin: "already tried Google" was one boolean for the whole
 * visit, set on the request and cleared only by a *successful* labelled
 * check-in. So the first empty or failed answer retired the option — a person
 * who typed "eslab" instead of "esslab", or who searched while the provider was
 * briefly down, had no way back, and the screen drew neither a list, a button
 * nor a reason.
 *
 * The rule now: the option is spent per *name*, using the same normalisation
 * the backend fingerprints with. A new name is a fresh chance; the same name is
 * not, which is what stops a spent ceiling from being hammered by a button.
 */

/** Google, scripted per query, counting every question actually asked. */
class ScriptedGoogleApi extends FakeApi {
  readonly asked: string[] = [];

  constructor(
    private readonly script: Map<string, GooglePlaceAnswer | null>,
    options?: { now?: () => number },
  ) {
    super(options);
  }

  override async googlePlaceSearch(
    query: string,
    _latitude: number,
    _longitude: number,
    sessionId?: string,
  ): Promise<GooglePlaceAnswer | null> {
    this.asked.push(`${query}${sessionId ? `@${sessionId}` : ''}`);
    return this.script.get(query.trim().toLowerCase()) ?? null;
  }

  /** Nothing mapped here, so the picker reaches its third step at all. */
  override async nearbyVenues(_latitude: number, _longitude: number): Promise<HotelCard[]> {
    return [];
  }
}

function hit(name: string, token: string): GooglePlaceHit {
  return { selectionToken: token, name, detail: 'Budapest' };
}

/** Gets the screen to the state where the advanced find is legitimately offered. */
async function atTheThirdStep(phone: string): Promise<void> {
  await onboard('Deniz', phone);
  await act(async () => {
    fireEvent.press(await screen.findByTestId('tab-Nearby'));
  });
  await act(async () => {
    fireEvent.press(await screen.findByTestId('checkin-simulate-shore'));
  });
}

async function typeName(name: string): Promise<void> {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('checkin-search'), name);
  });
  // Past the catalogue search's debounce, so `shown` has settled.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

describe('asking Google a second time', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FAKE_API = 'true';
  });
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USE_FAKE_API;
  });

  it('offers the option again when the name changes after an empty answer', async () => {
    const api = new ScriptedGoogleApi(
      new Map<string, GooglePlaceAnswer | null>([
        ['eslab', { places: [], duplicate: false, sessionId: 'sess-1' }],
        ['esslab', {
          places: [hit('Espressolab Hajógyári', 'tok-esslab')],
          duplicate: false,
          sessionId: 'sess-1',
        }],
      ]),
      { now: () => FIXED },
    );
    setApi(api);
    await atTheThirdStep('+905551119040');

    // The mistyped name. Google answers, and knows nothing by it.
    await typeName('eslab');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });
    expect(await screen.findByText(COPY.checkin.googleNoResults)).toBeTruthy();
    // Spent for *this* spelling: pressing again would ask the same question.
    expect(screen.queryByTestId('checkin-google-more')).toBeNull();

    // The corrected name — and the option is back, which is the whole fix.
    await typeName('esslab');
    const again = await screen.findByTestId('checkin-google-more');
    await act(async () => {
      fireEvent.press(again);
    });

    expect(await screen.findByText('Espressolab Hajógyári')).toBeTruthy();
    // Two questions, both real, and the second inside the session the first
    // opened — a retry is not a reason to start billing a new one.
    expect(api.asked).toEqual(['eslab', 'esslab@sess-1']);
  });

  it('offers the option again after a failure, and lets the retry succeed', async () => {
    const api = new ScriptedGoogleApi(
      new Map<string, GooglePlaceAnswer | null>([
        // Not in the script: the provider could not answer at all.
        ['kral', null],
        ['kral espresso', {
          places: [hit('Kral Espresso', 'tok-kral')],
          duplicate: false,
          sessionId: 'sess-2',
        }],
      ]),
      { now: () => FIXED },
    );
    setApi(api);
    await atTheThirdStep('+905551119041');

    await typeName('kral');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });
    // The honest "no": unavailable, not empty — a different sentence.
    expect(await screen.findByText(COPY.checkin.googleUnavailable)).toBeTruthy();
    expect(screen.queryByTestId('checkin-google-more')).toBeNull();

    await typeName('kral espresso');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });

    // And the retry can be checked into, so the recovery is complete rather
    // than merely visible.
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-tok-kral'));
    });
    expect(await screen.findByText('Kral Espresso')).toBeTruthy();
  });

  it('does not ask twice for the same name, however it is typed', async () => {
    const api = new ScriptedGoogleApi(
      new Map<string, GooglePlaceAnswer | null>([
        ['esslab', { places: [], duplicate: false, sessionId: 'sess-3' }],
      ]),
      { now: () => FIXED },
    );
    setApi(api);
    await atTheThirdStep('+905551119042');

    await typeName('esslab');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });
    expect(api.asked).toHaveLength(1);

    // Case and spacing are what the backend's fingerprint ignores, so the
    // screen ignores them too: this is the same question, and the backend's
    // deduplication is not something to lean on for a request we can simply
    // not make.
    await typeName('  ESSLAB  ');
    expect(screen.queryByTestId('checkin-google-more')).toBeNull();
    expect(api.asked).toHaveLength(1);
  });

  it('keeps one session across names, rather than opening one per press', async () => {
    const api = new ScriptedGoogleApi(
      new Map<string, GooglePlaceAnswer | null>([
        ['esslab', { places: [], duplicate: false, sessionId: 'sess-4' }],
        ['kral', {
          places: [hit('Kral Espresso', 'tok-kral-2')],
          duplicate: false,
          sessionId: 'sess-4',
        }],
      ]),
      { now: () => FIXED },
    );
    setApi(api);
    await atTheThirdStep('+905551119043');

    await typeName('esslab');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });
    await typeName('kral');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });

    // The first ask carries no session — there is none yet — and every ask
    // after it carries the one the server issued. Google bills a session.
    expect(api.asked[0]).toBe('esslab');
    expect(api.asked[1]).toBe('kral@sess-4');
  });

  it('puts a previous name’s list away instead of leaving it selectable', async () => {
    const api = new ScriptedGoogleApi(
      new Map<string, GooglePlaceAnswer | null>([
        ['esslab', {
          places: [hit('Espressolab Hajógyári', 'tok-stale')],
          duplicate: false,
          sessionId: 'sess-5',
        }],
      ]),
      { now: () => FIXED },
    );
    setApi(api);
    await atTheThirdStep('+905551119044');

    await typeName('esslab');
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-google-more'));
    });
    expect(await screen.findByTestId('checkin-google-tok-stale')).toBeTruthy();

    // A different name is a different question; the old answer must not still
    // be sitting there waiting to be tapped.
    await typeName('kral');
    expect(screen.queryByTestId('checkin-google-tok-stale')).toBeNull();

    // And typing it back restores the list from session memory, without asking
    // Google again — the client's half of D-053 §3.
    await typeName('esslab');
    expect(await screen.findByTestId('checkin-google-tok-stale')).toBeTruthy();
    expect(api.asked).toHaveLength(1);
  });
});
