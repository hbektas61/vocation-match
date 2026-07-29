import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Notice, Screen } from '../components/ui';
import { BigActionButton } from '../components/BigActionButton';
import { LinearGradient } from 'expo-linear-gradient';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing, glass } from '../theme';

/** The owner's own 3D lobby render (2026-07-28), bundled — not a redrawing. */
const INBOX_HERO = require('../../assets/dark-inbox-chat.png');

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
      {/* The sheet's head (12:167): the tab's name and the ring to yourself. */}
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.headTitle}>{COPY.inbox.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.tabs.settings}
          onPress={() => tabNavigation.navigate('Settings')}
          style={({ pressed }) => [styles.profileRing, pressed && styles.pressedDim]}
          testID="inbox-profile-ring"
        />
      </View>
      {error ? (
        <Notice message={error} tone="error" testID="inbox-error" />
      ) : matches === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="inbox-loading" />
      ) : matches.length === 0 ? (
        /* The designer's empty inbox (2026-07-27): the two bubbles and the
           heart, why it is empty in one sentence, and both ways to change
           that — discovery, or the rooms that open it. */
        <View style={styles.empty} testID="inbox-empty">
          <Image
            source={INBOX_HERO}
            style={styles.emptyHero}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.emptyWords}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.inbox.emptyTitle}
            </Text>
            <Text style={styles.emptyBody}>{COPY.inbox.emptyBody}</Text>
          </View>
          <View style={styles.emptyActions}>
            <BigActionButton
              label={COPY.inbox.startDiscovering}
              icon="sparkle"
              filled
              onPress={() => tabNavigation.navigate('Discovery')}
              testID="inbox-start-discovering"
            />
            <BigActionButton
              label={COPY.inbox.viewRooms}
              icon="door"
              onPress={() => tabNavigation.navigate('Vacation')}
              testID="inbox-view-rooms"
            />
          </View>
        </View>
      ) : (
        <>
          {fresh.length > 0 ? (
            /* The sheet's new-match strip (12:170): the warm ring around the
               face, the first name under it — no heading over it. */
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
                    <LinearGradient
                      colors={['#FBBF24', '#FB7185', '#EC4899']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.freshRing}
                    >
                      <Avatar
                        url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                        name={match.displayName}
                        size="md"
                        testID={`inbox-photo-${match.matchId}`}
                      />
                    </LinearGradient>
                    <Text style={styles.freshName}>{firstName(match.displayName)}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
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
              {/* The sheet's row (12:183): the 46 face, the name over the
                  last words, the clock on the right. */}
              <View
                style={[styles.chatCard, match.unmatchedAt !== null && styles.rowClosed]}
              >
                <RowFace
                  url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                  name={match.displayName}
                  testID={`inbox-photo-${match.matchId}`}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>{match.displayName}</Text>
                  {match.unmatchedAt !== null ? (
                    <Text style={styles.rowPreview}>{COPY.inbox.closedLabel}</Text>
                  ) : null}
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {match.lastMessageBody ?? COPY.inbox.sayHelloPreview}
                  </Text>
                </View>
                {match.lastMessageAt !== null ? (
                  <Text style={styles.rowWhen}>{formatWhen(match.lastMessageAt)}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

/**
 * The row's 46 face (12:184) — the shared Avatar is 56, and the sheet is
 * specific. Falls back to the initial the same way.
 */
function RowFace({ url, name, testID }: { url: string | null; name: string; testID?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = url !== null && !failed;
  return (
    <View
      style={styles.rowFace}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      testID={testID}
    >
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={styles.rowFaceImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={styles.rowFaceInitial}>{name.trim() ? name.trim()[0].toUpperCase() : '?'}</Text>
      )}
    </View>
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
  emptyActions: { alignSelf: 'stretch', gap: spacing.sm },
  emptyHero: {
    width: '100%',
    aspectRatio: 398 / 172,
    borderRadius: radius.lg,
  },
  /** The sheet's head row (12:167). */
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 34 * 1.15,
    color: color.ink,
  },
  profileRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.4,
    borderColor: 'rgba(244, 114, 182, 0.5)',
  },
  pressedDim: { opacity: 0.8 },
  /** The new-match strip (12:170): 14 between faces, 6 under each. */
  freshRow: { flexDirection: 'row', gap: 14 },
  freshItem: { alignItems: 'center', gap: 6 },
  /** The warm 64 collar (12:172): 4 of gradient around the 56 face. */
  freshRing: {
    padding: 4,
    borderRadius: 32,
  },
  freshName: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    color: color.ink,
  },
  /** The sheet's conversation row (12:183): glass, 18 corners, 12 inside. */
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** Readable, dimmed: a closed conversation is history, not a mistake. */
  rowClosed: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  rowName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
  rowPreview: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: color.inkMuted,
  },
  rowWhen: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: color.inkMuted,
  },
  rowFace: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.veil,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFaceImage: { width: 46, height: 46 },
  rowFaceInitial: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.inkMuted,
  },
});
