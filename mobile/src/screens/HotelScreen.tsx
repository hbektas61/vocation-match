import React, { useCallback, useEffect, useRef, useState } from 'react';
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

/** Two characters before anything is fetched. */
const MIN_QUERY = 2;

/**
 * The hotel, as a tab and as a gate.
 *
 * `onActivated` is what the gate passes in: when somebody reached this screen
 * because they tried to open a room, choosing is the end of that errand and
 * they should be put back where they were going. As a tab there is nowhere to
 * return to, so it is absent and the screen simply stays.
 */
export function HotelScreen({ onActivated }: { onActivated?: () => void } = {}) {
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

  // Only the hotel already on this account. The catalog is deliberately not
  // fetched: a list of every hotel presented as though it were a result is an
  // invitation to pick one at random, and the one at the top would be chosen
  // far more often than it deserves. Nothing is shown until somebody asks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = getApi();
        const active = await api.getActiveHotel();
        if (cancelled) return;
        dispatch({ type: 'ACTIVE_HOTEL_LOADED', activeHotel: active });
        // `getActiveHotel` answers with an id, and the card above it needs a
        // name. Resolved here rather than by showing the catalogue: these go
        // into the store, never into `results`, so nothing becomes selectable
        // that somebody did not search for.
        if (active) {
          const known = await api.searchHotels('');
          if (!cancelled) dispatch({ type: 'HOTELS_LOADED', hotels: known });
        }
      } finally {
        if (!cancelled) setLoadingActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  /**
   * Two characters, because one letter matches most of a catalogue and the
   * result is a list nobody asked for.
   */
  const searchable = (text: string) => text.trim().length >= MIN_QUERY;

  /**
   * `sequence` is what stops a slow answer to an old query landing on top of a
   * fast answer to the current one. Typing "lar" then "lara" can return in
   * either order, and without this the screen settles on whichever the network
   * happened to finish last.
   */
  const sequence = useRef(0);

  const runSearch = useCallback(async (text: string, ticket: number) => {
    setSearchError(null);
    try {
      const hotels = await getApi().searchHotels(text);
      if (ticket !== sequence.current) return;
      dispatch({ type: 'HOTELS_LOADED', hotels });
      setResults(hotels);
    } catch (err) {
      if (ticket !== sequence.current) return;
      setSearchError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
      setResults([]);
    }
  }, [dispatch]);

  const changeQuery = (text: string) => {
    setQuery(text);
    // Back to the empty state rather than showing the previous query's hits
    // under the new one.
    setResults(searchable(text) ? null : []);
  };

  // Debounced, so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (!searchable(query)) return;
    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      runSearch(query.trim(), ticket);
    }, 250);
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
      onActivated?.();
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
      {searchError ? (
        <>
          <Notice message={searchError} tone="error" testID="hotel-search-error" />
          <Button
            label={COPY.common.retry}
            variant="secondary"
            onPress={() => runSearch(query.trim(), ++sequence.current)}
            testID="hotel-search-retry"
          />
        </>
      ) : null}
      {/* Four states, deliberately distinct. "Type to search" is not the same
          as "nothing matched", and neither is the same as "still looking" —
          collapsing any two of them makes the screen look broken in the case
          it collapsed. */}
      {!searchable(query) ? (
        <EmptyState message={COPY.hotel.searchPrompt} testID="hotel-search-prompt" />
      ) : results === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : results.length === 0 ? (
        <EmptyState message={COPY.hotel.noResults} testID="hotel-no-results" />
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
