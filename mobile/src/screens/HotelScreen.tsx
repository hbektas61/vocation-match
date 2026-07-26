import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Body, Button, Caption, Card, DoorPlate, EmptyState, Field, Gap, Heading, Notice, Screen, StateChip, Title } from '../components/ui';
import { DestinationCard } from '../components/DestinationCard';
import { HotelBuilding, SearchScene } from '../components/HotelIllustrations';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
import { ApiError, getApi, type HotelCard, type RoomHeadcount, type RoomStatus } from '../data';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

/**
 * The designer's popular destinations. Names are proper nouns (no i18n);
 * the gradients stand in for photographs we hold no rights to, and the
 * reference's hotel counts are omitted because the catalogue fills lazily —
 * any number would be an invention. A card is a pre-typed query.
 */
const DESTINATIONS: { name: string; query: string; colors: readonly [string, string] }[] = [
  { name: 'İstanbul', query: 'İstanbul', colors: ['#8E6BC7', '#54366E'] },
  { name: 'Antalya', query: 'Antalya', colors: ['#A98BDE', '#6C55B4'] },
  { name: 'Kapadokya', query: 'Nevşehir', colors: ['#C9A3E8', '#8A63B8'] },
];

const QUICK_CITIES = ['İstanbul', 'Antalya'];

const MagnifierIcon = () => (
  <View style={{ marginRight: spacing.sm }}>
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.inkMuted} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="M21 21l-4.5-4.5" />
    </Svg>
  </View>
);

const InfoIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

const ClockIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 7v5l3 2" />
  </Svg>
);

const CityIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M10 12h4m-4-4h4m0 13v-3a2 2 0 0 0-4 0v3" />
    <Path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
    <Path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
  </Svg>
);

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
  /** For the two mini state chips on the active hotel's key card. */
  const [roomStates, setRoomStates] = useState<RoomStatus[] | null>(null);
  /**
   * Thresholded headcounts (D-032). A null entry renders as nothing — no
   * "quiet room" wording — because below five people even "somebody is
   * here" points at a person.
   */
  const [roomCounts, setRoomCounts] = useState<RoomHeadcount[] | null>(null);
  /** What "Son arama" re-runs: the last query that actually searched. */
  const [lastQuery, setLastQuery] = useState<string | null>(null);

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
        if (active) {
          api
            .getRooms()
            .then((rooms) => {
              if (!cancelled) setRoomStates(rooms);
            })
            .catch(() => undefined);
          api
            .getRoomCounts()
            .then((counts) => {
              if (!cancelled) setRoomCounts(counts);
            })
            .catch(() => undefined);
        }
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
      setLastQuery(text);
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
      // The key card's mini door-states have to describe the hotel just
      // activated, not the one from screen-mount.
      api
        .getRooms()
        .then(setRoomStates)
        .catch(() => undefined);
      api
        .getRoomCounts()
        .then(setRoomCounts)
        .catch(() => undefined);
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
    // As a tab there is no header over this screen, so it takes the top inset
    // itself; as the choose-a-hotel gate it sits under a native modal header,
    // which already has. `onActivated` is exactly the difference between the two.
    <Screen safeTop={!onActivated} testID="screen-hotel">
      <Title>{COPY.hotel.title}</Title>
      {loadingActive ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : activeHotel ? (
        /* The designer's hotel card (2026-07-27): a plain lavender band
           where a photo would boast, the tracked eyebrow, the name over the
           city, the two doors inline, and the one-hotel sentence at the
           foot. */
        <View style={styles.hotelCard} testID="active-hotel-card">
          <View style={styles.hotelCardBand} />
          <View style={styles.hotelCardBody}>
            <DoorPlate>{COPY.hotel.activePlate}</DoorPlate>
            <View style={styles.hotelCardTitle}>
              <Heading>{activeHotel.name}</Heading>
              <Caption>{`${activeHotel.city}, ${activeHotel.country}`}</Caption>
            </View>
            {roomStates ? (
              <View style={styles.roomStates}>
                {roomStates.map((status) => (
                  <View key={status.room} style={styles.roomState}>
                    <Caption>
                      {status.room === 'UPCOMING'
                        ? COPY.rooms.upcomingPlate
                        : COPY.rooms.hereNowPlate}
                    </Caption>
                    <StateChip
                      open={status.eligible}
                      label={status.eligible ? COPY.rooms.openChip : COPY.rooms.closedChip}
                    />
                    {(() => {
                      const count = roomCounts?.find((entry) => entry.room === status.room);
                      return count?.headcount != null ? (
                        <Caption testID={`room-count-${status.room}`}>
                          {COPY_FOR.roomHeadcount(count.headcount)}
                        </Caption>
                      ) : null;
                    })()}
                  </View>
                ))}
              </View>
            ) : null}
            <Caption>{COPY.trust.oneHotel}</Caption>
          </View>
        </View>
      ) : (
        /* The designer's nothing-chosen card (2026-07-27): the little hotel
           in its pale disc, the invitation beside it, and the requirement
           worn as a quiet badge rather than an error. */
        <View style={styles.emptyCard} testID="hotel-empty-state">
          <View style={styles.emptyDisc}>
            <HotelBuilding />
          </View>
          <View style={styles.emptyText}>
            <Heading>{COPY.hotel.emptyTitle}</Heading>
            <Body>{COPY.hotel.emptyBody}</Body>
            <View style={styles.emptyBadge}>
              <InfoIcon />
              <Text style={styles.emptyBadgeText}>{COPY.hotel.emptyBadge}</Text>
            </View>
          </View>
        </View>
      )}

      {switchedNotice ? <Notice message={COPY.hotel.switchedNotice} testID="hotel-switched" /> : null}
      {activateError ? <Notice message={activateError} tone="error" testID="hotel-activate-error" /> : null}

      {pendingSwitch ? (
        <Card>
          <Heading>{COPY_FOR.switchPrompt(pendingSwitch.name)}</Heading>
          <Body>{COPY.trust.switchWarning}</Body>
          <Button
            label={COPY.hotel.switchButton}
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
        prefix={<MagnifierIcon />}
        testID="hotel-search"
      />
      {/* An ODbL licence term: the stored hotel data has to say where it is
          from, somewhere the person seeing it can read. */}
      <Caption>{COPY.hotel.attribution}</Caption>
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
      {searchError ? null : !searchable(query) ? (
        /* Idle is not empty (designer, 2026-07-27): quick queries, the
           popular destinations, and only then the type-to-search drawing. */
        <View style={styles.idle} testID="hotel-search-prompt">
          <Text style={styles.sectionTitle}>{COPY.hotel.quickOptions}</Text>
          <View style={styles.chipRow}>
            {QUICK_CITIES.map((city) => (
              <Pressable
                key={city}
                accessibilityRole="button"
                accessibilityLabel={city}
                onPress={() => changeQuery(city)}
                style={({ pressed }) => [styles.quickChip, pressed && styles.resultPressed]}
                testID={`quick-${city}`}
              >
                <CityIcon />
                <Text style={styles.quickChipLabel}>{city}</Text>
              </Pressable>
            ))}
            {lastQuery && !QUICK_CITIES.includes(lastQuery) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${COPY.hotel.lastSearch}: ${lastQuery}`}
                onPress={() => changeQuery(lastQuery)}
                style={({ pressed }) => [styles.quickChip, pressed && styles.resultPressed]}
                testID="quick-last-search"
              >
                <ClockIcon />
                <Text style={styles.quickChipLabel}>{COPY.hotel.lastSearch}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.sectionTitle}>{COPY.hotel.popularTitle}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinationRow}>
            {DESTINATIONS.map((destination) => (
              <DestinationCard
                key={destination.name}
                name={destination.name}
                colors={destination.colors}
                onPress={() => changeQuery(destination.query)}
                testID={`destination-${destination.name}`}
              />
            ))}
          </ScrollView>
          <View style={styles.promptScene}>
            <SearchScene />
            <Body>{COPY.hotel.searchPrompt}</Body>
          </View>
        </View>
      ) : results === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : results.length === 0 ? (
        <EmptyState message={COPY.hotel.noResults} testID="hotel-no-results" />
      ) : (
        results.map((hotel) => {
          const isActive = activeHotel?.id === hotel.id;
          return (
            /* Results wear the same card as the active hotel — the designer's
               one card, in two roles — with a slimmer band so the list stays
               a list. */
            <Pressable
              key={hotel.id}
              accessibilityRole="button"
              accessibilityLabel={
                isActive ? `${hotel.name}. ${COPY.hotel.activatedNote}` : COPY.hotel.activateCta(hotel.name)
              }
              accessibilityState={{ disabled: activating || isActive }}
              disabled={activating || isActive}
              onPress={() => requestActivation(hotel)}
              style={({ pressed }) => [styles.hotelCard, pressed && styles.resultPressed]}
              testID={`activate-${hotel.id}`}
            >
              <View style={styles.resultBand} />
              <View style={styles.resultBody}>
                {isActive ? <DoorPlate>{COPY.hotel.activePlate}</DoorPlate> : null}
                <View style={styles.hotelCardTitle}>
                  <Heading>{hotel.name}</Heading>
                  <Caption>{`${hotel.city}, ${hotel.country}`}</Caption>
                </View>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

/** Keeps a just-activated hotel in the cache even if it fell outside the last search. */
function mergeHotel(hotels: HotelCard[], hotel: HotelCard): HotelCard[] {
  if (hotels.some((h) => h.id === hotel.id)) return hotels;
  return [...hotels, hotel];
}

const styles = StyleSheet.create({
  /** The designer's card shell: hairline edge, soft lift, band on top. */
  hotelCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  hotelCardBand: { height: 48, backgroundColor: color.accent },
  hotelCardBody: { padding: spacing.lg, gap: spacing.md },
  hotelCardTitle: { gap: spacing.xs },
  resultBand: { height: 20, backgroundColor: color.accent },
  resultBody: { padding: spacing.md, gap: spacing.xs },
  roomStates: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  roomState: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: 'rgba(123, 79, 168, 0.05)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  emptyDisc: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(123, 79, 168, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { flex: 1, gap: spacing.xs },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    marginTop: spacing.xs,
  },
  emptyBadgeText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.accentDeep,
  },
  idle: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.ink,
    marginTop: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 168, 0.25)',
    backgroundColor: 'rgba(123, 79, 168, 0.04)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  quickChipLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    color: color.ink,
  },
  destinationRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  promptScene: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  resultPressed: { opacity: 0.8 },
});
