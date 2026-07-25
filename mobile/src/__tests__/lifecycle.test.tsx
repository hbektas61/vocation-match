/**
 * H-405, H-406 — what happens when the app is not being looked at, and when the
 * network stops answering.
 *
 * Both failure modes look the same from the inside: a screen that appears to be
 * working and is not. A lapsed session leaves the tabs up with every request
 * failing; a request with no deadline leaves a button disabled forever. Neither
 * is visible in a test that only ever exercises the happy path.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { FakeApi, getApi, setApi } from '../data';
import { onboard, onboardToSettings } from '../testSupport/onboarding';

let clock = Date.parse('2026-07-25T10:00:00Z');
let foregroundListeners: ((state: string) => void)[];

beforeEach(() => {
  clock = Date.parse('2026-07-25T10:00:00Z');
  setApi(new FakeApi({ now: () => clock }));
  // Captured rather than emitted: React Native's test build does not deliver
  // `AppState.emit`, so a test that used it would pass by doing nothing at all.
  foregroundListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'change') {
      foregroundListeners.push(handler as (state: string) => void);
    }
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Fires the same event the OS does when the app returns to the foreground. */
async function returnToForeground() {
  expect(foregroundListeners.length).toBeGreaterThan(0);
  await act(async () => {
    foregroundListeners.forEach((listener) => listener('active'));
  });
}

describe('coming back to a session that has gone', () => {
  it('signs out rather than showing tabs whose every request fails', async () => {
    await onboard();
    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();

    // An hour passes with the app in the background: the session lapses.
    clock += 61 * 60 * 1000;
    await returnToForeground();

    await waitFor(async () => {
      expect(await getApi().currentSession()).toBeNull();
    });
    // Back to the start rather than a signed-in-looking app that does nothing.
    expect(await screen.findByTestId('confirm-age')).toBeTruthy();
  });

  it('stays put when the session is still good', async () => {
    await onboard();
    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();

    clock += 60 * 1000;
    await returnToForeground();

    // Nothing should have happened at all.
    expect(screen.getByTestId('activate-hotel-lara-shore')).toBeTruthy();
    expect(await getApi().currentSession()).not.toBeNull();
  });

  it('does not sign anyone out because a check failed', async () => {
    await onboard();
    expect(await screen.findByTestId('activate-hotel-lara-shore')).toBeTruthy();
    jest
      .spyOn(getApi(), 'currentSession')
      .mockRejectedValue(new Error('fetch failed'));

    await returnToForeground();

    // A dropped connection looks exactly like a lapsed session from here.
    // Guessing wrong in that direction throws someone out of the app.
    expect(screen.getByTestId('activate-hotel-lara-shore')).toBeTruthy();
  });
});

describe('a request that never comes back', () => {
  it('leaves the delete button usable rather than stuck on "Deleting…"', async () => {
    await onboardToSettings();
    await screen.findByTestId('settings-delete-account');

    // A request that hangs rather than failing. Without a deadline the card
    // sits disabled with no way out short of restarting the app; the real
    // client gives every request one (`REQUEST_TIMEOUT_MS`), and this is the
    // in-memory stand-in for what that produces.
    const api = getApi() as FakeApi;
    jest.spyOn(api, 'deleteAccount').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('Request timed out — no connection.')), 10);
        }),
    );

    await fireEvent.press(screen.getByTestId('delete-account'));
    await fireEvent.press(screen.getByTestId('delete-account-confirm'));

    expect(await screen.findByTestId('delete-account-error')).toBeTruthy();
    expect(await api.currentSession()).not.toBeNull();
  });
});
