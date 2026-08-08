/**
 * The `(google)` marker is a marker, not a name.
 *
 * D-054 keeps nothing of Google's but the Place ID, so a Google venue's row
 * carries a literal `(google)` in the columns a catalogue venue keeps its name,
 * city and country in — the columns are `not null` and Google's display name is
 * not ours to store. The real name is resolved live and held in memory.
 *
 * The defect the owner photographed (2026-08-07) is what happens when a screen
 * reads that column anyway: `(google)` is an ordinary-looking string, so a
 * `?? null` on it succeeds, wins over the live resolution, and the chip on
 * Keşfet and Çevremde printed "(GOOGLE)" while the stay screen printed
 * "(google)" over its dates. Six screens each answered "what is this venue
 * called" by hand and all six answered it that way.
 *
 * So the question is asked in one place now (`useActiveVenueName`), and the
 * cached card can no longer supply the answer. This suite is that promise:
 * every surface that names the active venue names it, and none of them can
 * reach the marker.
 */
import { act, screen, within } from '@testing-library/react-native';

import { COPY, upperCase } from '../copy';
import { FakeApi, getApi, setApi } from '../data';
import { GOOGLE_NAME_PLACEHOLDER } from '../data/contracts';
import { resetDeckLabels } from '../data/venueLabels';
import { press } from '../testSupport/interact';
import { chooseGoogleVenue, onboard } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
/** What `chooseGoogleVenue` picks by default, as Google names it. */
const RESOLVED = 'Biblos Resort Alaçatı';

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
  resetDeckLabels();
});

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function chooseAGoogleVenue(phone: string): Promise<void> {
  await onboard('Deniz', phone);
  await chooseGoogleVenue();
  await settle();
}

describe('a venue whose name is deliberately not stored', () => {
  it('really does cache a card with the marker where its name would be', async () => {
    // The premise of every assertion below. Without this the suite could go
    // green on a fixture that quietly started storing names, which is the one
    // thing D-054 says must never happen.
    await chooseAGoogleVenue('+905551119001');

    const active = await getApi().getActiveHotel();
    const card = await getApi().getHotelById(active!.hotelId);
    expect(card?.provider).toBe('google');
    expect(card?.name).toBe(GOOGLE_NAME_PLACEHOLDER);
  });

  it('is named by the chip on a scoped tab, not marked by it', async () => {
    await chooseAGoogleVenue('+905551119002');

    await press(await screen.findByTestId('tab-Discovery'));
    const chip = await screen.findByTestId('venue-ribbon-name');
    expect(chip).toHaveTextContent(upperCase(RESOLVED));
    expect(chip).not.toHaveTextContent(upperCase(GOOGLE_NAME_PLACEHOLDER));
    expect(chip).not.toHaveTextContent(COPY.venue.nameUnavailable);
  });

  it('is named by the banner over the dates a stay is declared on', async () => {
    await chooseAGoogleVenue('+905551119003');

    await press(await screen.findByTestId('tab-Vacation'));
    await press(await screen.findByTestId('active-hotel-enter'));
    await press(await screen.findByTestId('open-upcoming'));
    await screen.findByTestId('screen-upcoming');
    await settle(120);

    const banner = await screen.findByTestId('upcoming-venue');
    expect(within(banner).getByText(RESOLVED)).toBeTruthy();
    expect(within(banner).queryByText(GOOGLE_NAME_PLACEHOLDER)).toBeNull();
  });

  it('never leaks the marker onto any screen the app has open', async () => {
    // The sweep the six by-hand answers needed and never had. Tabs stay
    // mounted, so walking the five leaves all five drawn at once — and the
    // marker is a string nobody may read on any of them.
    await chooseAGoogleVenue('+905551119004');

    for (const tab of ['Discovery', 'Nearby', 'Events', 'Inbox', 'Vacation']) {
      await press(await screen.findByTestId(`tab-${tab}`));
      await settle(120);
    }

    expect(screen.queryAllByText(GOOGLE_NAME_PLACEHOLDER, { exact: false })).toEqual([]);
    // And the sweep is only worth anything if the name really did arrive.
    expect(screen.getByTestId('active-hotel-name')).toHaveTextContent(RESOLVED);
  });
});
