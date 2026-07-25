/**
 * H-203, H-204, H-205 — deleting an account from Settings.
 *
 * The three things that matter are all about honesty: it takes two deliberate
 * taps, the second tap is labelled with what it does and preceded by what
 * disappears and what does not, and a failure leaves the person signed in with
 * an account that still exists rather than dropping them on a login screen.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';
import { COPY } from '../copy';
import { ApiError, FakeApi, getApi, setApi } from '../data';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
const ADULT_BIRTHDATE = '1994-03-01';

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

async function onboardToSettings() {
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('confirm-age'));
  await fireEvent.press(await screen.findByTestId('auth-switch-mode'));
  await fireEvent.changeText(await screen.findByTestId('auth-email'), 'deniz@example.test');
  await fireEvent.changeText(screen.getByTestId('auth-password'), 'correct horse');
  await fireEvent.press(screen.getByTestId('auth-submit'));
  await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
  await fireEvent.changeText(screen.getByTestId('profile-birthdate'), ADULT_BIRTHDATE);
  await fireEvent.press(screen.getByTestId('save-profile'));
  await fireEvent.press(await screen.findByText('Settings'));
  expect(await screen.findByTestId('settings-delete-account')).toBeTruthy();
}

describe('deleting an account', () => {
  it('does not delete on the first tap', async () => {
    await onboardToSettings();

    await fireEvent.press(screen.getByTestId('delete-account'));

    expect(await screen.findByTestId('delete-account-confirm')).toBeTruthy();
    expect(await getApi().currentSession()).not.toBeNull();
    expect(await getApi().getOwnProfile()).not.toBeNull();
  });

  it('says what goes and what stays before the irreversible tap', async () => {
    await onboardToSettings();
    await fireEvent.press(screen.getByTestId('delete-account'));

    expect(screen.getByText(COPY.deleteAccount.whatGoes)).toBeTruthy();
    // The half a deletion screen usually leaves out.
    expect(screen.getByText(COPY.deleteAccount.whatStays)).toBeTruthy();
    expect(screen.getByTestId('delete-account-warning')).toBeTruthy();
  });

  it('can be backed out of', async () => {
    await onboardToSettings();
    await fireEvent.press(screen.getByTestId('delete-account'));
    await fireEvent.press(screen.getByTestId('delete-account-cancel'));

    expect(screen.queryByTestId('delete-account-confirm')).toBeNull();
    expect(await getApi().currentSession()).not.toBeNull();
  });

  it('deletes on the second tap and leaves no session behind', async () => {
    await onboardToSettings();
    const api = getApi();

    await fireEvent.press(screen.getByTestId('delete-account'));
    await fireEvent.press(screen.getByTestId('delete-account-confirm'));

    // Right back to the start of the app — every piece of this person's state
    // is cleared from the device, not just the token.
    expect(await screen.findByTestId('screen-age-gate')).toBeTruthy();
    await waitFor(async () => {
      expect(await api.currentSession()).toBeNull();
    });
    await expect(api.signIn('deniz@example.test', 'correct horse')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('keeps the person signed in when the deletion fails, and says so', async () => {
    await onboardToSettings();
    const api = getApi() as FakeApi;
    api.failNextDeleteWith(new ApiError('NETWORK', 'No connection. Try again.'));

    await fireEvent.press(screen.getByTestId('delete-account'));
    await fireEvent.press(screen.getByTestId('delete-account-confirm'));

    expect(await screen.findByTestId('delete-account-error')).toBeTruthy();
    // Still here, still signed in, account still exists — and the button is
    // usable again rather than stuck on "Deleting…".
    expect(await api.currentSession()).not.toBeNull();
    expect(await api.getOwnProfile()).not.toBeNull();
    expect(screen.getByLabelText(COPY.deleteAccount.confirmButton)).toBeTruthy();
  });
});
