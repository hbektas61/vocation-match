import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Notice, Screen } from '../components/ui';
import { ProfileRing } from '../components/ProfileRing';
import { LinearGradient } from 'expo-linear-gradient';
import { apiErrorMessage, COPY, COPY_FOR, roomPlate } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, glass } from '../theme';

/** The owner's own 3D lobby render (2026-07-28), bundled — not a redrawing. */
const INBOX_HERO = require('../../assets/dark-inbox-chat.png');

/** Everything a sighted person sees in one row, in the order they see it. */
function inboxRowLabel(match: MatchSummary): string {
  const parts = [match.displayName];
  if (match.unmatchedAt !== null) {
    parts.push(COPY.inbox.closedLabel);
  }
  parts.push(match.lastMessageBody ?? COPY.inbox.sayHelloPreview);
  // D-057: one inbox holds all four sources, so each row says which one it
  // came from — the row is otherwise identical whether you met at a hotel,
  // a café or a concert.
  parts.push(roomPlate(match.room));
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
        <ProfileRing testID="inbox-profile-ring" />
      </View>
      {error ? (
        <Notice message={error} tone="error" testID="inbox-error" />
      ) : matches === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="inbox-loading" />
      ) : matches.length === 0 ? (
        /* The sheet's empty inbox (12:137): the line under the head, the
           lobby art in the 180 band, why it is empty in one sentence, and
           both ways to change that — top-anchored, not floated. */
        <View style={styles.empty} testID="inbox-empty">
          <Text style={styles.subtitle}>{COPY.inbox.subtitle}</Text>
          <Image
            source={INBOX_HERO}
            style={styles.emptyHero}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            {COPY.inbox.emptyTitle}
          </Text>
          <Text style={styles.emptyBody}>{COPY.inbox.emptyBody}</Text>
          <Button
            label={COPY.inbox.startDiscovering}
            onPress={() => tabNavigation.navigate('Discovery')}
            testID="inbox-start-discovering"
          />
          <Button
            label={COPY.inbox.viewRooms}
            variant="secondary"
            onPress={() => tabNavigation.navigate('Vacation')}
            testID="inbox-view-rooms"
          />
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
                  {/* Where the two of you met. Never a venue you were not at,
                      never a distance, never a ticket claim. */}
                  <Text
                    style={styles.rowSource}
                    numberOfLines={1}
                    testID={`inbox-source-${match.matchId}`}
                  >
                    {roomPlate(match.room)}
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
  /** The sheet's empty column (12:137): top-anchored, 12 between. */
  empty: { alignSelf: 'stretch', gap: 12 },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.inkMuted,
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: color.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.inkMuted,
    textAlign: 'center',
  },
  /** The lobby art in the sheet's 180 band (12:142). */
  emptyHero: {
    width: '100%',
    height: 180,
    borderRadius: 20,
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
  /** D-057: where the two of you met, under the preview. */
  rowSource: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.3,
    color: color.inkMuted,
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
