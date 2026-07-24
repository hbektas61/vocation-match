import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import App from '../../App';

/** Shared path: age gate → placeholder auth → profile → hotel activation. */
async function onboardAndActivateHotel() {
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('confirm-age'));
  await fireEvent.press(await screen.findByTestId('sign-in'));
  await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
  await fireEvent.changeText(screen.getByTestId('profile-age'), '30');
  await fireEvent.press(screen.getByTestId('save-profile'));
  await fireEvent.press(await screen.findByTestId('activate-hotel-lara-shore'));
  expect(await screen.findByText(/Active hotel/)).toBeTruthy();
}

/**
 * Critical happy path (ADR-007): onboarding → hotel activation → Here Now
 * presence → discovery swipe → mutual match → chat. Everything runs on
 * local fixtures; the presence check is simulated.
 */
describe('critical flow', () => {
  it('walks from age gate to a mutual match and chat', async () => {
    await onboardAndActivateHotel();

    // Rooms tab → Here Now → simulated in-range presence check.
    await fireEvent.press(screen.getByText('Rooms'));
    await fireEvent.press(await screen.findByTestId('open-here-now'));
    await fireEvent.press(await screen.findByTestId('simulate-near'));
    expect(await screen.findByText(/You are in/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('here-now-done'));

    // Discovery: Derya already likes the tester, so a like is a match.
    await fireEvent.press(await screen.findByText('Discovery'));
    expect(await screen.findByTestId('candidate-cand-derya')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('swipe-like'));
    expect(await screen.findByText("It's a match!")).toBeTruthy();

    // Chat: first message gets one canned reply.
    await fireEvent.press(screen.getByTestId('match-open-chat'));
    await fireEvent.changeText(await screen.findByTestId('chat-input'), 'Merhaba!');
    await fireEvent.press(screen.getByTestId('chat-send'));
    expect(await screen.findByText('Merhaba!')).toBeTruthy();
    expect(await screen.findByText(/Nice to match|pool area|What brings you/)).toBeTruthy();
  });

  it('keeps discovery closed until a room is opened', async () => {
    await onboardAndActivateHotel();

    await fireEvent.press(screen.getByText('Discovery'));
    expect(
      await screen.findByText(
        'Open a room first: declare an upcoming stay or run a presence check.',
      ),
    ).toBeTruthy();
  });
});
