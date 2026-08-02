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
import { FAKE_PHONE_OTP, getApi } from '../data';

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

/**
 * Onboards, then opens Settings — which after D-057 means pressing the profile
 * ring on the trip tab rather than a bottom tab that no longer exists.
 */
export async function onboardToSettings(name = 'Deniz'): Promise<void> {
  await onboardWithHotel(name);
  const ring = await screen.findByTestId('hotel-profile-ring');
  await act(async () => {
    fireEvent.press(ring);
  });
}

/**
 * Puts a *catalogue* venue on the account.
 *
 * Since D-054 the trip tab chooses a venue through Google, and a Google venue
 * deliberately carries no coordinate of ours — so it cannot stand in for the
 * fixture hotels that the room, discovery and region-pool tests are anchored
 * to. Those tests are not about picking; they are about what a chosen venue
 * makes possible. So this now sets the venue through the API rather than
 * through the screen, which keeps their subject intact and stops a change to
 * the picker breaking forty tests that never mention it.
 *
 * The picker itself is driven end-to-end in `venueSelection.test.tsx`, through
 * `chooseGoogleVenue` below.
 */
export async function activateHotel(hotelId = PILOT_HOTEL): Promise<void> {
  await act(async () => {
    await getApi().setActiveHotel(hotelId);
  });
  // Away and back, so the trip tab's focus effect re-reads the account. The
  // screen learns its venue from the server on focus, not from whoever set it.
  await press('tab-Inbox');
  await press('tab-Vacation');
}

/**
 * The real D-054 flow, through the screen: open the picker, choose a
 * destination, then choose a venue inside it.
 *
 * `destinationQuery` and `venueQuery` are what somebody types; the indices are
 * which prediction they tap. Nothing here knows a Place ID, which is the
 * point — neither does the app.
 */
export async function chooseGoogleVenue({
  countryCode = 'TR',
  destinationQuery = 'Alaçatı',
  venueQuery = 'Biblos',
  destinationIndex = 0,
  venueIndex = 0,
  chip,
}: {
  countryCode?: string;
  destinationQuery?: string;
  venueQuery?: string;
  destinationIndex?: number;
  venueIndex?: number;
  chip?: 'all' | 'stay';
} = {}): Promise<void> {
  await press('tab-Vacation');
  await press('venue-open-picker');
  await press(`country-option-${countryCode}`);
  await type('destination-search', destinationQuery);
  await press(`destination-option-${destinationIndex}`);
  if (chip) await press(`venue-chip-${chip}`);
  await type('venue-search', venueQuery);
  await press(`venue-option-${venueIndex}`);
  // First-time selection has a review step. Replacing an active venue skips
  // this because HotelScreen owns the stronger destructive confirmation.
  if (screen.queryByTestId('confirm-venue-selection')) {
    await press('confirm-venue-selection');
  }
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
