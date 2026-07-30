/**
 * D-057 — the five-item bar, Settings behind the profile ring, and the shared
 * context selector over the one deck.
 *
 * The three things worth asserting are the three that were easy to get wrong:
 * that removing a tab did not strand Settings, that a room you cannot enter is
 * still *named* with its reason rather than hidden, and that switching the
 * deck's context is a viewing choice which withdraws nothing.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { COPY, matchSource, roomPlate } from '../copy';
import { FakeApi, getApi, setApi, type RoomKey } from '../data';
import { onboardWithHotel } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

/** Opens Here Now and passes the simulated in-range check. */
async function verifyAtHotel() {
  await fireEvent.press(await screen.findByTestId('tab-Vacation'));
  await fireEvent.press(await screen.findByTestId('open-here-now'));
  await fireEvent.press(await screen.findByTestId('simulate-near'));
  await fireEvent.press(await screen.findByTestId('here-now-done'));
}

describe('D-057 bottom navigation', () => {
  it('offers exactly the five primary destinations, and no Settings tab', async () => {
    await onboardWithHotel('Deniz');

    for (const route of ['Vacation', 'Nearby', 'Events', 'Discovery', 'Inbox']) {
      expect(await screen.findByTestId(`tab-${route}`)).toBeTruthy();
    }
    // The sixth destination is gone from the bar — not merely relabelled.
    expect(screen.queryByTestId('tab-Settings')).toBeNull();
  });

  it('labels the fifth tab "Messages" while the screen keeps its own heading', async () => {
    await onboardWithHotel('Deniz');

    const tab = await screen.findByTestId('tab-Inbox');
    expect(tab).toHaveTextContent(COPY.tabs.messages);

    await fireEvent.press(tab);
    // The heading is the longer word; only the tab label was shortened.
    expect(await screen.findByText(COPY.inbox.title)).toBeTruthy();
  });
});

describe('D-057 Settings behind the profile ring', () => {
  it.each([
    ['Vacation', 'hotel-profile-ring'],
    ['Discovery', 'discovery-profile-ring'],
    ['Events', 'events-profile-ring'],
    ['Inbox', 'inbox-profile-ring'],
  ])('reaches Settings from the %s tab in one press', async (tab, ring) => {
    await onboardWithHotel('Deniz');

    await fireEvent.press(await screen.findByTestId(`tab-${tab}`));
    await fireEvent.press(await screen.findByTestId(ring));

    expect(await screen.findByTestId('sign-out')).toBeTruthy();
  });

  it('names the ring for what it opens, not just for Settings', async () => {
    await onboardWithHotel('Deniz');
    const ring = await screen.findByTestId('hotel-profile-ring');
    // It is the only route to the profile as well, so "Settings" alone would
    // leave a screen-reader user unable to find their own photo.
    expect(ring.props.accessibilityLabel).toBe(COPY.settings.ringLabel);
  });

  it('keeps blocking, reporting and account deletion at the first level', async () => {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('hotel-profile-ring'));

    // Section labels are tracked uppercase, so the cards are found by id.
    expect(await screen.findByTestId('settings-blocked')).toBeTruthy();
    expect(await screen.findByTestId('delete-account')).toBeTruthy();
  });
});

describe('D-057 context selector', () => {
  it('names the room the deck is drawing and its time state', async () => {
    await onboardWithHotel('Deniz');
    await verifyAtHotel();
    await fireEvent.press(await screen.findByTestId('tab-Discovery'));

    const selector = await screen.findByTestId('discovery-context');
    // The room, in words. Never a distance and never a coordinate.
    expect(selector.props.accessibilityLabel).toContain(COPY.hereNow.roomTitle);
  });

  it('lists a room that is shut, with the reason, instead of hiding it', async () => {
    await onboardWithHotel('Deniz');
    await verifyAtHotel();
    await fireEvent.press(await screen.findByTestId('tab-Discovery'));
    await fireEvent.press(await screen.findByTestId('discovery-context'));

    // Upcoming is closed for an account that has declared no dates — and the
    // sheet says so rather than leaving the room off the list entirely.
    const shut = await screen.findByTestId('context-row-UPCOMING');
    expect(shut.props.accessibilityState.disabled).toBe(true);
    expect(shut.props.accessibilityLabel).toContain(COPY.roomReason.NO_DECLARATION);
  });

  it('switches the deck without withdrawing anything', async () => {
    await onboardWithHotel('Deniz');
    await verifyAtHotel();

    // Declare a stay too, so two rooms are open at once and switching is real.
    await getApi().declareUpcomingStay('2026-07-24', '2026-07-28');
    await fireEvent.press(await screen.findByTestId('tab-Inbox'));
    await fireEvent.press(await screen.findByTestId('tab-Discovery'));

    await fireEvent.press(await screen.findByTestId('discovery-context'));
    await fireEvent.press(await screen.findByTestId('context-row-UPCOMING'));

    const selector = await screen.findByTestId('discovery-context');
    expect(selector.props.accessibilityLabel).toContain(COPY.upcoming.roomTitle);

    // The membership the switch moved away from is untouched: the proximity
    // answer and the declared stay both still stand on the server.
    const rooms = await getApi().getRooms();
    expect(rooms.find((r) => r.room === 'HERE_NOW')?.eligible).toBe(true);
    expect(await getApi().getUpcomingStay()).not.toBeNull();
  });

  it('opens nothing when no room is eligible, and says why on the control', async () => {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('tab-Discovery'));

    const selector = await screen.findByTestId('discovery-context');
    expect(selector.props.accessibilityState.disabled).toBe(true);
    // Pressing a disabled control must not put a sheet over the screen.
    await fireEvent.press(selector);
    expect(screen.queryByTestId('discovery-context-sheet')).toBeNull();
  });
});

describe('D-057 match, inbox and chat source attribution', () => {
  const ROOMS: RoomKey[] = [
    'UPCOMING',
    'HERE_NOW',
    'NEARBY',
    'EVENT_UPCOMING',
    'EVENT_HERE_NOW',
  ];

  it('gives every room its own match sentence, and no two are the same', () => {
    const titles = ROOMS.map((room) => matchSource(room).title);
    expect(new Set(titles).size).toBe(ROOMS.length);
    expect(titles.every((t) => t.length > 0)).toBe(true);
  });

  it('never claims a hotel connection for an event or a check-in match', () => {
    for (const room of ['NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW'] as RoomKey[]) {
      const { title, body } = matchSource(room);
      expect(`${title} ${body}`).not.toMatch(/hotel|otel/i);
    }
  });

  it('never claims a ticket, and says so where a ticket would be assumed', () => {
    expect(matchSource('EVENT_UPCOMING').body).toMatch(/no ticket/i);
    expect(matchSource('EVENT_HERE_NOW').body).toMatch(/not a ticket check/i);
  });

  it('keeps the regional pool honest — near is not the same place', () => {
    expect(matchSource('NEARBY', { region: true }).title).not.toEqual(
      matchSource('NEARBY').title,
    );
    expect(matchSource('NEARBY', { region: true }).title).toMatch(/area/i);
  });

  it('names the source on every inbox row', async () => {
    await onboardWithHotel('Deniz');
    await verifyAtHotel();

    // Earn a real conversation: the deck, a mutual like, then a first message
    // so the match moves out of the new-matches strip and into a row.
    await fireEvent.press(await screen.findByTestId('tab-Discovery'));
    await fireEvent.press(await screen.findByTestId('swipe-like'));
    await fireEvent.press(await screen.findByTestId('match-keep-browsing'));
    const [summary] = await getApi().getMatches();
    await getApi().sendMessage(summary.matchId, 'Hi!');

    await fireEvent.press(await screen.findByTestId('tab-Inbox'));
    const source = await screen.findByTestId(`inbox-source-${summary.matchId}`);
    // The room this match came from — HERE_NOW here, but the row says it
    // whatever the room was, which is the point of one shared inbox.
    expect(source).toHaveTextContent(roomPlate(summary.room));
  });
});
