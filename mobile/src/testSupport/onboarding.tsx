/**
 * The shared way into the app for component tests.
 *
 * Kept in one place because the entry path has now changed twice: first when
 * sign-up stopped returning a session, and again when the whole way in became
 * one wizard that ends with a hotel. Every test that needs to be *past*
 * onboarding goes through here, so the next change is one edit rather than
 * fifteen.
 *
 * Deliberately not under `__tests__`: jest would try to run it as a suite.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';

export const ADULT_BIRTHDATE = '1994-03-01';
export const PILOT_HOTEL = 'hotel-lara-shore';

const press = async (testID: string) => {
  const target = await screen.findByTestId(testID);
  await act(async () => {
    fireEvent.press(target);
  });
};

const type = async (testID: string, value: string) => {
  const target = await screen.findByTestId(testID);
  await act(async () => {
    fireEvent.changeText(target, value);
  });
};

/** Welcome → the promise → email → password, stopping wherever that lands. */
export async function startSignUp(
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  await press('welcome-create-account');
  await press('onboarding-continue'); // the 18+ promise
  await type('auth-email', email);
  await press('onboarding-continue');
  await type('auth-password', password);
  await press('onboarding-continue');
}

/** Welcome → sign in → email → password, stopping wherever that lands. */
export async function startSignIn(
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  await press('welcome-sign-in');
  await type('auth-email', email);
  await press('onboarding-continue');
  await type('auth-password', password);
  await press('onboarding-continue');
}

/** Welcome → the promise → an account → the confirmation link → signed in. */
export async function signUpAndSignIn(
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  render(<App />);
  await startSignUp(email, password);

  // Stands in for opening the link; there is no mailbox behind the fake.
  await press('simulate-confirm-email');

  await type('auth-email', email);
  await press('onboarding-continue');
  await type('auth-password', password);
  await press('onboarding-continue');

}

/**
 * The above, plus the profile, the optional steps and the hotel — stopping on
 * the first teaching card, which is the last thing between here and the app.
 */
export async function onboardToTeaching(
  name = 'Deniz',
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  await signUpAndSignIn(email, password);

  await type('profile-name', name);
  await press('onboarding-continue');

  await type('profile-birthdate', ADULT_BIRTHDATE);
  await press('onboarding-continue');

  await press('onboarding-skip'); // bio
  await press('onboarding-skip'); // interests
  await press('onboarding-skip'); // photo

  await type('hotel-search', 'lara');
  await press(`activate-${PILOT_HOTEL}`);
  await press('onboarding-continue');
}

/** All of it, through the three teaching cards and into the app. */
export async function onboard(
  name = 'Deniz',
  email = 'deniz@example.test',
  password = 'correct horse',
): Promise<void> {
  await onboardToTeaching(name, email, password);

  // The three teaching cards, which only appear straight after onboarding.
  await press('teaching-next');
  await press('teaching-next');
  await press('teaching-start');
}

/** Onboards, then opens the Settings tab. */
export async function onboardToSettings(name = 'Deniz'): Promise<void> {
  await onboard(name);
  const settings = await screen.findByText('Settings');
  await act(async () => {
    fireEvent.press(settings);
  });
}
