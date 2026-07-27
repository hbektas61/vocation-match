/**
 * The hotel is chosen, never offered.
 *
 * The owner's rule is that nothing is preselected and the catalogue is not a
 * result list: a screen that opens with every hotel on it is an invitation to
 * pick whichever is at the top, and the top one would be chosen far more often
 * than it deserves. These tests pin that, plus the two failure shapes a search
 * box has that a static list does not — an answer to a query nobody is typing
 * any more, and an error somebody has to be able to retry.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { ApiError, FakeApi, getApi, setApi, type HotelCard } from '../data';
import { onboard } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

/** Onboards, then opens the Hotel tab, which is where the choice now lives. */
async function openHotelTab(): Promise<void> {
  await onboard('Deniz', '+905551117001');
  await fireEvent.press(await screen.findByText('Hotel'));
  await screen.findByTestId('hotel-search');
}

/** The debounce is real time, so tests have to wait it out. */
async function settle(ms = 400): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('before anything is typed', () => {
  it('shows no hotels at all, and no hotel is already chosen', async () => {
    await openHotelTab();
    await settle();

    expect(screen.getByTestId('hotel-search-prompt')).toBeTruthy();
    // Not "no results" — nothing has been asked yet, and saying "no hotels
    // match" to somebody who has not searched reads as a broken screen.
    expect(screen.queryByTestId('hotel-no-results')).toBeNull();
    expect(screen.queryByTestId('activate-hotel-lara-shore')).toBeNull();
  });

  it('does not ask the server for the catalogue', async () => {
    await onboard('Deniz', '+905551117002');
    const api = getApi();
    const search = jest.spyOn(api, 'searchHotels');

    await fireEvent.press(await screen.findByText('Hotel'));
    await screen.findByTestId('hotel-search');
    await settle();

    // The one call that is allowed is the one that puts a name on the hotel
    // this account already has; nothing is fetched to fill a list.
    expect(search.mock.calls.every(([query]) => query === '')).toBe(true);
    search.mockRestore();
  });

  it('still says nothing for a single character', async () => {
    await openHotelTab();

    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'l');
    await settle();

    // One letter matches most of a catalogue, which is the list nobody asked
    // for arriving by another route.
    expect(screen.getByTestId('hotel-search-prompt')).toBeTruthy();
  });
});

describe('once a query is typed', () => {
  it('offers only what the server returned', async () => {
    await openHotelTab();

    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'lara');
    await settle();

    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();
    expect(screen.queryByTestId('activate-hotel-bosphorus-garden')).toBeNull();
  });

  it('says so plainly when nothing matches', async () => {
    await openHotelTab();

    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'zzzzz');
    await settle();

    expect(await screen.findByTestId('hotel-no-results')).toBeTruthy();
  });

  it('does not let a slow answer to an old query land on the new one', async () => {
    await openHotelTab();
    const api = getApi();
    const real = api.searchHotels.bind(api);
    // "lar" takes a second; "lara" comes back at once. Without a sequence
    // check the screen settles on whichever finished last, which is the wrong
    // one and looks like the search ignoring what was typed.
    jest.spyOn(api, 'searchHotels').mockImplementation(async (query: string) => {
      const hotels: HotelCard[] = await real(query);
      if (query === 'lar') await new Promise((resolve) => setTimeout(resolve, 800));
      return query === 'lar' ? [] : hotels;
    });

    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'lar');
    await settle(300);
    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'lara');
    await settle(1200);

    expect(screen.getByTestId('activate-hotel-lara-shore')).toBeTruthy();
    expect(screen.queryByTestId('hotel-no-results')).toBeNull();
  });

  it('offers a retry when the search itself fails', async () => {
    await openHotelTab();
    const api = getApi();
    const real = api.searchHotels.bind(api);
    const search = jest
      .spyOn(api, 'searchHotels')
      .mockRejectedValueOnce(new ApiError('NETWORK', 'no route'));

    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'lara');
    await settle();
    expect(await screen.findByTestId('hotel-search-error')).toBeTruthy();

    search.mockImplementation(real);
    await fireEvent.press(screen.getByTestId('hotel-search-retry'));
    await settle();

    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();
  });
});

describe('the headcount on the key card (D-032)', () => {
  it('shows an exact number at five or more, and nothing at all below', async () => {
    await openHotelTab();
    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'lara');
    await settle();
    await fireEvent.press(await screen.findByTestId('activate-hotel-lara-shore'));
    await settle();

    // Lara Shore's fixtures put seven people in Upcoming (Nur included —
    // the caller has no declared window yet, so the whole room counts) and
    // three in Here Now. Seven is spoken; three is not — and not as "a few
    // people" either, because below the threshold even "somebody is here"
    // points at a person. Silence is the design, so the test demands it.
    expect(await screen.findByTestId('room-count-UPCOMING')).toHaveTextContent('7 people');
    expect(screen.queryByTestId('room-count-HERE_NOW')).toBeNull();
  });
});

describe('reaching for a room without a hotel', () => {
  it('offers the way to fix it on the screen that is blocked', async () => {
    await onboard('Deniz', '+905551117010');

    // Onboarding no longer asks for a hotel, so this is the ordinary state of
    // a brand new account rather than an edge case.
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.getByTestId('rooms-choose-hotel')).toBeTruthy();
  });

  it('opens the search with nothing chosen, and comes back once one is', async () => {
    await onboard('Deniz', '+905551117011');
    await fireEvent.press(await screen.findByTestId('rooms-choose-hotel'));

    // The gate is the same search as the tab: nothing offered until asked.
    expect(await screen.findByTestId('hotel-search-prompt')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('hotel-search'), 'lara');
    await settle();
    await fireEvent.press(await screen.findByTestId('activate-hotel-lara-shore'));
    await settle();

    // Choosing finishes the errand, so it hands back what was being reached
    // for rather than leaving somebody on a hotel screen.
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.queryByTestId('rooms-choose-hotel')).toBeNull();
  });

  it('can be backed out of without choosing anything', async () => {
    await onboard('Deniz', '+905551117012');
    await fireEvent.press(await screen.findByTestId('rooms-choose-hotel'));
    await screen.findByTestId('hotel-search-prompt');

    // A screen you cannot leave without picking a hotel is how default
    // selections get made.
    expect(await getApi().getActiveHotel()).toBeNull();
  });
});
