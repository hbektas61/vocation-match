import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Body, Button, ContextRibbon, Notice, RoomRibbon, Screen, ScreenHeader } from '../components/ui';
import { BigActionButton } from '../components/BigActionButton';
import { RadarEmpty } from '../components/RadarEmpty';
import { ContextSelector, CONTEXT_ORDER, type ContextRow } from '../components/ContextSelector';
import { nowMs } from '../clock';
import { formatDayMonth } from '../domain/dates';
import { apiErrorMessage, COPY, COPY_FOR, upperCase, roomPlate, roomStatusExplanation } from '../copy';
import { ApiError, getApi, type CandidateCard, type MyEvent, type RoomKey, type RoomStatus } from '../data';
import { resolveDeckLabels } from '../data/venueLabels';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { color, elevation, font, fontFamily, gradient, overlay, radius, spacing } from '../theme';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { PinScene } from '../components/RoomIllustrations';
import { useAppStore } from '../state/AppStore';

/** The owner's own 3D door render (2026-07-28), bundled — not a redrawing. */
const DOOR_HERO = require('../../assets/discovery-door.jpg');

const XIcon = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2.6} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

// The like button is a coral fill (D-058), and coral cannot carry a white
// glyph at 4.5:1 any more than it can carry white text — this is the same
// `color.onAccent` navy the shared `<ActionButton tone="like">` draws.
const HeartIcon = () => (
  <Svg width={34} height={34} viewBox="0 0 24 24" fill={color.onAccent}>
    <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
  </Svg>
);

const FlagIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill={color.ink} stroke={color.ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 21V4c3-2 6 2 9 0s4-1 7 0v11c-3-1-4-2-7 0s-6-2-9 0z" fill={color.ink} />
    <Path d="M4 22V3" stroke={color.ink} fill="none" />
  </Svg>
);

// These two ride on the deep navy plates over the photo, so they take the
// same `onPhoto` white the plates' text does.
const BuildingTinyIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color.onPhoto} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={5} y={3} width={14} height={18} rx={2} />
    <Path d="M9 8h2m2 0h2M9 12h2m2 0h2M10 21v-4h4v4" />
  </Svg>
);

const PinTinyIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color.onPhoto} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** "12 Ağu – 17 Ağu" — the plan, in dates. */
function formatStayRange(startIso: string, endIso: string): string {
  return `${formatDayMonth(startIso)} – ${formatDayMonth(endIso)}`;
}

/**
 * The line that says where this deck comes from (D-040): the hotel and your
 * dates, the hotel and the door's clock, or the venue and the check-in's
 * clock. Context, never a person's location.
 */
function contextLine(
  room: RoomKey,
  hotelName: string | null,
  stayRange: string | null,
  validUntil: number | null | undefined,
  checkinName: string | null,
  /** The focused event's leased name, or null once the lease has expired. */
  eventName: string | null = null,
): string {
  const minutesLeft =
    validUntil != null ? Math.max(1, Math.round((validUntil - nowMs()) / 60000)) : null;
  const left = minutesLeft != null ? COPY_FOR.timeLeft(minutesLeft) : null;
  if (room === 'UPCOMING') {
    return [hotelName, stayRange].filter(Boolean).join(' · ');
  }
  if (room === 'HERE_NOW') {
    return [hotelName, left].filter(Boolean).join(' · ');
  }
  // D-057: the two event rooms name the event, not the check-in venue. When
  // the provider's lease has lapsed the name is gone and the app's own label
  // stands in — never a stale copy we kept.
  if (room === 'EVENT_UPCOMING') {
    return eventName ?? COPY.events.pastEvent;
  }
  if (room === 'EVENT_HERE_NOW') {
    return [eventName ?? COPY.events.pastEvent, left].filter(Boolean).join(' · ');
  }
  return [checkinName, left].filter(Boolean).join(' · ');
}

export function DiscoveryScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // A second, honestly-typed handle for jumping to a sibling tab.
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Discovery'>>();
  const [rooms, setRooms] = useState<RoomStatus[] | null>(null);
  const [room, setRoom] = useState<RoomKey | null>(null);
  /** Context for the header line and the bond chip (D-040). */
  const [checkinName, setCheckinName] = useState<string | null>(null);
  const [stayRange, setStayRange] = useState<string | null>(null);
  /** The focused event's leased name. Null once the lease has lapsed. */
  const [eventName, setEventName] = useState<string | null>(null);
  /** Which event backs each event room, so switching can move the focus. */
  const [eventRooms, setEventRooms] = useState<{
    upcoming: MyEvent | null;
    live: MyEvent | null;
    focused: MyEvent | null;
  }>({ upcoming: null, live: null, focused: null });
  const [deck, setDeck] = useState<CandidateCard[] | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  /** Bumped by "scan again" on the empty room; the deck effect re-runs. */
  const [scan, setScan] = useState(0);
  /** A rescan in flight. The radar stays on screen and keeps pulsing. */
  const [rescanning, setRescanning] = useState(false);
  /** Place ID → name, for this deck session only. Never written down. */
  const [venueLabels, setVenueLabels] = useState<Map<string, string>>(new Map());
  const lastDeckRoom = useRef<RoomKey | null>(null);
  /** The no-hotel screen's "how does it work?" reveal. */
  const [howOpen, setHowOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Which of the candidate's photos is showing; reset per candidate. */
  const [photoIndex, setPhotoIndex] = useState(0);

  // Same as Rooms: whether there is an active hotel comes from the server, and
  // the cached card only ever supplies its name.
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  const hotelName = hotel?.name ?? null;
  const hasHotel = state.activeHotel !== null;

  // Room eligibility can change from another tab, so refresh it on focus,
  // and again at the soonest expiry (R-003) so an open deck closes itself
  // the moment the server would refuse it rather than at the next visit.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const load = async () => {
        try {
          // Çevremde (D-039) joins the room list as a synthetic entry when a
          // fresh check-in exists: same segments, same deck machinery, same
          // expiry-driven refresh — its validUntil is the check-in clock.
          const [fetched, checkin, stay, mine] = await Promise.all([
            getApi().getRooms(),
            getApi().getCheckin().catch(() => null),
            getApi().getUpcomingStay().catch(() => null),
            getApi().getMyEvents().catch(() => [] as MyEvent[]),
          ]);
          if (cancelled) return;
          const withNearby: RoomStatus[] = checkin
            ? [
                ...fetched,
                { room: 'NEARBY', eligible: true, reason: 'ELIGIBLE', validUntil: checkin.expiresAt },
              ]
            : fetched;
          /**
           * D-057: `getRooms()` answers for the vacation venue only, and
           * Çevremde has always been synthesised here from the check-in. The
           * two event rooms were not — so the selector that promises five
           * contexts could offer at most three, and somebody with a live event
           * room was told "açık odan yok" while standing in it. They are built
           * the same way, from the memberships the account already has.
           */
          const focusedEvent = mine.find((e) => e.focused) ?? mine[0] ?? null;
          const upcomingEvent = mine.find((e) => e.upcomingOpen) ?? null;
          const liveEvent = mine.find((e) => e.hereNowOpen) ?? null;
          const withEvents: RoomStatus[] = [...withNearby];
          if (upcomingEvent) {
            withEvents.push({
              room: 'EVENT_UPCOMING', eligible: true, reason: 'ELIGIBLE', validUntil: null,
            });
          }
          if (liveEvent) {
            withEvents.push({
              room: 'EVENT_HERE_NOW', eligible: true, reason: 'ELIGIBLE',
              validUntil: liveEvent.hereNowUntil,
            });
          }
          setEventRooms({ upcoming: upcomingEvent, live: liveEvent, focused: focusedEvent });
          setRooms(withEvents);
          setCheckinName(checkin?.venueName ?? null);
          setStayRange(stay ? formatStayRange(stay.startDate, stay.endDate) : null);
          const eligible = withEvents.filter((r) => r.eligible).map((r) => r.room);
          // D-040/D-057: keep what the person was looking at; otherwise the
          // most present-tense source first — the live event, the street, the
          // hotel door, then the two declared plans.
          const fallback = (
            ['EVENT_HERE_NOW', 'NEARBY', 'HERE_NOW', 'EVENT_UPCOMING', 'UPCOMING'] as RoomKey[]
          ).find((key) => eligible.includes(key));
          setRoom((current) => (current && eligible.includes(current) ? current : fallback ?? null));
          // D-057: the selector names the event, so the focused event's leased
          // name is fetched once per load — and only when an event room is
          // actually on the list. An expired lease simply leaves it null.
          if (withEvents.some((r) => r.room === 'EVENT_UPCOMING' || r.room === 'EVENT_HERE_NOW')) {
            const focused = focusedEvent;
            if (!cancelled && focused) {
              const [lease] = await getApi().getEventContent([focused.eventId]).catch(() => []);
              if (!cancelled) setEventName(lease?.name ?? null);
            }
          } else if (!cancelled) {
            setEventName(null);
          }
          const soonest = earliestRoomExpiry(withEvents, nowMs());
          if (soonest !== null) {
            timer = setTimeout(load, soonest - nowMs());
          }
        } catch {
          if (!cancelled) setRooms([]);
        }
      };

      load();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, []),
  );

  // Arriving with a source ("Discover people" on a feature card, "Discover
  // who is nearby" after a check-in) opens that deck (D-040).
  useEffect(() => {
    const requested = route.params?.source;
    if (requested) setRoom(requested);
  }, [route.params?.source]);

  // The deck belongs to one room at a time and is refetched when it changes.
  // (When there is no eligible room, the render below returns before the
  // deck is ever shown, so there is nothing to fetch or reset here.)
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    // Only a *room change* clears the deck. A rescan of the same room keeps
    // whatever is on screen — the radar goes on pulsing and the answer swaps
    // in quietly, so the person never sees the screen torn down and rebuilt
    // (owner, 2026-07-29).
    const roomChanged = lastDeckRoom.current !== room;
    lastDeckRoom.current = room;
    (async () => {
      if (roomChanged) {
        setDeck(null);
      } else {
        setRescanning(true);
      }
      setDeckError(null);
      try {
        const feed = await getApi().getDiscoveryFeed(room);
        if (!cancelled) setDeck(feed);
        // V-011: a Google venue has no stored name, so a neighbour's label has
        // to be asked for. Once per deck, for at most three distinct venues,
        // never for the viewer's own venue, and never in a way a card waits
        // on — the deck is already drawn by the time this resolves, and the
        // rest stay on the generic "nearby" label.
        const own = await getApi().getActiveVenue().catch(() => null);
        const wanted = new Set(
          feed
            .map((candidate) => candidate.venuePlaceId)
            .filter((placeId): placeId is string =>
              Boolean(placeId) && placeId !== own?.googlePlaceId),
        );
        const labels = await resolveDeckLabels(
          feed.map((candidate) => candidate.venuePlaceId),
          own?.googlePlaceId ?? null,
        );
        if (!cancelled && labels.size > 0) setVenueLabels(new Map(labels));
        // V-012: three counts, so the fallback rate is measured rather than
        // assumed. Reported after the deck is on screen and never awaited for
        // correctness.
        if (wanted.size > 0) {
          const named = [...wanted].filter((placeId) => labels.has(placeId)).length;
          void getApi()
            .reportDeckLabels(wanted.size, named, wanted.size - named)
            .catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setDeckError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
        }
      } finally {
        if (!cancelled) setRescanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, scan]);

  // A mutual match interrupts the deck with the celebration screen.
  useEffect(() => {
    if (state.lastMatchId) {
      const matchId = state.lastMatchId;
      dispatch({ type: 'CLEAR_LAST_MATCH' });
      navigation.navigate('Match', { matchId });
    }
  }, [state.lastMatchId, dispatch, navigation]);

  const blockedIds = useMemo(() => new Set(state.blockedUsers.map((b) => b.userId)), [state.blockedUsers]);
  const visibleDeck = useMemo(
    () => (deck ?? []).filter((c) => !blockedIds.has(c.userId)),
    [deck, blockedIds],
  );
  /**
   * D-057: every room the account has, in one order, with the shut ones still
   * on the list and carrying their reason. The selector renders exactly this —
   * it fetches nothing of its own, which is what keeps switching free.
   */
  const contextRows: ContextRow[] = useMemo(() => {
    const statuses = rooms ?? [];
    return CONTEXT_ORDER.flatMap((key) => {
      const status = statuses.find((r) => r.room === key);
      if (!status) return [];
      return [
        {
          room: key,
          meta: contextLine(key, hotelName, stayRange, status.validUntil, checkinName, eventName),
          eligible: status.eligible,
          validUntil: status.validUntil ?? null,
          reason: status.eligible ? null : roomStatusExplanation(key, status),
        },
      ];
    });
  }, [rooms, hotelName, stayRange, checkinName, eventName]);
  /**
   * Switching context is a viewing choice, and for the two event rooms the
   * server has to be told which event is being viewed — `discovery_feed`
   * refuses an event deck with no focus. It moves the focus and nothing else:
   * no membership is created, none is withdrawn.
   */
  const chooseRoom = useCallback((next: RoomKey) => {
    const event = next === 'EVENT_HERE_NOW' ? eventRooms.live
      : next === 'EVENT_UPCOMING' ? eventRooms.upcoming
      : null;
    if (event) {
      getApi().setEventFocus(event.eventId, next).catch(() => undefined);
    }
    setRoom(next);
  }, [eventRooms]);

  const candidate = visibleDeck[0] ?? null;
  // Only the card on top: signing a URL for a deck of twenty would hand out
  // nineteen readable links for people the user may never actually see.
  const cardPaths = useMemo(
    () =>
      candidate
        ? candidate.photoPaths.length > 0
          ? candidate.photoPaths
          : candidate.photoPath
            ? [candidate.photoPath]
            : []
        : [],
    [candidate],
  );
  const photoPaths = cardPaths;
  useEffect(() => setPhotoIndex(0), [candidate?.userId]);
  const shownPath = cardPaths[Math.min(photoIndex, Math.max(cardPaths.length - 1, 0))] ?? null;
  const photoUrls = usePhotoUrls(photoPaths);

  // "No hotel yet" is a claim about the account, and while the account is
  // still being hydrated the claim is not known — showing the no-hotel
  // pitch to a returning owner for a heartbeat (or until they visited the
  // trip tab) was the bug. Loading is loading, everywhere.
  if (rooms === null || (!hasHotel && state.accountLoadStatus === 'loading')) {
    return (
      <Screen safeTop testID="screen-discovery">
        <ScreenHeader title={COPY.tabs.discovery} ringTestID="discovery-profile-ring" />
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="discovery-loading" />
      </Screen>
    );
  }

  const nearbyOpen = rooms.some((r) => r.room === 'NEARBY' && r.eligible);

  if (!hasHotel && !nearbyOpen) {
    return (
      <Screen safeTop testID="screen-discovery">
        <ScreenHeader title={COPY.tabs.discovery} ringTestID="discovery-profile-ring" />
        <Body>{`${COPY.roomReason.NO_ACTIVE_HOTEL} ${COPY.trust.oneHotel}`}</Body>
        {/* The empty state: the pin, the claim, the one-hotel pill, and both
            actions. D-058 replaced the raster here — it was cropped from the
            D-044 night mock, so it stayed navy after the card went white. The
            drawn pin carries the same idea in the light tokens. */}
        <View style={styles.noHotelCard}>
          <PinScene size={120} />
          <Text accessibilityRole="header" style={styles.noHotelTitle}>
            {COPY.discovery.noHotelTitle}
          </Text>
          <Text style={styles.noHotelBody}>{COPY.discovery.noHotelBody}</Text>
          <View style={styles.oneHotelPill}>
            <Text style={styles.oneHotelPillText}>{COPY.trust.oneHotel}</Text>
          </View>
        </View>
        <Button
          label={COPY.hotel.chooseCta}
          onPress={() => navigation.navigate('ChooseHotel')}
          testID="discovery-choose-hotel"
        />
        <Button
          label={COPY.discovery.howItWorks}
          variant="secondary"
          onPress={() => setHowOpen((open) => !open)}
          testID="discovery-how"
        />
        {howOpen ? (
          <Text style={styles.howBody} testID="discovery-how-body">
            {COPY.discovery.howItWorksBody}
          </Text>
        ) : null}
      </Screen>
    );
  }

  if (!room) {
    /* The designer's pre-room screen (2026-07-27): the orbit field, why the
       deck is closed in two sentences, and both ways in as buttons — the
       rooms, or a proximity check straight from here. */
    return (
      <Screen safeTop testID="screen-discovery">
        <ScreenHeader title={COPY.tabs.discovery} ringTestID="discovery-profile-ring" />
        {/* D-057 (NAV-05): the selector is present but disabled here, so the
            control that answers "which room am I in" does not vanish at the
            one moment somebody is asking it. It opens nothing. */}
        <ContextSelector
          rows={contextRows}
          current={room}
          onChange={chooseRoom}
          now={nowMs()}
          testID="discovery-context"
        />
        <View style={styles.noRoom} testID="discovery-no-room">
          <Image
            source={DOOR_HERO}
            style={styles.noRoomHero}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.emptyWords}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.discovery.noRoomTitle}
            </Text>
            <Text style={styles.emptyBody}>{COPY.discovery.noRoomBody}</Text>
          </View>
          <View style={styles.emptyActionWide}>
            <BigActionButton
              label={COPY.inbox.viewRooms}
              icon="door"
              filled
              onPress={() => tabNavigation.navigate('Vacation')}
              testID="discovery-go-rooms"
            />
            <BigActionButton
              label={COPY.discovery.checkProximity}
              icon="compass"
              onPress={() => navigation.navigate('HereNow')}
              testID="discovery-check-proximity"
            />
            <BigActionButton
              label={COPY.checkin.openCta}
              icon="sparkle"
              onPress={() => tabNavigation.navigate('Nearby')}
              testID="discovery-go-checkin"
            />
          </View>
        </View>
      </Screen>
    );
  }

  const swipe = async (direction: 'LIKE' | 'PASS') => {
    if (!candidate || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await getApi().swipe(candidate.userId, room, direction);
      if (result.matched && result.matchId) {
        dispatch({
          type: 'MATCH_UPSERTED',
          match: {
            matchId: result.matchId,
            otherUserId: candidate.userId,
            displayName: candidate.displayName,
            age: candidate.age,
            photoPath: candidate.photoPath,
            room,
            createdAt: nowMs(),
            unmatchedAt: null,
            lastMessageAt: null,
            lastMessageBody: null,
      unreadCount: 0,
          },
        });
      }
      setDeck((prev) => (prev ?? []).filter((c) => c.userId !== candidate.userId));
    } catch (err) {
      setActionError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen safeTop testID="screen-discovery" bleed scroll={false}>
      {/* D-057: the head and the context selector sit above the card. Which
          room you are browsing is a real choice, and it is now stated rather
          than inferred — including when the answer is "none of them yet". */}
      <View style={styles.deckHead}>
        <ScreenHeader title={COPY.tabs.discovery} ringTestID="discovery-profile-ring" />
        <ContextSelector
          rows={contextRows}
          current={room}
          onChange={chooseRoom}
          now={nowMs()}
          testID="discovery-context"
        />
      </View>

      {deckError ? <Notice message={deckError} tone="error" testID="discovery-error" /> : null}
      {actionError ? (
        <Notice message={actionError} tone="error" testID="discovery-action-error" />
      ) : null}

      {deck === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="deck-loading" />
      ) : candidate ? (
        /* The whole person is one screen (owner decision): a full-bleed photo
           card with the name on it, the one fact this app can print — the
           room · hotel bond — as its only tag, and the three actions floating
           at its foot. No sections to scroll; the decision is made here. */
        <>
        <View style={styles.card} testID={`candidate-${candidate.userId}`}>
          {shownPath && photoUrls[shownPath] ? (
            <Image
              source={{ uri: photoUrls[shownPath] }}
              style={styles.cardPhoto}
              resizeMode="cover"
              accessibilityLabel={`Photo ${photoIndex + 1} of ${cardPaths.length} of ${candidate.displayName}`}
              testID={`candidate-photo-${candidate.userId}`}
            />
          ) : (
            <View style={styles.cardNoPhoto} testID={`candidate-photo-${candidate.userId}`}>
              <Text style={styles.cardInitial}>{candidate.displayName.slice(0, 1)}</Text>
            </View>
          )}

          {/* Tap left to go back a photo, right to go forward — the grammar
              every story viewer has taught. */}
          {cardPaths.length > 1 ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
                onPress={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                style={styles.tapZoneLeft}
                testID="card-photo-previous"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                onPress={() => setPhotoIndex((i) => Math.min(cardPaths.length - 1, i + 1))}
                style={styles.tapZoneRight}
                testID="card-photo-next"
              />
            </>
          ) : null}

          {/* The two chips of the reference: the room, on its own deep-navy
              plate over the photo, and the bond — same venue, or the
              neighbour's venue by name (D-038): the label is what keeps the
              region pool honest. D-058: the room chip is the shared
              `<RoomRibbon>` for the two hotel rooms, so this card gets the
              same filled/hollow-dot distinction the rest of the app already
              draws between Here Now and Upcoming; Çevremde and the two event
              rooms fall back to the generic `<ContextRibbon>` plate, since
              `RoomRibbon` only speaks the hotel rooms' vocabulary. */}
          <View style={styles.chipRowTop} pointerEvents="none">
            {room === 'UPCOMING' || room === 'HERE_NOW' ? (
              <RoomRibbon room={room} hotelName={null} onPhoto testID="candidate-room" />
            ) : (
              <ContextRibbon label={upperCase(roomPlate(room))} testID="candidate-room" />
            )}
            <View
              style={styles.sameHotelChip}
              testID={candidate.sameVenue ? 'card-bond-same' : 'card-bond-nearby'}
            >
              <BuildingTinyIcon />
              <Text style={styles.sameHotelText} numberOfLines={1}>
                {candidate.sameVenue
                  ? (room === 'NEARBY' ? checkinName : hotelName) ?? COPY.discovery.sameHotel
                  : (candidate.venueName
                      ?? (candidate.venuePlaceId ? venueLabels.get(candidate.venuePlaceId) : null))
                    ? `${candidate.venueName ?? venueLabels.get(candidate.venuePlaceId!)} · ${COPY.discovery.nearby}`
                    // The safe fallback (V-011): a ceiling, a provider failure
                    // or the fourth distinct venue all land here. "Nearby" is
                    // true and costs nothing; naming the wrong place would be
                    // neither.
                    : COPY.discovery.nearby}
              </Text>
            </View>
          </View>

          {/* Identity on the photo's foot, on its own scrim: name and age,
              the bio, and the hotel worn as a pill. `gradient.photoScrim` is
              the fixed readability scrim D-058 asks every photo carry — a
              photo can be any brightness, so the darkness is drawn rather
              than hoped for. */}
          <LinearGradient
            colors={[...gradient.photoScrim]}
            style={styles.cardScrim}
            pointerEvents="none"
          />
          <View style={styles.cardBottom} pointerEvents="none">
            <Text style={styles.cardName}>
              {candidate.displayName}
              <Text style={styles.cardAge}>{`, ${candidate.age}`}</Text>
            </Text>
            {candidate.bio ? (
              <Text style={styles.cardBio} numberOfLines={2}>
                {candidate.bio}
              </Text>
            ) : null}
            {hotelName ? (
              <View style={styles.hotelChip}>
                <PinTinyIcon />
                <Text style={styles.hotelChipText} numberOfLines={1}>
                  {hotel?.city ? `${hotelName}, ${hotel.city}` : hotelName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* The photo segments live under the card in the reference. */}
        {cardPaths.length > 1 ? (
          <View style={styles.segments} testID="card-photo-segments">
            {cardPaths.map((path, index) => (
              <View
                key={path}
                style={[styles.segment, index === photoIndex && styles.segmentActive]}
              />
            ))}
          </View>
        ) : null}

        {/* Pass, the big heart, and safety — three circles on the ground,
            sized exactly as the reference sizes them. The reference gives
            the third slot to chat; chat does not exist before a match, and
            report/block must be reachable from the deck (D-008). */}
        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.discovery.passButton}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => swipe('PASS')}
            style={styles.actionCircle}
            testID="swipe-pass"
          >
            <XIcon />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${COPY.discovery.likeButton} ${candidate.displayName}`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => swipe('LIKE')}
            style={styles.actionHeart}
            testID="swipe-like"
          >
            <HeartIcon />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.discovery.reportBlockButton}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() =>
              navigation.navigate('ReportBlock', {
                userId: candidate.userId,
                displayName: candidate.displayName,
              })
            }
            style={styles.actionCircle}
            testID="discovery-report-block"
          >
            <FlagIcon />
          </Pressable>
        </View>
        </>
      ) : (
        /* The empty room as a scan still running (owner's reference,
           2026-07-26): rings, a listening dot, one calm sentence, and the
           way to ask again — not a grey card with a question mark. */
        <View style={styles.emptyRoom} testID="discovery-empty">
          <RadarEmpty />
          <View style={styles.emptyWords}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.discovery.emptyTitle}
            </Text>
            <Text style={styles.emptyBody}>{COPY.discovery.emptyBody}</Text>
          </View>
          <View style={styles.emptyAction}>
            <Button
              label={rescanning ? COPY.discovery.rescanning : COPY.discovery.rescan}
              busy={rescanning}
              onPress={() => setScan((n) => n + 1)}
              testID="discovery-rescan"
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Centered column, generous air — the reference's stage. */
  emptyRoom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  emptyWords: { alignItems: 'center', gap: spacing.sm },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    color: color.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.6,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  emptyAction: { alignSelf: 'stretch', maxWidth: 280, width: '100%', gap: spacing.sm },
  emptyActionWide: { alignSelf: 'stretch', gap: spacing.sm },
  noRoomHero: { width: 320, height: 292 },
  noHotelCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  noHotelTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.ink,
    textAlign: 'center',
  },
  noHotelBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
    textAlign: 'center',
  },
  oneHotelPill: {
    backgroundColor: color.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  oneHotelPillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.inkMuted,
  },
  howBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * 1.55,
    color: color.inkMuted,
    paddingHorizontal: spacing.xs,
  },
  noRoom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  /**
   * D-057: the deck is `bleed`, so its head supplies the side margin the
   * screen shell would otherwise have given it — the card below is meant to
   * run to the edges and the head is not.
   */
  deckHead: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: spacing.sm,
    gap: spacing.sm + 2,
  },
  /**
   * The card is the screen: everything else stands on the photograph. Lifted
   * with the shared `elevation.raised` rather than a hand-rolled shadow, since
   * this is the one floating surface on the whole screen.
   */
  card: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: color.veil,
  },
  cardPhoto: { ...StyleSheet.absoluteFillObject },
  chipRowTop: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  /**
   * The bond chip — same venue, or a neighbour's by name. A deep navy plate
   * over the photo, matching the room ribbon it sits beside.
   */
  sameHotelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: overlay.plate,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 6,
    paddingVertical: 8,
  },
  sameHotelText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.onPhoto,
  },
  cardScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
  },
  cardBottom: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    // Above the action circles now floating on the photo's foot.
    bottom: 104,
    gap: spacing.sm,
  },
  cardName: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    color: color.onPhoto,
  },
  cardAge: {
    fontFamily: fontFamily.body,
    fontSize: 34,
    color: color.onPhoto,
  },
  cardBio: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.4,
    color: color.onPhoto,
  },
  /** A deep navy plate, matching the ribbon and the bond chip above it. */
  hotelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: overlay.plate,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 6,
    paddingVertical: 8,
  },
  hotelChipText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.onPhoto,
  },
  /** Under the card, as the reference draws them. */
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.veil,
  },
  segmentActive: { backgroundColor: color.accentDeep },
  /** Three circles on the ground: 64 · 84 · 64, the heart carrying the size. */
  /** K-01: the circles float on the photo, not on a strip under it. */
  cardActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  /** Pass and the safety flag: white, with the quiet card edge. */
  actionCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.rule,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.raised,
  },
  /** Like: a flat coral fill — never a gradient, per D-058. */
  actionHeart: {
    overflow: 'hidden',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardNoPhoto: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInitial: {
    fontFamily: fontFamily.display,
    fontSize: 128,
    lineHeight: 140,
    color: color.inkFaint,
  },
  /** Below the top scrim and the action row, so both stay tappable. */
  tapZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 110,
    bottom: 120,
    width: '40%',
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    top: 110,
    bottom: 120,
    width: '40%',
  },
  /**
   * Light, not display-bold: the reference sets the name quietly and lets the
   * photograph carry the screen.
   */
  /** The one loud thing on the screen, exactly as the reference has it. */
});
