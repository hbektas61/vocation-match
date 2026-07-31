/**
 * H-404 — the things a screen reader has to be told, because nothing else says
 * them.
 *
 * All four of these are the same defect in different places: something changes
 * on screen without moving focus, so a sighted person sees it and a VoiceOver
 * user hears nothing at all. `accessibilityLiveRegion` does not help — it is
 * Android-only — which is why the app announces explicitly, and why that has to
 * be tested rather than assumed.
 *
 * What this cannot show is whether the announcement is actually audible, or
 * where the cursor lands afterwards. Both need a device, and both are in
 * `.studio/device-readiness.md`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import App from '../../App';
import { COPY } from '../copy';
import { FakeApi, setApi } from '../data';
import {
  authenticateWithPhone,
  onboardToSettings,
  requestPhoneCode,
} from '../testSupport/onboarding';
import { press, typeText } from '../testSupport/interact';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
let announced: string[];

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
  announced = [];
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation((message: string) => {
      announced.push(message);
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const spoken = () => announced.join(' | ');

describe('what gets announced', () => {
  it('announces that the SMS code is expected', async () => {
    render(<App />);
    await requestPhoneCode('+905551110021');

    // The step is replaced in place, not pushed, so nothing resets the cursor.
    expect(await screen.findByTestId('screen-onboarding-otp')).toBeTruthy();
    expect(spoken()).toContain(COPY.onboarding.otp.headline);
    expect(spoken()).toContain(COPY.onboarding.otp.body);
  });

  it('says a new SMS code was sent, instead of going quiet', async () => {
    render(<App />);
    await requestPhoneCode('+905551110022');
    await screen.findByTestId('otp-resend');
    announced = [];

    const startedAt = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 61_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('otp-resend'));
    });

    expect(screen.getByTestId('otp-resent')).toBeTruthy();
    // Silence here is indistinguishable from the button doing nothing.
    expect(spoken()).toContain(COPY.phoneAuth.resent);
  });

  it('names each onboarding step, which nothing else does', async () => {
    await authenticateWithPhone('+905551110023');
    await screen.findByTestId('profile-name');
    announced = [];

    await typeText(screen.getByTestId('profile-name'), 'Deniz');
    await press(screen.getByTestId('onboarding-continue'));

    // Eleven steps swap in place inside one navigator screen, so nothing resets
    // the cursor between them. Without this a VoiceOver user taps "Continue"
    // and is given a new question in total silence.
    expect(await screen.findByTestId('screen-onboarding-birthdate')).toBeTruthy();
    expect(spoken()).toContain(COPY.onboarding.birthdate.headline);
  });


  it('reads the whole delete-account warning, not only its last sentence', async () => {
    await onboardToSettings();
    await screen.findByTestId('settings-delete-account');
    announced = [];

    await press(screen.getByTestId('delete-account'));

    // Someone can reach the delete button without their cursor passing over the
    // paragraphs, so all three have to be spoken when the panel opens.
    expect(spoken()).toContain(COPY.deleteAccount.noUndo);
    expect(spoken()).toContain(COPY.deleteAccount.whatGoes);
    expect(spoken()).toContain(COPY.deleteAccount.whatStays);
  });
});
