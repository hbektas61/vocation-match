import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

import { getApi } from '../data';
import {
  appReducer,
  initialAppState,
  toDomainProfile,
  type AppAction,
  type AppState,
} from './appReducer';

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
      try {
        session = await api.currentSession();
        const remoteProfile = session ? await api.getOwnProfile() : null;
        profile = remoteProfile ? toDomainProfile(remoteProfile) : null;
      } catch {
        // Restoring the session is best-effort: any failure here falls back
        // to a signed-out start rather than blocking the app from loading.
        session = null;
        profile = null;
      }
      if (!cancelled) {
        dispatch({ type: 'BOOTSTRAP_RESOLVED', session, profile });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
