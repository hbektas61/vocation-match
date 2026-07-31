/**
 * Two things a pilot with real people would have hit on the first day.
 *
 * Editing your profile: there was exactly one screen that wrote a profile, and
 * it only ever appeared when you did not have one. A name typed wrong during
 * onboarding was permanent, on a product where the name is most of what a
 * stranger has to go on.
 *
 * Your declared stay: you could re-declare dates, but never see what you had
 * declared, and never take it back. That last one was the asymmetry worth
 * fixing — a presence answer could already be withdrawn, and a declaration is
 * the same kind of statement about yourself.
 */
import { screen, waitFor } from '@testing-library/react-native';

import { COPY } from '../copy';
import { ApiError, FakeApi, getApi, setApi } from '../data';
import { onboardWithHotel, onboardToSettings } from '../testSupport/onboarding';
import { fire, press, typeText } from '../testSupport/interact';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

describe('editing a profile after onboarding', () => {
  it('opens prefilled with what is actually stored', async () => {
    await onboardToSettings('Deniz');
    await press(await screen.findByTestId('open-edit-profile'));

    const name = await screen.findByTestId('edit-profile-name');
    expect(name.props.value).toBe('Deniz');
    // The birthdate has to come from the server: the cached domain profile is
    // the shape other people see, and a form that prefilled an empty date and
    // saved it would be worse than no form.
    // The masked field holds bare digits and draws the separators beside
    // them. What the server holds is still ISO; this is the one place the
    // forms are allowed to differ.
    expect(screen.getByTestId('edit-profile-birthdate').props.value).toBe('01031994');
  });

  it('saves a corrected name and shows it everywhere', async () => {
    await onboardToSettings('Dneiz');
    await press(await screen.findByTestId('open-edit-profile'));

    await typeText(await screen.findByTestId('edit-profile-name'), 'Deniz');
    await typeText(screen.getByTestId('edit-profile-bio'), 'Swims at sunrise.');
    await press(screen.getByTestId('save-edit-profile'));

    await waitFor(async () => {
      expect((await getApi().getOwnProfile())?.displayName).toBe('Deniz');
    });
    // Back on Settings, reading from the store rather than from the form.
    expect(await screen.findByText(/^Deniz, \d+$/)).toBeTruthy();
    expect(screen.getByText('Swims at sunrise.')).toBeTruthy();
  });

  it('does not let an edit get round the 18+ rule', async () => {
    await onboardToSettings();
    await press(await screen.findByTestId('open-edit-profile'));

    const recentYear = new Date(FIXED).getFullYear() - 5;
    await typeText(
      await screen.findByTestId('edit-profile-birthdate'),
      `01/01/${recentYear}`,
    );
    await press(screen.getByTestId('save-edit-profile'));

    expect(await screen.findByText(COPY.profileSetup.underAge)).toBeTruthy();
    // Still on the edit screen, and nothing was written.
    expect(screen.getByTestId('screen-edit-profile')).toBeTruthy();
    expect((await getApi().getOwnProfile())?.birthdate).toBe('1994-03-01');
  });

  it('keeps the photo, which is managed on its own', async () => {
    await onboardToSettings();
    const api = getApi() as FakeApi;
    const withPhoto = await api.addProfilePhoto({
      uri: 'file:///tmp/pick.jpg',
      mimeType: 'image/jpeg',
    });

    await press(await screen.findByTestId('open-edit-profile'));
    await typeText(await screen.findByTestId('edit-profile-name'), 'Renamed');
    await press(screen.getByTestId('save-edit-profile'));

    await waitFor(async () => {
      expect((await api.getOwnProfile())?.displayName).toBe('Renamed');
    });
    expect((await api.getOwnProfile())?.photoPath).toBe(withPhoto[0].path);
  });
});

describe('the identity answers, after onboarding', () => {
  it('can be corrected later, including the one that decides your own feed', async () => {
    await onboardToSettings('Deniz');
    await press(await screen.findByTestId('open-edit-profile'));

    // Onboarding asks these once. Being wrong about yourself forever is not a
    // reasonable consequence of a mistap — and show_me in particular decides
    // whose cards you are shown, so getting it wrong with no way back leaves
    // somebody with an empty deck and no explanation.
    await press(await screen.findByTestId('edit-profile-gender-man'));
    await press(screen.getByTestId('edit-profile-show-gender'));
    await press(screen.getByTestId('edit-profile-orientation-queer'));
    await press(screen.getByTestId('edit-profile-show-me-men'));
    await press(screen.getByTestId('save-edit-profile'));

    await waitFor(async () => {
      const saved = await getApi().getOwnProfile();
      expect(saved?.gender).toBe('MAN');
      expect(saved?.showGender).toBe(true);
      expect(saved?.orientations).toEqual(['Queer']);
      expect(saved?.showMe).toBe('MEN');
    });
  });

  it('does not lose the completion mark when a profile is edited', async () => {
    await onboardToSettings('Deniz');
    const before = (await getApi().getOwnProfile())?.onboardingCompletedAt;
    await press(await screen.findByTestId('open-edit-profile'));

    await typeText(await screen.findByTestId('edit-profile-name'), 'Deniz A');
    await press(screen.getByTestId('save-edit-profile'));

    // An edit that quietly turned a finished profile back into a draft would
    // take somebody out of discovery without saying so.
    await waitFor(async () => {
      expect((await getApi().getOwnProfile())?.displayName).toBe('Deniz A');
    });
    expect((await getApi().getOwnProfile())?.onboardingCompletedAt).toBe(before);
  });
});

describe('the stay you declared', () => {
  async function openUpcoming() {
    await onboardWithHotel();
    await press(await screen.findByTestId('tab-Vacation'));
    await press(await screen.findByTestId('open-upcoming'));
  }


/**
 * Drives the native date picker the way a thumb would. The iOS wrapper
 * reads `nativeEvent.timestamp` and builds the (event, date) pair itself,
 * so the test speaks the native shape, not the public one.
 */
async function pickDate(testID: string, iso: string): Promise<void> {
  const picker = await screen.findByTestId(testID);
  const timestamp = new Date(`${iso}T12:00:00`).getTime();
  // `fire`, not a bare `await fireEvent(...)`: fireEvent is synchronous and
  // returns nothing awaitable, so that await was not a wait — it yielded one
  // microtask at the exact moment nothing was act-wrapped, which is where the
  // handler's continuation landed. The `press`/`typeText` sweep only covered
  // the two named events and left this generic one behind.
  await fire(picker, 'onChange', { nativeEvent: { timestamp, utcOffset: 0 } });
}

  it('starts empty, and offers no way to withdraw what does not exist', async () => {
    await openUpcoming();

    expect(await screen.findByTestId('upcoming-check-in')).toBeTruthy();
    expect(screen.queryByTestId('upcoming-withdraw')).toBeNull();
  });

  it('scopes the Upcoming deck to stays that cross yours (D-035)', async () => {
    await openUpcoming();
    await pickDate('upcoming-check-in', '2026-08-01');
    await pickDate('upcoming-check-out', '2026-08-08');
    await press(screen.getByTestId('save-upcoming'));
    await screen.findByTestId('open-upcoming');

    const deck = await getApi().getDiscoveryFeed('UPCOMING');
    const names = deck.map((c) => c.displayName);
    // Derya and Selin's windows cross the declared week; Nur is a December
    // person at the same hotel and must not appear in an August room.
    expect(names).toContain('Derya');
    expect(names).toContain('Selin');
    expect(names).not.toContain('Nur');

    // And the hotel card must know: it refreshes on focus now, because the
    // owner declared a stay elsewhere and came back to a card still calling
    // the room closed.
    await press(screen.getByTestId('tab-Vacation'));
    expect(await screen.findAllByText('Open')).toBeTruthy();
  });

  it('shows what you declared when you come back to it', async () => {
    await openUpcoming();
    await pickDate('upcoming-check-in', '2026-08-01');
    await pickDate('upcoming-check-out', '2026-08-08');
    await press(screen.getByTestId('save-upcoming'));
    // Q-001. The save is a round trip, and pressing "open" before it lands
    // reopens the screen against a backend that has nothing to prefill from —
    // which is why this failed intermittently under a loaded parallel run and
    // never in isolation. Wait for the state the screen will read, not for a
    // longer timeout on the element it will eventually draw.
    await waitFor(async () => expect(await getApi().getUpcomingStay()).not.toBeNull());
    // …and then for the card to have caught up. `vacation-discover-upcoming`
    // only exists once the room reads as open, so it is the marker that the
    // screen has settled. Pressing before it is what used to make this test
    // land in Discovery: the CTA's action changed under the press.
    await screen.findByTestId('vacation-discover-upcoming', {}, { timeout: 5000 });

    await press(await screen.findByTestId('open-upcoming'));

    // `upcoming-withdraw` renders only once the declaration has been loaded
    // into the screen, so it is the marker that the prefill has happened.
    // Asserting it first means the date assertions below can never read a
    // half-populated form.
    // A navigation plus the screen's own fetch of the declaration — not a
    // render tick, which is all `findBy`'s 1000 ms default is meant to cover.
    expect(await screen.findByTestId('upcoming-withdraw', {}, { timeout: 5000 })).toBeTruthy();

    // The dates come back, rather than the form opening blank and leaving
    // "update your stay" as a guess at what you had said.
    // The pickers carry dates now; the calendar day is what must match. The
    // host component exposes it as `date` (a timestamp or Date, by version).
    const dayOf = (raw: unknown) => new Date(raw as number).toISOString().slice(0, 10);
    expect(dayOf(screen.getByTestId('upcoming-check-in').props.date)).toBe('2026-08-01');
    expect(dayOf(screen.getByTestId('upcoming-check-out').props.date)).toBe('2026-08-08');
  }, 20000);

  it('can be withdrawn, and closes the room when it is', async () => {
    await openUpcoming();
    await pickDate('upcoming-check-in', '2026-08-01');
    await pickDate('upcoming-check-out', '2026-08-08');
    await press(screen.getByTestId('save-upcoming'));
    // Q-001, same race: the room only opens once the declaration is stored.
    await waitFor(async () => expect(await getApi().getUpcomingStay()).not.toBeNull());

    const rooms = await getApi().getRooms();
    expect(rooms.find((r) => r.room === 'UPCOMING')?.eligible).toBe(true);

    // Same settle: press the update action, not the CTA mid-flip.
    await screen.findByTestId('vacation-discover-upcoming', {}, { timeout: 5000 });
    await press(await screen.findByTestId('open-upcoming'));
    await press(await screen.findByTestId('upcoming-withdraw', {}, { timeout: 5000 }));

    await waitFor(async () => {
      expect(await getApi().getUpcomingStay()).toBeNull();
    });
    // Asserted against the server, not the screen: a withdrawal that only
    // changed local state would leave the room open for everyone else.
    const after = await getApi().getRooms();
    expect(after.find((r) => r.room === 'UPCOMING')).toMatchObject({
      eligible: false,
      reason: 'NO_DECLARATION',
    });
  }, 20000);
});

/**
 * A conversation whose match disappeared underneath it.
 *
 * Since H2 the other person can delete their account, and the cascade takes the
 * match and every message with it. The cached copy in the store keeps the
 * screen looking alive, so without this someone sits retyping into a
 * conversation that no longer exists and gets a generic failure each time.
 */
describe('a match that vanishes mid-conversation', () => {
  /** Onboard, open a room, match with the fixture who likes back, open chat. */
  async function reachChat() {
    await onboardWithHotel();
    await press(await screen.findByTestId('tab-Vacation'));
    await press(await screen.findByTestId('open-here-now'));
    await press(await screen.findByTestId('simulate-near'));
    await press(await screen.findByTestId('here-now-done'));
    await press(await screen.findByText('Discovery'));
    await press(await screen.findByTestId('swipe-like'));
    await press(await screen.findByTestId('match-open-chat'));
    expect(await screen.findByTestId('chat-input')).toBeTruthy();
  }

  it('falls back to "no longer available" instead of failing on every send', async () => {
    await reachChat();

    // The other side deletes their account: the match and its messages are
    // gone from the server, and only this device still believes in them.
    const api = getApi();
    jest.spyOn(api, 'sendMessage').mockRejectedValue(
      new ApiError('NOT_FOUND', 'That conversation is no longer available.'),
    );
    jest.spyOn(api, 'getMatches').mockResolvedValue([]);

    await typeText(screen.getByTestId('chat-input'), 'still there?');
    await press(screen.getByTestId('chat-send'));

    expect(await screen.findByText(COPY.chat.notAvailable)).toBeTruthy();
    expect(screen.queryByTestId('chat-input')).toBeNull();
    jest.restoreAllMocks();
  });

  it('ends the same way when the other person blocks, saying nothing about which it was', async () => {
    await reachChat();

    // A block answers FORBIDDEN on send, and `my_matches` stops returning the
    // match — so the screen lands exactly where a deleted account leads. That
    // is deliberate: nothing the blocked person sees may tell them which of the
    // two happened.
    const api = getApi();
    jest.spyOn(api, 'sendMessage').mockRejectedValue(
      new ApiError('FORBIDDEN', 'This conversation is closed.'),
    );
    jest.spyOn(api, 'getMatches').mockResolvedValue([]);

    await typeText(screen.getByTestId('chat-input'), 'hello?');
    await press(screen.getByTestId('chat-send'));

    expect(await screen.findByText(COPY.chat.notAvailable)).toBeTruthy();
    jest.restoreAllMocks();
  });

  it('stays put on an ordinary unmatch, where the history is still readable', async () => {
    await reachChat();
    const api = getApi();
    const [existing] = await api.getMatches();

    // The other difference FORBIDDEN can mean. Here the match still exists,
    // so the refresh keeps it and the closed notice is what shows.
    jest.spyOn(api, 'sendMessage').mockRejectedValue(
      new ApiError('FORBIDDEN', 'This conversation is closed.'),
    );
    jest
      .spyOn(api, 'getMatches')
      .mockResolvedValue([{ ...existing, unmatchedAt: Date.now() }]);

    await typeText(screen.getByTestId('chat-input'), 'hello?');
    await press(screen.getByTestId('chat-send'));

    expect(await screen.findByTestId('chat-closed')).toBeTruthy();
    expect(screen.queryByText(COPY.chat.notAvailable)).toBeNull();
    jest.restoreAllMocks();
  });

  it('notices a vanished match when unmatching too', async () => {
    await reachChat();
    const api = getApi();
    jest
      .spyOn(api, 'unmatch')
      .mockRejectedValue(new ApiError('NOT_FOUND', 'That match is not open.'));
    jest.spyOn(api, 'getMatches').mockResolvedValue([]);

    await press(screen.getByTestId('chat-menu'));
    await press(await screen.findByTestId('chat-unmatch'));
    await press(await screen.findByTestId('chat-unmatch-confirm'));

    expect(await screen.findByText(COPY.chat.notAvailable)).toBeTruthy();
    jest.restoreAllMocks();
  });

  it('does not unmatch on the first press', async () => {
    // R-014. Unmatching closes the conversation for both people and cannot be
    // undone from this screen, and the menu item sits directly above "Report or
    // block" — so it asks, the way blocking and leaving an event room already
    // did. It used to fire immediately.
    await reachChat();
    const api = getApi();
    const unmatch = jest.spyOn(api, 'unmatch');

    await press(screen.getByTestId('chat-menu'));
    await press(await screen.findByTestId('chat-unmatch'));

    expect(unmatch).not.toHaveBeenCalled();
    expect(await screen.findByText(COPY.chat.unmatchConfirm)).toBeTruthy();

    // And backing out leaves the conversation exactly as it was.
    await press(screen.getByTestId('chat-unmatch-cancel'));
    expect(unmatch).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-unmatch')).toBeTruthy();
    jest.restoreAllMocks();
  });

  it('keeps the conversation when the refresh itself fails', async () => {
    await reachChat();

    const api = getApi();
    jest.spyOn(api, 'sendMessage').mockRejectedValue(new ApiError('NETWORK', 'No connection.'));
    jest.spyOn(api, 'getMatches').mockRejectedValue(new Error('fetch failed'));

    await typeText(screen.getByTestId('chat-input'), 'hello?');
    await press(screen.getByTestId('chat-send'));

    // A dropped connection is not evidence the match is gone. Throwing someone
    // out of a conversation for one would be worse than the stale copy.
    expect(await screen.findByTestId('chat-send-error')).toBeTruthy();
    expect(screen.getByTestId('chat-input')).toBeTruthy();
    jest.restoreAllMocks();
  });
});
