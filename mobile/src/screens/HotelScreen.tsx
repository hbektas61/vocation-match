import React, { useCallback, useEffect, useState } from 'react';
import {ActivityIndicator } from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  Field,
  Gap,
  Heading,
  Notice,
  Screen,
  Title,
} from '../components/ui';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
import { ApiError, getApi, type HotelCard } from '../data';
import { useAppStore } from '../state/AppStore';

export function HotelScreen() {
  const { state, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  // `null` results mean a search is in flight (loading state).
  const [results, setResults] = useState<HotelCard[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<HotelCard | null>(null);
  const [switchedNotice, setSwitchedNotice] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const activeHotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;

  // Initial load: the full catalog (for name lookups elsewhere) and whatever
  // hotel is already active on this account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = getApi();
        const [hotels, active] = await Promise.all([api.searchHotels(''), api.getActiveHotel()]);
        if (cancelled) return;
        dispatch({ type: 'HOTELS_LOADED', hotels });
        dispatch({ type: 'ACTIVE_HOTEL_LOADED', activeHotel: active });
        setResults(hotels);
      } finally {
        if (!cancelled) setLoadingActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const runSearch = useCallback(async (text: string) => {
    setSearchError(null);
    try {
      const hotels = await getApi().searchHotels(text);
      setResults(hotels);
    } catch (err) {
      setSearchError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
      setResults([]);
    }
  }, []);

  const changeQuery = (text: string) => {
    setQuery(text);
    setResults(null);
  };

  // Debounced search so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const activate = async (hotel: HotelCard) => {
    setPendingSwitch(null);
    setActivating(true);
    setActivateError(null);
    try {
      const api = getApi();
      const result = await api.setActiveHotel(hotel.id);
      const active = await api.getActiveHotel();
      dispatch({ type: 'HOTELS_LOADED', hotels: mergeHotel(state.hotels, hotel) });
      dispatch({ type: 'HOTEL_ACTIVATED', activeHotel: active ?? { hotelId: hotel.id, activatedAt: nowMs() } });
      setSwitchedNotice(result.previousHotelId !== null && result.previousHotelId !== hotel.id);
    } catch (err) {
      setActivateError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setActivating(false);
    }
  };

  const requestActivation = (hotel: HotelCard) => {
    setSwitchedNotice(false);
    if (activeHotel && activeHotel.id !== hotel.id) {
      setPendingSwitch(hotel);
      return;
    }
    activate(hotel);
  };

  return (
    <Screen testID="screen-hotel">
      <Title>{COPY.hotel.title}</Title>
      {loadingActive ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : activeHotel ? (
        <Card>
          <Heading>{activeHotel.name}</Heading>
          <Caption>
            {activeHotel.city}, {activeHotel.country}
          </Caption>
          <Body>
            {COPY.hotel.activeLabel} {COPY.trust.oneHotel}
          </Body>
        </Card>
      ) : (
        <Notice message={`${COPY.hotel.noActiveHotel} ${COPY.trust.oneHotel}`} />
      )}

      {switchedNotice ? <Notice message={COPY.hotel.switchedNotice} testID="hotel-switched" /> : null}
      {activateError ? <Notice message={activateError} tone="error" testID="hotel-activate-error" /> : null}

      {pendingSwitch ? (
        <Card>
          <Heading>{COPY_FOR.switchPrompt(pendingSwitch.name)}</Heading>
          <Body>{COPY.trust.switchWarning}</Body>
          <Button
            label={`Switch to ${pendingSwitch.name}`}
            onPress={() => activate(pendingSwitch)}
            disabled={activating}
            testID="confirm-switch"
          />
          <Button
            label={COPY.hotel.keepCurrent}
            variant="secondary"
            onPress={() => setPendingSwitch(null)}
            disabled={activating}
            testID="cancel-switch"
          />
        </Card>
      ) : null}

      <Gap size="sm" />
      <Field
        label={COPY.hotel.searchLabel}
        value={query}
        onChangeText={changeQuery}
        placeholder={COPY.hotel.searchPlaceholder}
        testID="hotel-search"
      />
      {searchError ? <Notice message={searchError} tone="error" testID="hotel-search-error" /> : null}
      {results === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : results.length === 0 ? (
        <EmptyState message={COPY.hotel.noResults} />
      ) : (
        results.map((hotel) => (
          <Card key={hotel.id}>
            <Heading>{hotel.name}</Heading>
            <Caption>
              {hotel.city}, {hotel.country}
            </Caption>
            {activeHotel?.id === hotel.id ? (
              <Caption>{COPY.hotel.activatedNote}</Caption>
            ) : (
              <Button
                label={`Activate ${hotel.name}`}
                onPress={() => requestActivation(hotel)}
                disabled={activating}
                testID={`activate-${hotel.id}`}
              />
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

/** Keeps a just-activated hotel in the cache even if it fell outside the last search. */
function mergeHotel(hotels: HotelCard[], hotel: HotelCard): HotelCard[] {
  if (hotels.some((h) => h.id === hotel.id)) return hotels;
  return [...hotels, hotel];
}
