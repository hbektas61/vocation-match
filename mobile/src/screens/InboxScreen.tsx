import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  Avatar,
  Body,
  Button,
  Caption,
  Field,
  Heading,
  Notice,
  Screen,
  Title,
} from '../components/ui';
import { InboxIllustration } from '../components/InboxIllustration';
import { LinearGradient } from 'expo-linear-gradient';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

const MagnifierIcon = () => (
  <View style={{ marginRight: spacing.sm }}>
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.inkMuted} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5" />
    </Svg>
  </View>
);

const HeartBadge = () => (
  <View style={heartBadgeStyle}>
    <Svg width={13} height={13} viewBox="0 0 24 24" fill={color.accentDeep}>
      <Path d="M12 8c0-5-8-5-8 0 0 4.5 5.2 7.6 8 9.6 2.8-2 8-5.1 8-9.6 0-5-8-5-8 0z" />
    </Svg>
  </View>
);

const heartBadgeStyle = {
  position: 'absolute' as const,
  bottom: -4,
  alignSelf: 'center' as const,
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: '#FFFFFF',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  shadowColor: color.ink,
  shadowOpacity: 0.15,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

const BellIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill={color.accentDeep} stroke={color.accentDeep} strokeWidth={1.5} strokeLinejoin="round">
    <Path d="M10.268 21a2 2 0 0 0 3.464 0" stroke="#FFFFFF" fill="none" strokeLinecap="round" />
    <Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </Svg>
);

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
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Client-side only: the list is small, the server never sees the query. */
  const [query, setQuery] = useState('');
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
  const q = query.trim().toLocaleLowerCase('tr');
  const visible = (matches ?? []).filter(
    (m) =>
      q === '' ||
      m.displayName.toLocaleLowerCase('tr').includes(q) ||
      (m.lastMessageBody ?? '').toLocaleLowerCase('tr').includes(q),
  );
  const fresh = visible.filter((m) => m.lastMessageAt === null && m.unmatchedAt === null);
  const talking = visible.filter((m) => m.lastMessageAt !== null || m.unmatchedAt !== null);

  return (
    <Screen safeTop testID="screen-inbox">
      <Title>{COPY.inbox.title}</Title>
      <Body>{COPY.inbox.subtitle}</Body>
      {error ? (
        <Notice message={error} tone="error" testID="inbox-error" />
      ) : matches === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="inbox-loading" />
      ) : matches.length === 0 ? (
        /* The designer's empty inbox (2026-07-27): the two bubbles and the
           heart, why it is empty in one sentence, and both ways to change
           that — discovery, or the rooms that open it. */
        <View style={styles.empty} testID="inbox-empty">
          <InboxIllustration />
          <View style={styles.emptyWords}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.inbox.emptyTitle}
            </Text>
            <Text style={styles.emptyBody}>{COPY.inbox.emptyBody}</Text>
          </View>
          <View style={styles.emptyActions}>
            <Button
              label={COPY.inbox.startDiscovering}
              onPress={() => tabNavigation.navigate('Discovery')}
              testID="inbox-start-discovering"
            />
            <Button
              label={COPY.inbox.viewRooms}
              variant="secondary"
              onPress={() => tabNavigation.navigate('Rooms')}
              testID="inbox-view-rooms"
            />
          </View>
          <View style={styles.bellStrip}>
            <View style={styles.bellDisc}>
              <BellIcon />
            </View>
            <View style={styles.bellWords}>
              <Caption>{COPY.inbox.matchesAppearHere}</Caption>
            </View>
          </View>
        </View>
      ) : (
        <>
          <Field
            label={COPY.inbox.searchLabel}
            hideLabel
            value={query}
            onChangeText={setQuery}
            placeholder={COPY.inbox.searchPlaceholder}
            prefix={<MagnifierIcon />}
            autoCapitalize="none"
            testID="inbox-search"
          />
          {fresh.length > 0 ? (
            <View style={styles.freshBlock}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                {COPY.inbox.newMatches}
              </Text>
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
                      {/* The designer's ring: a gradient collar with the heart
                          badge resting on its foot. */}
                      <View>
                        <LinearGradient
                          colors={['#C9A3E8', '#7B4FA8']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.freshRing}
                        >
                          <View style={styles.freshRingInner}>
                            <Avatar
                              url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                              name={match.displayName}
                              size="md"
                              testID={`inbox-photo-${match.matchId}`}
                            />
                          </View>
                        </LinearGradient>
                        <HeartBadge />
                      </View>
                      <Caption>{firstName(match.displayName)}</Caption>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          {talking.length > 0 ? (
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {COPY.inbox.chats}
            </Text>
          ) : null}
          {talking.map((match) => (
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
                style={[styles.chatCard, match.unmatchedAt !== null && styles.rowClosed]}
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
                      <Caption>{formatWhen(match.lastMessageAt)}</Caption>
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

/**
 * The designer's time column: today reads as a clock time, yesterday as a
 * word, anything older as days — a date would be a paragraph.
 */
function formatWhen(at: number): string {
  const then = new Date(at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at >= startOfToday) {
    const hh = String(then.getHours()).padStart(2, '0');
    const mm = String(then.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (at >= startOfToday - 86_400_000) {
    return COPY.inbox.yesterday;
  }
  return COPY_FOR.daysAgo(Math.floor((startOfToday - at) / 86_400_000) + 1);
}

function firstName(name: string): string {
  return name.split(' ')[0];
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyWords: { alignItems: 'center', gap: spacing.sm },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    color: color.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyActions: { alignSelf: 'stretch', gap: spacing.sm, maxWidth: 300, width: '100%' },
  bellStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(123, 79, 168, 0.05)',
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    alignSelf: 'stretch',
  },
  bellDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bellWords: { flex: 1 },
  sectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.ink,
    marginTop: spacing.xs,
  },
  freshBlock: { gap: spacing.sm },
  freshRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs, paddingBottom: spacing.sm },
  freshItem: { alignItems: 'center', gap: spacing.sm },
  /** The ring is the "new" signal, and the word under the face repeats it. */
  freshRing: {
    padding: 3,
    borderRadius: radius.pill,
  },
  freshRingInner: {
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
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
