import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';

import { Badge, Body, Button, Caption, Card, Notice, Screen, Title } from '../components/ui';
import { nowMs, todayIsoDate } from '../clock';
import { COPY } from '../copy';
import { isRoomEligible } from '../domain/rooms';
import { getHotelById } from '../fixtures/hotels';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

export function RoomsScreen() {
  const { state } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const hotel = getHotelById(state.activeHotel.activeHotelId);
  const now = nowMs();
  const eligibilityInput = {
    activeHotelId: state.activeHotel.activeHotelId,
    upcoming: state.upcoming,
    hereNow: state.hereNow,
    now,
    todayIsoDate: todayIsoDate(),
  };
  const upcomingOpen = isRoomEligible('UPCOMING', eligibilityInput);
  const hereNowOpen = isRoomEligible('HERE_NOW', eligibilityInput);
  // A check that was in range but is no longer fresh means the session expired.
  const hereNowExpired =
    !hereNowOpen &&
    state.hereNow !== null &&
    state.hereNow.withinRange &&
    state.hereNow.hotelId === state.activeHotel.activeHotelId;

  if (!hotel) {
    return (
      <Screen testID="screen-rooms">
        <Title>Rooms</Title>
        <Notice message={`Activate a hotel first. ${COPY.trust.oneHotel}`} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-rooms">
      <Title>Rooms at {hotel.name}</Title>
      <Card>
        <Badge label={COPY.upcoming.statusBadge} tone="upcoming" />
        <Body>{COPY.upcoming.explainer}</Body>
        {upcomingOpen && state.upcoming ? (
          <Caption>
            Open — your declared stay is {state.upcoming.checkInDate} to{' '}
            {state.upcoming.checkOutDate}.
          </Caption>
        ) : (
          <Caption>Closed — declare your stay dates to enter.</Caption>
        )}
        <Button
          label={upcomingOpen ? 'Update stay dates' : 'Declare stay dates'}
          onPress={() => navigation.navigate('Upcoming')}
          testID="open-upcoming"
        />
      </Card>
      <Card>
        <Badge label={COPY.hereNow.statusBadge} tone="hereNow" />
        <Body>{COPY.hereNow.explainer}</Body>
        {hereNowOpen ? (
          <Caption>Open — a recent check placed you within 500 m.</Caption>
        ) : (
          <Caption>{hereNowExpired ? COPY.hereNow.expired : 'Closed — run a presence check to enter.'}</Caption>
        )}
        <Button
          label={COPY.hereNow.checkButton}
          onPress={() => navigation.navigate('HereNow')}
          testID="open-here-now"
        />
      </Card>
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}
