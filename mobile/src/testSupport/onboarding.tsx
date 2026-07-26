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
import { FAKE_PHONE_OTP } from '../data';

export const ADULT_BIRTHDATE = '1994-03-01';
export const PILOT_HOTEL = 'hotel-lara-shore';
export const DEFAULT_PHONE = '+905551110001';

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

/** Welcome → 18+ promise → phone → requested SMS, stopping on the code step. */
export async function requestPhoneCode(phone = DEFAULT_PHONE): Promise<void> {
  await press('welcome-phone');
  await press('onboarding-continue'); // the 18+ promise
  await type('auth-phone', phone);
  await press('onboarding-continue');
}

/** The universal phone flow: it creates a new account or restores an existing one. */
export async function authenticateWithPhone(phone = DEFAULT_PHONE): Promise<void> {
  render(<App />);
  await requestPhoneCode(phone);
  await type('auth-otp', FAKE_PHONE_OTP);
  await press('onboarding-continue');
}

/**
 * The above, plus the profile, the optional steps and the hotel — stopping on
 * the first teaching card, which is the last thing between here and the app.
 */
export async function onboardToTeaching(
  name = 'Deniz',
  phone = DEFAULT_PHONE,
): Promise<void> {
  await authenticateWithPhone(phone);

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
  phone = DEFAULT_PHONE,
): Promise<void> {
  await onboardToTeaching(name, phone);

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
