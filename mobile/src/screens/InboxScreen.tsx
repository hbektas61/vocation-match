import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Body,
  Caption,
  EmptyState,
  Heading,
  Notice,
  Screen,
  Title,
} from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { spacing } from '../theme';

/** Everything a sighted person sees in one row, in the order they see it. */
function inboxRowLabel(match: MatchSummary): string {
  const parts = [match.displayName];
  if (match.unmatchedAt !== null) {
    parts.push(COPY.inbox.closedLabel);
  }
  parts.push(match.lastMessageBody ?? COPY.inbox.sayHelloPreview);
  parts.push('Open chat');
  return parts.join('. ');
}

export function InboxScreen() {
  const { dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoPaths = useMemo(() => (matches ?? []).map((m) => m.photoPath), [matches]);
  const photoUrls = usePhotoUrls(photoPaths);

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
            // A Pressable is accessible by default, which collapses everything
            // inside it into this one label — so the closed-conversation
            // caption, the message preview and the avatar are all read only if
            // they are named here. Without that, every row in the inbox sounds
            // identical apart from the name.
            accessibilityLabel={inboxRowLabel(match)}
            onPress={() => navigation.navigate('Chat', { matchId: match.matchId })}
            testID={`inbox-${match.matchId}`}
          >
            <View style={styles.row}>
              <Avatar
                url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                name={match.displayName}
                testID={`inbox-photo-${match.matchId}`}
              />
              <View style={styles.rowText}>
                <Heading>{match.displayName}</Heading>
                {match.unmatchedAt !== null ? <Caption>{COPY.inbox.closedLabel}</Caption> : null}
                <Body>{match.lastMessageBody ?? COPY.inbox.sayHelloPreview}</Body>
              </View>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1, gap: spacing.xs },
});
