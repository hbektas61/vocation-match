/**
 * D-061 — what replaced the tab titles.
 *
 * Taking "Çevremde" and "Tatilim" off the page left a row with a profile ring
 * hanging in it (owner, 2026-08-07). What went in its place is the fact the
 * word was standing on: **which vacation venue this screen is scoped to**.
 * Keşfet, Etkinlikler, Çevremde and Mesajlar answer entirely in terms of that
 * venue, and until now not one of them said which venue it was — you had to
 * open Tatilim and remember.
 *
 * Three promises, and all three are the kind that rot quietly:
 *
 *  - the venue is named on the screens it scopes, and *not* on Tatilim, where
 *    the venue is the subject rather than the context,
 *  - an account with no venue yet is offered the thing it actually needs
 *    rather than an empty pill,
 *  - and naming it costs the server at most one question per session, however
 *    many tabs draw it. A ribbon on five screens that each asked would be five
 *    calls for one answer that cannot change while you are looking at it —
 *    the same meter-attached-to-a-gesture this file's sibling `venueLabels`
 *    exists to prevent.
 */
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { COPY } from '../copy';
import { FakeApi, getApi, setApi } from '../data';
import { resetDeckLabels } from '../data/venueLabels';
import { press } from '../testSupport/interact';
import { chooseGoogleVenue, onboard, onboardWithHotel } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
  resetDeckLabels();
});

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('the venue in the head of every screen it scopes', () => {
  it('names the venue on a scoped tab, and goes there when pressed', async () => {
    await onboardWithHotel('Deniz');

    await press(await screen.findByTestId('tab-Discovery'));
    expect(await screen.findByTestId('venue-ribbon')).toBeTruthy();
    // The name itself, not a label about a name.
    expect(screen.getByTestId('venue-ribbon-name')).not.toHaveTextContent(
      COPY.common.loading,
    );

    await press(screen.getByTestId('venue-ribbon'));
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });

  it('is absent from Tatilim, where the venue is the screen', async () => {
    await onboardWithHotel('Deniz');

    await press(await screen.findByTestId('tab-Vacation'));
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
    expect(screen.queryByTestId('venue-ribbon')).toBeNull();
  });

  it('offers the way to choose one when no venue is set', async () => {
    // Not an empty pill and not a blank corner: the account's next real step.
    await onboard('Deniz', '+905551117044');
    await settle();

    await press(await screen.findByTestId('tab-Nearby'));
    expect(await screen.findByTestId('venue-ribbon-empty')).toBeTruthy();
    expect(screen.queryByTestId('venue-ribbon')).toBeNull();

    await press(screen.getByTestId('venue-ribbon-empty'));
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });

  it('asks the server which venue it is at most once, across every tab', async () => {
    // A Google venue is the expensive case: the name is deliberately not
    // stored (D-054), so it has to be resolved live — which is exactly why the
    // read is shared rather than repeated per screen.
    render(<App />);
    await onboard('Deniz', '+905551117045');
    await chooseGoogleVenue();
    await settle();

    // Cleared first, and the counts asserted *exactly*. `<= 1` would also pass
    // on a ribbon that never resolved anything at all, which is the failure
    // this test would most want to catch.
    resetDeckLabels();
    const api = getApi();
    const active = jest.spyOn(api, 'getActiveVenue');
    const resolve = jest.spyOn(api, 'resolveGooglePlace');

    for (const tab of ['Discovery', 'Events', 'Nearby', 'Inbox', 'Discovery']) {
      await press(await screen.findByTestId(`tab-${tab}`));
      await settle(120);
    }

    // A real name arrived, so one question was genuinely asked and answered…
    const name = await screen.findByTestId('venue-ribbon-name');
    expect(name).not.toHaveTextContent(COPY.common.loading);
    expect(name).not.toHaveTextContent(COPY.venue.nameUnavailable);
    // …and five screens drawing it did not turn into five questions.
    expect(active).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
