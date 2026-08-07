import React, { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { RootStackParamList, TabParamList } from '../navigation/types';

import {
  Button,
  ConfirmDialog,
  Notice,
  PhotoScrim,
  Screen,
  ScreenHeader,
  SectionLabel,
  SkeletonCard,
} from '../components/ui';
import { nowMs } from '../clock';
import { formatStayRangeLabel } from '../domain/dates';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
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
import { SearchScene } from '../components/HotelIllustrations';
import { VenuePicker } from '../components/VenuePicker';
import { VacationFeatureCard } from '../components/VacationFeatureCard';
import { useToast } from '../components/ToastHost';
import { useAppStore } from '../state/AppStore';
import { color, elevation, font, fontFamily, leading, MIN_TOUCH, radius, spacing, tracking } from '../theme';

/**
 * Figma tatilim_view (176:2730): the active-venue card's photo band. Not on
 * the D-059 ladder — width and height are geometry, not a type or spacing
 * decision, exactly like the ladder doc's own carve-outs for the deck's
 * faceless initial and the sheet pickers' `SHEET_TOP`. Named rather than
 * repeated because the photo `Image`, its no-photo fallback band, and the
 * loading skeleton all have to agree on one number.
 */
const VENUE_CARD_PHOTO_HEIGHT = 194;


/** "12–17 Ağustos" in the app's language — dates, never documents. */
function formatStayRange(stay: UpcomingStay): string {
  return formatStayRangeLabel(stay.startDate, stay.endDate);
}

const PinSmallIcon = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** 131:87 — the drawn stand-ins for the frame's suitcase and bed emojis. */
const SuitcaseIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={7} width={16} height={13} rx={2.5} />
    <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 11v5M15 11v5" />
  </Svg>
);

const BedIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 5v14" />
    <Path d="M3 15h18v4" />
    <Path d="M3 11h13a4 4 0 0 1 4 4" />
  </Svg>
);

/** The head's switch pill (176:2730): a small refresh mark, not a full glyph
    library entry, since this one slot is the only place it is drawn today. */
const RefreshIcon = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.onInverse} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
    <Path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
  </Svg>
);

/** The empty state's one action: a magnifying glass, coral-pill sized. */
const SearchGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.onAccent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={10.5} cy={10.5} r={6.5} />
    <Path d="M20 20l-4.35-4.35" />
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
  /** Activating is an action; its refusal is said by the shared host. */
  const toast = useToast();
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
      toast.error(
        err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        'hotel-activate-error',
      );
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
      {/*
        D-061: a tab does not name itself — the tab bar already does, and the
        word was the largest thing on the screen. A screen you *arrived* at
        still names itself, which is why the activation view keeps its title.
      */}
      {onActivated ? (
        <View style={styles.headerRow}>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {COPY.hotel.title}
          </Text>
        </View>
      ) : (
        // D-065: the chip now appears here too (owner, 2026-08-07) — Tatilim
        // used to leave it off because the venue *was* the screen, but the
        // generated head draws it on every tab, and the ring's Settings route
        // (D-057) still needs somewhere to sit beside it. The head's own
        // switch action takes the corner a title used to leave empty; it goes
        // to the same picker the cards below already open.
        <ScreenHeader
          title={COPY.tabs.vacation}
          subtitle={COPY.vacation.headerSubtitle}
          ringTestID="hotel-profile-ring"
          right={
            activeId && !picking ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.vacation.switchVenueCta}
                onPress={() => setPicking(true)}
                style={({ pressed }) => [styles.headerSwitchPill, pressed && styles.resultPressed]}
                testID="hotel-header-switch-venue"
              >
                <RefreshIcon />
                <Text style={styles.headerSwitchPillText}>{COPY.vacation.switchVenueCta}</Text>
              </Pressable>
            ) : undefined
          }
        />
      )}
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
        // is still being resolved. Neither is "no hotel chosen". Waits at
        // roughly the active card's own height (176:2730's shorter photo
        // band plus its footer) rather than the taller shape this replaced.
        <SkeletonCard height={VENUE_CARD_PHOTO_HEIGHT + 72} testID="hotel-loading" />
      ) : activeHotel ? (
        <>
        <SectionLabel>{COPY.vacation.hereSectionLabel}</SectionLabel>
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
        {/* Figma tatilim_view (176:2730): the photo band, and a footer row
            below it rather than a plate floating on top — the name, the
            place, and the way into the room. The whole card still opens the
            same details screen (`HotelDetailsScreen` — "the room behind
            'Otel detaylarını gör'"); the footer's own pill is a second,
            more legible door to the identical place, not a second one. */}
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
                 name and kept nowhere — the "Powered by Google" line in the
                 footer below credits both (D-054). */
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
            {/*
              The design's bottom-scrim slot over the photo carries an avatar
              stack of "who's here right now" and a headcount badge. Nothing
              on this screen fetches either today: the only headcount call
              (`getRoomCounts`) is not made here, and no endpoint returns
              per-member avatars for a room at all — inventing either fetch
              to fill the slot is exactly what this pass was told not to do.
              The scrim is left undrawn rather than drawn empty over nothing.
            */}
          </View>
          <View style={styles.hotelCardFooter}>
            <View style={styles.hotelCardFooterInfo}>
              {/* D-054: for a Google venue this is a name resolved a moment
                  ago and held in memory, never a stored one. */}
              <Text style={styles.hotelCardName} testID="active-hotel-name">
                {activeName ?? activeHotel.name}
              </Text>
              {/* A Google venue has no city or country of ours to print —
                  they are Google's content — so the line under the name
                  carries only what the user themselves declared, and is
                  absent until they declare it. */}
              {activeVenue?.provider !== 'google' || stay ? (
                /* 131:83: "Alaçatı, İzmir · 12–17 Ağustos" — one quiet line,
                   the dot as the only punctuation between facts. */
                <Text style={styles.hotelCardMeta} numberOfLines={1} testID="active-hotel-dates">
                  {activeVenue?.provider === 'google'
                    ? formatStayRange(stay!)
                    : [`${activeHotel.city}, ${activeHotel.country}`, stay ? formatStayRange(stay) : null]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
              ) : null}
              {/* The attribution is a credit, not an address: its own quiet
                  line, present whenever the name on this card came from
                  Google. */}
              {activeVenue?.provider === 'google' ? (
                <Text style={styles.venueAttribution} testID="active-hotel-attribution">
                  {COPY.venue.attribution}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.vacation.enterRoomCta}
              onPress={() => stackNavigation.navigate('HotelDetails', { hotelId: activeHotel.id })}
              style={({ pressed }) => [styles.enterRoomPill, pressed && styles.resultPressed]}
              testID="active-hotel-enter"
            >
              <Text style={styles.enterRoomPillText}>{COPY.vacation.enterRoomCta}</Text>
            </Pressable>
          </View>
        </Pressable>
        </>
      ) : (
        /* Figma tatilim_view (176:2730): the search illustration already
           drawn for this exact job (`SearchScene`, unused until now — this
           slice is what it was waiting for), a centred heading and support
           line, and the one action that matters here. */
        <View style={styles.emptyState} testID="hotel-empty-state">
          <SearchScene width={200} />
          <Text accessibilityRole="header" style={styles.emptyStateTitle}>
            {COPY.hotel.emptyTitle}
          </Text>
          <Text style={styles.emptyStateBody}>{COPY.hotel.emptyBody}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.vacation.searchVenueCta}
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.emptyStateCta, pressed && styles.resultPressed]}
            testID="hotel-empty-search-cta"
          >
            <SearchGlyph />
            <Text style={styles.emptyStateCtaText}>{COPY.vacation.searchVenueCta}</Text>
          </Pressable>
        </View>
      )}

      {switchedNotice ? <Notice message={COPY.hotel.switchedNotice} testID="hotel-switched" /> : null}

      {/* The switch question pops like the leave question does (owner,
          2026-08-03): a blocking card over a dimmed screen, not a card the
          keyboard half-covers at the foot of the list. */}
      <ConfirmDialog
        visible={pendingSwitch !== null}
        title={pendingSwitch ? COPY_FOR.switchPrompt(pendingSwitch.name) : ''}
        body={COPY.trust.switchWarning}
        confirmLabel={COPY.hotel.switchButton}
        cancelLabel={COPY.hotel.keepCurrent}
        busy={activating}
        onCancel={() => setPendingSwitch(null)}
        onConfirm={() => {
          if (pendingSwitch) void activate(pendingSwitch);
        }}
        testID="hotel-switch-question"
        confirmTestID="confirm-switch"
        cancelTestID="cancel-switch"
      />

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
          onPress={() => setPicking(true)}
          testID="venue-open-picker"
        />
      )}

      {/* The exit lives where the choice does (owner, 2026-08-03): the tab
          itself, not only the details screen behind the card. Same question,
          same teardown — leaving is a switch that puts nothing in its place. */}
      {activeId && !picking && !onActivated ? (
        <>
          {/* Owner, 2026-08-05: change is the loud act, leaving the quiet
              one — the red lives in the confirmation, not on the shelf. */}
          <Button
            label={COPY.hotel.leaveCta}
            variant="secondary"
            onPress={() => setConfirmingLeave(true)}
            testID="hotel-leave-home"
          />
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
            // D-065: no premium copy on an implemented screen before the
            // billing phase opens (`.studio/decisions.md`) — the closed
            // state chip below already says the room is shut without naming
            // an entitlement that does not exist yet.
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
  /** Only the activation view still draws a head of its own (D-061). */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    lineHeight: font.display * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  /**
   * The head's own switch action (176:2730): the deep navy pill, distinct
   * from the coral of everything below it — the one place on this screen
   * that is not the accent, because it sits over the venue chip's own wash
   * rather than the white ground.
   */
  headerSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: color.inverse,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerSwitchPillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    color: color.onInverse,
  },
  searchLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    color: color.inkMuted,
  },
  /** The Figma placeholder size (10:78). */
  searchInput: { fontSize: font.body },
  /** The active-venue card shell (176:2730): white, the D-059 hero radius. */
  hotelCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    ...elevation.card,
  },
  /** T-01: the pill naming the trip, above the hero. */
  stayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
    marginBottom: spacing.sm,
    ...elevation.card,
  },
  stayPillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.ink,
  },
  /** T-01: the question over the two rooms. */
  roomsHeading: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    letterSpacing: tracking.display,
    color: color.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  roomsGrid: { flexDirection: 'row', gap: spacing.snug, alignItems: 'stretch' },
  /** 131:86: the teaser card itself. */
  teaser: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    ...elevation.card,
    paddingTop: spacing.wide,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  teaserDisc: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teaserTitle: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  teaserBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  teaserOpenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.cozy },
  teaserOpenDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: color.successMark },
  teaserOpenText: { fontFamily: fontFamily.bodySemi, fontSize: font.label, color: color.success },
  teaserArrow: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  /** The quiet second action a live room earns. */
  teaserExtra: { minHeight: 32, justifyContent: 'center' },
  teaserExtraText: { fontFamily: fontFamily.bodySemi, fontSize: font.caption, color: color.ink },
  /** The stand-in band for a hotel the catalogue holds no photo of. */
  hotelCardBand: { height: VENUE_CARD_PHOTO_HEIGHT, backgroundColor: color.veil },
  hotelPhoto: { width: '100%', height: VENUE_CARD_PHOTO_HEIGHT, backgroundColor: color.veil },
  /** The licence's half of the bargain, on the photo it pays for — the
      PhotoScrim above it is what keeps this legible on any image. */
  photoCredit: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.onPhoto,
    maxWidth: '80%',
  },
  /** The footer row (176:2730): name and place on the left, the room's own
      door on the right — below the photo now, not floating over its foot. */
  hotelCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  hotelCardFooterInfo: { flex: 1, gap: spacing.xs },
  hotelCardName: {
    fontFamily: fontFamily.display,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  hotelCardMeta: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /** The provider credit: quiet, and never wearing a location pin. */
  venueAttribution: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    color: color.inkMuted,
  },
  enterRoomPill: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.snug,
  },
  enterRoomPillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.control,
    color: color.onAccent,
  },
  /** The nothing-chosen state (176:2730): centred, illustration first. */
  emptyState: {
    backgroundColor: color.surface,
    borderRadius: radius.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    ...elevation.card,
  },
  emptyStateTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    color: color.ink,
    textAlign: 'center',
  },
  emptyStateBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 240,
  },
  emptyStateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.snug,
    marginTop: spacing.xs,
  },
  emptyStateCtaText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.control,
    color: color.onAccent,
  },
  idle: { gap: spacing.md },
  resultPressed: { opacity: 0.8 },
});
