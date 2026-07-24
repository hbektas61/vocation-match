import React from 'react';

import { Body, Button, Gap, Notice, Screen, Title } from '../components/ui';
import { COPY } from '../copy';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

export function MatchScreen({ navigation, route }: RootScreenProps<'Match'>) {
  const { state } = useAppStore();
  const match = state.matches.find((m) => m.matchId === route.params.matchId) ?? null;

  if (!match) {
    return (
      <Screen testID="screen-match">
        <Notice message={COPY.match.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-match">
      <Title>{COPY.match.title}</Title>
      <Body>
        {`You and ${match.displayName} liked each other. `}
        {COPY.match.body}
      </Body>
      <Gap />
      <Button
        label={`Say hello to ${match.displayName}`}
        onPress={() => navigation.replace('Chat', { matchId: match.matchId })}
        testID="match-open-chat"
      />
      <Button
        label={COPY.match.keepBrowsing}
        variant="secondary"
        onPress={() => navigation.goBack()}
        testID="match-keep-browsing"
      />
    </Screen>
  );
}
