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
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import App from '../../App';
import { COPY } from '../copy';
import { FakeApi, setApi } from '../data';
import {
  onboardToSettings,
  onboardToTeaching,
  startSignIn,
  startSignUp,
} from '../testSupport/onboarding';

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
  it('says the sign-up worked and is waiting on an email', async () => {
    await render(<App />);
    await startSignUp('new@example.test');

    // The step is replaced in place, not pushed, so nothing resets the cursor.
    expect(await screen.findByTestId('screen-confirm-email')).toBeTruthy();
    expect(spoken()).toContain(COPY.confirmEmail.title);
    expect(spoken()).toContain(COPY.confirmEmail.body);
  });

  it('distinguishes "we just sent one" from "you never confirmed"', async () => {
    const api = new FakeApi({ now: () => FIXED });
    setApi(api);
    await api.signUp('waiting@example.test', 'correct horse');

    await render(<App />);
    await startSignIn('waiting@example.test');

    expect(await screen.findByTestId('screen-confirm-email')).toBeTruthy();
    // Nothing was sent on this path, and saying otherwise costs someone an
    // hour of watching an inbox.
    expect(spoken()).toContain(COPY.confirmEmail.notConfirmedYet);
    expect(screen.getByText(COPY.confirmEmail.notConfirmedYet)).toBeTruthy();
  });

  it('says the email went out again, instead of going quiet', async () => {
    await render(<App />);
    await startSignUp('new@example.test');
    await screen.findByTestId('confirm-resend');
    announced = [];

    await fireEvent.press(screen.getByTestId('confirm-resend'));

    expect(await screen.findByTestId('confirm-resent')).toBeTruthy();
    // Silence here is indistinguishable from the button doing nothing.
    expect(spoken()).toContain(COPY.confirmEmail.resent);
  });

  it('names each onboarding step, which nothing else does', async () => {
    await render(<App />);
    await startSignUp('stepper@example.test');
    await fireEvent.press(await screen.findByTestId('simulate-confirm-email'));
    await fireEvent.changeText(await screen.findByTestId('auth-email'), 'stepper@example.test');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('auth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('profile-name');
    announced = [];

    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Twelve steps swap in place inside one navigator screen, so nothing resets
    // the cursor between them. Without this a VoiceOver user taps "Continue"
    // and is given a new question in total silence.
    expect(await screen.findByTestId('screen-onboarding-birthdate')).toBeTruthy();
    expect(spoken()).toContain(COPY.onboarding.birthdate.headline);
  });

  it('names each teaching card, which replaces the one before it in place', async () => {
    await onboardToTeaching();
    expect(await screen.findByTestId('teaching-next')).toBeTruthy();
    announced = [];

    await fireEvent.press(screen.getByTestId('teaching-next'));

    expect(spoken()).toContain(COPY.onboarding.teaching.hereNow.title);
  });

  it('reads the whole delete-account warning, not only its last sentence', async () => {
    await onboardToSettings();
    await screen.findByTestId('settings-delete-account');
    announced = [];

    await fireEvent.press(screen.getByTestId('delete-account'));

    // Someone can reach the delete button without their cursor passing over the
    // paragraphs, so all three have to be spoken when the panel opens.
    expect(spoken()).toContain(COPY.deleteAccount.noUndo);
    expect(spoken()).toContain(COPY.deleteAccount.whatGoes);
    expect(spoken()).toContain(COPY.deleteAccount.whatStays);
  });
});
