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

  // App start restores only the device session. Profile and hotel hydration is
  // a separate retryable state below: a network failure must not discard a
  // valid local session and force another paid SMS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session = null;
      try {
        session = await getApi().currentSession();
      } catch {
        // Session storage is local. A malformed/unreadable value cannot be
        // trusted as authentication state.
        session = null;
      }
      if (!cancelled) {
        dispatch({ type: 'BOOTSTRAP_RESOLVED', session, profile: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once an OTP or local storage yields a session, load the account around it.
  // Failure keeps that session and presents a retry screen; it is never
  // mislabeled as a bad/expired OTP.
  useEffect(() => {
    if (!state.session || state.accountLoadStatus !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const api = getApi();
        const remoteProfile = await api.getOwnProfile();
        const profile = remoteProfile ? toDomainProfile(remoteProfile) : null;
        const activeHotel = profile ? await api.getActiveHotel() : null;
        if (!cancelled) {
          dispatch({ type: 'ACCOUNT_HYDRATED', profile, activeHotel });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'ACCOUNT_HYDRATION_FAILED' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.session, state.accountLoadStatus]);

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
