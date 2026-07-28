import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { BigActionButton } from '../components/BigActionButton';
import { NoHotelCard } from '../components/NoHotelCard';
import { CompassScene } from '../components/NoHotelIllustrations';
import { RadarEmpty } from '../components/RadarEmpty';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, COPY_FOR, upperCase, roomPlate } from '../copy';
import { ApiError, getApi, type CandidateCard, type RoomKey, type RoomStatus } from '../data';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { color, font, fontFamily, palette, radius, spacing } from '../theme';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';

/** The owner's own 3D door render (2026-07-28), bundled — not a redrawing. */
const DOOR_HERO = require('../../assets/discovery-door.jpg');

const XIcon = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={'#0F1B3D'} strokeWidth={2.6} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

const HeartIcon = () => (
  <Svg width={34} height={34} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
  </Svg>
);

const FlagIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="#0F1B3D" stroke="#0F1B3D" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 21V4c3-2 6 2 9 0s4-1 7 0v11c-3-1-4-2-7 0s-6-2-9 0z" fill="#0F1B3D" />
    <Path d="M4 22V3" stroke="#0F1B3D" fill="none" />
  </Svg>
);

const BuildingTinyIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={5} y={3} width={14} height={18} rx={2} />
    <Path d="M9 8h2m2 0h2M9 12h2m2 0h2M10 21v-4h4v4" />
  </Svg>
);

const PinTinyIcon = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** "12 Ağu – 17 Ağu" — the plan, in dates. */
function formatStayRange(startIso: string, endIso: string): string {
  const part = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${part(startIso)} – ${part(endIso)}`;
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
): string {
  const minutesLeft =
    validUntil != null ? Math.max(1, Math.round((validUntil - nowMs()) / 60000)) : null;
  if (room === 'UPCOMING') {
    return [hotelName, stayRange].filter(Boolean).join(' · ');
  }
  if (room === 'HERE_NOW') {
    return [hotelName, minutesLeft != null ? COPY_FOR.timeLeft(minutesLeft) : null]
      .filter(Boolean)
      .join(' · ');
  }
  return [checkinName, minutesLeft != null ? COPY_FOR.timeLeft(minutesLeft) : null]
    .filter(Boolean)
    .join(' · ');
}

const ROOM_LABEL: Record<RoomKey, string> = {
  UPCOMING: COPY.upcoming.roomTitle,
  HERE_NOW: COPY.hereNow.roomTitle,
  NEARBY: COPY.checkin.roomTitle,
};

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
  const [deck, setDeck] = useState<CandidateCard[] | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  /** Bumped by "scan again" on the empty room; the deck effect re-runs. */
  const [scan, setScan] = useState(0);
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
          const [fetched, checkin, stay] = await Promise.all([
            getApi().getRooms(),
            getApi().getCheckin().catch(() => null),
            getApi().getUpcomingStay().catch(() => null),
          ]);
          if (cancelled) return;
          const withNearby: RoomStatus[] = checkin
            ? [
                ...fetched,
                { room: 'NEARBY', eligible: true, reason: 'ELIGIBLE', validUntil: checkin.expiresAt },
              ]
            : fetched;
          setRooms(withNearby);
          setCheckinName(checkin?.venueName ?? null);
          setStayRange(stay ? formatStayRange(stay.startDate, stay.endDate) : null);
          const eligible = withNearby.filter((r) => r.eligible).map((r) => r.room);
          // D-040: keep what the person was looking at; otherwise the most
          // present-tense source first — the street, the hotel door, the plan.
          const fallback = (['NEARBY', 'HERE_NOW', 'UPCOMING'] as RoomKey[]).find((key) =>
            eligible.includes(key),
          );
          setRoom((current) => (current && eligible.includes(current) ? current : fallback ?? null));
          const soonest = earliestRoomExpiry(withNearby, nowMs());
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
    (async () => {
      setDeck(null);
      setDeckError(null);
      try {
        const feed = await getApi().getDiscoveryFeed(room);
        if (!cancelled) setDeck(feed);
      } catch (err) {
        if (!cancelled) {
          setDeckError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
        }
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
  const eligibleRooms = rooms?.filter((r) => r.eligible).map((r) => r.room) ?? [];
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

  if (rooms === null) {
    return (
      <Screen safeTop testID="screen-discovery">
        <Title>{COPY.tabs.discovery}</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="discovery-loading" />
      </Screen>
    );
  }

  const nearbyOpen = rooms.some((r) => r.room === 'NEARBY' && r.eligible);

  if (!hasHotel && !nearbyOpen) {
    return (
      <Screen safeTop testID="screen-discovery">
        <Title>{COPY.tabs.discovery}</Title>
        <Body>{`${COPY.roomReason.NO_ACTIVE_HOTEL} ${COPY.trust.oneHotel}`}</Body>
        <NoHotelCard
          illustration={<CompassScene />}
          title={COPY.discovery.noHotelTitle}
          body={COPY.discovery.noHotelBody}
          primaryLabel={COPY.hotel.chooseCta}
          onPrimary={() => navigation.navigate('ChooseHotel')}
          primaryTestID="discovery-choose-hotel"
          secondary={
            <>
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
            </>
          }
        />
      </Screen>
    );
  }

  if (!room) {
    /* The designer's pre-room screen (2026-07-27): the orbit field, why the
       deck is closed in two sentences, and both ways in as buttons — the
       rooms, or a proximity check straight from here. */
    return (
      <Screen safeTop testID="screen-discovery">
        <Title>{COPY.tabs.discovery}</Title>
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
      {/* The room switch stays above the card: which door you are browsing is
          a real choice, and the reference has no equivalent for it. */}
      {room ? (
        <Text style={styles.contextLine} testID="discovery-context">
          {contextLine(
            room,
            hotelName,
            stayRange,
            rooms.find((r) => r.room === room)?.validUntil ?? null,
            checkinName,
          )}
        </Text>
      ) : null}
      {eligibleRooms.length > 1 ? (
        <View style={styles.roomSwitch}>
          {eligibleRooms.map((r) => (
            <View key={r} style={styles.roomSwitchItem}>
              <Button
                label={ROOM_LABEL[r]}
                variant={r === room ? 'primary' : 'secondary'}
                compact
                onPress={() => setRoom(r)}
                testID={`room-${r}`}
              />
            </View>
          ))}
        </View>
      ) : null}

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

          {/* The two chips of the reference: the room, white on the photo,
              and the bond — same venue, or the neighbour's venue by name
              (D-038): the label is what keeps the region pool honest. */}
          <View style={styles.chipRowTop} pointerEvents="none">
            <View style={styles.roomChip} testID="candidate-room">
              <View style={styles.roomChipDot} />
              <Text style={styles.roomChipText}>
                {upperCase(roomPlate(room))}
              </Text>
            </View>
            <View
              style={styles.sameHotelChip}
              testID={candidate.sameVenue ? 'card-bond-same' : 'card-bond-nearby'}
            >
              <BuildingTinyIcon />
              <Text style={styles.sameHotelText} numberOfLines={1}>
                {candidate.sameVenue
                  ? (room === 'NEARBY' ? checkinName : hotelName) ?? COPY.discovery.sameHotel
                  : candidate.venueName
                    ? `${candidate.venueName} · ${COPY.discovery.nearby}`
                    : COPY.discovery.sameHotel}
              </Text>
            </View>
          </View>

          {/* Identity on the photo's foot, on its own scrim: name and age,
              the bio, and the hotel worn as a pill. */}
          <LinearGradient
            colors={['transparent', 'rgba(8, 5, 16, 0.82)']}
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
              label={COPY.discovery.rescan}
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
  contextLine: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.inkMuted,
    textAlign: 'center',
  },
  roomSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  roomSwitchItem: { flex: 1 },
  /** The card is the screen: everything else stands on the photograph. */
  card: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.veil,
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
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
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 6,
    paddingVertical: 8,
  },
  roomChipDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2.5,
    borderColor: color.accentDeep,
  },
  roomChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1,
    color: color.accentDeep,
  },
  sameHotelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(40, 36, 50, 0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 6,
    paddingVertical: 8,
  },
  sameHotelText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: '#FFFFFF',
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
    bottom: spacing.md,
    gap: spacing.sm,
  },
  cardName: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    color: '#FFFFFF',
  },
  cardAge: {
    fontFamily: fontFamily.body,
    fontSize: 34,
    color: 'rgba(255,255,255,0.95)',
  },
  cardBio: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.4,
    color: 'rgba(255,255,255,0.95)',
  },
  hotelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 6,
    paddingVertical: 8,
  },
  hotelChipText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(20, 22, 26, 0.12)',
  },
  segmentActive: { backgroundColor: color.accentDeep },
  /** Three circles on the ground: 64 · 84 · 64, the heart carrying the size. */
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm + 4,
  },
  actionCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionHeart: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: color.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accentDeep,
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
    color: palette.placeholder,
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
