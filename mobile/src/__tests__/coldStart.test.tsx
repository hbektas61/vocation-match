/**
 * Closing the app is not signing out.
 *
 * The owner's question, verbatim: someone signs in, closes the app, opens it
 * again — are they asked for their phone number again? The design says no
 * twice over (the session lives in the keychain and `persistSession` restores
 * it; the wizard's step is derived from what the server knows), but nothing
 * pinned it. A restart here is a second `render(<App />)` against the same
 * api instance: the instance plays the role the keychain plays on a device —
 * it remembers the session; the freshly mounted tree remembers nothing.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { FakeApi, setApi } from '../data';
import { authenticateWithPhone, onboard } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

/** Unmounts the whole tree, then mounts a fresh one: close and reopen. */
async function reopenApp(view: { unmount: () => void }): Promise<void> {
  await act(async () => {
    view.unmount();
  });
  render(<App />);
}

describe('coming back after closing the app', () => {
  it('takes a finished account straight to the app, never back to the phone', async () => {
    const view = await onboard('Deniz', '+905551119001');
    await screen.findByTestId('screen-hotel');

    await reopenApp(view);

    // Straight in: the rooms, not the welcome screen and not the phone box.
    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
    expect(screen.queryByTestId('auth-phone')).toBeNull();
    expect(screen.queryByTestId('screen-welcome')).toBeNull();
  });

  it('resumes a half-finished profile at the open question, not at the phone', async () => {
    // Through the account and the two saved answers (name, birthdate), then
    // closed at the gender question.
    const view = await authenticateWithPhone('+905551119002');
    await act(async () => {
      fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    });
    await act(async () => {
      fireEvent.press(await screen.findByTestId('onboarding-continue'));
    });
    await act(async () => {
      fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '01/03/1994');
    });
    await act(async () => {
      fireEvent.press(await screen.findByTestId('onboarding-continue'));
    });
    await screen.findByTestId('screen-onboarding-gender');

    await reopenApp(view);

    // The wizard derives its step from the server: the saved name and
    // birthdate are not asked again, the phone least of all.
    expect(await screen.findByTestId('screen-onboarding-gender')).toBeTruthy();
    expect(screen.queryByTestId('auth-phone')).toBeNull();
    expect(screen.queryByTestId('profile-name')).toBeNull();
  });
});
