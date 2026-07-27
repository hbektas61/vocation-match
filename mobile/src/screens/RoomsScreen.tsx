import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Body, Button, Caption, Notice, Screen, StateChip, Title } from '../components/ui';
import { CalendarIllustration, PinScene } from '../components/RoomIllustrations';
import { NoHotelCard } from '../components/NoHotelCard';
import { DoorScene } from '../components/NoHotelIllustrations';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, COPY_FOR, roomStatusExplanation, upperCase } from '../copy';
import { ApiError, getApi, type RoomKey, type RoomStatus } from '../data';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

/** The small icons beside each card's status line, and the footer shield. */
const CalendarIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3} y={5} width={18} height={16} rx={2} />
    <Path d="M8 3v4M16 3v4M3 11h18" />
  </Svg>
);

const PinIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

const ShieldIcon = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <Path d="M13 9l-3 4h4l-3 4" strokeWidth={1.8} />
  </Svg>
);

/**
 * One room, as the designer's card (2026-07-27): the tracked plate and the
 * state chip on the head row, the drawing beside the claim and its trust
 * sentence, the server's status line under a hairline, and the door's one
 * action as a full-width button.
 */
function RoomCard({
  room,
  status,
  lead,
  body,
  illustration,
  icon,
  buttonLabel,
  onOpen,
  extra,
  testID,
  buttonTestID,
}: {
  room: RoomKey;
  status: RoomStatus | null;
  lead: string;
  body: string;
  illustration: React.ReactNode;
  icon: React.ReactNode;
  buttonLabel: string;
  onOpen: () => void;
  extra?: React.ReactNode;
  testID: string;
  buttonTestID: string;
}) {
  const open = status?.eligible === true;
  return (
    <View style={styles.roomCard} testID={testID}>
      <View style={styles.cardHead}>
        <View style={styles.platePill}>
          <Text style={styles.platePillText}>
            {upperCase(room === 'UPCOMING' ? COPY.rooms.upcomingPlate : COPY.rooms.hereNowPlate)}
          </Text>
        </View>
        <StateChip
          open={open}
          label={open ? COPY.rooms.openChip : COPY.rooms.closedChip}
          testID={`${testID}-state`}
        />
      </View>
      <View style={styles.cardBodyRow}>
        <View style={styles.cardArt}>{illustration}</View>
        <View style={styles.cardWords}>
          <Text style={styles.cardLead}>{lead}</Text>
          <Body>{body}</Body>
        </View>
      </View>
      <View style={styles.hairline} />
      {status ? (
        <View style={styles.statusRow}>
          {icon}
          <View style={styles.statusText}>
            <Caption>{roomStatusExplanation(room, status)}</Caption>
          </View>
        </View>
      ) : null}
      {extra}
      <Button
        label={buttonLabel}
        variant={open ? 'secondary' : 'primary'}
        onPress={onOpen}
        testID={buttonTestID}
      />
    </View>
  );
}

export function RoomsScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [rooms, setRooms] = useState<RoomStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Whether there *is* an active hotel is the server's answer, carried in the
  // room status. The cached card is only ever the source of its *name*: it is
  // populated by visiting the Hotel tab, and nothing fills it on a cold start,
  // so gating on it told every returning user they had no hotel.
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  const hotelName = hotel?.name ?? null;

  // Refresh on focus (coming back from Upcoming or Here Now), and again once
  // more at the soonest room expiry (R-003) so a lapsed Here Now check stops
  // looking open on its own rather than waiting for the next navigation.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const load = async () => {
        setError(null);
        try {
          const fetched = await getApi().getRooms();
          if (cancelled) return;
          setRooms(fetched);
          dispatch({ type: 'ROOMS_LOADED', rooms: fetched });
          const soonest = earliestRoomExpiry(fetched, nowMs());
          if (soonest !== null) {
            timer = setTimeout(load, soonest - nowMs());
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
          }
        }
      };

      load();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, [dispatch]),
  );

  const upcomingStatus = rooms?.find((r) => r.room === 'UPCOMING') ?? null;
  const hereNowStatus = rooms?.find((r) => r.room === 'HERE_NOW') ?? null;
  const noActiveHotel =
    upcomingStatus?.reason === 'NO_ACTIVE_HOTEL' || hereNowStatus?.reason === 'NO_ACTIVE_HOTEL';

  if (error) {
    return (
      <Screen safeTop testID="screen-rooms">
        <Title>{COPY.rooms.plainTitle}</Title>
        <Notice message={error} tone="error" testID="rooms-error" />
      </Screen>
    );
  }

  if (rooms === null) {
    return (
      <Screen safeTop testID="screen-rooms">
        <Title>{COPY.rooms.plainTitle}</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="rooms-loading" />
      </Screen>
    );
  }

  if (noActiveHotel) {
    // Saying "activate a hotel first" and stopping there tells somebody what is
    // wrong and leaves them to find where to fix it. The way out belongs on the
    // screen that is blocked — twice, per the designer: the search, and the
    // hotel tab it lives on.
    return (
      <Screen safeTop testID="screen-rooms">
        <Title>{COPY.rooms.plainTitle}</Title>
        <Body>{`${COPY.roomReason.NO_ACTIVE_HOTEL} ${COPY.trust.oneHotel}`}</Body>
        <NoHotelCard
          illustration={<DoorScene />}
          title={COPY.rooms.noHotelTitle}
          body={COPY.rooms.noHotelBody}
          primaryLabel={COPY.hotel.chooseCta}
          onPrimary={() => navigation.navigate('ChooseHotel')}
          primaryTestID="rooms-choose-hotel"
          secondary={
            <Button
              label={COPY.rooms.viewHotels}
              variant="secondary"
              onPress={() => tabNavigation.navigate('Hotel')}
              testID="rooms-view-hotels"
            />
          }
        />
      </Screen>
    );
  }

  const upcomingOpen = upcomingStatus?.eligible === true;

  return (
    <Screen safeTop testID="screen-rooms">
      <Title>{COPY_FOR.roomsTitle(hotelName)}</Title>
      <Body>{COPY.rooms.subtitle}</Body>

      <RoomCard
        room="UPCOMING"
        status={upcomingStatus}
        lead={COPY.rooms.upcomingLead}
        body={COPY.rooms.upcomingBody}
        illustration={<CalendarIllustration />}
        icon={<CalendarIcon />}
        buttonLabel={upcomingOpen ? COPY.upcoming.updateButton : COPY.upcoming.saveButton}
        onOpen={() => navigation.navigate('Upcoming')}
        testID="room-upcoming"
        buttonTestID="open-upcoming"
      />

      <RoomCard
        room="HERE_NOW"
        status={hereNowStatus}
        lead={COPY.rooms.hereNowLead}
        body={COPY.rooms.hereNowBody}
        illustration={<PinScene />}
        icon={<PinIcon />}
        buttonLabel={COPY.hereNow.checkButton}
        onOpen={() => navigation.navigate('HereNow')}
        extra={
          state.locationPermission === 'denied' ? (
            <Notice message={COPY.hereNow.permissionDenied} tone="error" />
          ) : null
        }
        testID="room-here-now"
        buttonTestID="open-here-now"
      />

      {/* The trust caption grown into the designer's footer: what is true
          about location and deletion, and the way to the controls. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${COPY.rooms.privacyTitle}. ${COPY.rooms.privacyBody}`}
        onPress={() => tabNavigation.navigate('Settings')}
        style={({ pressed }) => [styles.privacyCard, pressed && styles.privacyPressed]}
        testID="rooms-privacy"
      >
        <ShieldIcon />
        <View style={styles.privacyWords}>
          <Text style={styles.privacyTitle}>{COPY.rooms.privacyTitle}</Text>
          <Caption>{COPY.rooms.privacyBody}</Caption>
        </View>
        <Text style={styles.privacyChevron}>›</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  roomCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  platePill: {
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 5,
  },
  platePillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.6,
    color: color.accentDeep,
  },
  cardBodyRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  cardArt: { width: 96 },
  cardWords: { flex: 1, gap: spacing.xs },
  cardLead: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 1,
    lineHeight: (font.body + 1) * 1.35,
    color: color.ink,
  },
  hairline: { height: 1, backgroundColor: color.border },
  statusRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  statusText: { flex: 1 },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(123, 79, 168, 0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  privacyPressed: { opacity: 0.8 },
  privacyWords: { flex: 1, gap: 2 },
  privacyTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  privacyChevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.inkMuted,
  },
});
