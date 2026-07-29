import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';

import { setLocale, type Locale } from '../copy';
import { getApi } from '../data';
import { readLocalePreference, writeLocalePreference } from '../i18n/localePreference';
import { registerForPush } from '../notifications/push';
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
  chooseLocale: (locale: Locale) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, initialAppState);

  /**
   * The one sanctioned way to change language: the module binding first (so
   * the words are already right when the render happens), the state second
   * (so the render happens), the disk last (so the choice survives a
   * relaunch, without the flow ever waiting on a write).
   */
  const chooseLocale = useCallback((locale: Locale) => {
    setLocale(locale);
    dispatch({ type: 'SET_LOCALE', locale });
    void writeLocalePreference(locale);
  }, []);

  // A stored preference is applied before anything is on screen worth
  // reading: the bootstrap spinner is the only thing that can flash English.
  useEffect(() => {
    let cancelled = false;
    void readLocalePreference().then((stored) => {
      if (stored && !cancelled) {
        setLocale(stored);
        dispatch({ type: 'SET_LOCALE', locale: stored });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        // The hotel's card, resolved here so every screen agrees from the
        // first frame: the id alone is what the server remembers, and a
        // returning account must not read as "no hotel chosen" anywhere.
        // Failing to fetch the card does not fail hydration — the id is
        // already in the store, and screens show a loading face, never a lie.
        if (activeHotel) {
          api
            .getHotelById(activeHotel.hotelId)
            .then((card) => {
              if (!cancelled && card) dispatch({ type: 'HOTELS_LOADED', hotels: [card] });
            })
            .catch(() => undefined);
        }
      } catch {
        if (!cancelled) dispatch({ type: 'ACCOUNT_HYDRATION_FAILED' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.session, state.accountLoadStatus]);

  // A finished profile is the moment pushes start mattering: messages and
  // arrivals can now involve this person. Locale is a dependency on purpose —
  // the words of a push are fixed at send time, so changing language
  // re-registers the device with the new one.
  useEffect(() => {
    if (!state.session || !state.profile?.onboardingCompletedAt) return;
    void registerForPush(getApi(), state.locale);
  }, [state.session, state.profile?.onboardingCompletedAt, state.locale]);

  // A session can lapse, or its account be deleted from another device, while
  // the app sits in the background trusting the answer it got at start-up.
  useSessionWatch(state.session !== null, dispatch);

  const value = useMemo(() => ({ state, dispatch, chooseLocale }), [state, chooseLocale]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) {
    throw new Error('useAppStore must be used inside AppStoreProvider');
  }
  return value;
}
