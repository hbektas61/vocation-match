import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { RootStackParamList, TabParamList } from '../navigation/types';

import { Body, Button, Card, ConfirmDialog, Heading, Notice, PhotoScrim, Screen } from '../components/ui';
import { nowMs } from '../clock';
import { formatStayRangeLabel } from '../domain/dates';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { apiErrorMessage, COPY, COPY_FOR, upperCase } from '../copy';
import {
  ApiError,
  getApi,
  readBackendConfig,
  type ActiveVenue,
  type HotelCard,
  type RoomStatus,
  type UpcomingStay,
  type VenueSearchMode,
} from '../data';
import { HotelBuilding } from '../components/HotelIllustrations';
import { VenuePicker } from '../components/VenuePicker';
import { VacationFeatureCard } from '../components/VacationFeatureCard';
import { ProfileRing } from '../components/ProfileRing';
import { useAppStore } from '../state/AppStore';
import { color, elevation, fontFamily, radius, spacing } from '../theme';


/** "12–17 Ağustos" in the app's language — dates, never documents. */
function formatStayRange(stay: UpcomingStay): string {
  return formatStayRangeLabel(stay.startDate, stay.endDate);
}

const InfoIcon = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2.2} strokeLinecap="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

const PinSmallIcon = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** 131:87 — the drawn stand-ins for the frame's suitcase and bed emojis. */
const SuitcaseIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={7} width={16} height={13} rx={2.5} />
    <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 11v5M15 11v5" />
  </Svg>
);

const BedIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 5v14" />
    <Path d="M3 15h18v4" />
    <Path d="M3 11h13a4 4 0 0 1 4 4" />
  </Svg>
);

/** 131:86/92 — the drawn room teaser: a disc, a word, a sentence, an arrow. */
function RoomTeaser({
  icon,
  title,
  body,
  open = false,
  onPress,
  testID,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** The room is live: the card says so with the shared green mark. */
  open?: boolean;
  onPress: () => void;
  testID: string;
  extra?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${open ? `${COPY.vacation.cardOpen}. ` : ''}${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.teaser, pressed && styles.resultPressed]}
      testID={testID}
    >
      <View style={styles.teaserDisc}>{icon}</View>
      <Text style={styles.teaserTitle}>{title}</Text>
      {open ? (
        /* The declared stay reads back from the card itself — pressing in is
           no longer the only proof the declaration landed. */
        <View style={styles.teaserOpenRow}>
          <View style={styles.teaserOpenDot} />
          <Text style={styles.teaserOpenText}>{COPY.vacation.cardOpen}</Text>
        </View>
      ) : null}
      <Text style={styles.teaserBody}>{body}</Text>
      <Text style={styles.teaserArrow} accessibilityElementsHidden importantForAccessibility="no">
        {'→'}
      </Text>
      {extra}
    </Pressable>
  );
}

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
  /** The venue's one live photo, held exactly like the name is (D-054). */
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<
    { selectionToken: string; mode: VenueSearchMode; name: string } | null
  >(null);
  const [switchedNotice, setSwitchedNotice] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  /** For the state words on the two feature cards. */
  const [roomStates, setRoomStates] = useState<RoomStatus[] | null>(null);
  /** The declared window, shown on the active card (D-040). */
  const [stay, setStay] = useState<UpcomingStay | null>(null);
  /** The exit, on the tab itself (owner, 2026-08-03): it asks before it acts. */
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
            if (!cancelled) {
              setGoogleName(resolved?.name ?? false);
              setGooglePhoto(resolved?.photoUri ?? null);
            }
          } else {
            setGoogleName(null);
            setGooglePhoto(null);
          }
        } else {
          setActiveVenue(null);
          setGoogleName(null);
          setGooglePhoto(null);
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
      const venue = await api.getActiveVenue().catch(() => null);
      setActiveVenue(venue);
      // The name the user just read, kept for this screen only. Resolving it
      // again from Google would be a second paid call for a string already on
      // the device.
      setGoogleName(choice.name);
      // The photo is the one thing the selection did not carry, so it is the
      // one thing worth a call here — without this, the hero stayed a bare
      // band until the next focus happened to re-run the resolver (owner
      // report, 2026-08-03: "the photo only appears after I pick dates").
      setGooglePhoto(null);
      if (venue?.provider === 'google' && venue.googlePlaceId) {
        api
          .resolveGooglePlace(venue.googlePlaceId)
          .then((identity) => setGooglePhoto(identity?.photoUri ?? null))
          .catch(() => undefined);
      }
      // The feature cards' state words have to describe the venue just
      // activated, not the one from screen-mount.
      api
        .getRooms()
        .then(setRoomStates)
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
        <VenuePicker
          onChosen={requestActivation}
          onClose={() => setPicking(false)}
          busy={activating}
          confirmSelection={!activeId}
        />
      ) : null}
      {picking ? null : loadingActive || (activeId && !activeHotel) ? (
        // Either the answer is on its way, or the id is known and its card
        // is still being resolved. Neither is "no hotel chosen".
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : activeHotel ? (
        <>
        {stay ? (
          <View style={styles.stayPill} testID="active-stay-pill">
            <PinSmallIcon />
            <Text style={styles.stayPillText} numberOfLines={1}>
              {/* A Google venue has no city of ours to print (D-054): the
                  pill carries the dates alone rather than the stub. */}
              {[
                activeHotel.provider === 'google' ? null : activeHotel.city,
                formatStayRange(stay),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ) : null}
        {/* The Figma active card (10:117): the photo band, the name, one line
            of place and dates, and the selected pill. The whole card is the
            way to the hotel's details. */}
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
            ) : googlePhoto ? (
              /* A Google venue's photo, resolved a moment ago beside its
                 name and kept nowhere — the "Powered by Google" line on the
                 plate below credits both (D-054). */
              <Image
                source={{ uri: googlePhoto }}
                style={styles.hotelPhoto}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                testID="active-hotel-photo"
              />
            ) : (
              // No photograph on file: a flat inert well rather than a
              // decorative gradient — D-058 keeps full-bleed colour to its
              // two allowlisted moments, and this band is neither.
              <View style={styles.hotelCardBand} />
            )}
            {activeHotel.photoUrl && activeHotel.photoAttribution ? (
              <>
                {/* The credit sits on the photo itself, so it needs the same
                    scrim any text on a photograph needs — a photo can be any
                    brightness, and the licence line has to stay legible. */}
                <PhotoScrim />
                <Text style={styles.photoCredit} numberOfLines={1}>
                  {activeHotel.photoAttribution}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.heroPlate}>
            <Text style={styles.heroPlateLabel}>{upperCase(COPY.hotel.activePlate)}</Text>
            {/* D-054: for a Google venue this is a name resolved a moment ago
                and held in memory, never a stored one. */}
            <Text style={styles.heroPlateName} testID="active-hotel-name">
              {activeName ?? activeHotel.name}
            </Text>
            {/* A Google venue has no city or country of ours to print — they
                are Google's content — so the line under the name carries only
                what the user themselves declared, and is absent until they
                declare it. It used to fall back to the attribution, which put
                "Powered by Google" behind a location pin as though that were
                where the place is. */}
            {activeVenue?.provider !== 'google' || stay ? (
              /* 131:83: "Alaçatı, İzmir · 12–17 Ağustos" — one quiet line,
                 no pin, the dot as the only punctuation between facts. */
              <Text style={styles.heroPlateMeta} numberOfLines={1} testID="active-hotel-dates">
                {activeVenue?.provider === 'google'
                  ? formatStayRange(stay!)
                  : [`${activeHotel.city}, ${activeHotel.country}`, stay ? formatStayRange(stay) : null]
                      .filter(Boolean)
                      .join(' · ')}
              </Text>
            ) : null}
            {/* The attribution is a credit, not an address: its own quiet line,
                and present whenever the name on this card came from Google —
                including once dates exist, when the old code dropped it. */}
            {activeVenue?.provider === 'google' ? (
              <Text style={styles.venueAttribution} testID="active-hotel-attribution">
                {COPY.venue.attribution}
              </Text>
            ) : null}
          </View>
        </Pressable>
        </>
      ) : (
        /* The Figma nothing-chosen card (10:79): the little hotel in its disc,
           the invitation beside it, and the requirement worn as a quiet badge
           rather than an error. */
        <View style={styles.emptyCard} testID="hotel-empty-state">
          {/* The 74 disc (10:80). D-058: this was a raster commissioned for the
              night theme — a navy disc that read as a hole once the card went
              white. The drawn version is the same subject in the light tokens,
              and it scales instead of being squeezed into the circle. */}
          <View style={styles.emptyDisc}>
            <HotelBuilding size={44} />
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
        /* D-040, in T-01's geometry: the drawn heading, then the two rooms
           side by side. When Upcoming is live its button becomes the deck,
           and updating the dates steps back to a quiet second action. */
        <>
          <Text style={styles.roomsHeading}>{COPY.vacation.whereWillYouBe}</Text>
          {/* 131:85, exactly as drawn: two quiet teasers — a disc, a word, a
              sentence, an arrow. The state chips, server notes and headcounts
              this grid used to carry live on in the rooms themselves; the tab
              only points. */}
          <View style={styles.roomsGrid}>
            <RoomTeaser
              icon={<SuitcaseIcon />}
              title={COPY.vacation.upcomingCardTitle}
              body={COPY.vacation.upcomingCardBody}
              open={upcomingOpen}
              onPress={
                upcomingOpen
                  ? () => tabNavigation.navigate('Discovery', { source: 'UPCOMING' })
                  : () => stackNavigation.navigate('Upcoming')
              }
              testID={upcomingOpen ? 'vacation-discover-upcoming' : 'open-upcoming'}
              extra={
                upcomingOpen ? (
                  /* The dates stay editable once the room is live — the card's
                     own press has become the deck, so updating steps down to
                     this quiet line. */
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={COPY.upcoming.updateButton}
                    onPress={() => stackNavigation.navigate('Upcoming')}
                    style={({ pressed }) => [styles.teaserExtra, pressed && styles.resultPressed]}
                    testID="open-upcoming"
                  >
                    <Text style={styles.teaserExtraText}>{COPY.upcoming.updateButton}</Text>
                  </Pressable>
                ) : null
              }
            />
            <RoomTeaser
              icon={<BedIcon />}
              title={COPY.vacation.hereNowCardTitle}
              body={COPY.vacation.hereNowCardBody}
              open={hereNowOpen}
              onPress={() => stackNavigation.navigate('HereNow')}
              testID="open-here-now"
              extra={
                hereNowOpen ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={COPY.vacation.discoverCta}
                    onPress={() => tabNavigation.navigate('Discovery', { source: 'HERE_NOW' })}
                    style={({ pressed }) => [styles.teaserExtra, pressed && styles.resultPressed]}
                    testID="vacation-discover-here-now"
                  >
                    <Text style={styles.teaserExtraText}>{COPY.vacation.discoverCta}</Text>
                  </Pressable>
                ) : null
              }
            />
          </View>
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

      {/* The exit lives where the choice does (owner, 2026-08-03): the tab
          itself, not only the details screen behind the card. Same question,
          same teardown — leaving is a switch that puts nothing in its place. */}
      {activeId && !picking && !onActivated ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.hotel.leaveCta}
            onPress={() => setConfirmingLeave(true)}
            style={({ pressed }) => [styles.leaveRow, pressed && styles.resultPressed]}
            testID="hotel-leave-home"
          >
            <Text style={styles.leaveText}>{COPY.hotel.leaveCta}</Text>
          </Pressable>
          <ConfirmDialog
            visible={confirmingLeave}
            title={COPY.hotel.leaveConfirmTitle}
            body={COPY.hotel.leaveConfirmBody}
            confirmLabel={COPY.hotel.leaveYes}
            cancelLabel={COPY.common.cancel}
            busy={leaving}
            onCancel={() => setConfirmingLeave(false)}
            onConfirm={async () => {
              setLeaving(true);
              try {
                await getApi().leaveActiveVenue();
                dispatch({ type: 'ACTIVE_HOTEL_LOADED', activeHotel: null });
                setConfirmingLeave(false);
                setStay(null);
                setRoomStates(null);
                setActiveVenue(null);
                setGoogleName(null);
                setGooglePhoto(null);
              } finally {
                setLeaving(false);
              }
            }}
            testID="hotel-leave-home-question"
            confirmTestID="hotel-leave-home-confirm"
            cancelTestID="hotel-leave-home-cancel"
          />
        </>
      ) : null}

      {/* Idle on the not-yet-chosen screen is one card (10:86): the feature
          that exists before any venue does, honestly shut behind the one
          thing it needs. */}
      {!picking && !activeId && !onActivated && !loadingActive ? (
        /* T-01: both features, both shut, both saying why. Only Tatilden Önce
           was here, so somebody who had not yet chosen a place could not learn
           Oteldeyim existed — the tab's whole job at that moment is to say
           what choosing a place gets you. */
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
          <VacationFeatureCard
            room="HERE_NOW"
            status={null}
            tag={COPY.vacation.premiumTag}
            lead={COPY.rooms.hereNowLead}
            body={COPY.vacation.hereNowFeatureBody}
            buttonLabel={COPY.vacation.chooseFirst}
            onOpen={() => setPicking(true)}
            testID="room-here-now-locked"
            buttonTestID="vacation-choose-for-here-now"
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
  /** The Figma card shell (10:117): white, the quiet hairline, the card radius. */
  hotelCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 24,
    overflow: 'hidden',
    ...elevation.card,
  },
  /** T-01: the pill naming the trip, above the hero. */
  stayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  stayPillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    color: color.accentDeep,
  },
  /** T-01: the question over the two rooms. */
  roomsHeading: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    lineHeight: 24,
    color: color.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  roomsGrid: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  /** 131:86: the teaser card itself. */
  teaser: {
    flex: 1,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 20,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
  teaserDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teaserTitle: { fontFamily: fontFamily.bodySemi, fontSize: 15, lineHeight: 21, color: color.ink },
  teaserBody: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 17, color: color.inkMuted },
  teaserOpenRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  teaserOpenDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.successMark },
  teaserOpenText: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: color.success },
  teaserArrow: { fontFamily: fontFamily.bodySemi, fontSize: 16, lineHeight: 22, color: color.accentDeep },
  /** The tab's quiet exit, under the change button. */
  leaveRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  leaveText: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.accentDeep },
  /** The quiet second action a live room earns. */
  teaserExtra: { minHeight: 32, justifyContent: 'center' },
  teaserExtraText: { fontFamily: fontFamily.bodySemi, fontSize: 12, color: color.accentDeep },
  /** T-01: the white plate floating on the hero's foot. */
  heroPlate: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    backgroundColor: color.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  heroPlateLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    letterSpacing: 1,
    color: color.accentDeep,
  },
  heroPlateName: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 24,
    color: color.ink,
  },
  heroPlateMeta: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkMuted,
  },
  /** The stand-in band for a hotel the catalogue holds no photo of. */
  hotelCardBand: { height: 340, backgroundColor: color.veil },
  hotelPhoto: { width: '100%', height: 340, backgroundColor: color.veil },
  /** The licence's half of the bargain, on the photo it pays for — the
      PhotoScrim above it is what keeps this legible on any image. */
  photoCredit: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: color.onPhoto,
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
  /** The provider credit: quiet, and never wearing a location pin. */
  venueAttribution: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
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
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.lg,
    padding: 16,
    ...elevation.card,
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
