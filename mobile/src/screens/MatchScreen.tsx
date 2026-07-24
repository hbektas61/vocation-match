import React from 'react';

import { Body, Button, Gap, Notice, Screen, Title } from '../components/ui';
import { COPY } from '../copy';
import { getCandidateById, SELF_ID } from '../fixtures/candidates';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

export function MatchScreen({ navigation, route }: RootScreenProps<'Match'>) {
  const { state } = useAppStore();
  const match = state.matches.find((m) => m.id === route.params.matchId) ?? null;
  const otherUserId = match?.userIds.find((id) => id !== SELF_ID) ?? null;
  const other = otherUserId ? getCandidateById(otherUserId) : null;

  if (!match) {
    return (
      <Screen testID="screen-match">
        <Notice message="This match is no longer available." />
        <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-match">
      <Title>{COPY.match.title}</Title>
      <Body>
        {other ? `You and ${other.displayName} liked each other. ` : ''}
        {COPY.match.body}
      </Body>
      <Gap />
      <Button
        label={other ? `Say hello to ${other.displayName}` : 'Open chat'}
        onPress={() => navigation.replace('Chat', { matchId: match.id })}
        testID="match-open-chat"
      />
      <Button
        label="Keep browsing"
        variant="secondary"
        onPress={() => navigation.goBack()}
        testID="match-keep-browsing"
      />
    </Screen>
  );
}
