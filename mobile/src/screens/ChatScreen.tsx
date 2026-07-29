import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { nowMs } from '../clock';
import { Body, Button, Notice, Screen } from '../components/ui';
import { apiErrorMessage, COPY, upperCase, roomPlate } from '../copy';
import { ApiError, getApi, type ChatMessage } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { color, font, fontFamily, radius, spacing, glass, gradient } from '../theme';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';

const DEEP = '#0F1B3D';

const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const DotsIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill={color.ink}>
    <Circle cx={5} cy={12} r={2} />
    <Circle cx={12} cy={12} r={2} />
    <Circle cx={19} cy={12} r={2} />
  </Svg>
);

const BuildingIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.inkMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={5} y={3} width={14} height={18} rx={2} />
    <Path d="M9 8h2m2 0h2M9 12h2m2 0h2M10 21v-4h4v4" />
  </Svg>
);

const SendIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 2L11 13" />
    <Path d="M22 2l-7 20-4-9-9-4z" />
  </Svg>
);

/** The reference's clock column: HH:MM under each bubble. */
function timeOf(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Bugün / Dün / a short date — the separators the thread groups under. */
function dayLabel(at: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at >= startOfToday) return COPY.chat.today;
  if (at >= startOfToday - 86_400_000) return COPY.inbox.yesterday;
  const d = new Date(at);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function ChatScreen({ navigation, route }: RootScreenProps<'Chat'>) {
  const { state, dispatch } = useAppStore();
  const { matchId } = route.params;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // True once a server lookup for a not-yet-cached match has finished,
  // whichever way it went — gates the "no longer available" fallback.
  const [checkedServer, setCheckedServer] = useState(false);

  const match = state.matches.find((m) => m.matchId === matchId) ?? null;
  const photoUrls = usePhotoUrls([match?.photoPath ?? null]);
  const selfId = state.session?.userId ?? null;

  /** Replaces the cached matches with the server's, whatever it says. */
  const refreshMatches = useCallback(async () => {
    try {
      const fetched = await getApi().getMatches();
      dispatch({ type: 'MATCHES_LOADED', matches: fetched });
    } catch {
      // Leaves the cache alone. A failed refresh is not evidence the match is
      // gone, and throwing someone out of a conversation on a dropped
      // connection would be worse than the stale copy.
    }
  }, [dispatch]);

  // The match may not be cached yet (e.g. a deep link straight into Chat).
  useEffect(() => {
    if (match) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await getApi().getMatches();
        if (!cancelled) dispatch({ type: 'MATCHES_LOADED', matches: fetched });
      } finally {
        if (!cancelled) setCheckedServer(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [match, matchId, dispatch]);

  // History, plus a live subscription for anything sent after it loads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const history = await getApi().getMessages(matchId);
        if (!cancelled) setMessages(history);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
        }
      }
    })();
    const unsubscribe = getApi().subscribeToMessages(matchId, (message) => {
      setMessages((prev) => {
        const base = prev ?? [];
        return base.some((m) => m.id === message.id) ? base : [...base, message];
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [matchId]);

  if (!match) {
    if (!checkedServer) {
      return (
        <Screen safeTop testID="screen-chat">
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="chat-match-loading" />
        </Screen>
      );
    }
    return (
      <Screen safeTop testID="screen-chat">
        <Notice message={COPY.chat.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const closed = match.unmatchedAt != null;
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  const theirPhoto = match.photoPath ? photoUrls[match.photoPath] ?? null : null;

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || closed) return;
    setSending(true);
    setSendError(null);
    try {
      await getApi().sendMessage(matchId, text);
      setDraft('');
    } catch (err) {
      // A match can disappear underneath an open conversation — the other
      // person deleting their account takes it and its messages with them —
      // and the cached copy makes the screen look alive either way. So the
      // server is asked, and whatever it says wins. Both codes refresh, and
      // the refresh decides: an unmatch still returns the match (closed
      // notice); a block or deletion does not ("no longer available") — and
      // nothing the blocked person sees tells them which one happened.
      if (err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN')) {
        await refreshMatches();
      }
      setSendError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSending(false);
    }
  };

  const unmatch = async () => {
    setMenuOpen(false);
    try {
      await getApi().unmatch(matchId);
      dispatch({ type: 'MATCH_UNMATCHED', matchId, unmatchedAt: nowMs() });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        await refreshMatches();
      }
      setSendError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    }
  };

  /** Consecutive messages grouped under their day's separator. */
  const grouped: { label: string; items: ChatMessage[] }[] = [];
  for (const message of messages ?? []) {
    const label = dayLabel(message.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(message);
    else grouped.push({ label, items: [message] });
  }

  return (
    <Screen safeTop testID="screen-chat" scroll={false}>
      {/* The reference's own header: two floating circles, then the person
          and the bond — who this is, and the room·hotel you know each other
          from. It does not scroll away with the messages. */}
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.common.back}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          testID="chat-back"
        >
          <BackIcon />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.chat.moreActions}
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((open) => !open)}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          testID="chat-menu"
        >
          <DotsIcon />
        </Pressable>
      </View>

      {menuOpen ? (
        /* Ending a conversation and reporting someone both live behind the
           dots — available, and neither the loudest thing on the screen. */
        <View style={styles.menu} testID="chat-menu-sheet">
          {!closed ? (
            <Button
              label={COPY.chat.unmatchButton}
              variant="secondary"
              compact
              onPress={unmatch}
              testID="chat-unmatch"
            />
          ) : null}
          <Button
            label={COPY.chat.reportBlockButton}
            variant="danger"
            compact
            onPress={() => {
              setMenuOpen(false);
              navigation.navigate('ReportBlock', {
                userId: match.otherUserId,
                displayName: match.displayName,
                matchId: match.matchId,
              });
            }}
            testID="chat-report-block"
          />
        </View>
      ) : null}

      <View style={styles.bondHeader}>
        {theirPhoto ? (
          <Image source={{ uri: theirPhoto }} style={styles.bondPhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.bondPhoto, styles.bondPhotoEmpty]}>
            <Text style={styles.bondInitial}>{upperCase(match.displayName.slice(0, 1))}</Text>
          </View>
        )}
        <View style={styles.bondText}>
          <View style={styles.bondNameRow}>
            <Text style={styles.bondName}>{`${match.displayName}, ${match.age}`}</Text>
            <View style={styles.roomChip} testID="chat-room">
              <View style={styles.roomChipDot} />
              <Text style={styles.roomChipText}>
                {upperCase(roomPlate(match.room))}
              </Text>
            </View>
          </View>
          {hotel ? (
            <View style={styles.bondHotelRow}>
              <BuildingIcon />
              <Text style={styles.bondHotelText} numberOfLines={1}>
                {`${hotel.name}, ${hotel.city}`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.headerRule} />

      <ScrollView contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {loadError ? <Notice message={loadError} tone="error" testID="chat-load-error" /> : null}
        {messages === null ? (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="chat-loading" />
        ) : messages.length === 0 ? (
          <Body>
            {COPY.chat.sayHelloTo} {match.displayName}!
          </Body>
        ) : (
          grouped.map((group) => (
            <View key={group.label} style={styles.dayGroup}>
              <Text style={styles.daySeparator}>{group.label}</Text>
              {group.items.map((message) => {
                const mine = message.senderId === selfId;
                return (
                  <View key={message.id} style={mine ? styles.rowMine : styles.rowTheirs}>
                    {!mine ? (
                      theirPhoto ? (
                        <Image source={{ uri: theirPhoto }} style={styles.miniAvatar} resizeMode="cover" accessibilityIgnoresInvertColors />
                      ) : (
                        <View style={[styles.miniAvatar, styles.miniAvatarEmpty]}>
                          <Text style={styles.miniInitial}>{upperCase(match.displayName.slice(0, 1))}</Text>
                        </View>
                      )
                    ) : null}
                    <View style={mine ? styles.bubbleColumnMine : styles.bubbleColumn}>
                      <View
                        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${mine ? COPY.chat.senderYou : match.displayName}: ${message.body}`}
                      >
                        {mine ? (
                          <LinearGradient
                            colors={[...gradient.primary]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                          />
                        ) : null}
                        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
                      </View>
                      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                        {timeOf(message.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        {closed ? <Notice message={COPY.chat.closedNotice} testID="chat-closed" /> : null}
        {sendError ? <Notice message={sendError} tone="error" testID="chat-send-error" /> : null}
      </ScrollView>

      {!closed ? (
        /* The reference's composer: the pill and the plane. */
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={`${COPY.chat.messageLabel} ${match.displayName}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={COPY.chat.messagePlaceholder}
            placeholderTextColor={color.inkMuted}
            editable={!sending}
            style={styles.composerInput}
            testID="chat-input"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.chat.sendButton}
            accessibilityState={{ disabled: !draft.trim() || sending }}
            disabled={!draft.trim() || sending}
            onPress={send}
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendButtonIdle,
              pressed && styles.pressed,
            ]}
            testID="chat-send"
          >
            <SendIcon />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pressed: { opacity: 0.8 },
  menu: {
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bondHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  bondPhoto: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: color.veil,
  },
  bondPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  bondInitial: { fontFamily: fontFamily.display, fontSize: 30, color: color.accentDeep },
  bondText: { flex: 1, gap: 4 },
  bondNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  bondName: { fontFamily: fontFamily.display, fontSize: font.heading + 2, color: color.ink },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.35)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  roomChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2.2,
    borderColor: DEEP,
  },
  roomChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 0.8,
    color: DEEP,
  },
  bondHotelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bondHotelText: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.inkMuted,
    flexShrink: 1,
  },
  headerRule: { height: 1, backgroundColor: color.rule },
  thread: { paddingVertical: spacing.md, gap: spacing.md, flexGrow: 1 },
  dayGroup: { gap: spacing.sm },
  daySeparator: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    color: color.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  rowTheirs: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end' },
  miniAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.veil },
  miniAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  miniInitial: { fontFamily: fontFamily.bodySemi, fontSize: 15, color: color.accentDeep },
  bubbleColumn: { maxWidth: '78%', gap: 4 },
  bubbleColumnMine: { maxWidth: '78%', gap: 4, alignItems: 'flex-end' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  /**
   * Theirs a touch lighter, mine a touch deeper — both from the brand
   * family, both carrying ink; the tucked corner says whose voice it is
   * without leaning on colour alone.
   */
  bubbleTheirs: {
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderBottomLeftRadius: 6,
  },
  bubbleMine: { backgroundColor: color.accent, borderBottomRightRadius: 6, overflow: 'hidden' },
  bubbleText: {
    color: color.ink,
    fontSize: font.body + 1,
    lineHeight: (font.body + 1) * 1.4,
    fontFamily: fontFamily.body,
  },
  bubbleTextMine: { color: '#1A1A2E' },
  bubbleTime: { fontFamily: fontFamily.body, fontSize: font.caption, color: color.inkMuted },
  bubbleTimeMineInk: { color: 'rgba(26, 26, 46, 0.7)' },
  bubbleTimeMine: { textAlign: 'right' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: color.background,
  },
  composerInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: glass.fill,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.45)',
    paddingHorizontal: spacing.md + 4,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: DEEP,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DEEP,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sendButtonIdle: { opacity: 0.45 },
});
