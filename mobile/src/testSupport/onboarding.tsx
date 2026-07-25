/**
 * The shared way into the app for component tests.
 *
 * Kept in one place because the entry path changed once already: sign-up no
 * longer returns a session, so every test that used to go straight from the
 * form to the profile screen now has to pass through email confirmation. That
 * is the real flow, and a helper is better than five copies of it drifting
 * apart.
 *
 * Deliberately not under `__tests__`: jest would try to run it as a suite.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';

export const ADULT_BIRTHDATE = '1994-03-01';

/**
 * Age gate, sign-up, confirmation, sign-in. The confirmation step is the
 * preview build's stand-in for opening the link in the email; on a real project
 * that happens out of band.
 */
export async function signUpAndSignIn(
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('confirm-age'));

  await fireEvent.press(await screen.findByTestId('auth-switch-mode'));
  await fireEvent.changeText(await screen.findByTestId('auth-email'), email);
  await fireEvent.changeText(screen.getByTestId('auth-password'), password);
  await fireEvent.press(screen.getByTestId('auth-submit'));

  await fireEvent.press(await screen.findByTestId('simulate-confirm-email'));

  await fireEvent.changeText(await screen.findByTestId('auth-email'), email);
  await fireEvent.changeText(screen.getByTestId('auth-password'), password);
  await fireEvent.press(screen.getByTestId('auth-submit'));
}

/** The above, plus the profile every screen behind onboarding needs. */
export async function onboard(
  name = 'Deniz',
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  await signUpAndSignIn(email, password);
  await fireEvent.changeText(await screen.findByTestId('profile-name'), name);
  await fireEvent.changeText(screen.getByTestId('profile-birthdate'), ADULT_BIRTHDATE);
  await fireEvent.press(screen.getByTestId('save-profile'));
}

/** Onboards, then opens the Settings tab. */
export async function onboardToSettings(name = 'Deniz'): Promise<void> {
  await onboard(name);
  await fireEvent.press(await screen.findByText('Settings'));
}
