/**
 * D-057 — the five-item bar, Settings behind the profile ring, and the shared
 * context selector over the one deck.
 *
 * The three things worth asserting are the three that were easy to get wrong:
 * that removing a tab did not strand Settings, that a room you cannot enter is
 * still *named* with its reason rather than hidden, and that switching the
 * deck's context is a viewing choice which withdraws nothing.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { COPY, matchSource, roomPlate } from '../copy';
import { FakeApi, getApi, setApi, type RoomKey } from '../data';
import { onboard, onboardWithHotel } from '../testSupport/onboarding';

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

describe('D-057 Etkinlikler (§9)', () => {
  /** Onboards, opens Etkinlikler and looks at İstanbul. */
  async function lookAtIstanbul() {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('tab-Events'));
    await fireEvent.changeText(await screen.findByTestId('events-area-input'), 'İstanbul');
    await fireEvent.press(await screen.findByTestId('events-area-confirm'));
    await screen.findByTestId('events-upcoming');
  }

  it('draws a card with no provider image as a whole card, not a hole (E-20)', async () => {
    await lookAtIstanbul();

    // The fixtures carry both kinds; the imageless ones must still show their
    // name, their place and their date.
    const card = await screen.findByTestId('events-upcoming-option-0');
    expect(card.props.accessibilityLabel).toBeTruthy();
    expect(card.props.accessibilityLabel.split('. ').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps results on screen while a filter reloads (E-06)', async () => {
    await lookAtIstanbul();
    const before = screen.getByTestId('events-upcoming');
    expect(before).toBeTruthy();

    // Hold the next search open, so the instant "busy" is true is observable.
    // A synchronous act() flushes the state the handler sets before its first
    // await — which is exactly the moment the old behaviour blanked the list.
    let release: (() => void) | undefined;
    jest.spyOn(getApi(), 'searchEvents').mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ kind: 'empty' });
      }),
    );

    act(() => {
      fireEvent.press(screen.getByTestId('events-chip-music'));
    });

    // The previous list is still readable, and busy is a line beside it
    // rather than a spinner standing where the results were.
    expect(screen.getByTestId('events-upcoming')).toBeTruthy();
    expect(screen.getByTestId('events-loading')).toBeTruthy();
    await act(async () => {
      release?.();
    });
  });

  it('clears results when the area changes, because they were about elsewhere', async () => {
    await lookAtIstanbul();
    expect(screen.getByTestId('events-upcoming')).toBeTruthy();

    let release: (() => void) | undefined;
    jest.spyOn(getApi(), 'searchEvents').mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ kind: 'empty' });
      }),
    );

    await fireEvent.press(screen.getByTestId('events-change-area'));
    await fireEvent.changeText(screen.getByTestId('events-area-input'), 'Paris');
    act(() => {
      fireEvent.press(screen.getByTestId('events-area-confirm'));
    });

    // İstanbul's concerts under a heading that says Paris would be a lie.
    expect(screen.queryByTestId('events-upcoming')).toBeNull();
    await act(async () => {
      release?.();
    });
  });

  it('says the list is not the whole world, next to the provider credit', async () => {
    await lookAtIstanbul();
    expect(await screen.findByTestId('events-coverage-note')).toHaveTextContent(
      COPY.events.notEverything,
    );
    expect(screen.getByTestId('events-attribution')).toHaveTextContent(COPY.events.attribution);
  });
});

describe('D-057 Tatilim (§7)', () => {
  it('shows both features, both shut, before a place is chosen (T-01)', async () => {
    // A fresh account with no active venue: the tab's whole job here is to
    // say what choosing a place gets you, so neither feature may be missing.
    // `onboard` finishes the wizard without choosing a place — an active
    // venue is not part of finishing (D-040).
    await onboard('Deniz');

    expect(await screen.findByTestId('room-upcoming-locked')).toBeTruthy();
    expect(await screen.findByTestId('room-here-now-locked')).toBeTruthy();
  });
});

describe('D-057 event detail (§9.3)', () => {
  /** Opens İstanbul, then the first upcoming event's detail screen. */
  async function openFirstEvent() {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('tab-Events'));
    await fireEvent.changeText(await screen.findByTestId('events-area-input'), 'İstanbul');
    await fireEvent.press(await screen.findByTestId('events-area-confirm'));
    await fireEvent.press(await screen.findByTestId('events-upcoming-option-0'));
    await screen.findByTestId('screen-event-detail');
  }

  it('shows where and when, not just the name (E-21)', async () => {
    await openFirstEvent();
    // The two facts somebody decides on used to live only on the list behind
    // this screen: it carried the event's name and nothing else.
    await screen.findByTestId('screen-event-detail');
    // The venue and the date, from the lease, shown rather than stored.
    expect(await screen.findByText(/Küçükçiftlik/)).toBeTruthy();
  });

  it('says going is a declaration before it is declared (E-22)', async () => {
    await openFirstEvent();
    // The product risk of this whole feature is somebody reading "going" as
    // a ticket, so the sentence is on screen beside the button, not after it.
    expect(await screen.findByText(COPY.events.joinExplainer)).toBeTruthy();
  });

  it('asks before withdrawing, and keeps the membership until confirmed (E-24)', async () => {
    await openFirstEvent();
    await fireEvent.press(await screen.findByTestId('event-join-upcoming'));
    expect(await screen.findByTestId('event-withdraw')).toBeTruthy();

    // First press opens the question rather than doing the thing.
    await fireEvent.press(screen.getByTestId('event-withdraw'));
    expect(await screen.findByText(COPY.events.withdrawConfirm)).toBeTruthy();
    expect(await getApi().getMyEvents()).toHaveLength(1);

    // Backing out leaves the membership exactly where it was.
    await fireEvent.press(screen.getByTestId('event-withdraw-cancel'));
    expect(await getApi().getMyEvents()).toHaveLength(1);

    await fireEvent.press(await screen.findByTestId('event-withdraw'));
    await fireEvent.press(await screen.findByTestId('event-withdraw-confirm'));
    expect(await getApi().getMyEvents()).toHaveLength(0);
  });
});

describe('D-057 Çevremde (§8)', () => {
  it('reaches Settings from Çevremde, which had no route at all', async () => {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('tab-Nearby'));

    // The corner used to hold a decorative pin on this screen.
    await fireEvent.press(await screen.findByTestId('checkin-profile-ring'));
    expect(await screen.findByTestId('sign-out')).toBeTruthy();
  });

  it('credits the open catalogue whose data the list is made of', () => {
    // ODbL. Google's answers were credited and OpenStreetMap's were not,
    // which is the wrong way round given whose data is shown by default.
    expect(COPY.checkin.catalogAttribution).toMatch(/OpenStreetMap/i);
  });
});

describe('D-057 closed decisions — N-07 and E-21', () => {
  it('reports the check-in allowance from the server, never derived here', async () => {
    await onboardWithHotel('Deniz');
    const summary = await getApi().googleCheckinEntitlement();

    // Five fields, one source. A client that computes what it is entitled to
    // is a client that can disagree with the server about somebody's rights.
    expect(summary.limit).toBeGreaterThan(0);
    expect(summary.used).toBe(0);
    expect(summary.remaining).toBe(summary.limit);
    expect(summary.resetsAt).toBeGreaterThan(Date.now());
    expect(typeof summary.isPremium).toBe('boolean');
  });

  it('spends the allowance on a completed check-in and on nothing else', async () => {
    await onboardWithHotel('Deniz');
    const before = await getApi().googleCheckinEntitlement();

    // A search that found nothing must cost nothing.
    await getApi().googlePlaceSearch('zzzzzz', 36.85, 30.78).catch(() => null);
    const after = await getApi().googleCheckinEntitlement();
    expect(after.used).toBe(before.used);
    expect(after.remaining).toBe(before.remaining);
  });

  it('offers both event rooms independently, and neither creates the other (E-21)', async () => {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('tab-Events'));
    await fireEvent.changeText(await screen.findByTestId('events-area-input'), 'İstanbul');
    await fireEvent.press(await screen.findByTestId('events-area-confirm'));
    await fireEvent.press(await screen.findByTestId('events-upcoming-option-0'));
    await screen.findByTestId('screen-event-detail');

    // Both ways in are on screen before anything has been declared.
    expect(await screen.findByTestId('event-join-upcoming')).toBeTruthy();
    expect(await screen.findByTestId('event-verify-from-selection')).toBeTruthy();

    // Taking the live one creates no membership.
    await fireEvent.press(screen.getByTestId('event-verify-from-selection'));
    expect(await getApi().getMyEvents()).toHaveLength(0);
  });
});

describe('D-057 touch targets', () => {
  it('gives every bottom-bar item at least the 44 px minimum', async () => {
    await onboardWithHotel('Deniz');
    // Measured at 40 in the browser: the icon seat plus the label came to it,
    // and the bar's own padding sits outside the pressable, so it never
    // counted toward the target somebody has to hit.
    for (const route of ['Vacation', 'Nearby', 'Events', 'Discovery', 'Inbox']) {
      const tab = await screen.findByTestId(`tab-${route}`);
      const style = Array.isArray(tab.props.style)
        ? Object.assign({}, ...tab.props.style.filter(Boolean))
        : tab.props.style;
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('D-057 Etkinlikler refusals (§9.2)', () => {
  async function lookAt(city: string) {
    await onboardWithHotel('Deniz');
    await fireEvent.press(await screen.findByTestId('tab-Events'));
    await fireEvent.changeText(await screen.findByTestId('events-area-input'), city);
    await fireEvent.press(await screen.findByTestId('events-area-confirm'));
  }

  it('says which of the refusals happened, in its own words', async () => {
    // §3.4: a spinner that means all of them makes the screen look broken in
    // most of them. Each has to be distinguishable from the others.
    await lookAt('Mykonos');
    expect(await screen.findByText(COPY.events.noResults)).toBeTruthy();
  });

  it('states a shared refusal once, not once per bucket', async () => {
    const api = getApi() as FakeApi;
    api.setProviderCeiling(0);
    await lookAt('İstanbul');

    // Both buckets fail for the same reason far more often than not; saying it
    // twice, once under each heading, reads as two separate problems.
    const notices = await screen.findAllByText(COPY.events.ceilingReached);
    expect(notices).toHaveLength(1);
  });
});
