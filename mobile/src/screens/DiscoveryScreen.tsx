import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Flag from 'lucide-react-native/icons/flag';
import Heart from 'lucide-react-native/icons/heart';
import X from 'lucide-react-native/icons/x';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, Loading, Notice, Screen, ScreenHeader, SkeletonCard } from '../components/ui';
import { ProfileRing } from '../components/ProfileRing';
import { useToast } from '../components/ToastHost';
import { RadarEmpty } from '../components/RadarEmpty';
import { ContextSelector, CONTEXT_ORDER, type ContextRow } from '../components/ContextSelector';
import { nowMs } from '../clock';
import { formatStayRangeLabel } from '../domain/dates';
import { apiErrorMessage, COPY, COPY_FOR, roomStatusExplanation } from '../copy';
import { ApiError, getApi, type CandidateCard, type MyEvent, type RoomKey, type RoomStatus } from '../data';
import { resolveDeckLabels, resolveOwnVenueLabel } from '../data/venueLabels';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import {
  color,
  elevation,
  font,
  fontFamily,
  gradient,
  leading,
  MIN_TOUCH,
  overlay,
  radius,
  spacing,
  tokens,
  tracking,
} from '../theme';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { RadarScene } from '../components/RoomIllustrations';
import { useAppStore } from '../state/AppStore';

/** The owner's own 3D door render (2026-07-28), bundled — not a redrawing. */

const XIcon = () => <X size={26} strokeWidth={2.6} color={color.ink} />;

// The like button is a coral fill (D-058), and coral cannot carry a white
// glyph at 4.5:1 any more than it can carry white text — the navy fill stays.
const HeartIcon = () => (
  <Heart size={30} strokeWidth={0} color={color.onAccent} fill={color.onAccent} />
);

const FlagIcon = () => <Flag size={19} strokeWidth={2} color={color.ink} />;

// These two ride on the deep navy plates over the photo, so they take the
// same `onPhoto` white the plates' text does.
const BuildingTinyIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color.onPhoto} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={5} y={3} width={14} height={18} rx={2} />
    <Path d="M9 8h2m2 0h2M9 12h2m2 0h2M10 21v-4h4v4" />
  </Svg>
);

/** The room's door, drawn in the product's own line (D-058). */
const DoorIcon = () => (
  <Svg
    width={32}
    height={32}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color.accent}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M4 21h16" />
    <Path d="M6 21V9a6 6 0 0 1 12 0v12" />
    <Path d="M9 21V10a3 3 0 0 1 6 0v11" />
    <Path d="M13.6 15.2h.01" />
  </Svg>
);

/** The three doors into the deck, in the product's own line (2026-08-05). */
const doorStroke = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: color.accent,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const SuitcaseIcon = () => (
  <Svg {...doorStroke}>
    <Rect x={3} y={7} width={18} height={13} rx={2} />
    <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
  </Svg>
);

const TicketIcon = () => (
  <Svg {...doorStroke}>
    <Path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
    <Path d="M12 8v1m0 3v1m0 3v1" />
  </Svg>
);

const PinDoorIcon = () => (
  <Svg {...doorStroke}>
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Path d="M12 10h.01" />
  </Svg>
);

/** The small filled heart in K-01's glass pill (132:75). */
const HeartTinyIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill={color.accentDeep}>
    <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
  </Svg>
);

/** "12–17 Ağustos" — the plan, in dates, said the way T-01 says it. */
function formatStayRange(startIso: string, endIso: string): string {
  return formatStayRangeLabel(startIso, endIso);
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
    // The plain sentence (owner, 2026-08-03): who this deck is — the people
    // going where you are going, when you are going.
    return hotelName ? COPY_FOR.upcomingDeckLine(hotelName) : stayRange ?? '';
  }
  if (room === 'HERE_NOW') {
    return [hotelName, left].filter(Boolean).join(' · ');
  }
  // D-057: the two event rooms name the event, not the check-in venue. When
  // the provider's lease has lapsed the name is gone and the app's own label
  // stands in — never a stale copy we kept.
  if (room === 'EVENT_UPCOMING') {
    // Named, as a sentence (owner, 2026-08-04): which event, and who the
    // deck is — the people going to it with you.
    return eventName ? COPY_FOR.eventDeckLine(eventName) : COPY.events.pastEvent;
  }
  if (room === 'EVENT_HERE_NOW') {
    return [eventName ?? COPY.events.pastEvent, left].filter(Boolean).join(' · ');
  }
  return [checkinName, left].filter(Boolean).join(' · ');
}

export function DiscoveryScreen() {
  const { state, dispatch } = useAppStore();
  /** K-01's heart pill: the standing matches, the number a heart can honestly wear. */
  const matchCount = state.matches.filter((m) => !m.unmatchedAt).length;
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
  /** A swipe's refusal is news about that swipe, so it goes to the host. */
  const toast = useToast();
  /** Which of the candidate's photos is showing; reset per candidate. */
  const [photoIndex, setPhotoIndex] = useState(0);

  // Same as Rooms: whether there is an active hotel comes from the server, and
  // the cached card only ever supplies its name.
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  /**
   * A Google venue's stored name is the '(google)' stub (D-054): the real
   * one is resolved live, from the same session cache the deck labels use,
   * and until it lands the screen says nothing rather than the stub.
   */
  const [ownVenueName, setOwnVenueName] = useState<string | null>(null);
  useEffect(() => {
    if (hotel?.provider !== 'google') {
      setOwnVenueName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const venue = await getApi().getActiveVenue().catch(() => null);
      if (cancelled || !venue?.googlePlaceId) return;
      const name = await resolveOwnVenueLabel(venue.googlePlaceId);
      if (!cancelled) setOwnVenueName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [hotel?.provider, hotel?.id]);
  const hotelName = hotel?.provider === 'google' ? ownVenueName : hotel?.name ?? null;
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
          // The Events tab's own rule (owner, 2026-08-04): a membership is
          // current while its lease still names it OR its live window has not
          // closed. Both gone — the name purged, no future close — is a past
          // event, and a past event's room must not stand in the selector
          // promising a deck the server will refuse ("Bunu bulamadık").
          const leases = mine.length > 0
            ? await getApi().getEventContent(mine.map((e) => e.eventId)).catch(() => [])
            : [];
          const leaseNames = new Map(leases.map((lease) => [lease.eventId, lease.name]));
          const currentEvents = mine.filter(
            (e) =>
              (leaseNames.get(e.eventId) ?? null) !== null ||
              (e.liveClosesAt !== null && e.liveClosesAt > nowMs()),
          );
          const focusedEvent = currentEvents.find((e) => e.focused) ?? currentEvents[0] ?? null;
          const upcomingEvent = currentEvents.find((e) => e.upcomingOpen) ?? null;
          const liveEvent = currentEvents.find((e) => e.hereNowOpen) ?? null;
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
          // D-057: the selector names the event — from the leases already in
          // hand, since one answer now serves the filter and the name both.
          setEventName(focusedEvent ? leaseNames.get(focusedEvent.eventId) ?? null : null);
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
        // Investor demo (2026-08-04): entering a room fills it. The server
        // no-ops unless DEMO_SEED_ENABLED is on, and a seeding failure is
        // swallowed by contract — the deck fetch below is the real work.
        await getApi().seedDemoRoom(room);
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
  // The card waiting underneath: its face is signed and warmed with the
  // current card's set, so the reveal at the end of a fling is instant.
  const nextCandidate = visibleDeck[1] ?? null;
  const nextPath = nextCandidate
    ? nextCandidate.photoPaths[0] ?? nextCandidate.photoPath ?? null
    : null;
  const photoPaths = useMemo(() => [...cardPaths, nextPath], [cardPaths, nextPath]);
  useEffect(() => setPhotoIndex(0), [candidate?.userId]);
  const shownPath = cardPaths[Math.min(photoIndex, Math.max(cardPaths.length - 1, 0))] ?? null;
  const photoUrls = usePhotoUrls(photoPaths);
  // Owner report (2026-08-04): tapping through a card's photos dragged,
  // because each one was first fetched at the moment it was shown. The card's
  // whole set warms the image cache the moment its URLs are signed, so a tap
  // lands on bytes already on the device.
  useEffect(() => {
    for (const p of cardPaths) {
      const url = photoUrls[p];
      // `prefetch` returns undefined under the test renderer's mock, so the
      // promise is normalised before the catch.
      if (url) void Promise.resolve(Image.prefetch(url)).catch(() => undefined);
    }
  }, [cardPaths, photoUrls]);

  /**
   * The hand-thrown swipe (owner, 2026-08-04): drag the card and it leans,
   * cross the threshold and it flies, let go early and it springs home —
   * the grammar every deck app taught. Taps still pass through (the photo
   * zones, the selector), because the responder only claims a gesture once
   * it has clearly become a horizontal drag.
   */
  const position = useRef(new Animated.ValueXY()).current;
  const swipeRef = useRef<(direction: 'LIKE' | 'PASS') => void>(() => undefined);
  const flingRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy / 3 });
      },
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) > 110 && !flingRef.current) {
          flingRef.current = true;
          const direction = gesture.dx > 0 ? 'LIKE' : 'PASS';
          Animated.timing(position, {
            toValue: { x: gesture.dx > 0 ? 560 : -560, y: gesture.dy / 2 },
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            swipeRef.current(direction);
            position.setValue({ x: 0, y: 0 });
            flingRef.current = false;
          });
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          friction: 6,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;
  const cardLean = position.x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: ['-10deg', '0deg', '10deg'],
  });
  const likeStampOpacity = position.x.interpolate({
    inputRange: [0, 40, 130],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const nopeStampOpacity = position.x.interpolate({
    inputRange: [-130, -40, 0],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  // The card behind grows toward full size as the one in hand travels.
  const backdropScale = position.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: [1, 0.94, 1],
    extrapolate: 'clamp',
  });

  // "No hotel yet" is a claim about the account, and while the account is
  // still being hydrated the claim is not known — showing the no-hotel
  // pitch to a returning owner for a heartbeat (or until they visited the
  // trip tab) was the bug. Loading is loading, everywhere.
  if (rooms === null || (!hasHotel && state.accountLoadStatus === 'loading')) {
    return (
      <Screen safeTop testID="screen-discovery">
        <ScreenHeader title={COPY.tabs.discovery} ringTestID="discovery-profile-ring" />
        <Loading testID="discovery-loading" />
      </Screen>
    );
  }

  const nearbyOpen = rooms.some((r) => r.room === 'NEARBY' && r.eligible);

  if (!hasHotel && !nearbyOpen) {
    return (
      <Screen safeTop testID="screen-discovery">
        <ScreenHeader title={COPY.tabs.discovery} ringTestID="discovery-profile-ring" />
        {/*
          Three doors, not one demand (owner, 2026-08-05). The old state said
          "choose a hotel first", which is not even true: the deck also opens
          from an event and from a check-in, five rooms between them. Each door
          says what it opens and how many rooms that is, and the radar above
          them moves, because the promise of this screen is that somebody may
          appear at any moment.
        */}
        <View style={styles.doors}>
          <RadarScene size={132} />
          <View style={styles.emptyWords}>
            <Text accessibilityRole="header" style={styles.noHotelTitle}>
              {COPY.discovery.doorsTitle}
            </Text>
            <Text style={styles.noHotelBody}>{COPY.discovery.doorsBody}</Text>
          </View>

          <View style={styles.doorList}>
            {[
              {
                key: 'hotel',
                title: COPY.discovery.doorHotelTitle,
                meta: COPY.discovery.doorHotelMeta,
                icon: <SuitcaseIcon />,
                onPress: () => navigation.navigate('ChooseHotel'),
                testID: 'discovery-choose-hotel',
              },
              {
                key: 'event',
                title: COPY.discovery.doorEventTitle,
                meta: COPY.discovery.doorEventMeta,
                icon: <TicketIcon />,
                onPress: () => tabNavigation.navigate('Events'),
                testID: 'discovery-go-events',
              },
              {
                key: 'nearby',
                title: COPY.discovery.doorNearbyTitle,
                meta: COPY.discovery.doorNearbyMeta,
                icon: <PinDoorIcon />,
                onPress: () => tabNavigation.navigate('Nearby'),
                testID: 'discovery-go-nearby',
              },
            ].map((door) => (
              <Pressable
                key={door.key}
                accessibilityRole="button"
                accessibilityLabel={`${door.title}. ${door.meta}`}
                onPress={door.onPress}
                style={({ pressed }) => [styles.doorRow, pressed && styles.doorRowPressed]}
                testID={door.testID}
              >
                <View style={styles.doorDisc}>{door.icon}</View>
                <View style={styles.doorWords}>
                  <Text style={styles.doorTitle}>{door.title}</Text>
                  <Text style={styles.doorMeta}>{door.meta}</Text>
                </View>
                <Text style={styles.doorChevron}>›</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.oneHotelPillText}>{COPY.trust.oneHotel}</Text>
        </View>
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
        {/* Redesigned in the app's own empty-state language (owner,
            2026-08-04): the drawn door in its warm disc, the fact, one
            sentence, one loud way in — and the two lighter doors as quiet
            links instead of a wall of three pills. The purple raster this
            replaces was the one AI image left standing after R-009/D-058
            took the others down. */}
        <View style={styles.noRoom} testID="discovery-no-room">
          <View style={styles.noRoomDisc}>
            <DoorIcon />
          </View>
          <View style={styles.emptyWords}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.discovery.noRoomTitle}
            </Text>
            <Text style={styles.emptyBody}>{COPY.discovery.noRoomBody}</Text>
          </View>
          <View style={styles.noRoomActions}>
            <Button
              label={COPY.inbox.viewRooms}
              onPress={() => tabNavigation.navigate('Vacation')}
              testID="discovery-go-rooms"
            />
            <View style={styles.quietRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.discovery.checkProximity}
                onPress={() => navigation.navigate('HereNow')}
                style={({ pressed }) => [styles.quietAction, pressed && { opacity: 0.7 }]}
                testID="discovery-check-proximity"
              >
                <Text style={styles.quietActionText}>{COPY.discovery.checkProximity}</Text>
              </Pressable>
              <View style={styles.quietDivider} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.checkin.openCta}
                onPress={() => tabNavigation.navigate('Nearby')}
                style={({ pressed }) => [styles.quietAction, pressed && { opacity: 0.7 }]}
                testID="discovery-go-checkin"
              >
                <Text style={styles.quietActionText}>{COPY.checkin.openCta}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Screen>
    );
  }


  const swipe = async (direction: 'LIKE' | 'PASS') => {
    if (!candidate || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setBusy(true);
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
      toast.error(
        err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        'discovery-action-error',
      );
    } finally {
      setBusy(false);
    }
  };
  swipeRef.current = (direction) => void swipe(direction);

  return (
    <Screen safeTop testID="screen-discovery" bleed scroll={false}>
      {/* D-057: the head and the context selector sit above the card. Which
          room you are browsing is a real choice, and it is now stated rather
          than inferred — including when the answer is "none of them yet". */}
      {candidate ? null : (
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
      )}

      {deckError ? <Notice message={deckError} tone="error" testID="discovery-error" /> : null}

      {deck === null ? (
        <SkeletonCard fill testID="deck-loading" />
      ) : candidate ? (
        /* The whole person is one screen (owner decision): a full-bleed photo
           card with the name on it, the one fact this app can print — the
           room · hotel bond — as its only tag, and the three actions floating
           at its foot. No sections to scroll; the decision is made here. */
        <>
        {/* The stack (owner, 2026-08-04): the next person waits a breath
            behind, growing to full size as the card in hand travels. */}
        {nextCandidate ? (
          <Animated.View
            style={[styles.card, styles.backdropCard, { transform: [{ scale: backdropScale }] }]}
            pointerEvents="none"
          >
            {nextPath && photoUrls[nextPath] ? (
              <ExpoImage
                source={{ uri: photoUrls[nextPath] }}
                style={styles.cardPhoto}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.cardNoPhoto}>
                <Text style={styles.cardInitial}>{nextCandidate.displayName.slice(0, 1)}</Text>
              </View>
            )}
          </Animated.View>
        ) : null}
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX: position.x },
                { translateY: position.y },
                { rotate: cardLean },
              ],
            },
          ]}
          {...panResponder.panHandlers}
          testID={`candidate-${candidate.userId}`}
        >
          {shownPath && photoUrls[shownPath] ? (
            <ExpoImage
              source={{ uri: photoUrls[shownPath] }}
              style={styles.cardPhoto}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={140}
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

          {/* The verdict, said as you pull (owner, 2026-08-04): LIKE leans
              in from the left shoulder, NOPE from the right, opacity riding
              the drag — the deck-app grammar completed. */}
          <Animated.View
            style={[styles.stamp, styles.stampLike, { opacity: likeStampOpacity }]}
            pointerEvents="none"
          >
            <Text style={[styles.stampText, styles.stampTextLike]}>
              {COPY.discovery.likeStamp}
            </Text>
          </Animated.View>
          <Animated.View
            style={[styles.stamp, styles.stampNope, { opacity: nopeStampOpacity }]}
            pointerEvents="none"
          >
            <Text style={[styles.stampText, styles.stampTextNope]}>
              {COPY.discovery.nopeStamp}
            </Text>
          </Animated.View>

          {/* The photo-progress bars ride the photo's very top (owner,
              2026-08-04): tap left or right and the lit bar walks with the
              photo, the way every deck app has taught. */}
          {cardPaths.length > 1 ? (
            <View style={styles.segments} pointerEvents="none" testID="card-photo-segments">
              {cardPaths.map((path, index) => (
                <View
                  key={path}
                  style={[styles.segment, index === photoIndex && styles.segmentActive]}
                />
              ))}
            </View>
          ) : null}

          {/* K-01 (132:72/74): the two floating glass controls — the ring
              to yourself top-left, and the matches count top-right, which is
              the one heart-number this product honestly has. */}
          <View style={styles.floatTop} pointerEvents="box-none">
            <View style={styles.glassRing}>
              <ProfileRing testID="discovery-profile-ring" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.tabs.messages}
              onPress={() => tabNavigation.navigate('Inbox')}
              style={styles.likesPill}
              testID="discovery-matches-pill"
            >
              <HeartTinyIcon />
              <Text style={styles.likesCount}>{matchCount}</Text>
            </Pressable>
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
          <View style={styles.cardBottom} pointerEvents="box-none">
            <Text style={styles.cardName}>
              {candidate.displayName}
              <Text style={styles.cardAge}>{`, ${candidate.age}`}</Text>
            </Text>
            {candidate.bio ? (
              <Text style={styles.cardBio} numberOfLines={1}>
                {candidate.bio}
              </Text>
            ) : null}
            {/* The bond — same venue, or the neighbour's venue by name
                (D-038): the label is what keeps the region pool honest. The
                word follows the room (owner, 2026-08-04): "Aynı otelde" was
                standing on Çevremde cards, where the shared thing is a
                place, not a hotel. Event rooms carry no chip at all — the
                dock below already names the event. */}
            {room === 'EVENT_UPCOMING' || room === 'EVENT_HERE_NOW' ? null : (
              <View
                style={styles.sameHotelChip}
                testID={candidate.sameVenue ? 'card-bond-same' : 'card-bond-nearby'}
              >
                <BuildingTinyIcon />
                <Text style={styles.sameHotelText} numberOfLines={1}>
                  {candidate.sameVenue
                    ? room === 'NEARBY'
                      ? /* The candidate's checked-in place by name; a
                           placeless "buradayım" has no name to print, and
                           "Yakınında" is the honest whole of what is known
                           (owner, 2026-08-04). */
                        checkinName ?? COPY.discovery.nearYou
                      : hotelName ?? COPY.discovery.sameHotel
                    : (candidate.venueName
                        ?? (candidate.venuePlaceId ? venueLabels.get(candidate.venuePlaceId) : null))
                      ? `${candidate.venueName ?? venueLabels.get(candidate.venuePlaceId!)} · ${COPY.discovery.nearby}`
                      : COPY.discovery.nearby}
                </Text>
              </View>
            )}
            {/* K-01's green-dot line (132:82) — said only when it is
                live-true: these two rooms exist because a location check
                passed minutes ago, and no other room may borrow the dot. */}
            {room === 'HERE_NOW' || room === 'EVENT_HERE_NOW' ? (
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>
                  {room === 'HERE_NOW' ? COPY.discovery.liveAtVenue : COPY.discovery.liveAtEvent}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* The room selector stands in the quiet strip over the actions
            (owner, 2026-08-04) — off the person's photo, still one press
            from anywhere, still opening the same sheet (D-057). It does not
            ride the card, so it never flies with a swipe. */}
        <View style={styles.selectorDock}>
          <ContextSelector
            rows={contextRows}
            current={room}
            onChange={chooseRoom}
            now={nowMs()}
            testID="discovery-context"
          />
        </View>

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
            style={styles.actionPass}
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
            style={styles.actionFlag}
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

/** The initial that stands in for a missing photograph, sized to the card. */
const PHOTOLESS_INITIAL = 128;

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
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  emptyAction: { alignSelf: 'stretch', maxWidth: 280, width: '100%', gap: spacing.sm },
  emptyActionWide: { alignSelf: 'stretch', gap: spacing.sm },
  noRoomDisc: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRoomActions: { alignSelf: 'stretch', gap: spacing.xs },
  quietRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  quietAction: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  quietActionText: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.ink },
  quietDivider: { width: 1, height: 16, backgroundColor: color.rule },
  /** The three-door state: the radar, the claim, the doors, the promise. */
  doors: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  doorList: { alignSelf: 'stretch', gap: spacing.snug },
  doorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...elevation.card,
  },
  doorRowPressed: { backgroundColor: color.accentWash },
  doorDisc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorWords: { flex: 1, gap: spacing.tight },
  doorTitle: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.ink },
  doorMeta: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  doorChevron: { fontFamily: fontFamily.bodySemi, fontSize: font.heading, color: color.inkMuted },
  noHotelCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
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
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },
  oneHotelPill: {
    backgroundColor: color.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.cozy,
  },
  oneHotelPillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.inkMuted,
    textAlign: 'center',
  },
  howBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
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
    paddingHorizontal: spacing.wide,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.snug,
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
  /** The waiting card: same frame, no interaction, a breath smaller. */
  backdropCard: { ...StyleSheet.absoluteFillObject },
  /** The drag verdicts, worn like rubber stamps. */
  stamp: {
    position: 'absolute',
    top: 64,
    borderWidth: 3.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.xs,
  },
  stampLike: { left: 20, borderColor: color.successMark, transform: [{ rotate: '-14deg' }] },
  stampNope: { right: 20, borderColor: color.danger, transform: [{ rotate: '14deg' }] },
  stampText: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.display,
    letterSpacing: tracking.label,
  },
  stampTextLike: { color: color.successMark },
  stampTextNope: { color: color.danger },
  /** K-01: the floating glass controls, a step under the progress bars. */
  floatTop: {
    position: 'absolute',
    top: 22,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassRing: {
    borderRadius: radius.pill,
    backgroundColor: overlay.glass,
    padding: spacing.xs,
  },
  likesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.cozy,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: overlay.glass,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.sm,
  },
  likesCount: { fontFamily: fontFamily.bodySemi, fontSize: font.caption, color: color.ink },
  /**
   * The bond chip — same venue, or a neighbour's by name. A deep navy plate
   * over the photo, matching the room ribbon it sits beside.
   */
  sameHotelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.cozy,
    backgroundColor: overlay.plate,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.sm,
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
    // Above the selector dock, which is above the action circles.
    bottom: 156,
    gap: spacing.sm,
  },
  /** The selector's own strip between the words and the actions. */
  selectorDock: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 92,
  },
  /** 132:78: "Deniz, 28" — one voice, name and age together. */
  cardName: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    lineHeight: font.display * leading.tight,
    letterSpacing: tracking.display,
    color: color.onPhoto,
  },
  cardAge: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    letterSpacing: tracking.display,
    color: color.onPhoto,
  },
  cardBio: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.onPhoto,
  },
  /** 132:82: the live line — a green mark and the words beside it. */
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.cozy },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.successMark,
  },
  liveText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.onPhoto,
  },
  /** On the photo's head (owner, 2026-08-04) — the deck-app grammar. */
  segments: {
    position: 'absolute',
    top: 8,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.cozy,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: tokens.border.inverse,
  },
  segmentActive: { backgroundColor: color.onPhoto },
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
    borderRadius: radius.pill,
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
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  /** The safety flag rides the same centred row, one size down. */
  actionFlag: {
    width: 44,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: overlay.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPass: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.rule,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.raised,
  },
  cardNoPhoto: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * A drawing rather than type: the initial fills a card with no photograph,
   * so it is sized to the card and sits outside the type ladder by name.
   */
  cardInitial: {
    fontFamily: fontFamily.display,
    fontSize: PHOTOLESS_INITIAL,
    lineHeight: PHOTOLESS_INITIAL * leading.tight,
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
