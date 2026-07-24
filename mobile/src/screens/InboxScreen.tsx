import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { Body, Caption, Card, EmptyState, Heading, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

export function InboxScreen() {
  const { dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      (async () => {
        try {
          const fetched = await getApi().getMatches();
          if (!cancelled) {
            setMatches(fetched);
            dispatch({ type: 'MATCHES_LOADED', matches: fetched });
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [dispatch]),
  );

  return (
    <Screen testID="screen-inbox">
      <Title>{COPY.inbox.title}</Title>
      {error ? (
        <Notice message={error} tone="error" testID="inbox-error" />
      ) : matches === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="inbox-loading" />
      ) : matches.length === 0 ? (
        <EmptyState message={COPY.inbox.empty} />
      ) : (
        matches.map((match) => (
          <Pressable
            key={match.matchId}
            accessibilityRole="button"
            accessibilityLabel={`Open chat with ${match.displayName}`}
            onPress={() => navigation.navigate('Chat', { matchId: match.matchId })}
            testID={`inbox-${match.matchId}`}
          >
            <Card>
              <Heading>{match.displayName}</Heading>
              {match.unmatchedAt !== null ? <Caption>{COPY.inbox.closedLabel}</Caption> : null}
              <Body>{match.lastMessageBody ?? COPY.inbox.sayHelloPreview}</Body>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
