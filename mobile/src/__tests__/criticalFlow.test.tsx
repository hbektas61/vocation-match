import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { COPY } from '../copy';
import { ApiError, FakeApi, getApi, setApi } from '../data';
import { onboard, signUpAndSignIn } from '../testSupport/onboarding';

// A fixed clock keeps session lifetimes and age math deterministic across runs.
const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Shared path: age gate → sign-up → email confirmation → sign-in → profile →
 * hotel activation. The confirmation step is not decoration: a project with
 * `enable_confirmations = true` returns no session from a sign-up, so this is
 * the real entry path and the one the app has to work on.
 */
async function onboardAndActivateHotel() {
  await onboard('Deniz');
  await fireEvent.press(await screen.findByTestId('activate-hotel-lara-shore'));
  expect(await screen.findByText(/Active hotel/)).toBeTruthy();
}

/** From the Rooms tab, opens Here Now and simulates an in-range check. */
async function checkInAtHotel() {
  await fireEvent.press(screen.getByText('Rooms'));
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

  it('keeps discovery closed until a room is opened', async () => {
    await onboardAndActivateHotel();

    await fireEvent.press(screen.getByText('Discovery'));
    expect(
      await screen.findByText(
        'Open a room first: declare an upcoming stay or run a presence check.',
      ),
    ).toBeTruthy();
  });
});

describe('rooms and hotel switching', () => {
  it('shows the server-decided reason a room is still closed', async () => {
    await onboardAndActivateHotel();

    await fireEvent.press(screen.getByText('Rooms'));
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
      await screen.findByText('Open — a recent check placed you within 500 m.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByText('Hotel'));
    await fireEvent.press(await screen.findByTestId('activate-hotel-bosphorus-garden'));
    await fireEvent.press(await screen.findByTestId('confirm-switch'));
    expect(await screen.findByText(/Switched hotels/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Rooms'));
    expect(
      await screen.findByText('Closed — run a presence check to enter.'),
    ).toBeTruthy();
  });

  it('closes a Here Now room on its own once it expires, without a navigation (R-003)', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();
    expect(
      await screen.findByText('Open — a recent check placed you within 500 m.'),
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

    // Force a fresh focus-triggered fetch so the mocked sequence is consumed.
    await fireEvent.press(screen.getByText('Hotel'));
    await fireEvent.press(screen.getByText('Rooms'));
    expect(
      await screen.findByText('Open — a recent check placed you within 500 m.'),
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
    expect(await screen.findByText('Deniz')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('unblock-cand-derya'));

    expect(await screen.findByText('You have not blocked anyone.')).toBeTruthy();
  });
});

describe('authentication and profile', () => {
  it('shows an error for a failed sign-in', async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('confirm-age'));

    await fireEvent.changeText(await screen.findByTestId('auth-email'), 'nobody@example.test');
    await fireEvent.changeText(screen.getByTestId('auth-password'), 'whatever1');
    await fireEvent.press(screen.getByTestId('auth-submit'));

    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
    // The user stays on the auth screen and can try again.
    expect(screen.getByTestId('screen-auth')).toBeTruthy();
  });

  it('waits for a confirmed email rather than signing a new account straight in', async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('confirm-age'));
    await fireEvent.press(await screen.findByTestId('auth-switch-mode'));
    await fireEvent.changeText(await screen.findByTestId('auth-email'), 'new@example.test');
    await fireEvent.changeText(screen.getByTestId('auth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('auth-submit'));

    // The bug this replaced: a sessionless sign-up was treated as an error, so
    // a correctly configured project failed on its own happy path.
    expect(await screen.findByTestId('screen-confirm-email')).toBeTruthy();
    expect(screen.queryByTestId('auth-error')).toBeNull();
    expect(await getApi().currentSession()).toBeNull();
  });

  it('tells someone who has not confirmed yet, instead of blaming their password', async () => {
    const api = getApi();
    await api.signUp('waiting@example.test', 'correct horse');

    await render(<App />);
    await fireEvent.press(await screen.findByTestId('confirm-age'));
    await fireEvent.changeText(await screen.findByTestId('auth-email'), 'waiting@example.test');
    await fireEvent.changeText(screen.getByTestId('auth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('auth-submit'));

    expect(await screen.findByTestId('screen-confirm-email')).toBeTruthy();
    expect(screen.getByTestId('confirm-resend')).toBeTruthy();
  });

  it('signs in once the address is confirmed', async () => {
    await signUpAndSignIn('confirmed@example.test');
    expect(await screen.findByTestId('screen-profile-setup')).toBeTruthy();
  });

  it('refuses an underage birthdate at profile setup with the 18+ message', async () => {
    await signUpAndSignIn('young@example.test');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Kid');
    const recentYear = new Date().getFullYear() - 5;
    await fireEvent.changeText(screen.getByTestId('profile-birthdate'), `${recentYear}-01-01`);
    await fireEvent.press(screen.getByTestId('save-profile'));

    expect(await screen.findByText('Vocation Match is 18+ only.')).toBeTruthy();
    expect(screen.getByTestId('screen-profile-setup')).toBeTruthy();
  });

  it('completes the whole entry path and reaches the main tabs', async () => {
    await onboard('Deniz', 'brandnew@example.test');
    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();
  });

  it('stops sharing on the server when location permission is denied', async () => {
    await onboardAndActivateHotel();
    await checkInAtHotel();

    // The room is open, and the server agrees it is open.
    expect(
      (await getApi().getRooms()).find((room) => room.room === 'HERE_NOW')?.eligible,
    ).toBe(true);

    await fireEvent.press(screen.getByText('Rooms'));
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

    expect(await screen.findByTestId('confirm-age')).toBeTruthy();
  });
});

/**
 * The confirmation screen is the one place a person can be stuck: they have not
 * confirmed, so they cannot sign in, and if the screen has no way out and no
 * way to try again they are simply stopped. These are the three exits.
 */
describe('waiting for a confirmation email', () => {
  async function reachConfirmScreen(email = 'waiting@example.test') {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('confirm-age'));
    await fireEvent.press(await screen.findByTestId('auth-switch-mode'));
    await fireEvent.changeText(await screen.findByTestId('auth-email'), email);
    await fireEvent.changeText(screen.getByTestId('auth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    expect(await screen.findByTestId('screen-confirm-email')).toBeTruthy();
  }

  it('confirms the email was sent again', async () => {
    await reachConfirmScreen();

    await fireEvent.press(screen.getByTestId('confirm-resend'));

    expect(await screen.findByTestId('confirm-resent')).toBeTruthy();
    expect(screen.queryByTestId('confirm-error')).toBeNull();
  });

  it('says so when the resend fails, rather than looking like it worked', async () => {
    await reachConfirmScreen();
    (getApi() as FakeApi).failNextResendWith(
      new ApiError('RATE_LIMITED', 'You are doing that too often.'),
    );

    await fireEvent.press(screen.getByTestId('confirm-resend'));

    expect(await screen.findByTestId('confirm-error')).toBeTruthy();
    expect(screen.queryByTestId('confirm-resent')).toBeNull();
    // And the button is usable again rather than stuck on "Sending…".
    expect(screen.getByLabelText(COPY.confirmEmail.resendButton)).toBeTruthy();
  });

  it('lets someone go back and sign in instead', async () => {
    // The case that reaches this screen by accident: an existing, already
    // confirmed account tapping "create one". The server will not say the
    // address is taken — that would tell a stranger who has an account here —
    // so the way out has to be a button rather than an error message.
    await onboard('Already', 'already@example.test');
    await fireEvent.press(await screen.findByText('Settings'));
    await fireEvent.press(await screen.findByTestId('sign-out'));

    await fireEvent.press(await screen.findByTestId('confirm-age'));
    await fireEvent.press(await screen.findByTestId('auth-switch-mode'));
    await fireEvent.changeText(await screen.findByTestId('auth-email'), 'already@example.test');
    await fireEvent.changeText(screen.getByTestId('auth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    expect(await screen.findByTestId('screen-confirm-email')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('confirm-back'));
    expect(await screen.findByTestId('screen-auth')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('auth-email'), 'already@example.test');
    await fireEvent.changeText(screen.getByTestId('auth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    // Straight to the app: this account was complete all along.
    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();
  });
});
