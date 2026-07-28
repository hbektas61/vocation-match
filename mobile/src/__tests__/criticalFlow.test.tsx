import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { COPY } from '../copy';
import { ApiError, FakeApi, getApi, setApi } from '../data';
import {
  authenticateWithPhone,
  onboardWithHotel,
  requestPhoneCode,
} from '../testSupport/onboarding';

// A fixed clock keeps session lifetimes and age math deterministic across runs.
const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Shared path: the whole onboarding wizard, which now ends at the hotel rather
 * than dropping someone into the app to find it themselves. Phone OTP is the
 * only way into the account, whether it already exists or is new.
 */
async function onboardAndActivateHotel() {
  await onboardWithHotel('Deniz');
  expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
}

/** From the Rooms tab, opens Here Now and simulates an in-range check. */
async function checkInAtHotel() {
  await fireEvent.press(screen.getByTestId('tab-Vacation'));
  await fireEvent.press(await screen.findByTestId('open-here-now'));
  await fireEvent.press(await screen.findByTestId('simulate-near'));
  expect(await screen.findByText(/You are in/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('here-now-done'));
}

/**
 * Critical happy path: onboarding → hotel activation → Here Now presence →
 * discovery swipe → mutual match → chat. Everything runs on the in-memory
 * `FakeApi`; the presence check is simulated.
 */
describe('critical flow', () => {
  it('walks from age gate to a mutual match and a real conversation', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();

    // Discovery: Derya already likes the tester (fixture), so a like matches.
    await fireEvent.press(await screen.findByText('Discovery'));
    expect(await screen.findByTestId('candidate-cand-derya')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('swipe-like'));
    expect(await screen.findByText("It's a match!")).toBeTruthy();

    // Chat: the message really goes through sendMessage/getMessages — the
    // in-memory API never fabricates a reply from the other person.
    await fireEvent.press(screen.getByTestId('match-open-chat'));
    await fireEvent.changeText(await screen.findByTestId('chat-input'), 'Merhaba!');
    await fireEvent.press(screen.getByTestId('chat-send'));
    expect(await screen.findByText('Merhaba!')).toBeTruthy();

    // The same message is what the conversation and the inbox preview show —
    // both read straight from the API, with nothing invented in between.
    const [summary] = await getApi().getMatches();
    expect(summary.lastMessageBody).toBe('Merhaba!');
    await expect(getApi().getMessages(summary.matchId)).resolves.toEqual([
      expect.objectContaining({ body: 'Merhaba!' }),
    ]);

  });

  it('can report and block from the discovery deck before any match exists', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();

    await fireEvent.press(await screen.findByText('Discovery'));
    expect(await screen.findByTestId('candidate-cand-derya')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('discovery-report-block'));
    await fireEvent.press(await screen.findByTestId('block-start'));
    await fireEvent.press(await screen.findByTestId('block-confirm'));

    // Back on the deck: the blocked person is gone, the next candidate shows.
    await fireEvent.press(await screen.findByText('Discovery'));
    expect(await screen.findByTestId('candidate-cand-mert')).toBeTruthy();
    expect(screen.queryByTestId('candidate-cand-derya')).toBeNull();
  });

  it('keeps discovery closed until a room is opened, and offers both ways in', async () => {
    await onboardAndActivateHotel();

    await fireEvent.press(screen.getByText('Discovery'));
    // The pre-room orbit screen (owner's designer, 2026-07-27): no deck, a
    // named reason, and the two doors out of the state — rooms, or a
    // proximity check right here.
    expect(await screen.findByTestId('discovery-no-room')).toBeTruthy();
    expect(screen.getByText("You haven't entered a room yet")).toBeTruthy();
    expect(screen.getByTestId('discovery-go-rooms')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('discovery-check-proximity'));
    expect(await screen.findByTestId('simulate-near')).toBeTruthy();
  });
});

describe('rooms and hotel switching', () => {
  it('shows the server-decided reason a room is still closed', async () => {
    await onboardAndActivateHotel();

    await fireEvent.press(screen.getByTestId('tab-Vacation'));
    expect(
      await screen.findByText('Closed — declare your stay dates to enter.'),
    ).toBeTruthy();
    expect(
      await screen.findByText('Closed — run a presence check to enter.'),
    ).toBeTruthy();
  });

  it('switching hotels closes Here Now at the previous hotel (D-004)', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();
    expect(
      await screen.findByText('Open — a recent check found you at the hotel.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tab-Vacation'));
    // The search box still holds what the first hotel was found with, and the
    // list only ever shows what the query returned.
    await fireEvent.changeText(await screen.findByTestId('hotel-search'), 'bosphorus');
    await fireEvent.press(await screen.findByTestId('activate-hotel-bosphorus-garden'));
    await fireEvent.press(await screen.findByTestId('confirm-switch'));

    // Choosing lands on the rooms now, where the consequence of the switch
    // is visible as the state itself: the new hotel's Here Now is closed.
    expect(
      await screen.findByText('Closed — run a presence check to enter.'),
    ).toBeTruthy();
  });

  it('closes a Here Now room on its own once it expires, without a navigation (R-003)', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();
    expect(
      await screen.findByText('Open — a recent check found you at the hotel.'),
    ).toBeTruthy();

    // Replace the next two `getRooms` answers with one that expires in
    // ~200 real ms, then the server's own closed answer — proving the
    // screen schedules and honours its own refresh at `validUntil` rather
    // than waiting for the user to navigate away and back.
    const rooms = await getApi().getRooms();
    const upcoming = rooms.find((r) => r.room === 'UPCOMING')!;
    jest
      .spyOn(getApi(), 'getRooms')
      .mockResolvedValueOnce([
        upcoming,
        { room: 'HERE_NOW', eligible: true, reason: 'ELIGIBLE', validUntil: Date.now() + 200 },
      ])
      .mockResolvedValueOnce([
        upcoming,
        { room: 'HERE_NOW', eligible: false, reason: 'NO_RECENT_CHECK', validUntil: null },
      ]);

    // Force a fresh focus-triggered fetch so the mocked sequence is consumed:
    // hop to another tab and back.
    await fireEvent.press(screen.getByTestId('tab-Settings'));
    await fireEvent.press(screen.getByTestId('tab-Vacation'));
    expect(
      await screen.findByText('Open — a recent check found you at the hotel.'),
    ).toBeTruthy();

    expect(
      await screen.findByText('Closed — run a presence check to enter.'),
    ).toBeTruthy();
  });
});

describe('settings and blocking', () => {
  it('unblocks a person from the blocked list in Settings (R-002)', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();

    await fireEvent.press(await screen.findByText('Discovery'));
    expect(await screen.findByTestId('candidate-cand-derya')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('discovery-report-block'));
    await fireEvent.press(await screen.findByTestId('block-start'));
    await fireEvent.press(await screen.findByTestId('block-confirm'));

    await fireEvent.press(await screen.findByText('Settings'));
    expect(await screen.findByText(/^Deniz, \d+$/)).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('unblock-cand-derya'));

    expect(await screen.findByText('You have not blocked anyone.')).toBeTruthy();
  });
});

/**
 * A row in the inbox is one `Pressable`, and React Native collapses everything
 * inside an accessible view into that view's label. So the message preview and
 * the closed-conversation caption are read only if the label names them —
 * otherwise every row in the inbox sounds identical apart from the person's
 * name, while a sighted user sees three different things.
 */
describe('the inbox for someone who cannot see it', () => {
  it('names the person, the preview, and what the row does', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();
    await fireEvent.press(await screen.findByText('Discovery'));
    await fireEvent.press(await screen.findByTestId('swipe-like'));
    await fireEvent.press(await screen.findByTestId('match-keep-browsing'));

    await fireEvent.press(await screen.findByText('Inbox'));
    const [summary] = await getApi().getMatches();

    // A match with no conversation yet lives in the new-matches strip: a face,
    // the name, and the invitation — that is the whole of what the item does,
    // and the label says all of it.
    const fresh = await screen.findByTestId(`inbox-${summary.matchId}`);
    expect(fresh.props.accessibilityLabel).toContain('Derya');
    expect(fresh.props.accessibilityLabel).toContain(COPY.inbox.sayHello);

    // Once there are words, it becomes a conversation row, and the label has
    // to carry the preview a sighted person sees. The message goes through the
    // API so the tab bar stays reachable; a focus round-trip refreshes the list.
    await getApi().sendMessage(summary.matchId, 'Hi!');
    await fireEvent.press(screen.getByText('Discovery'));
    await fireEvent.press(await screen.findByText('Inbox'));

    // Wait for the refreshed list — the strip item and the row share the
    // match's testID, and querying mid-refresh can hand back the node that is
    // being unmounted.
    await screen.findByText('Hi!');
    const row = screen.getByTestId(`inbox-${summary.matchId}`);
    expect(row.props.accessibilityLabel).toContain('Derya');
    expect(row.props.accessibilityLabel).toContain('Hi!');
    expect(row.props.accessibilityLabel).toContain('Open chat');
  });
});

describe('authentication and profile', () => {
  it('offers code entry when an SMS response is lost after an uncertain request', async () => {
    (getApi() as FakeApi).failNextOtpRequestWith(
      new ApiError('NETWORK', 'No connection. Try again.'),
    );
    render(<App />);

    await fireEvent.press(await screen.findByTestId('welcome-phone'));
    await fireEvent.press(await screen.findByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('auth-phone'), '+90 555 111 00 11');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByTestId('screen-onboarding-otp')).toBeTruthy();
    expect(screen.getByText(COPY.phoneAuth.requestUncertain)).toBeTruthy();
    expect(await getApi().currentSession()).toBeNull();
  });

  it('does not open a session until the SMS code is confirmed', async () => {
    render(<App />);
    await requestPhoneCode('+905551110012');

    expect(await screen.findByTestId('screen-onboarding-otp')).toBeTruthy();
    expect(screen.queryByTestId('otp-error')).toBeNull();
    expect(await getApi().currentSession()).toBeNull();
  });

  it('rejects an incorrect SMS code without leaving the code step', async () => {
    render(<App />);
    await requestPhoneCode('+905551110013');
    await fireEvent.changeText(await screen.findByTestId('auth-otp'), '000000');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByText(COPY.errors.otpInvalid)).toBeTruthy();
    expect(screen.getByTestId('screen-onboarding-otp')).toBeTruthy();
  });

  it('signs in once the SMS code is confirmed', async () => {
    await authenticateWithPhone('+905551110014');
    expect(await screen.findByTestId('screen-onboarding-name')).toBeTruthy();
  });

  it('keeps a valid OTP session when profile hydration fails, then retries it', async () => {
    const api = getApi();
    const profile = jest.spyOn(api, 'getOwnProfile').mockRejectedValue(new Error('fetch failed'));
    render(<App />);
    await requestPhoneCode('+905551110024');
    await fireEvent.changeText(await screen.findByTestId('auth-otp'), '123456');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByTestId('screen-account-load-error')).toBeTruthy();
    expect(await api.currentSession()).not.toBeNull();

    profile.mockRestore();
    await fireEvent.press(screen.getByTestId('account-load-retry'));
    expect(await screen.findByTestId('screen-onboarding-name')).toBeTruthy();
  });

  it('keeps a returning session when active-hotel hydration fails, then retries it', async () => {
    const phone = '+905551110025';
    await onboardWithHotel('Already', phone);
    await fireEvent.press(await screen.findByText('Settings'));
    await fireEvent.press(await screen.findByTestId('sign-out'));

    const api = getApi();
    const hotel = jest.spyOn(api, 'getActiveHotel').mockRejectedValue(new Error('fetch failed'));
    await requestPhoneCode(phone);
    await fireEvent.changeText(await screen.findByTestId('auth-otp'), '123456');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByTestId('screen-account-load-error')).toBeTruthy();
    expect(await api.currentSession()).not.toBeNull();

    hotel.mockRestore();
    await fireEvent.press(screen.getByTestId('account-load-retry'));
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });

  it('refuses an underage birthdate with the 18+ message', async () => {
    await authenticateWithPhone('+905551110015');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Kid');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    const recentYear = new Date().getFullYear() - 5;
    await fireEvent.changeText(
      await screen.findByTestId('profile-birthdate'),
      `01/01/${recentYear}`,
    );
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByText('Vacation Match is 18+ only.')).toBeTruthy();
    expect(screen.getByTestId('screen-onboarding-birthdate')).toBeTruthy();
  });

  it('completes the whole entry path and reaches the main tabs', async () => {
    await onboardWithHotel('Deniz', '+905551110016');
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });

  it('stops sharing on the server when location permission is denied', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();

    // The room is open, and the server agrees it is open.
    expect(
      (await getApi().getRooms()).find((room) => room.room === 'HERE_NOW')?.eligible,
    ).toBe(true);

    await fireEvent.press(screen.getByTestId('tab-Vacation'));
    await fireEvent.press(await screen.findByTestId('open-here-now'));
    await fireEvent.press(await screen.findByTestId('simulate-deny'));

    // Withdrawing consent has to reach the server. Asserting on the UI alone
    // would pass even if the stored answer stayed and kept the room open for
    // another thirty minutes.
    expect(
      (await getApi().getRooms()).find((room) => room.room === 'HERE_NOW'),
    ).toMatchObject({ eligible: false, reason: 'NO_RECENT_CHECK' });
  });

  it('signs out from settings and returns to onboarding', async () => {
    await onboardAndActivateHotel();

    await fireEvent.press(screen.getByText('Settings'));
    await fireEvent.press(await screen.findByTestId('sign-out'));

    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
  });
});

/**
 * The OTP screen is the one place a person can be stuck: the code may not
 * arrive, may expire, or may be typed incorrectly. These tests cover its ways
 * forward and back.
 */
describe('waiting for an SMS code', () => {
  async function reachOtpScreen(phone = '+905551110017') {
    render(<App />);
    await requestPhoneCode(phone);
    expect(await screen.findByTestId('screen-onboarding-otp')).toBeTruthy();
  }

  it('keeps resend disabled during the cooldown', async () => {
    const phone = '+905551110017';
    await reachOtpScreen(phone);

    expect(screen.getByTestId('otp-resend').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Send a new code in 60s')).toBeTruthy();
    expect(screen.queryByText(phone)).toBeNull();
    expect(screen.getByText(COPY.phoneAuth.destination('+••••••0017'))).toBeTruthy();
  });

  it('does not verify a code while a resend request is in flight', async () => {
    await reachOtpScreen('+905551110027');
    await fireEvent.changeText(screen.getByTestId('auth-otp'), '123456');

    const startedAt = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 61_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });

    let finishResend: (() => void) | undefined;
    jest.spyOn(getApi(), 'requestPhoneOtp').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishResend = resolve;
        }),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('otp-resend'));
    });

    expect(screen.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      finishResend?.();
      await Promise.resolve();
    });
  });

  it('says so when resend fails, rather than looking like it worked', async () => {
    await reachOtpScreen('+905551110018');
    const startedAt = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 61_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    (getApi() as FakeApi).failNextOtpRequestWith(
      new ApiError('RATE_LIMITED', 'You are doing that too often.'),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('otp-resend'));
    });

    expect(screen.getByTestId('otp-error')).toBeTruthy();
    expect(screen.queryByTestId('otp-resent')).toBeNull();
    expect(screen.getByTestId('otp-resend')).toBeTruthy();
  });

  it('starts a new cooldown when a resend response is lost', async () => {
    await reachOtpScreen('+905551110028');
    const startedAt = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 61_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    (getApi() as FakeApi).failNextOtpRequestWith(
      new ApiError('NETWORK', 'No connection. Try again.'),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('otp-resend'));
    });

    expect(screen.getByText(COPY.phoneAuth.requestUncertain)).toBeTruthy();
    expect(screen.getByTestId('otp-resend').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Send a new code in 60s')).toBeTruthy();
  });

  it('opens an existing account after the same phone completes OTP again', async () => {
    const phone = '+905551110019';
    await onboardWithHotel('Already', phone);
    await fireEvent.press(await screen.findByText('Settings'));
    await fireEvent.press(await screen.findByTestId('sign-out'));

    await requestPhoneCode(phone);
    await fireEvent.changeText(await screen.findByTestId('auth-otp'), '123456');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });

  it('goes back to the same phone number', async () => {
    const phone = '+905551110020';
    await reachOtpScreen(phone);

    await fireEvent.press(screen.getByLabelText(COPY.common.back));

    expect(await screen.findByTestId('screen-onboarding-phone')).toBeTruthy();
    // Same number, shown the way the field shows numbers: the country code is
    // the fixed prefix beside the box, and the rest is grouped as it is read.
    expect(screen.getByTestId('auth-phone').props.value).toBe('555 111 00 20');
    // Hidden from the screen reader on purpose — the field's accessible name
    // already says "Turkey, country code plus 90", and reading the glyphs
    // again would be the same fact twice.
    expect(
      screen.getByTestId('phone-prefix', { includeHiddenElements: true }),
    ).toHaveTextContent('+90');
  });

  it('does not request another SMS when back and forward happen during the cooldown', async () => {
    const request = jest.spyOn(getApi(), 'requestPhoneOtp');
    await reachOtpScreen('+905551110026');
    expect(request).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText(COPY.common.back));
    await fireEvent.press(await screen.findByTestId('onboarding-continue'));

    expect(await screen.findByTestId('screen-onboarding-otp')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
