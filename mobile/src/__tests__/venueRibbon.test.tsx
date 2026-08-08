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
 * Two promises, and both are the kind that rot quietly:
 *
 *  - an account with no venue yet is offered the thing it actually needs
 *    rather than an empty pill,
 *  - and naming it costs the server at most one question per session, however
 *    many tabs draw it. A ribbon on five screens that each asked would be five
 *    calls for one answer that cannot change while you are looking at it —
 *    the same meter-attached-to-a-gesture this file's sibling `venueLabels`
 *    exists to prevent.
 *
 * D-065 revised the third promise the original three made: the chip used to
 * be absent from Tatilim, on the theory that the venue was the whole screen
 * there rather than its context. The redesign draws it on every primary tab
 * including Tatilim, so that clause is now pinned the other way — see "appears
 * on Tatilim too" below.
 */
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { COPY, upperCase } from '../copy';
import { FakeApi, getApi, setApi } from '../data';
import { resetDeckLabels } from '../data/venueLabels';
import { press } from '../testSupport/interact';
import {
  activateHotel,
  chooseGoogleVenue,
  DEFAULT_PHONE,
  onboard,
  onboardWithHotel,
} from '../testSupport/onboarding';

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

  it('appears on Tatilim too (D-065), the same chip every other tab draws', async () => {
    // D-061 left it off Tatilim on the theory that the venue was already the
    // whole screen there. D-065's generated head draws it on every tab
    // instead — the owner's read was that the chip is chrome, not a
    // statement about what a screen is "about" — so this is the one clause
    // of D-061 the redesign revises rather than keeps.
    await onboardWithHotel('Deniz');

    await press(await screen.findByTestId('tab-Vacation'));
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
    expect(await screen.findByTestId('venue-ribbon')).toBeTruthy();
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

/**
 * Keşfet is the one screen whose scope its own user chooses, and the chip was
 * not listening. The owner's phone showed the selector saying "Demet Akalın"
 * with the hotel's name in the chip directly above it (2026-08-08) — the head
 * and the control under it naming two different places at once.
 *
 * Slice 4 had already settled the argument one screen over: a match made in an
 * event room does not wear the active hotel's name, because that would name a
 * place neither person was in together. This is the same rule on the head that
 * raises the question.
 */
describe('the chip on Keşfet names the room, not the hotel', () => {
  /** Declares for an event the ordinary way, and answers with its name. */
  async function joinAnEvent(): Promise<string> {
    const api = getApi();
    const found = await api.searchEvents(
      { kind: 'city', city: 'İstanbul', label: 'İstanbul' },
      'upcoming',
      'all',
    );
    if (found.kind !== 'ok') throw new Error('the fixture provider answered nothing');
    const opened = await api.openEvent(found.events[0].selectionToken);
    if (!opened) throw new Error('the event would not open');
    await act(async () => {
      await api.joinEventUpcoming(opened.selectionToken);
    });
    // The lease is what names an event, and it can lapse (D-056). Here it has
    // just been taken, so a nameless one means the fixture, not the rule.
    if (!opened.event.name) throw new Error('the fixture event arrived unnamed');
    return opened.event.name;
  }

  /**
   * An account holding both kinds of room at once, on a venue whose deck is
   * empty in the fixtures.
   *
   * The head is drawn above the *empty* deck — over a candidate the screen
   * shows the floating ring instead, which is where this contradiction could
   * never have been seen anyway. Kaş carries no fixture candidates, so both
   * rooms below reach the state that draws the chip, and the venue's own name
   * is on screen to be contradicted.
   */
  async function bothRooms(): Promise<{ venue: RegExp; event: string }> {
    await onboard('Deniz', DEFAULT_PHONE);
    await activateHotel('hotel-kas-blue');
    await act(async () => {
      // A declared stay is what opens TATİLDEN ÖNCE.
      await getApi().declareUpcomingStay('2026-08-12', '2026-08-17');
    });
    const event = await joinAnEvent();
    await press(await screen.findByTestId('tab-Discovery'));
    return { venue: /KAŞ BLUE BAY/i, event };
  }

  async function chooseRoom(room: string): Promise<void> {
    await press(await screen.findByTestId('discovery-context'));
    await press(await screen.findByTestId(`context-row-${room}`));
    await settle(120);
  }

  it('wears the event name in an event room, and never the vacation venue', async () => {
    const { venue, event } = await bothRooms();

    await chooseRoom('EVENT_UPCOMING');

    const chip = await screen.findByTestId('venue-ribbon-name');
    expect(chip).toHaveTextContent(upperCase(event));
    // The whole point: the venue's name is gone from the head while the deck
    // is drawn from an event.
    expect(chip).not.toHaveTextContent(venue);
    // And it still says what pressing it does — Etkinlikler now, not Tatilim.
    expect(screen.getByTestId('venue-ribbon').props.accessibilityLabel).toContain(
      COPY.events.tab,
    );
  });

  it('wears the venue in a vacation room, on the same account', async () => {
    // The negative control, and the same session: the override is per room,
    // not a latch. Without this the test above would also pass on a chip that
    // had simply stopped naming the venue on this screen at all.
    const { venue, event } = await bothRooms();

    await chooseRoom('EVENT_UPCOMING');
    expect(await screen.findByTestId('venue-ribbon-name')).not.toHaveTextContent(venue);

    await chooseRoom('UPCOMING');

    const chip = await screen.findByTestId('venue-ribbon-name');
    expect(chip).toHaveTextContent(venue);
    expect(chip).not.toHaveTextContent(upperCase(event));
  });
});
