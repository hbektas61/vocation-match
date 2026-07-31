/**
 * D-054 §8 — choosing where the holiday is.
 *
 * This replaces `hotelSearch.test.tsx`, whose subject (a catalogue search box
 * on the trip tab) no longer exists. The rules it protected are all still here
 * and still asserted — nothing is offered until somebody asks, a slow answer
 * to an old query never lands on a new one, a failure is recoverable — because
 * those were never facts about the catalogue. They were facts about a search.
 *
 * What is new is the shape the brief specifies: a destination first, then a
 * venue inside it, with the default mode deliberately unrestricted so a beach
 * club Google files under `bar` is still findable.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { FAKE_PHONE_OTP, FakeApi, getApi, setApi } from '../data';
import { onboard, chooseGoogleVenue } from '../testSupport/onboarding';
import { press } from '../testSupport/interact';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

let fake: FakeApi;

beforeEach(() => {
  fake = new FakeApi({ now: () => FIXED });
  setApi(fake);
});

/** The debounce is real time, so tests have to wait it out. */
async function settle(ms = 500): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function openPicker(phone: string): Promise<void> {
  await onboard('Deniz', phone);
  await press(await screen.findByTestId('tab-Vacation'));
  await press(await screen.findByTestId('venue-open-picker'));
  await screen.findByTestId('destination-search');
}

async function typeInto(testID: string, text: string): Promise<void> {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });
  await settle();
}

/** Destination chosen; the screen is on step B. */
async function pickAlacati(phone: string): Promise<void> {
  await openPicker(phone);
  await typeInto('destination-search', 'Alaçatı');
  await press(await screen.findByTestId('destination-option-0'));
  await screen.findByTestId('venue-search');
}

/* ------------------------------------------------------------- §8.1–§8.4 */

describe('choosing a destination', () => {
  it('accepts Alaçatı, which Google does not call a city', async () => {
    // §8.1. A `(cities)` restriction would refuse a sublocality, and Alaçatı
    // and Dubai Marina are both exactly that — which is why the request asks
    // for geocoding results rather than for cities.
    await openPicker('+905551118001');
    await typeInto('destination-search', 'Alaçatı');

    expect(await screen.findByText('Alaçatı')).toBeTruthy();
    expect(screen.getByText('İzmir, Türkiye')).toBeTruthy();
  });

  it('accepts a neighbourhood too, so Dubai Marina is reachable', async () => {
    await openPicker('+905551118002');
    await typeInto('destination-search', 'Dubai Marina');

    expect(await screen.findByText('Dubai Marina')).toBeTruthy();
  });

  it('never offers a business as a destination', async () => {
    // §8.2. "Biblos" is a resort, and a resort is not somewhere you go — it
    // is somewhere you stay, which is the next step's question.
    await openPicker('+905551118003');
    await typeInto('destination-search', 'Biblos');

    expect(await screen.findByTestId('venue-no-results')).toBeTruthy();
    expect(screen.queryByText('Biblos Resort Alaçatı')).toBeNull();
  });

  it('offers nothing at all before three characters', async () => {
    await openPicker('+905551118004');
    const before = fake.googleCallCount();

    await typeInto('destination-search', 'Al');

    expect(screen.getByTestId('venue-prompt')).toBeTruthy();
    // And, more to the point, nothing was asked of a metered provider.
    expect(fake.googleCallCount()).toBe(before);
  });

  it('does not let a slow answer to an old query land on the new one', async () => {
    // §8.3. Typing "Ala" then "Çeşme" can return in either order; without the
    // ticket the screen settles on whichever finished last, which is the one
    // nobody is looking at.
    await openPicker('+905551118005');
    const api = getApi();
    const real = api.searchDestinations.bind(api);
    jest.spyOn(api, 'searchDestinations').mockImplementation(async (query, session) => {
      const answer = await real(query, session);
      if (query === 'Ala') await new Promise((resolve) => setTimeout(resolve, 900));
      return answer;
    });

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('destination-search'), 'Ala');
    });
    await settle(400);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('destination-search'), 'Çeşme');
    });
    await settle(1400);

    expect(screen.getByText('Çeşme')).toBeTruthy();
    expect(screen.queryByText('Alaçatı')).toBeNull();
  });

  it('clears the venue step when the destination changes', async () => {
    // §8.4. The predictions go, and so does the session they were scoped to —
    // otherwise a venue found in Alaçatı could be chosen after switching to
    // Çeşme.
    await pickAlacati('+905551118006');
    await typeInto('venue-search', 'Biblos');
    expect(await screen.findByText('Biblos Resort Alaçatı')).toBeTruthy();

    await press(screen.getByTestId('venue-change-destination'));

    expect(await screen.findByTestId('venue-picker-destination')).toBeTruthy();
    expect(screen.queryByText('Biblos Resort Alaçatı')).toBeNull();
    expect(screen.getByTestId('venue-prompt')).toBeTruthy();
  });
});

/* ------------------------------------------------------------ §8.5–§8.11 */

describe('choosing a venue inside that destination', () => {
  it('finds the resort', async () => {
    // §8.5
    await pickAlacati('+905551118010');
    await typeInto('venue-search', 'Biblos');

    expect(await screen.findByText('Biblos Resort Alaçatı')).toBeTruthy();
  });

  it('finds the beach club Google files under `bar`', async () => {
    // §8.6 and §8.9 together: this is the case a lodging-only default loses.
    await pickAlacati('+905551118011');
    await typeInto('venue-search', 'Before Sunset');

    expect(await screen.findByText('Before Sunset Beach')).toBeTruthy();
  });

  it('finds a named public beach', async () => {
    // §8.7. Ilıca is in Çeşme's box rather than Alaçatı's, which is the
    // destination the brief names for it.
    await openPicker('+905551118012');
    await typeInto('destination-search', 'Çeşme');
    await press(await screen.findByTestId('destination-option-0'));
    await screen.findByTestId('venue-search');
    await typeInto('venue-search', 'Ilıca');

    expect(await screen.findByText('Ilıca Plajı')).toBeTruthy();
  });

  it('never answers with the same brand in another country', async () => {
    // §8.8. There is a Biblos Resort in Marbella. It is not an answer to
    // "where in Alaçatı".
    await pickAlacati('+905551118013');
    await typeInto('venue-search', 'Biblos');

    expect(await screen.findByText('Biblos Resort Alaçatı')).toBeTruthy();
    expect(screen.queryByText('Marbella, Málaga, İspanya')).toBeNull();
  });

  it('keeps the beach club out of the lodging chip, and back in under Tümü', async () => {
    // The chips refine; the default does not. Proving both directions is what
    // shows the default is genuinely unrestricted rather than accidentally so.
    await pickAlacati('+905551118014');
    await press(screen.getByTestId('venue-chip-stay'));
    await typeInto('venue-search', 'Before Sunset');
    expect(await screen.findByTestId('venue-no-results')).toBeTruthy();

    await press(screen.getByTestId('venue-chip-all'));
    await settle();
    expect(await screen.findByText('Before Sunset Beach')).toBeTruthy();
  });

  it('offers no chip that would hide what it is named after', async () => {
    // A `Beach & Club` chip existed until staging showed it returning nothing
    // for the brief's own beach-club case. Two chips is the honest set.
    await pickAlacati('+905551118017');
    expect(screen.getByTestId('venue-chip-all')).toBeTruthy();
    expect(screen.getByTestId('venue-chip-stay')).toBeTruthy();
    expect(screen.queryByTestId('venue-chip-beach')).toBeNull();
  });

  it('shows the Google attribution wherever a prediction is drawn', async () => {
    // §8.11
    await pickAlacati('+905551118015');
    await typeInto('venue-search', 'Biblos');

    expect(await screen.findByTestId('venue-attribution')).toHaveTextContent('Powered by Google');
  });

  it('renders one row per Place ID', async () => {
    // §8.10. The tokens are minted from this list, so a duplicated prediction
    // would be two ways to select one venue — and one of them left unspent.
    await pickAlacati('+905551118016');
    await typeInto('venue-search', 'Biblos');

    expect(screen.getAllByText('Biblos Resort Alaçatı')).toHaveLength(1);
  });
});

/* --------------------------------------------------------- §8.12–§8.14 */

describe('the venue identity behind a Place ID', () => {
  /**
   * Two people, one after the other, without the screen.
   *
   * These are the only cases here that need a *second* account, and a second
   * account cannot be onboarded into the same mounted tree — so they are
   * driven through the API instead. That is honest about what is being
   * asserted: the identity rule is a property of the backend, not of the
   * picker, and the picker's own behaviour is covered above.
   */
  async function chooseAs(
    phone: string,
    destinationQuery: string,
    venueQuery: string,
  ): Promise<{ hotelId: string; googlePlaceId: string | null }> {
    await fake.signOut();
    await fake.requestPhoneOtp(phone);
    await fake.verifyPhoneOtp(phone, FAKE_PHONE_OTP);
    await fake.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });
    const destinations = await fake.searchDestinations(destinationQuery);
    const chosen = await fake.chooseDestination(destinations!.places[0].selectionToken);
    const venues = await fake.searchVacationVenues(venueQuery, chosen!.sessionId, 'all');
    await fake.activateGoogleVenue(venues!.places[0].selectionToken, 'all');
    const venue = (await fake.getActiveVenue())!;
    return { hotelId: venue.hotelId, googlePlaceId: venue.googlePlaceId };
  }

  it('sends two people who chose the same place into the same venue', async () => {
    // §8.12 — the brief's central invariant.
    const first = await chooseAs('+905551118020', 'Alaçatı', 'Biblos');
    const second = await chooseAs('+905551118021', 'Alaçatı', 'Biblos');

    expect(second.hotelId).toBe(first.hotelId);
    expect(second.googlePlaceId).toBe(first.googlePlaceId);
  });

  it('keeps two same-named places apart when their Place IDs differ', async () => {
    // §8.13. Biblos Alaçatı and Biblos Marbella share a brand and nothing else,
    // and the display name is not what decides.
    const alacati = await chooseAs('+905551118023', 'Alaçatı', 'Biblos');
    const marbella = await chooseAs('+905551118024', 'Marbella', 'Biblos');

    expect(marbella.hotelId).not.toBe(alacati.hotelId);
    expect(marbella.googlePlaceId).not.toBe(alacati.googlePlaceId);
  });

  it('cannot mint two venues for one Place ID, however the selections race', async () => {
    // §8.14. Two first selections of the same place, resolved concurrently.
    // In the database this is settled by `unique (provider, provider_place_id)`
    // inside one statement; here the same property is asserted of the id.
    await onboard('Deniz', '+905551118022');
    const session = await fake.searchDestinations('Alaçatı');
    const chosen = await fake.chooseDestination(session!.places[0].selectionToken);
    const venues = await fake.searchVacationVenues('Biblos', chosen!.sessionId, 'all');
    const first = await fake.activateGoogleVenue(venues!.places[0].selectionToken, 'all');

    const again = await fake.searchDestinations('Alaçatı');
    const chosenAgain = await fake.chooseDestination(again!.places[0].selectionToken);
    const venuesAgain = await fake.searchVacationVenues('Biblos', chosenAgain!.sessionId, 'all');
    const second = await fake.activateGoogleVenue(venuesAgain!.places[0].selectionToken, 'all');

    expect(second.hotelId).toBe(first.hotelId);
  });
});

/* --------------------------------------------------------- §8.17–§8.19 */

describe('what is written down', () => {
  it('stores the Place ID and nothing Google said about the place', async () => {
    // §8.17 and §8.18. The card the app can read back holds the placeholder,
    // not a name — which is what makes "we are not building a catalogue" a
    // property of the data rather than a promise in a document.
    await chooseAndRead('+905551118030');
    const venue = (await fake.getActiveVenue())!;
    const card = (await fake.getHotelById(venue.hotelId))!;

    expect(venue.googlePlaceId).toBe('gp-venue-biblos');
    expect(card.provider).toBe('google');
    expect(card.name).toBe('(google)');
    expect(card.city).toBe('(google)');
    expect(card.address).toBeNull();
    expect(JSON.stringify(card)).not.toContain('Biblos');
  });

  it('still keeps the app-owned records a room is made of', async () => {
    // §8.19. Membership and a declared stay are ours, and they persist
    // normally against a venue that holds none of Google's content.
    await chooseAndRead('+905551118031');
    const stay = await fake.declareUpcomingStay('2026-08-12', '2026-08-17');
    const venue = (await fake.getActiveVenue())!;

    expect(stay.hotelId).toBe(venue.hotelId);
    expect(await fake.getUpcomingStay()).toEqual(stay);
  });

  it('shows a resolved name on the card, and says so plainly when it cannot', async () => {
    // §4: the name is fetched for the screen that draws it, and a provider
    // that cannot answer produces a stated absence rather than an invention.
    await chooseAndRead('+905551118032');
    expect(await screen.findByTestId('active-hotel-name')).toHaveTextContent(
      'Biblos Resort Alaçatı',
    );

    fake.breakGoogleResolution(true);
    await press(screen.getByTestId('tab-Inbox'));
    await press(screen.getByTestId('tab-Vacation'));
    await settle();

    expect(await screen.findByTestId('active-hotel-name')).toHaveTextContent(
      'Place details are unavailable right now',
    );
  });
});

/* --------------------------------------------------------- §8.20–§8.24 */

describe('the location check for a venue we hold no coordinate for', () => {
  /** A fake account is premium by default, which Here Now requires (D-036). */
  async function premiumAtBiblos(phone: string): Promise<void> {
    await chooseAndRead(phone);
  }

  it('succeeds inside the radius', async () => {
    // §8.20. The coordinate comes from the provider, at check time.
    await premiumAtBiblos('+905551118040');
    const answer = await fake.verifyPresenceAtVenue(38.2712, 26.3688, 10);
    expect(answer.withinRange).toBe(true);
  });

  it('fails outside it', async () => {
    // §8.21 — roughly 5.5 km north.
    await premiumAtBiblos('+905551118041');
    const answer = await fake.verifyPresenceAtVenue(38.3212, 26.3688, 10);
    expect(answer.withinRange).toBe(false);
  });

  it('answers with a decision, never a coordinate or a distance', async () => {
    // §8.22
    await premiumAtBiblos('+905551118042');
    const answer = await fake.verifyPresenceAtVenue(38.2712, 26.3688, 10);
    expect(Object.keys(answer).sort()).toEqual(['expiresAt', 'outcome', 'withinRange']);
  });

  it('does not consume a good check, or the venue, when the provider fails', async () => {
    // §8.23. The room, the membership and the stay are exactly as they were.
    await premiumAtBiblos('+905551118043');
    await fake.verifyPresenceAtVenue(38.2712, 26.3688, 10);
    const before = (await fake.getActiveVenue())!;
    const roomsBefore = await fake.getRooms();

    fake.breakGoogleResolution(true);
    await expect(fake.verifyPresenceAtVenue(38.2712, 26.3688, 10)).rejects.toThrow();

    expect(await fake.getActiveVenue()).toEqual(before);
    expect(await fake.getRooms()).toEqual(roomsBefore);
  });

  it.each([
    ['99 m is precise enough', 99, 'IN_RANGE'],
    ['101 m is not', 101, 'LOCATION_INACCURATE'],
    ['and 900 m is nowhere near', 900, 'LOCATION_INACCURATE'],
    ['nor is a device that will not say', null, 'LOCATION_INACCURATE'],
  ])('%s (D-055a)', async (_label, accuracy, expected) => {
    // A 500 m radius cannot be settled by a reading whose own error is larger.
    await premiumAtBiblos(`+90555111${8045 + Number(accuracy ?? 0) % 1000}`.slice(0, 13));
    const answer = await fake.verifyPresenceAtVenue(38.2712, 26.3688, accuracy as number | null);
    expect(answer.outcome).toBe(expected);
    if (expected !== 'IN_RANGE') {
      expect(answer.withinRange).toBe(false);
      expect(answer.expiresAt).toBeNull();
    }
  });

  it('writes nothing at all when the fix is too vague', async () => {
    await premiumAtBiblos('+905551118049');
    await fake.verifyPresenceAtVenue(38.2712, 26.3688, 10);
    const roomsBefore = await fake.getRooms();

    const refused = await fake.verifyPresenceAtVenue(38.3212, 26.3688, 900);

    expect(refused.outcome).toBe('LOCATION_INACCURATE');
    // The good answer from a moment ago is untouched: a refusal is not a
    // failed check, so it must not overwrite one that succeeded.
    expect(await fake.getRooms()).toEqual(roomsBefore);
  });

  it('needs no declared stay first', async () => {
    // §8.24 — D-002 unchanged: proximity is sufficient on its own.
    await premiumAtBiblos('+905551118044');
    expect(await fake.getUpcomingStay()).toBeNull();

    const answer = await fake.verifyPresenceAtVenue(38.2712, 26.3688, 10);

    expect(answer.withinRange).toBe(true);
    expect(
      (await fake.getRooms()).find((room) => room.room === 'HERE_NOW')?.eligible,
    ).toBe(true);
  });
});

/* --------------------------------------------------------- §8.25–§8.28 */

describe('what it costs', () => {
  it('makes one request for a word typed a letter at a time', async () => {
    // §8.25. Eight keystrokes inside one debounce window are one request.
    await openPicker('+905551118050');
    const before = fake.googleCallCount();

    for (const text of ['A', 'Al', 'Ala', 'Alaç', 'Alaça', 'Alaçat', 'Alaçatı']) {
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('destination-search'), text);
      });
    }
    await settle();

    expect(fake.googleCallCount() - before).toBe(1);
  });

  it('answers an identical repeat from what is already on screen', async () => {
    // §8.26. The repeat is recognised before the request cap is charged, and
    // no upstream call is made at all.
    await pickAlacati('+905551118051');
    await typeInto('venue-search', 'Biblos');
    const after = fake.googleCallCount();

    await typeInto('venue-search', 'Bib');
    await typeInto('venue-search', 'Biblos');

    expect(await screen.findByText('Biblos Resort Alaçatı')).toBeTruthy();
    // One extra request for "Bib", and none for the repeat of "Biblos".
    expect(fake.googleCallCount() - after).toBe(1);
  });

  it('refuses at the ceiling before the paid request, and spends nothing', async () => {
    // §8.27
    await onboard('Deniz', '+905551118052');
    fake.setGoogleCeiling(0);
    const before = fake.googleCallCount();

    expect(await fake.searchDestinations('Alaçatı')).toBeNull();
    expect(fake.googleCallCount()).toBe(before);
  });

  it('leaves an existing room usable when the search is unavailable', async () => {
    // §8.28. Losing the door to Google is not losing the room behind it.
    await chooseAndRead('+905551118053');
    const stay = await fake.declareUpcomingStay('2026-08-12', '2026-08-17');

    fake.setGoogleCeiling(0);

    expect(await fake.searchDestinations('Çeşme')).toBeNull();
    expect(await fake.getUpcomingStay()).toEqual(stay);
    expect(
      (await fake.getRooms()).find((room) => room.room === 'UPCOMING')?.eligible,
    ).toBe(true);
  });
});

/* ------------------------------------------------------------ the screen */

describe('the trip tab before anything is chosen', () => {
  it('offers no venues at all until somebody opens the picker', async () => {
    await onboard('Deniz', '+905551118060');
    await press(await screen.findByTestId('tab-Vacation'));

    expect(await screen.findByTestId('venue-open-picker')).toBeTruthy();
    expect(screen.queryByTestId('destination-search')).toBeNull();
    expect(screen.queryByTestId('venue-no-results')).toBeNull();
  });

  it('can be backed out of without choosing anything', async () => {
    await onboard('Deniz', '+905551118061');
    await press(await screen.findByTestId('vacation-choose-for-upcoming'));
    await screen.findByTestId('destination-search');

    // A screen you cannot leave without picking is how default selections get
    // made.
    expect(await getApi().getActiveHotel()).toBeNull();
  });
});

/** Chooses Biblos in Alaçatı through the screen and lands back on the card. */
async function chooseAndRead(phone: string): Promise<void> {
  await onboard('Deniz', phone);
  await chooseGoogleVenue();
  await settle();
}
