import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { RootStackParamList, TabParamList } from '../navigation/types';

import { Body, Button, Caption, Card, DoorPlate, EmptyState, Field, Heading, Notice, Screen, StateChip, Title } from '../components/ui';
import { DestinationCard } from '../components/DestinationCard';
import { HotelBuilding, SearchScene } from '../components/HotelIllustrations';
import { nowMs } from '../clock';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { apiErrorMessage, COPY, COPY_FOR, upperCase } from '../copy';
import { ApiError, getApi, readBackendConfig, type HotelCard, type RoomHeadcount, type RoomStatus, type UpcomingStay } from '../data';
import { VacationFeatureCard } from '../components/VacationFeatureCard';
import { CalendarIllustration, PinScene } from '../components/RoomIllustrations';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

/**
 * The designer's popular destinations. Names are proper nouns (no i18n);
 * the gradients stand in for photographs we hold no rights to, and the
 * reference's hotel counts are omitted because the catalogue fills lazily —
 * any number would be an invention. A card is a pre-typed query.
 */
const DESTINATIONS: { name: string; query: string; cityKey: string; colors: readonly [string, string] }[] = [
  { name: 'İstanbul', query: 'İstanbul', cityKey: 'istanbul', colors: ['#8E6BC7', '#54366E'] },
  { name: 'Antalya', query: 'Antalya', cityKey: 'antalya', colors: ['#A98BDE', '#6C55B4'] },
  { name: 'Kapadokya', query: 'Nevşehir', cityKey: 'kapadokya', colors: ['#C9A3E8', '#8A63B8'] },
];

/** A real photograph of the city through our proxy, or null in fake mode. */
function destinationSource(cityKey: string) {
  const config = readBackendConfig();
  if (!config) return null;
  return {
    uri: `${config.url}/functions/v1/hotel-photo?city=${cityKey}&w=600`,
    headers: { apikey: config.anonKey },
  };
}

const QUICK_CITIES = ['İstanbul', 'Antalya'];

/** "12 Ağu – 17 Ağu" in the device's language — dates, never documents. */
function formatStayRange(stay: UpcomingStay): string {
  const part = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${part(stay.startDate)} – ${part(stay.endDate)}`;
}

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

const CheckIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 12.5l5.5 5.5L20 6.5" />
  </Svg>
);

const PinSmallIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

const CalendarSmallIcon = () => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3} y={5} width={18} height={16} rx={3} />
    <Path d="M8 3v4M16 3v4M3 11h18" />
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
 * A photo served by our own hotel-photo function needs the platform's JWT
 * gate satisfied; a Commons URL needs nothing. The anon key is already in
 * the app bundle, so sending it is not a disclosure.
 */
/** Our proxy takes a width; other sources are already sized. */
function thumbUrl(url: string): string {
  return url.includes('/functions/v1/hotel-photo') ? `${url}&w=400` : url;
}

function photoSource(url: string) {
  const config = readBackendConfig();
  if (config && url.includes('/functions/v1/hotel-photo')) {
    // Only the apikey header: the gateway accepts the publishable key there,
    // while a non-JWT in Authorization would be refused.
    return { uri: url, headers: { apikey: config.anonKey } };
  }
  return { uri: url };
}

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
  const stackNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
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
  /** The declared window, shown on the active card (D-040). */
  const [stay, setStay] = useState<UpcomingStay | null>(null);

  const activeHotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;

  // Only the hotel already on this account. The catalog is deliberately not
  // fetched: a list of every hotel presented as though it were a result is an
  // invitation to pick one at random, and the one at the top would be chosen
  // far more often than it deserves. Nothing is shown until somebody asks.
  //
  // On focus rather than on mount: a tab stays mounted, and the owner
  // declared a stay in another screen only to come back to a card still
  // claiming the room was closed.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // R-003 lives with the cards: a lapsed Here Now check stops looking
    // open on its own, exactly as it did on the retired Rooms screen.
    const watchRooms = async () => {
      try {
        const rooms = await getApi().getRooms();
        if (cancelled) return;
        setRoomStates(rooms);
        const soonest = earliestRoomExpiry(rooms, nowMs());
        if (soonest !== null) {
          timer = setTimeout(watchRooms, soonest - nowMs());
        }
      } catch {
        // The card simply keeps its last answer.
      }
    };
    (async () => {
      try {
        const api = getApi();
        const active = await api.getActiveHotel();
        if (cancelled) return;
        dispatch({ type: 'ACTIVE_HOTEL_LOADED', activeHotel: active });
        if (active) {
          watchRooms();
          api
            .getRoomCounts()
            .then((counts) => {
              if (!cancelled) setRoomCounts(counts);
            })
            .catch(() => undefined);
          api
            .getUpcomingStay()
            .then((current) => {
              if (!cancelled) setStay(current);
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
      if (timer) clearTimeout(timer);
    };
  }, [dispatch]));

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
      api
        .getUpcomingStay()
        .then(setStay)
        .catch(() => setStay(null));
      setSwitchedNotice(result.previousHotelId !== null && result.previousHotelId !== hotel.id);
      // Choosing ends the search: clear the query so the screen settles on
      // the card of the hotel just chosen rather than the list it came from.
      setQuery('');
      setResults([]);
      if (onActivated) {
        // The gate: choosing finishes the errand it interrupted.
        onActivated();
      }
      // As a tab the screen stays (D-040): the next decision — dates or a
      // proximity check — is made right here, on the feature cards below.
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
      <Title>{onActivated ? COPY.hotel.title : COPY.tabs.vacation}</Title>
      {!onActivated && !activeHotel && !searchable(query) ? (
        <Body>{COPY.vacation.planTitle}</Body>
      ) : null}
      {/* The reference puts the search first: the screen opens ready to be
          asked. The ODbL line stays beside it — a licence term, not a
          caption. */}
      <Field
        label={COPY.hotel.searchLabel}
        value={query}
        onChangeText={changeQuery}
        placeholder={COPY.hotel.searchPlaceholder}
        prefix={<MagnifierIcon />}
        testID="hotel-search"
      />
      <Caption>{COPY.hotel.attribution}</Caption>
      {searchable(query) ? null : loadingActive ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : activeHotel ? (
        /* The designer's active card (2026-07-27, "resim şart"): a real
           photograph when the catalogue has one — Commons, credited — and
           the lavender band when it honestly does not. Under it: the name,
           the place, the selected pill, the two doors as tiles, the
           one-hotel line. */
        <View style={styles.hotelCard} testID="active-hotel-card">
          <View>
            {activeHotel.photoUrl ? (
              <Image
                source={photoSource(activeHotel.photoUrl)}
                style={styles.hotelPhoto}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                testID="active-hotel-photo"
              />
            ) : (
              <View style={styles.hotelCardBand} />
            )}
            <View style={styles.activeBadge}>
              <View style={styles.activeBadgeDot}>
                <CheckIcon />
              </View>
              <Text style={styles.activeBadgeText}>{upperCase(COPY.hotel.activePlate)}</Text>
            </View>
            {activeHotel.photoUrl && activeHotel.photoAttribution ? (
              <Text style={styles.photoCredit} numberOfLines={1}>
                {activeHotel.photoAttribution}
              </Text>
            ) : null}
          </View>
          <View style={styles.hotelCardBody}>
            <View style={styles.activeHeadRow}>
              <View style={styles.activeHeadText}>
                <Heading>{activeHotel.name}</Heading>
                <View style={styles.placeRow}>
                  <PinSmallIcon />
                  <Caption>{`${activeHotel.city}, ${activeHotel.country}`}</Caption>
                </View>
                <View style={styles.selectedPill}>
                  <View style={styles.selectedPillDot}>
                    <CheckIcon />
                  </View>
                  <Text style={styles.selectedPillText}>{COPY.hotel.selectedActive}</Text>
                </View>
              </View>
              <View style={styles.activeArtCircle}>
                <HotelBuilding size={54} />
              </View>
            </View>
            {roomStates ? (
              <View style={styles.roomTiles}>
                {roomStates.map((status) => {
                  const count = roomCounts?.find((entry) => entry.room === status.room);
                  return (
                    <View key={status.room} style={styles.roomTile}>
                      {status.room === 'UPCOMING' ? <CalendarSmallIcon /> : <PinSmallIcon />}
                      <View style={styles.roomTileText}>
                        <Caption>
                          {status.room === 'UPCOMING'
                            ? COPY.rooms.upcomingPlate
                            : COPY.rooms.hereNowPlate}
                        </Caption>
                        <StateChip
                          open={status.eligible}
                          label={status.eligible ? COPY.rooms.openChip : COPY.rooms.closedChip}
                        />
                        {count?.headcount != null ? (
                          <Caption testID={`room-count-${status.room}`}>
                            {COPY_FOR.roomHeadcount(count.headcount)}
                          </Caption>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {stay ? (
              <Caption testID="active-hotel-dates">{formatStayRange(stay)}</Caption>
            ) : null}
            <Caption>{COPY.trust.oneHotel}</Caption>
            <Pressable
              accessibilityRole="button"
              onPress={() => stackNavigation.navigate('HotelDetails', { hotelId: activeHotel.id })}
              style={({ pressed }) => [styles.detailsRow, pressed && styles.resultPressed]}
              testID="hotel-details"
            >
              <Text style={styles.detailsLabel}>{COPY.hotel.detailsCta}</Text>
              <Text style={styles.detailsChevron}>›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => stackNavigation.navigate('ChooseHotel')}
              style={({ pressed }) => [styles.detailsRow, pressed && styles.resultPressed]}
              testID="hotel-change"
            >
              <Text style={styles.detailsLabel}>{COPY.vacation.changeHotel}</Text>
              <Text style={styles.detailsChevron}>›</Text>
            </Pressable>
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

      {activeHotel && !searchable(query) && !onActivated ? (
        /* D-040: the two hotel features live right under the hotel they
           belong to. The trip tab is choose → decide, one screen. */
        <>
          <VacationFeatureCard
            room="UPCOMING"
            status={roomStates?.find((r) => r.room === 'UPCOMING') ?? null}
            lead={COPY.rooms.upcomingLead}
            body={COPY.vacation.upcomingFeatureBody}
            illustration={<CalendarIllustration />}
            icon={<CalendarSmallIcon />}
            buttonLabel={
              roomStates?.find((r) => r.room === 'UPCOMING')?.eligible
                ? COPY.upcoming.updateButton
                : COPY.upcoming.saveButton
            }
            onOpen={() => stackNavigation.navigate('Upcoming')}
            extra={
              roomStates?.find((r) => r.room === 'UPCOMING')?.eligible ? (
                <Button
                  label={COPY.vacation.discoverCta}
                  onPress={() => tabNavigation.navigate('Discovery', { source: 'UPCOMING' })}
                  testID="vacation-discover-upcoming"
                />
              ) : null
            }
            testID="room-upcoming"
            buttonTestID="open-upcoming"
          />
          <VacationFeatureCard
            room="HERE_NOW"
            status={roomStates?.find((r) => r.room === 'HERE_NOW') ?? null}
            lead={COPY.rooms.hereNowLead}
            body={COPY.vacation.hereNowFeatureBody}
            illustration={<PinScene />}
            icon={<PinSmallIcon />}
            tag={state.profile?.isPremium ? undefined : COPY.vacation.premiumTag}
            buttonLabel={COPY.hereNow.checkButton}
            onOpen={() => stackNavigation.navigate('HereNow')}
            extra={
              roomStates?.find((r) => r.room === 'HERE_NOW')?.eligible ? (
                <Button
                  label={COPY.vacation.discoverCta}
                  onPress={() => tabNavigation.navigate('Discovery', { source: 'HERE_NOW' })}
                  testID="vacation-discover-here-now"
                />
              ) : null
            }
            testID="room-here-now"
            buttonTestID="open-here-now"
          />
        </>
      ) : null}
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
          {activeHotel || onActivated ? null : (
            <>
          {/* D-040: the two features are visible before a hotel exists, each
              honestly locked behind the one thing they need. */}
          <VacationFeatureCard
            room="UPCOMING"
            status={null}
            lead={COPY.rooms.upcomingLead}
            body={COPY.vacation.upcomingFeatureBody}
            illustration={<CalendarIllustration />}
            icon={<CalendarSmallIcon />}
            buttonLabel={COPY.vacation.chooseFirst}
            onOpen={() => stackNavigation.navigate('ChooseHotel')}
            testID="room-upcoming-locked"
            buttonTestID="vacation-choose-for-upcoming"
          />
          <VacationFeatureCard
            room="HERE_NOW"
            status={null}
            lead={COPY.rooms.hereNowLead}
            body={COPY.vacation.hereNowFeatureBody}
            illustration={<PinScene />}
            icon={<PinSmallIcon />}
            tag={COPY.vacation.premiumTag}
            buttonLabel={COPY.vacation.chooseFirst}
            onOpen={() => stackNavigation.navigate('ChooseHotel')}
            testID="room-here-now-locked"
            buttonTestID="vacation-choose-for-here-now"
          />
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
            </>
          )}
          <Text style={styles.sectionTitle}>{COPY.hotel.popularTitle}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinationRow}>
            {DESTINATIONS.map((destination) => (
              <DestinationCard
                key={destination.name}
                name={destination.name}
                colors={destination.colors}
                source={destinationSource(destination.cityKey)}
                onPress={() => changeQuery(destination.query)}
                testID={`destination-${destination.name}`}
              />
            ))}
          </ScrollView>
          {activeHotel ? null : (
            <View style={styles.promptScene}>
              <SearchScene />
              <Body>{COPY.hotel.searchPrompt}</Body>
            </View>
          )}
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
              {hotel.photoUrl ? (
                /* A small photo helps tell two same-brand hotels apart before
                   choosing — asked for at thumbnail size, not card size. */
                <Image
                  source={photoSource(thumbUrl(hotel.photoUrl))}
                  style={styles.resultPhoto}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  testID={`result-photo-${hotel.id}`}
                />
              ) : (
                <View style={styles.resultBand} />
              )}
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
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  hotelCardBand: { height: 96, backgroundColor: color.accent },
  hotelPhoto: { width: '100%', height: 190, backgroundColor: color.veil },
  activeBadge: {
    position: 'absolute',
    top: spacing.sm + 4,
    left: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.accentDeep,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  activeBadgeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  /** The licence's half of the bargain, on the photo it pays for. */
  photoCredit: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    maxWidth: '80%',
  },
  activeHeadRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  activeHeadText: { flex: 1, gap: spacing.xs },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  selectedPillDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: color.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.accentDeep,
  },
  activeArtCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(123, 79, 168, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTiles: { flexDirection: 'row', gap: spacing.sm },
  roomTile: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    backgroundColor: 'rgba(123, 79, 168, 0.03)',
  },
  roomTileText: { flex: 1, gap: 4 },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(123, 79, 168, 0.05)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  detailsLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    color: color.ink,
  },
  detailsChevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.inkMuted,
  },
  hotelCardBody: { padding: spacing.lg, gap: spacing.md },
  hotelCardTitle: { gap: spacing.xs },
  resultBand: { height: 20, backgroundColor: color.accent },
  resultPhoto: { width: '100%', height: 110, backgroundColor: color.veil },
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
