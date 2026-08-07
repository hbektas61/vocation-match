/**
 * The venue detail screen, as a room you can leave (R-016).
 *
 * For a Google venue this screen may show the name and the attribution and
 * nothing else — D-054 forbids storing Google's address, photograph, rating or
 * coordinate, so there is genuinely nothing else of ours to print. That part
 * was never the bug. The bug was that it went nowhere: a door in, no door out,
 * and half a screen of blank underneath.
 *
 * So what this file pins is the shape of the fix, and the boundary it must not
 * cross: the screen says *what this venue is to the account* and offers the two
 * things anybody would do about that, and it still asks Google for nothing new.
 */
import { screen } from '@testing-library/react-native';

import { COPY } from '../copy';
import { FakeApi, setApi } from '../data';
import { press } from '../testSupport/interact';
import { onboardWithHotel } from '../testSupport/onboarding';

beforeEach(() => {
  setApi(new FakeApi());
});

/** Onboards onto the pilot venue and opens its detail screen from the card. */
async function openVenueDetails(): Promise<void> {
  await onboardWithHotel('Deniz');
  await press(await screen.findByTestId('tab-Vacation'));
  await press(await screen.findByTestId('active-hotel-card'));
  expect(await screen.findByTestId('screen-hotel-details')).toBeTruthy();
}

describe('the venue detail screen', () => {
  it('says this is the venue the trip is built on', async () => {
    await openVenueDetails();

    expect(screen.getByTestId('hotel-details-status')).toBeTruthy();
    expect(screen.getByTestId('hotel-details-active')).toBeTruthy();
    expect(screen.getByText(COPY.hotel.activatedNote)).toBeTruthy();
    // The rule that makes "active" mean something: one at a time.
    expect(screen.getByText(COPY.trust.oneHotel)).toBeTruthy();
  });

  it('offers a way onward instead of only a way back', async () => {
    await openVenueDetails();

    const back = screen.getByTestId('hotel-details-back-to-plan');
    const change = screen.getByTestId('hotel-details-change-venue');
    // Named for where each one goes, not "OK" and "Cancel".
    expect(back.props.accessibilityLabel).toBe(COPY.hotel.backToPlan);
    expect(change.props.accessibilityLabel).toBe(COPY.hotel.switchButton);

    await press(back);
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });

  it('reaches the venue picker, and does not come back to a stale venue', async () => {
    await openVenueDetails();
    await press(screen.getByTestId('hotel-details-change-venue'));

    // The picker, reached through the route that already existed.
    // Reached as the gate rather than as the tab, which is the one place the
    // body still carries a way into the picker: the gate has no head action.
    expect(await screen.findByTestId('venue-open-picker')).toBeTruthy();
    // Detail was replaced rather than stacked under it, so nothing can hand
    // somebody back to the description of a venue they just left.
    expect(screen.queryByTestId('screen-hotel-details')).toBeNull();
  });

  it('keeps the attribution, which is a licence term and not decoration', async () => {
    await openVenueDetails();
    // The pilot venue is a catalogue one, so it carries OSM's credit; a Google
    // venue carries "Powered by Google" in the same seat. Either way the
    // credit survives the new furniture underneath it.
    expect(screen.getByText(COPY.hotel.attribution)).toBeTruthy();
  });
});
