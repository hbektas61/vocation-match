import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  Gap,
  Heading,
  Notice,
  Screen,
  Title,
} from '../components/ui';
import { nowMs } from '../clock';
import { COPY } from '../copy';
import { discoveryPool } from '../domain/matching';
import { eligibleRooms } from '../domain/rooms';
import type { RoomKey } from '../domain/types';
import { CANDIDATES, SELF_ID } from '../fixtures/candidates';
import { getHotelById } from '../fixtures/hotels';
import type { RootStackParamList } from '../navigation/types';
import { todayIsoDate, useAppStore } from '../state/AppStore';

const ROOM_LABEL: Record<RoomKey, string> = {
  UPCOMING: COPY.upcoming.roomTitle,
  HERE_NOW: COPY.hereNow.roomTitle,
};

export function DiscoveryScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const hotel = getHotelById(state.activeHotel.activeHotelId);
  const rooms = eligibleRooms({
    activeHotelId: state.activeHotel.activeHotelId,
    upcoming: state.upcoming,
    hereNow: state.hereNow,
    now: nowMs(),
    todayIsoDate: todayIsoDate(),
  });
  const [room, setRoom] = useState<RoomKey | null>(null);
  const activeRoom = room && rooms.includes(room) ? room : rooms[0] ?? null;

  // A mutual match interrupts the deck with the celebration screen.
  useEffect(() => {
    if (state.lastMatchId) {
      const matchId = state.lastMatchId;
      dispatch({ type: 'CLEAR_LAST_MATCH' });
      navigation.navigate('Match', { matchId });
    }
  }, [state.lastMatchId, dispatch, navigation]);

  if (!hotel) {
    return (
      <Screen testID="screen-discovery">
        <Title>Discovery</Title>
        <Notice message={`Activate a hotel first. ${COPY.trust.oneHotel}`} />
      </Screen>
    );
  }

  if (!activeRoom) {
    return (
      <Screen testID="screen-discovery">
        <Title>Discovery</Title>
        <Notice message={COPY.discovery.notEligible} />
      </Screen>
    );
  }

  const deck = discoveryPool(CANDIDATES, {
    selfId: SELF_ID,
    hotelId: hotel.id,
    room: activeRoom,
    swipes: state.swipes,
    blockedUserIds: state.blockedUserIds,
  });
  const candidate = deck[0] ?? null;

  const swipe = (direction: 'LIKE' | 'PASS') => {
    if (!candidate) return;
    dispatch({ type: 'SWIPE', toUserId: candidate.id, room: activeRoom, direction, now: nowMs() });
  };

  return (
    <Screen testID="screen-discovery">
      <Title>Discovery at {hotel.name}</Title>
      {rooms.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {rooms.map((r) => (
            <View key={r} style={{ flex: 1 }}>
              <Button
                label={ROOM_LABEL[r]}
                variant={r === activeRoom ? 'primary' : 'secondary'}
                onPress={() => setRoom(r)}
                testID={`room-${r}`}
              />
            </View>
          ))}
        </View>
      ) : (
        <Badge
          label={activeRoom === 'UPCOMING' ? COPY.upcoming.statusBadge : COPY.hereNow.statusBadge}
          tone={activeRoom === 'UPCOMING' ? 'upcoming' : 'hereNow'}
        />
      )}
      {candidate ? (
        <Card testID={`candidate-${candidate.id}`}>
          <Heading>
            {candidate.displayName}, {candidate.age}
          </Heading>
          <Body>{candidate.bio}</Body>
          <Caption>{candidate.interests.join(' · ')}</Caption>
          <Gap size="xs" />
          <Button label={`Like ${candidate.displayName}`} onPress={() => swipe('LIKE')} testID="swipe-like" />
          <Button label="Pass" variant="secondary" onPress={() => swipe('PASS')} testID="swipe-pass" />
        </Card>
      ) : (
        <EmptyState message={COPY.discovery.emptyDeck} />
      )}
    </Screen>
  );
}
