import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';

import type { RootStackParamList, TabParamList } from '../navigation/types';

import { Body, Button, Caption, Card, Heading, Notice, Screen } from '../components/ui';
import { nowMs } from '../clock';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { apiErrorMessage, COPY, COPY_FOR, roomStatusExplanation } from '../copy';
import {
  ApiError,
  getApi,
  readBackendConfig,
  type ActiveVenue,
  type HotelCard,
  type RoomHeadcount,
  type RoomStatus,
  type UpcomingStay,
  type VenueSearchMode,
} from '../data';
import { VenuePicker } from '../components/VenuePicker';
import { VacationFeatureCard } from '../components/VacationFeatureCard';
import { ProfileRing } from '../components/ProfileRing';
import { useAppStore } from '../state/AppStore';
import { color, fontFamily, glass, radius, spacing } from '../theme';

const EMPTY_DISC = require('../../assets/dark-hotel-disc.png');

/**
 * The photo band's stand-in (10:118): plum falling into the night ground,
 * for the hotel the catalogue holds no photograph of.
 */
const BAND_FALLBACK = ['#6B2E63', '#1C172E'] as const;

/** "12 Ağu – 17 Ağu" in the device's language — dates, never documents. */
function formatStayRange(stay: UpcomingStay): string {
  const part = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${part(stay.startDate)} – ${part(stay.endDate)}`;
}

const InfoIcon = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2.2} strokeLinecap="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

const CheckIcon = () => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 12.5l5.5 5.5L20 6.5" />
  </Svg>
);

const PinSmallIcon = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/**
 * A photo served by our own hotel-photo function needs the platform's JWT
 * gate satisfied; a Commons URL needs nothing. The anon key is already in
 * the app bundle, so sending it is not a disclosure.
 */
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
  /**
   * The picker is open when there is nothing chosen yet, or when somebody
   * asked to change it (D-054). It replaced a query-driven screen: the flow is
   * now two deliberate steps, so "is the user searching" is a state rather
   * than a length check on a text box.
   */
  const [picking, setPicking] = useState(false);
  /** Which provider is behind the active venue, and its Place ID if Google. */
  const [activeVenue, setActiveVenue] = useState<ActiveVenue | null>(null);
  /**
   * A Google venue's name, resolved live for this screen and kept in memory
   * only — it is never written down (D-054). `null` while it is being fetched,
   * `false` when Google could not answer, which the card says plainly rather
   * than inventing a name.
   */
  const [googleName, setGoogleName] = useState<string | null | false>(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<
    { selectionToken: string; mode: VenueSearchMode; name: string } | null
  >(null);
  const [switchedNotice, setSwitchedNotice] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  /** For the state words on the two feature cards. */
  const [roomStates, setRoomStates] = useState<RoomStatus[] | null>(null);
  /**
   * Thresholded headcounts (D-032). A null entry renders as nothing — no
   * "quiet room" wording — because below five people even "somebody is
   * here" points at a person.
   */
  const [roomCounts, setRoomCounts] = useState<RoomHeadcount[] | null>(null);
  /** The declared window, shown on the active card (D-040). */
  const [stay, setStay] = useState<UpcomingStay | null>(null);

  // The one question every branch of this screen asks — "is a hotel
  // chosen" — is answered by the id the store hydrated, never by whether
  // the card's details happen to be cached yet (the bug: a returning
  // account read as "no hotel chosen" until a search refilled the cache).
  const activeId = state.activeHotel?.hotelId ?? null;
  const activeHotel = state.hotels.find((h) => h.id === activeId) ?? null;

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
        // name. Resolved by the id itself — a catalogue search cannot be
        // trusted to contain it — and merged into the store, so nothing
        // becomes selectable that nobody searched for.
        if (active) {
          const card = await api.getHotelById(active.hotelId).catch(() => null);
          if (!cancelled && card) dispatch({ type: 'HOTELS_LOADED', hotels: [card] });

          // D-054: a Google venue holds no name. Which provider it is decides
          // whether one has to be fetched, and the answer stays in memory for
          // as long as this screen is drawn — no longer.
          const venue = await api.getActiveVenue().catch(() => null);
          if (cancelled) return;
          setActiveVenue(venue);
          if (venue?.provider === 'google' && venue.googlePlaceId) {
            setGoogleName(null);
            const resolved = await api.resolveGooglePlace(venue.googlePlaceId).catch(() => null);
            if (!cancelled) setGoogleName(resolved ?? false);
          } else {
            setGoogleName(null);
          }
        } else {
          setActiveVenue(null);
          setGoogleName(null);
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
   * Commits a Google selection as the one active vacation venue.
   *
   * The token is all the client has — it never learned a Place ID — and the
   * server resolves it to the internal venue, which is what makes two people
   * who chose the same place land in the same room (D-054 §2).
   */
  const activate = async (choice: { selectionToken: string; mode: VenueSearchMode; name: string }) => {
    setPendingSwitch(null);
    setActivating(true);
    setActivateError(null);
    try {
      const api = getApi();
      const result = await api.activateGoogleVenue(choice.selectionToken, choice.mode);
      const active = await api.getActiveHotel();
      const card = await api.getHotelById(result.hotelId).catch(() => null);
      if (card) dispatch({ type: 'HOTELS_LOADED', hotels: mergeHotel(state.hotels, card) });
      dispatch({
        type: 'HOTEL_ACTIVATED',
        activeHotel: active ?? { hotelId: result.hotelId, activatedAt: nowMs() },
      });
      setActiveVenue(await api.getActiveVenue().catch(() => null));
      // The name the user just read, kept for this screen only. Resolving it
      // again from Google would be a second paid call for a string already on
      // the device.
      setGoogleName(choice.name);
      // The feature cards' state words have to describe the venue just
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
      setSwitchedNotice(result.previousHotelId !== null && result.previousHotelId !== result.hotelId);
      // Choosing ends the search: the screen settles on the card of the venue
      // just chosen rather than the list it came from.
      setPicking(false);
      if (onActivated) {
        // The gate: choosing finishes the errand it interrupted.
        onActivated();
      }
      // As a tab the screen stays (D-040): the next decision — dates or a
      // location check — is made right here, on the feature cards below.
    } catch (err) {
      setActivateError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setActivating(false);
    }
  };

  const requestActivation = (
    selectionToken: string,
    mode: VenueSearchMode,
    name: string,
  ) => {
    setSwitchedNotice(false);
    if (activeId) {
      // Switching closes the previous venue's discovery immediately (D-004),
      // which is worth confirming rather than doing on one tap.
      setPendingSwitch({ selectionToken, mode, name });
      return;
    }
    activate({ selectionToken, mode, name });
  };

  /** What the active card is allowed to call the venue, and nothing more. */
  const activeName = activeVenue?.provider === 'google'
    ? googleName === false
      ? COPY.venue.nameUnavailable
      : (googleName ?? COPY.common.loading)
    : (activeHotel?.name ?? null);

  const upcomingStatus = roomStates?.find((r) => r.room === 'UPCOMING') ?? null;
  const upcomingOpen = upcomingStatus?.eligible === true;
  const hereNowStatus = roomStates?.find((r) => r.room === 'HERE_NOW') ?? null;
  const hereNowOpen = hereNowStatus?.eligible === true;

  // The live card's one line (10:128): the declared window and what it opens.
  const upcomingBody = upcomingOpen
    ? stay
      ? COPY_FOR.upcomingWindow(formatStayRange(stay))
      : roomStatusExplanation('UPCOMING', upcomingStatus as RoomStatus)
    : COPY.vacation.upcomingFeatureBody;
  // The server's reason a room is shut stays on the card (D-002/D-007): the
  // chip says closed, this says why, and the server is the one saying it.
  const upcomingNote =
    upcomingStatus && !upcomingOpen ? roomStatusExplanation('UPCOMING', upcomingStatus) : undefined;
  const hereNowNote = hereNowStatus ? roomStatusExplanation('HERE_NOW', hereNowStatus) : undefined;

  const countFor = (room: RoomStatus['room']) => {
    const entry = roomCounts?.find((candidate) => candidate.room === room);
    if (entry?.headcount == null) return null;
    return <Caption testID={`room-count-${room}`}>{COPY_FOR.roomHeadcount(entry.headcount)}</Caption>;
  };

  return (
    // As a tab there is no header over this screen, so it takes the top inset
    // itself; as the choose-a-hotel gate it sits under a native modal header,
    // which already has. `onActivated` is exactly the difference between the two.
    <Screen safeTop={!onActivated} testID="screen-hotel">
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {onActivated ? COPY.hotel.title : COPY.tabs.vacation}
        </Text>
        {onActivated ? null : (
          // The Figma header's ring (10:74), now the only way to Settings
          // (D-057) as well as to your own profile.
          <ProfileRing testID="hotel-profile-ring" />
        )}
      </View>
      {!onActivated && !activeId && !picking ? (
        <Text style={styles.subtitle}>{COPY.vacation.subtitle}</Text>
      ) : null}
      {/* D-054: the trip tab's search is the two-step Google picker. It stands
          where the one catalogue box used to, and it is the only way a
          vacation venue is chosen. */}
      {picking ? (
        <VenuePicker onChosen={requestActivation} busy={activating} />
      ) : null}
      {picking ? null : loadingActive || (activeId && !activeHotel) ? (
        // Either the answer is on its way, or the id is known and its card
        // is still being resolved. Neither is "no hotel chosen".
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : activeHotel ? (
        /* The Figma active card (10:117): the photo band, the name, one line
           of place and dates, and the selected pill. The whole card is the
           way to the hotel's details. */
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${activeName ?? activeHotel.name}. ${COPY.hotel.detailsCta}`}
          onPress={() => stackNavigation.navigate('HotelDetails', { hotelId: activeHotel.id })}
          style={({ pressed }) => [styles.hotelCard, pressed && styles.resultPressed]}
          testID="active-hotel-card"
        >
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
              <LinearGradient colors={[...BAND_FALLBACK]} style={styles.hotelCardBand} />
            )}
            {activeHotel.photoUrl && activeHotel.photoAttribution ? (
              <Text style={styles.photoCredit} numberOfLines={1}>
                {activeHotel.photoAttribution}
              </Text>
            ) : null}
          </View>
          <View style={styles.hotelCardBody}>
            {/* D-054: for a Google venue this is a name resolved a moment ago
                and held in memory, never a stored one. */}
            <Text style={styles.hotelName} testID="active-hotel-name">
              {activeName ?? activeHotel.name}
            </Text>
            <View style={styles.placeRow}>
              <PinSmallIcon />
              <Text style={styles.metaText} testID="active-hotel-dates">
                {/* A Google venue has no city or country of ours to print —
                    they are Google's content, so the line carries only what
                    the user themselves declared. */}
                {activeVenue?.provider === 'google'
                  ? (stay ? formatStayRange(stay) : COPY.venue.attribution)
                  : `${activeHotel.city}, ${activeHotel.country}${stay ? `   ·   ${formatStayRange(stay)}` : ''}`}
              </Text>
            </View>
            <View style={styles.selectedPill}>
              <CheckIcon />
              <Text style={styles.selectedPillText}>{COPY.hotel.selectedActive}</Text>
            </View>
          </View>
        </Pressable>
      ) : (
        /* The Figma nothing-chosen card (10:79): the little hotel in its dark
           disc, the invitation beside it, and the requirement worn as a quiet
           badge rather than an error. */
        <View style={styles.emptyCard} testID="hotel-empty-state">
          {/* The sheet's 74 disc (10:80): the art clipped into the circle. */}
          <View style={styles.emptyDisc}>
            <Image
              source={EMPTY_DISC}
              style={styles.emptyDiscArt}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
          <View style={styles.emptyText}>
            <Text style={styles.emptyTitle}>{COPY.hotel.emptyTitle}</Text>
            <Text style={styles.emptyBody}>{COPY.hotel.emptyBody}</Text>
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

      {activeId && !picking && !onActivated ? (
        /* D-040 in the Figma card shape (10:124, 10:131): the two features
           right under the hotel they belong to. When Upcoming is live its
           button becomes the deck, and updating the dates steps back to a
           quiet second action. */
        <>
          <VacationFeatureCard
            room="UPCOMING"
            status={upcomingStatus}
            lead={COPY.rooms.upcomingLead}
            body={upcomingBody}
            note={upcomingNote}
            counts={countFor('UPCOMING')}
            buttonLabel={upcomingOpen ? COPY.vacation.discoverCta : COPY.upcoming.saveButton}
            onOpen={
              upcomingOpen
                ? () => tabNavigation.navigate('Discovery', { source: 'UPCOMING' })
                : () => stackNavigation.navigate('Upcoming')
            }
            extra={
              upcomingOpen ? (
                <Button
                  label={COPY.upcoming.updateButton}
                  variant="secondary"
                  onPress={() => stackNavigation.navigate('Upcoming')}
                  testID="open-upcoming"
                />
              ) : null
            }
            testID="room-upcoming"
            buttonTestID={upcomingOpen ? 'vacation-discover-upcoming' : 'open-upcoming'}
          />
          <VacationFeatureCard
            room="HERE_NOW"
            status={hereNowStatus}
            lead={COPY.rooms.hereNowLead}
            body={COPY.vacation.hereNowFeatureBody}
            note={hereNowNote}
            tag={state.profile?.isPremium ? undefined : COPY.vacation.premiumTag}
            counts={countFor('HERE_NOW')}
            buttonLabel={COPY.hereNow.checkButton}
            onOpen={() => stackNavigation.navigate('HereNow')}
            extra={
              hereNowOpen ? (
                <Button
                  label={COPY.vacation.discoverCta}
                  variant="secondary"
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
      {/* The way into the picker, and the way back out of it. Choosing is a
          step somebody takes deliberately, so it is a button rather than a
          text box that is always live — which is also what keeps a stray
          keystroke from reaching a metered provider (§6). */}
      {picking ? (
        activeId ? (
          <Button
            label={COPY.common.cancel}
            variant="secondary"
            onPress={() => setPicking(false)}
            disabled={activating}
            testID="venue-cancel"
          />
        ) : null
      ) : loadingActive ? null : (
        <Button
          label={activeId ? COPY.hotel.switchButton : COPY.hotel.chooseCta}
          variant={activeId ? 'secondary' : 'primary'}
          onPress={() => setPicking(true)}
          testID="venue-open-picker"
        />
      )}

      {/* Idle on the not-yet-chosen screen is one card (10:86): the feature
          that exists before any venue does, honestly shut behind the one
          thing it needs. */}
      {!picking && !activeId && !onActivated && !loadingActive ? (
        <View style={styles.idle} testID="hotel-search-prompt">
          <VacationFeatureCard
            room="UPCOMING"
            status={null}
            lead={COPY.rooms.upcomingLead}
            body={COPY.vacation.upcomingFeatureBody}
            buttonLabel={COPY.vacation.chooseFirst}
            onOpen={() => setPicking(true)}
            testID="room-upcoming-locked"
            buttonTestID="vacation-choose-for-upcoming"
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** Keeps a just-activated hotel in the cache even if it fell outside the last search. */
function mergeHotel(hotels: HotelCard[], hotel: HotelCard): HotelCard[] {
  if (hotels.some((h) => h.id === hotel.id)) return hotels;
  return [...hotels, hotel];
}

const styles = StyleSheet.create({
  /** The Figma header row (10:72): the tab's name, and the ring to yourself. */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 34 * 1.15,
    color: color.ink,
  },
  profileRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.4,
    borderColor: 'rgba(244, 114, 182, 0.5)',
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * 1.45,
    color: color.inkMuted,
  },
  searchLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    color: color.inkMuted,
  },
  /** The Figma placeholder size (10:78). */
  searchInput: { fontSize: 14 },
  /** The Figma card shell (10:117): glass, the light hairline, 22 corners. */
  hotelCard: {
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  hotelCardBand: { height: 140 },
  hotelPhoto: { width: '100%', height: 140, backgroundColor: color.veil },
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
  hotelCardBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 6,
  },
  hotelName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 18,
    color: color.ink,
  },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: color.inkMuted,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectedPillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    color: color.accentDeep,
  },
  /** The Figma empty card (10:79): 20 corners, 16 inside, 14 between. */
  emptyCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: 20,
    padding: 16,
  },
  /** The 74 disc (10:80): a circle over the pink-soft fill, the art inside. */
  emptyDisc: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: color.veil,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDiscArt: { width: 74, height: 74 },
  emptyText: { flex: 1, gap: 6 },
  emptyTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    color: color.ink,
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * 1.45,
    color: color.inkMuted,
  },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emptyBadgeText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    color: color.accentDeep,
  },
  idle: { gap: 14 },
  resultBand: { height: 20, backgroundColor: color.accent },
  resultPhoto: { width: '100%', height: 110, backgroundColor: color.veil },
  resultBody: { padding: spacing.md, gap: spacing.xs },
  hotelCardTitle: { gap: spacing.xs },
  resultPressed: { opacity: 0.8 },
});
