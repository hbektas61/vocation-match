import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Body, Button, Caption, Card, Notice, RoomRibbon, Screen, Title } from '../components/ui';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, COPY_FOR, roomStatusExplanation } from '../copy';
import { ApiError, getApi, type RoomStatus } from '../data';
import type { RootStackParamList } from '../navigation/types';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { useAppStore } from '../state/AppStore';

export function RoomsScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rooms, setRooms] = useState<RoomStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;

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
      <Screen testID="screen-rooms">
        <Title>Rooms</Title>
        <Notice message={error} tone="error" testID="rooms-error" />
      </Screen>
    );
  }

  if (rooms === null) {
    return (
      <Screen testID="screen-rooms">
        <Title>Rooms</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="rooms-loading" />
      </Screen>
    );
  }

  if (noActiveHotel || !hotel) {
    // Saying "activate a hotel first" and stopping there tells somebody what is
    // wrong and leaves them to find where to fix it. The way out belongs on the
    // screen that is blocked.
    return (
      <Screen testID="screen-rooms">
        <Title>Rooms</Title>
        <Notice message={`${COPY.roomReason.NO_ACTIVE_HOTEL} ${COPY.trust.oneHotel}`} />
        <Button
          label={COPY.hotel.chooseCta}
          onPress={() => navigation.navigate('ChooseHotel')}
          testID="rooms-choose-hotel"
        />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-rooms">
      <Title>{COPY_FOR.roomsTitle(hotel.name)}</Title>
      <Card testID="room-upcoming">
        <RoomRibbon room="UPCOMING" hotelName={hotel.name} />
        <Body>{COPY.upcoming.explainer}</Body>
        {upcomingStatus ? <Caption>{roomStatusExplanation('UPCOMING', upcomingStatus)}</Caption> : null}
        <Button
          label={upcomingStatus?.eligible ? COPY.upcoming.updateButton : COPY.upcoming.saveButton}
          variant={upcomingStatus?.eligible ? 'secondary' : 'primary'}
          onPress={() => navigation.navigate('Upcoming')}
          testID="open-upcoming"
        />
      </Card>
      <Card testID="room-here-now">
        <RoomRibbon room="HERE_NOW" hotelName={hotel.name} />
        <Body>{COPY.hereNow.explainer}</Body>
        {hereNowStatus ? <Caption>{roomStatusExplanation('HERE_NOW', hereNowStatus)}</Caption> : null}
        {state.locationPermission === 'denied' ? (
          <Notice message={COPY.hereNow.permissionDenied} tone="error" />
        ) : null}
        <Button
          label={COPY.hereNow.checkButton}
          variant={hereNowStatus?.eligible ? 'secondary' : 'primary'}
          onPress={() => navigation.navigate('HereNow')}
          testID="open-here-now"
        />
      </Card>
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}
