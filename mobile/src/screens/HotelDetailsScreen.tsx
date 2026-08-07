/**
 * The room behind "Otel detaylarını gör" (designer, 2026-07-27).
 *
 * Deliberately only what the catalogue truly knows: the photograph with its
 * credit, the name, the place, the address when OSM recorded one, and where
 * the data comes from. No stars, no price, no amenities — inventing those
 * would be lying about a business.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Body, Button, Caption, Card, ConfirmDialog, PhotoScrim, Screen, SectionLabel, SuccessBadge, Title } from '../components/ui';
import { HotelBuilding } from '../components/HotelIllustrations';
import { nowMs } from '../clock';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { COPY } from '../copy';
import { getApi, readBackendConfig, type RoomStatus } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { color, elevation, font, fontFamily, leading, radius, spacing, tracking } from '../theme';

const PinIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

/** 131:86/92 — the drawn room teaser: a disc, a word, a sentence, an arrow. */
function RoomTeaser({
  icon,
  title,
  body,
  open = false,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** The room is live: the card says so with the shared green mark. */
  open?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${open ? `${COPY.vacation.cardOpen}. ` : ''}${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.teaser, pressed && styles.teaserPressed]}
      testID={testID}
    >
      <View style={styles.teaserDisc}>{icon}</View>
      <Text style={styles.teaserTitle}>{title}</Text>
      {open ? (
        /* Named so R-003 stays provable: the mark appearing and vanishing on
           its own, without a navigation, is how a lapsed check is seen. */
        <View style={styles.teaserOpenRow} testID={`${testID}-live`}>
          <View style={styles.teaserOpenDot} />
          <Text style={styles.teaserOpenText}>{COPY.vacation.cardOpen}</Text>
        </View>
      ) : null}
      <Text style={styles.teaserBody}>{body}</Text>
      <Text style={styles.teaserArrow} accessibilityElementsHidden importantForAccessibility="no">
        {'→'}
      </Text>
    </Pressable>
  );
}

export function HotelDetailsScreen({ route, navigation }: RootScreenProps<'HotelDetails'>) {
  const { state, dispatch } = useAppStore();
  /** The exit asks first (2026-08-03): leaving shuts rooms, like a switch. */
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const hotel = state.hotels.find((h) => h.id === route.params.hotelId) ?? null;
  /**
   * Today this screen is only ever opened from the active venue's own card,
   * but the route takes an id and a route that takes an id can be pointed at
   * anything. The status card and the two actions all speak about the *active*
   * venue, so they appear only when this really is it.
   */
  const isActive = state.activeHotel?.hotelId === route.params.hotelId;
  const config = readBackendConfig();
  const isGoogle = hotel?.provider === 'google';
  /**
   * D-054: a Google venue's name is not stored, so it is resolved once for
   * this screen and kept in memory. `false` is "Google could not answer",
   * which the screen says outright rather than inventing a name.
   */
  const [googleName, setGoogleName] = useState<string | null | false>(null);
  /**
   * The same resolve already answers with a photograph (D-054: a keyless,
   * expiring URL, held in memory and stored nowhere). This screen was throwing
   * it away and drawing the illustration instead, so a venue that had a photo
   * on Tatilim had none here (owner, 2026-08-06).
   */
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  /**
   * The two rooms' live state. D-065's `tatilim_view` (176:2730) does not draw
   * the room teasers the trip tab used to carry; it draws one venue card whose
   * own pill says "Odaya Gir", and this screen is what that pill has always
   * opened. So the rooms live here now, and with them R-003's watcher: a
   * lapsed Here Now check has to stop looking open on its own.
   */
  const [roomStates, setRoomStates] = useState<RoomStatus[] | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchRooms = async () => {
      try {
        const rooms = await getApi().getRooms();
        if (cancelled) return;
        setRoomStates(rooms);
        const soonest = earliestRoomExpiry(rooms, nowMs());
        if (soonest !== null) timer = setTimeout(watchRooms, soonest - nowMs());
      } catch {
        // The teasers simply keep their last answer.
      }
    };
    void watchRooms();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isActive]));

  useEffect(() => {
    if (!isGoogle) return;
    let cancelled = false;
    (async () => {
      const api = getApi();
      const venue = await api.getActiveVenue().catch(() => null);
      const placeId = venue?.hotelId === route.params.hotelId ? venue.googlePlaceId : null;
      if (!placeId) {
        if (!cancelled) setGoogleName(false);
        return;
      }
      const identity = await api.resolveGooglePlace(placeId).catch(() => null);
      if (cancelled) return;
      setGoogleName(identity?.name ?? false);
      setGooglePhoto(identity?.photoUri ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGoogle, route.params.hotelId]);

  if (!hotel) {
    return (
      <Screen testID="screen-hotel-details">
        <Body>{COPY.errors.notFound}</Body>
      </Screen>
    );
  }

  const source = googlePhoto
    ? { uri: googlePhoto }
    : hotel.photoUrl && config && hotel.photoUrl.includes('/functions/v1/hotel-photo')
      ? { uri: hotel.photoUrl, headers: { apikey: config.anonKey } }
      : hotel.photoUrl
        ? { uri: hotel.photoUrl }
        : null;

  return (
    <Screen testID="screen-hotel-details">
      {source ? (
        <View style={styles.photoWrap}>
          <Image source={source} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
          {hotel.photoAttribution ? (
            <>
              {/* The credit prints on the photo, so it needs the same scrim
                  every piece of text on an image needs. */}
              <PhotoScrim />
              <Text style={styles.credit} numberOfLines={1}>
                {hotel.photoAttribution}
              </Text>
            </>
          ) : null}
        </View>
      ) : (
        <View style={styles.artWrap}>
          <HotelBuilding size={96} />
        </View>
      )}
      <Title>
        {isGoogle
          ? googleName === false
            ? COPY.venue.nameUnavailable
            : (googleName ?? COPY.common.loading)
          : hotel.name}
      </Title>
      {/* A Google venue's address and city are Google's content, so there is
          nothing of ours to print — the attribution stands in their place. */}
      {isGoogle ? null : (
        <View style={styles.placeRow}>
          <PinIcon />
          <Body>{`${hotel.city}, ${hotel.country}`}</Body>
        </View>
      )}
      {!isGoogle && hotel.address ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{COPY.hotel.addressLabel}</Text>
          <Body>{hotel.address}</Body>
        </View>
      ) : null}
      <Caption>{isGoogle ? COPY.venue.attribution : COPY.hotel.attribution}</Caption>

      {/*
        R-016. For a Google venue this screen is the name and the attribution
        and nothing else — which is correct, because D-054 forbids storing any
        of the rest — but correct is not the same as finished: it was a room
        with a door in and no door out, and ~500pt of blank under it.

        What it was missing is not more of Google's data. It is the one thing
        the *account* knows and the screen never said: that this is the venue
        the whole trip tab is currently built on. That fact, and the two
        things anybody would want to do with it.
      */}
      {isActive ? (
        <>
          {/* The two rooms, moved off the trip tab in the D-065 fidelity pass
              and put behind the affordance the file itself draws for them.
              Each one opens its own room screen — the declaration, and the
              location check — which is where each flow actually begins. */}
          <SectionLabel>{COPY.vacation.whereWillYouBe}</SectionLabel>
          <View style={styles.roomsGrid}>
            <RoomTeaser
              icon={<SuitcaseIcon />}
              title={COPY.vacation.upcomingCardTitle}
              body={COPY.vacation.upcomingCardBody}
              open={roomStates?.find((r) => r.room === 'UPCOMING')?.eligible === true}
              onPress={() => navigation.navigate('Upcoming')}
              testID="open-upcoming"
            />
            <RoomTeaser
              icon={<BedIcon />}
              title={COPY.vacation.hereNowCardTitle}
              body={COPY.vacation.hereNowCardBody}
              open={roomStates?.find((r) => r.room === 'HERE_NOW')?.eligible === true}
              onPress={() => navigation.navigate('HereNow')}
              testID="open-here-now"
            />
          </View>
          <Card testID="hotel-details-status">
            <View style={styles.statusHead}>
              <SuccessBadge label={COPY.hotel.activePlate} testID="hotel-details-active" />
            </View>
            <Body>{COPY.hotel.activatedNote}</Body>
            <Caption>{COPY.trust.oneHotel}</Caption>
          </Card>
          {/* The three doors in the order the owner ranked them (2026-08-06):
              changing the venue is the loud one, going back and leaving are
              both quiet. Leaving keeps its weight in the question it asks, not
              in a red slab that shouted louder than the thing people came for. */}
          <Button
            label={COPY.hotel.switchButton}
            onPress={() => navigation.replace('ChooseHotel')}
            testID="hotel-details-change-venue"
          />
          <Button
            label={COPY.hotel.backToPlan}
            variant="secondary"
            onPress={() => navigation.goBack()}
            testID="hotel-details-back-to-plan"
          />
          {/* Leaving is not switching: cancelling the trip needs its own door
              (owner, 2026-08-03), and it asks first because it shuts rooms the
              same way a switch does (D-004). */}
          <Button
            label={COPY.hotel.leaveCta}
            variant="secondary"
            onPress={() => setConfirmingLeave(true)}
            testID="hotel-leave"
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
                navigation.goBack();
              } finally {
                setLeaving(false);
              }
            }}
            testID="hotel-leave-question"
            confirmTestID="hotel-leave-confirm"
            cancelTestID="hotel-leave-cancel"
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 210, backgroundColor: color.veil },
  credit: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.onPhoto,
    maxWidth: '80%',
  },
  // No photograph on file: the inert well a thumbnail ground uses, with the
  // building mark centred on it — the same job color.veil does everywhere
  // else an image would otherwise sit.
  artWrap: {
    height: 160,
    borderRadius: radius.xl,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.cozy },
  /** 131:85: the two rooms side by side, the way the trip tab used to draw them. */
  roomsGrid: { flexDirection: 'row', gap: spacing.snug, alignItems: 'stretch' },
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
  teaserPressed: { opacity: 0.8 },
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
  /** The badge sits on its own row so it keeps its size beside nothing. */
  statusHead: { flexDirection: 'row' },
  block: { gap: spacing.xs, marginTop: spacing.sm },
  blockLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    letterSpacing: tracking.none,
    color: color.inkMuted,
  },
});
