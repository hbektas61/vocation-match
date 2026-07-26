import { act, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { PrivacyShield } from '../PrivacyShield';

describe('PrivacyShield', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('covers sensitive screens while the app is outside the foreground', () => {
    let appStateListener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'change') appStateListener = handler as (state: string) => void;
      return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
    });

    render(<PrivacyShield />);
    expect(screen.queryByTestId('privacy-shield')).toBeNull();

    act(() => appStateListener?.('background'));
    expect(
      screen.getByTestId('privacy-shield', { includeHiddenElements: true }),
    ).toBeTruthy();

    act(() => appStateListener?.('active'));
    expect(screen.queryByTestId('privacy-shield')).toBeNull();
  });
});
