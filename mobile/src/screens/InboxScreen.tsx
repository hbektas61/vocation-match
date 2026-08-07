import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  Avatar,
  Button,
  EmptyState,
  Notice,
  Screen,
  ScreenHeader,
  SectionLabel,
  SkeletonRows,
} from '../components/ui';
import { EmptyInbox } from '../components/InboxIllustrations';
import { apiErrorMessage, COPY, COPY_FOR, roomPlate } from '../copy';
import { ApiError, getApi, type MatchSummary } from '../data';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, leading, radius, spacing, tracking } from '../theme';

/** The owner's own 3D lobby render (2026-07-28), bundled — not a redrawing. */

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
  if (match.unreadCount > 0) {
    parts.push(COPY_FOR.unreadMessages(match.unreadCount));
  }
  parts.push(COPY.inbox.openChatHint);
  return parts.join('. ');
}

export function InboxScreen() {
  const { dispatch } = useAppStore();
  // The drawing is sized off the window rather than fixed, so it cannot be
  // the thing that puts a scrollbar on a narrow phone: 40 of screen padding
  // and 56 of breathing room are taken out before it gets its width.
  const { width: windowWidth } = useWindowDimensions();
  const artWidth = Math.min(236, windowWidth - 96);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoPaths = useMemo(() => (matches ?? []).map((m) => m.photoPath), [matches]);
  const photoUrls = usePhotoUrls(photoPaths);

  /**
   * When the list is re-read, and deliberately not more often than that.
   *
   * Two moments here, both the same focus event: opening the tab, and coming
   * back to it from a conversation. The third — returning to the foreground —
   * is handled once for the whole app in `useForegroundMatches`, because a
   * listener that only exists while the inbox is focused cannot refresh a
   * badge for somebody who backgrounded the app on the discovery deck.
   *
   * No interval and no per-render fetch: unread is not urgent enough to poll
   * for, and a badge that costs a request every render costs battery all day.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      const load = async () => {
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
      };
      void load();
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

  const isEmpty = matches !== null && matches.length === 0;

  return (
    // `fill` only when there is nothing to list: an empty inbox is one
    // composition and should sit in the middle of the room it has, rather
    // than hanging off the head with the rest of the screen blank beneath it.
    <Screen safeTop fill={isEmpty} testID="screen-inbox">
      {/* 176:3773: the head draws the title again (D-065), with the line that
          used to stand under it only on the empty state now carried as the
          head's own subtitle, on every state. */}
      {/* 176:3771 is the one tab head in the contract with no venue chip on
          it, and it is the right one to leave off: the inbox is the only tab
          that is not scoped to the active venue — matches from a past venue,
          an event and Çevremde all land in the same list. */}
      <ScreenHeader
        title={COPY.inbox.title}
        venue={false}
        ringTestID="inbox-profile-ring"
      />
      {error ? (
        <Notice message={error} tone="error" testID="inbox-error" />
      ) : matches === null ? (
        <SkeletonRows testID="inbox-loading" />
      ) : isEmpty ? (
        /*
         * The sheet's empty inbox (12:137): the line under the head, the
         * lobby art in the 180 band, why it is empty in one sentence, and
         * both ways to change that — top-anchored, not floated.
         *
         * The title is real content, not decoration, so it stays outside the
         * shared `<EmptyState>` — that primitive's API is one message and one
         * action and has no room for it. The explanation and the two ways
         * forward are what it was built for.
         *
         * D-058 dropped the hero raster rather than repainting it — a violet
         * night-theme bitmap read as a hole on the cream ground, and a colour
         * sweep cannot see a bitmap. R-009 put a drawing back in its place,
         * this time in the theme's own tokens (`EmptyInbox`), which also
         * closes the ~370pt of dead space the bare card left below it.
         *
         * The art is hidden from assistive technology: it repeats the
         * sentence under it and nothing more, so announcing it would only
         * put noise between the heading and the two ways forward.
         */
        <View style={styles.empty} testID="inbox-empty">
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            {COPY.inbox.emptyTitle}
          </Text>
          <View
            style={styles.emptyArt}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="inbox-empty-art"
          >
            <EmptyInbox width={artWidth} />
          </View>
          <EmptyState
            message={COPY.inbox.emptyBody}
            /* The drawing above is this card's mark; the generic disc would
               be a second one saying the same nothing. */
            mark={false}
            action={
              <View style={styles.emptyActions}>
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
            }
          />
        </View>
      ) : (
        <>
          {fresh.length > 0 ? (
            /* 176:3788: the strip keeps its ringed faces and gains the heading
               the design puts over it — the two groups below are different
               kinds of thing and the screen never said so. */
            <>
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
                    {/* A fresh match's collar is a solid coral mark rather
                        than a gradient — D-058 keeps the sunset gradient out
                        of anything that is not the match moment itself. */}
                    <View style={styles.freshRing}>
                      <Avatar
                        url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                        name={match.displayName}
                        size="md"
                        testID={`inbox-photo-${match.matchId}`}
                      />
                    </View>
                    <Text style={styles.freshName}>{firstName(match.displayName)}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            </>
          ) : null}

          {talking.length > 0 ? <SectionLabel>{COPY.inbox.chats}</SectionLabel> : null}

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
              {/* 176:3812: the 56 face, and beside it a column ruled off from
                  the next row by a hairline — the white card with its own lift
                  is gone, because a list of them was a stack of objects where
                  the design has one list. */}
              <View
                style={[styles.chatRow, match.unmatchedAt !== null && styles.rowClosed]}
              >
                <RowFace
                  url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                  name={match.displayName}
                  testID={`inbox-photo-${match.matchId}`}
                />
                <View style={styles.rowText}>
                  {/* 176:3816: the name and the clock share the top line. */}
                  <View style={styles.rowTopLine}>
                    <Text style={styles.rowName} numberOfLines={1}>{match.displayName}</Text>
                    {match.lastMessageAt !== null ? (
                      <Text style={styles.rowWhen}>{formatWhen(match.lastMessageAt)}</Text>
                    ) : null}
                  </View>
                  {match.unmatchedAt !== null ? (
                    <Text style={styles.rowPreview}>{COPY.inbox.closedLabel}</Text>
                  ) : null}
                  {/* 176:3822: an unread preview is drawn in the brand. The
                      design's coral is 2.99:1 on white; a coral word takes the
                      darker sibling `accentDeep` (6.5:1), per D-058. */}
                  <Text
                    style={[styles.rowPreview, match.unreadCount > 0 && styles.rowPreviewUnread]}
                    numberOfLines={1}
                  >
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
                <View style={styles.rowRight}>
                  {match.unreadCount > 0 ? (
                    /* Here the number is worth showing: the row has the space,
                       and "three waiting" is different from "one". The count is
                       already in the row's accessible name, so this is hidden
                       rather than read out twice. */
                    <View
                      style={styles.unreadPill}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      testID={`inbox-unread-${match.matchId}`}
                    >
                      <Text style={styles.unreadPillText}>{match.unreadCount}</Text>
                    </View>
                  ) : null}
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
 * The row's face. 176:3813 draws it at 56 — the same size the shared `Avatar`
 * calls `md` — where the previous sheet (12:184) had it at 46. It stays its
 * own component rather than becoming `Avatar` because it falls back to the
 * initial on a *failed load*, which `Avatar` does not do.
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
  /**
   * The sheet's empty column (12:137), 12 between.
   *
   * It takes the room left under the head and centres itself in it, so the
   * heading, the drawing and the card read as one block instead of three
   * things pushed against the title with the screen empty below them.
   */
  empty: { alignSelf: 'stretch', flex: 1, justifyContent: 'center', gap: spacing.snug },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    letterSpacing: tracking.display,
    color: color.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },
  /** R-009's drawing, centred, with air above and below it so the heading
      and the card each keep their own space. */
  emptyArt: { alignItems: 'center', paddingVertical: spacing.sm },
  /** The two ways forward, full width inside the centred `<EmptyState>` card. */
  emptyActions: { alignSelf: 'stretch', gap: spacing.sm },
  /** The new-match strip (12:170): 14 between faces, 6 under each. */
  freshRow: { flexDirection: 'row', gap: spacing.md },
  freshItem: { alignItems: 'center', gap: spacing.cozy },
  /**
   * 176:3793: the 64 collar is a 2pt coral *ring* with air inside it, not a
   * solid coral disc — the face reads as circled rather than as mounted.
   */
  freshRing: {
    padding: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.accent,
  },
  freshName: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    color: color.ink,
  },
  /**
   * 176:3812: a row on the ground, ruled off from the next one. The white
   * card with its own lift is gone; `rule` is the divider token D-060 leaves
   * for exactly this, and the hairline hangs off the words rather than the
   * face, so the faces read as one column.
   */
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  /** Readable, dimmed: a closed conversation is history, not a mistake. */
  rowClosed: { opacity: 0.55 },
  rowText: {
    flex: 1,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
    paddingBottom: spacing.md,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontSize: font.body,
    color: color.ink,
  },
  /** D-057: where the two of you met, under the preview. */
  rowSource: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    letterSpacing: tracking.none,
    color: color.inkMuted,
  },
  rowPreview: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    color: color.inkMuted,
  },
  rowPreviewUnread: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  /** The count, in the brand fill with navy on it — the same pairing every
      other coral surface uses. */
  unreadPill: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.cozy,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadPillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    color: color.onAccent,
  },
  rowWhen: {
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.inkMuted,
  },
  rowFace: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.veil,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFaceImage: { width: 56, height: 56 },
  rowFaceInitial: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.inkMuted,
  },
});
