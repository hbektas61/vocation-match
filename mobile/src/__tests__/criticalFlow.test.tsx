import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { FakeApi, getApi, setApi } from '../data';

// A fixed clock keeps session lifetimes and age math deterministic across runs.
const FIXED = Date.parse('2026-07-25T10:00:00Z');
const ADULT_BIRTHDATE = '1994-03-01';

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Fills the auth form and submits it (create-account mode when `signUp`). */
async function submitAuth(email: string, password: string, { signUp }: { signUp: boolean }) {
  if (signUp) {
    await fireEvent.press(await screen.findByTestId('auth-switch-mode'));
  }
  await fireEvent.changeText(await screen.findByTestId('auth-email'), email);
  await fireEvent.changeText(screen.getByTestId('auth-password'), password);
  await fireEvent.press(screen.getByTestId('auth-submit'));
}

/** Shared path: age gate → real sign-up → real profile save → hotel activation. */
async function onboardAndActivateHotel() {
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('confirm-age'));
  await submitAuth('deniz@example.test', 'correct horse', { signUp: true });
  await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
  await fireEvent.changeText(screen.getByTestId('profile-birthdate'), ADULT_BIRTHDATE);
  await fireEvent.press(screen.getByTestId('save-profile'));
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

    await submitAuth('nobody@example.test', 'whatever1', { signUp: false });

    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
    // The user stays on the auth screen and can try again.
    expect(screen.getByTestId('screen-auth')).toBeTruthy();
  });

  it('refuses an underage birthdate at profile setup with the 18+ message', async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('confirm-age'));
    await submitAuth('young@example.test', 'correct horse', { signUp: true });

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Kid');
    const recentYear = new Date().getFullYear() - 5;
    await fireEvent.changeText(screen.getByTestId('profile-birthdate'), `${recentYear}-01-01`);
    await fireEvent.press(screen.getByTestId('save-profile'));

    expect(await screen.findByText('Vocation Match is 18+ only.')).toBeTruthy();
    expect(screen.getByTestId('screen-profile-setup')).toBeTruthy();
  });

  it('completes sign-up and profile save, reaching the main tabs', async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('confirm-age'));
    await submitAuth('brandnew@example.test', 'correct horse', { signUp: true });

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.changeText(screen.getByTestId('profile-birthdate'), ADULT_BIRTHDATE);
    await fireEvent.press(screen.getByTestId('save-profile'));

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
