/**
 * H-405 — noticing that the session has gone.
 *
 * The app decides what to show from `state.session`, which is read once at
 * start-up and then trusted. Three things can make it wrong while someone is
 * looking at the app:
 *
 *   * the token expires — the app is left showing tabs whose every request
 *     fails, and the failures are reported as "email or password is incorrect",
 *     which is written for a login form and means nothing here;
 *   * the account is deleted from another device, which is the same shape;
 *   * the app is backgrounded for long enough that both of the above happen
 *     while nothing is running to notice.
 *
 * So the session is re-checked when the app comes back to the foreground, and
 * the app signs itself out when it has gone. The alternative is a screen that
 * looks signed in and does nothing, which is the worst of the three.
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getApi } from '../data';
import type { AppAction } from './appReducer';

export function useSessionWatch(
  hasSession: boolean,
  dispatch: React.Dispatch<AppAction>,
): void {
  useEffect(() => {
    if (!hasSession) {
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const session = await getApi().currentSession();
        if (!cancelled && !session) {
          dispatch({ type: 'SIGN_OUT' });
        }
      } catch {
        // A failed check is not evidence the session is gone — a dropped
        // connection looks the same. Signing someone out for it would be
        // worse than leaving them where they are, so nothing happens.
      }
    };

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void verify();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [hasSession, dispatch]);
}
