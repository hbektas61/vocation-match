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

/** What the server stores. */
export const ADULT_BIRTHDATE = '1994-03-01';
/** The same date as somebody types it, which is the only form the field takes. */
export const ADULT_BIRTHDATE_TYPED = '01/03/1994';
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

/**
 * The universal phone flow: it creates a new account or restores an existing
 * one. Returns the render handle so a test can unmount the tree — closing the
 * app, from the component tree's point of view — and mount it again.
 */
export async function authenticateWithPhone(
  phone = DEFAULT_PHONE,
): Promise<ReturnType<typeof render>> {
  const view = render(<App />);
  await requestPhoneCode(phone);
  await type('auth-otp', FAKE_PHONE_OTP);
  await press('onboarding-continue');
  return view;
}

/**
 * The above, plus every profile answer. Ends in the app: finishing the last
 * step is what marks the profile complete, and the hotel is no longer part of
 * getting in.
 */
export async function onboard(
  name = 'Deniz',
  phone = DEFAULT_PHONE,
): Promise<ReturnType<typeof render>> {
  const view = await authenticateWithPhone(phone);

  await type('profile-name', name);
  await press('onboarding-continue');

  await type('profile-birthdate', ADULT_BIRTHDATE_TYPED);
  await press('onboarding-continue');

  await press('gender-woman');
  await press('onboarding-continue');

  await press('onboarding-skip'); // orientation

  await press('show-me-everyone');
  await press('onboarding-continue');

  await press('onboarding-skip'); // passions
  await press('onboarding-continue'); // Done, with no photo
  return view;
}

/** Onboards, then opens the Settings tab. */
export async function onboardToSettings(name = 'Deniz'): Promise<void> {
  await onboardWithHotel(name);
  const settings = await screen.findByText('Settings');
  await act(async () => {
    fireEvent.press(settings);
  });
}

/**
 * Picks a hotel from the Hotel tab.
 *
 * Onboarding no longer asks for one, so any test that needs a room has to come
 * through here — which is the point: it makes "needs a hotel" visible in the
 * test rather than something onboarding quietly did for everybody.
 */
export async function activateHotel(hotelId = PILOT_HOTEL): Promise<void> {
  await fireEvent.press(await screen.findByTestId('tab-Vacation'));
  await type('hotel-search', 'lara');
  await press(`activate-${hotelId}`);
  // Back to where the rooms are, which is where somebody who came here to use
  // one would expect to end up. By role, because "Rooms" is also a heading on
  // the screen itself and the plain text query matches both.
  await fireEvent.press(await screen.findByTestId('tab-Vacation'));
}

/**
 * Onboards and then picks a hotel.
 *
 * Most tests that existed before the hotel left onboarding assume a room is
 * reachable, and this keeps that assumption true for them without pretending
 * onboarding still asks.
 */
export async function onboardWithHotel(
  name = 'Deniz',
  phone = DEFAULT_PHONE,
): Promise<void> {
  await onboard(name, phone);
  await activateHotel();
}
