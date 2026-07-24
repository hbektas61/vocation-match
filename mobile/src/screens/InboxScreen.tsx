import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable } from 'react-native';

import { Body, Caption, Card, EmptyState, Heading, Screen, Title } from '../components/ui';
import { getCandidateById, SELF_ID } from '../fixtures/candidates';
import { getHotelById } from '../fixtures/hotels';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

export function InboxScreen() {
  const { state } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Screen testID="screen-inbox">
      <Title>Inbox</Title>
      {state.matches.length === 0 ? (
        <EmptyState message="No matches yet. Mutual likes appear here." />
      ) : (
        state.matches.map((match) => {
          const otherUserId = match.userIds.find((id) => id !== SELF_ID) ?? match.userIds[0];
          const other = getCandidateById(otherUserId);
          const hotel = getHotelById(match.hotelId);
          const lastMessage = [...state.messages]
            .reverse()
            .find((m) => m.matchId === match.id);
          return (
            <Pressable
              key={match.id}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${other?.displayName ?? 'match'}`}
              onPress={() => navigation.navigate('Chat', { matchId: match.id })}
              testID={`inbox-${match.id}`}
            >
              <Card>
                <Heading>{other?.displayName ?? 'Match'}</Heading>
                {hotel ? <Caption>{hotel.name}</Caption> : null}
                <Body>{lastMessage ? lastMessage.text : 'Say hello!'}</Body>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
