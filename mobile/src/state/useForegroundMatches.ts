/**
 * One re-read of the inbox when the app comes back to the foreground.
 *
 * The tab badge is drawn from `state.matches`, and that list was only ever
 * refreshed by the inbox's own focus effect — which lives and dies with the
 * inbox being the focused screen. So "we refresh on foreground" was not true:
 * background the app on the discovery deck, receive a message, come back, and
 * the badge stayed as it was until somebody happened to press Messages. The
 * one place the claim needed to hold was the one place it did not.
 *
 * This sits at the store, so there is exactly one listener for the whole app
 * and it exists only while somebody is signed in.
 *
 * Deliberately not a poll and not an interval. Coming back to the app is a
 * thing a person did; a timer is not, and a badge that costs a request every
 * thirty seconds costs battery all day for something nobody is waiting on.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getApi } from '../data';
import type { AppAction } from './appReducer';

export function useForegroundMatches(
  hasSession: boolean,
  dispatch: React.Dispatch<AppAction>,
): void {
  useEffect(() => {
    if (!hasSession) return;
    let cancelled = false;

    const subscription = AppState.addEventListener('change', (next) => {
      // `active` only. `inactive` is the state an iPhone passes through while
      // the app switcher is open or a call comes in, and refreshing on it
      // would fire two or three times for one return.
      if (next !== 'active') return;
      void (async () => {
        try {
          const matches = await getApi().getMatches();
          if (!cancelled) dispatch({ type: 'MATCHES_LOADED', matches });
        } catch {
          // A failed refresh leaves the previous list alone. The badge being
          // briefly stale is better than it being briefly wrong, and the
          // inbox's own focus effect will try again.
        }
      })();
    });

    return () => {
      // Torn down on sign-out as well as on unmount: `hasSession` going false
      // re-runs this effect, so the listener never outlives the session it
      // was fetching for.
      cancelled = true;
      subscription.remove();
    };
  }, [hasSession, dispatch]);
}
