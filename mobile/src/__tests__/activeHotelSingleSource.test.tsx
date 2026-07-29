/**
 * The bug this pins (owner, 2026-07-29): a returning account with a chosen
 * hotel opened as "no hotel chosen" — the trip tab keyed its answer off the
 * cached hotel card rather than the id the server remembers, and the card
 * only ever arrived from a search that cannot be trusted to contain it.
 * Discovery meanwhile pitched its no-hotel screen while the account was
 * still being hydrated.
 *
 * The store now resolves the card by id at hydration, and every screen
 * answers "is a hotel chosen" from the id alone. Loading is loading — never
 * "no hotel".
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { COPY } from '../copy';
import { FakeApi, getApi, setApi } from '../data';
import { activateHotel, onboard } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

it('a relaunch with a chosen hotel never reads as "no hotel", even when search finds nothing', async () => {
  setApi(new FakeApi({ now: () => FIXED }));
  const view = await onboard('Deniz', '+905551117031');
  await activateHotel();
  await settle();
  view.unmount();

  // Staging's thin catalogue: a search may well not contain the active
  // hotel. Only the by-id read is allowed to be the answer.
  const api = getApi();
  const search = jest.spyOn(api, 'searchHotels').mockResolvedValue([]);

  render(<App />);
  await settle(600);

  // The trip tab: the chosen hotel's card, never the "choose one" invitation.
  expect(await screen.findByTestId('active-hotel-card')).toBeTruthy();
  expect(screen.queryByTestId('hotel-empty-state')).toBeNull();

  // Discovery: the deck (or its empty room) — never the no-hotel pitch.
  await act(async () => {
    fireEvent.press(await screen.findByTestId('tab-Discovery'));
  });
  await settle(600);
  expect(screen.queryByText(COPY.discovery.noHotelTitle)).toBeNull();

  search.mockRestore();
});
