import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Body,
  Caption,
  EmptyState,
  Heading,
  Notice,
  Screen,
  SectionLabel,
  Title,
} from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, radius, spacing } from '../theme';

/** Everything a sighted person sees in one row, in the order they see it. */
function inboxRowLabel(match: MatchSummary): string {
  const parts = [match.displayName];
  if (match.unmatchedAt !== null) {
    parts.push(COPY.inbox.closedLabel);
  }
  parts.push(match.lastMessageBody ?? COPY.inbox.sayHelloPreview);
  parts.push(COPY.inbox.openChatHint);
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

  // The convention borrowed from the apps that earned it: a face with no
  // conversation yet is an invitation, and it lives in its own strip; a
  // conversation is a row. The split is real information, not decoration.
  const fresh = (matches ?? []).filter((m) => m.lastMessageAt === null && m.unmatchedAt === null);
  const talking = (matches ?? []).filter((m) => m.lastMessageAt !== null || m.unmatchedAt !== null);

  return (
    <Screen safeTop testID="screen-inbox">
      <Title>{COPY.inbox.title}</Title>
      {error ? (
        <Notice message={error} tone="error" testID="inbox-error" />
      ) : matches === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="inbox-loading" />
      ) : matches.length === 0 ? (
        <EmptyState message={COPY.inbox.empty} />
      ) : (
        <>
          {fresh.length > 0 ? (
            <View style={styles.freshBlock}>
              <SectionLabel>{COPY.inbox.newMatches}</SectionLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.freshRow}>
                  {fresh.map((match) => (
                    <Pressable
                      key={match.matchId}
                      accessibilityRole="button"
                      accessibilityLabel={`${match.displayName}. ${COPY.inbox.sayHello}`}
                      onPress={() => navigation.navigate('Chat', { matchId: match.matchId })}
                      style={styles.freshItem}
                      testID={`inbox-${match.matchId}`}
                    >
                      <View style={styles.freshRing}>
                        <Avatar
                          url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                          name={match.displayName}
                          size="md"
                          testID={`inbox-photo-${match.matchId}`}
                        />
                      </View>
                      <Caption>{firstName(match.displayName)}</Caption>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          {talking.map((match, index) => (
            <Pressable
              key={match.matchId}
              accessibilityRole="button"
              // A Pressable is accessible by default, which collapses
              // everything inside it into this one label — so the closed
              // caption, the preview and the time are read only if named here.
              accessibilityLabel={inboxRowLabel(match)}
              onPress={() => navigation.navigate('Chat', { matchId: match.matchId })}
              testID={`inbox-${match.matchId}`}
            >
              <View
                style={[
                  styles.row,
                  index > 0 && styles.rowRule,
                  match.unmatchedAt !== null && styles.rowClosed,
                ]}
              >
                <Avatar
                  url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                  name={match.displayName}
                  testID={`inbox-photo-${match.matchId}`}
                />
                <View style={styles.rowText}>
                  <View style={styles.rowTop}>
                    <Heading>{match.displayName}</Heading>
                    {match.lastMessageAt !== null ? (
                      <Caption>{timeAgo(match.lastMessageAt)}</Caption>
                    ) : null}
                  </View>
                  {match.unmatchedAt !== null ? (
                    <Caption>{COPY.inbox.closedLabel}</Caption>
                  ) : null}
                  <Body numberOfLines={1}>
                    {match.lastMessageBody ?? COPY.inbox.sayHelloPreview}
                  </Body>
                </View>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

/** "5m", "3h", "2d" — the inbox convention; a date would be a paragraph. */
function timeAgo(at: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function firstName(name: string): string {
  return name.split(' ')[0];
}

const styles = StyleSheet.create({
  freshBlock: { gap: spacing.sm },
  freshRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  freshItem: { alignItems: 'center', gap: spacing.xs },
  /** The ring is the "new" signal, and the word under the face repeats it. */
  freshRing: {
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.accentDeep,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowRule: { borderTopWidth: 1, borderTopColor: color.rule },
  /** Readable, dimmed: a closed conversation is history, not a mistake. */
  rowClosed: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
