import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

import { getApi } from '../data';
import {
  appReducer,
  initialAppState,
  toDomainProfile,
  type AppAction,
  type AppState,
} from './appReducer';
import { useSessionWatch } from './useSessionWatch';

interface AppStoreValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, initialAppState);

  // App start: restore a device session (if any) and its saved profile, so a
  // returning signed-in user lands in the main tabs instead of onboarding.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getApi();
      let session = null;
      let profile = null;
      let activeHotel = null;
      try {
        session = await api.currentSession();
        const remoteProfile = session ? await api.getOwnProfile() : null;
        profile = remoteProfile ? toDomainProfile(remoteProfile) : null;
        // Without this a returning account looks like it never chose a hotel
        // and gets asked for one again on every launch.
        activeHotel = session && profile ? await api.getActiveHotel() : null;
      } catch {
        // Restoring the session is best-effort: any failure here falls back
        // to a signed-out start rather than blocking the app from loading.
        session = null;
        profile = null;
        activeHotel = null;
      }
      if (!cancelled) {
        dispatch({ type: 'BOOTSTRAP_RESOLVED', session, profile });
        if (activeHotel) {
          dispatch({ type: 'ACTIVE_HOTEL_LOADED', activeHotel });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A session can lapse, or its account be deleted from another device, while
  // the app sits in the background trusting the answer it got at start-up.
  useSessionWatch(state.session !== null, dispatch);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) {
    throw new Error('useAppStore must be used inside AppStoreProvider');
  }
  return value;
}
