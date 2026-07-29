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
import Svg, { Circle, Path } from 'react-native-svg';

import { nowMs } from '../clock';
import { Body, Button, Notice, Screen } from '../components/ui';
import { apiErrorMessage, COPY, upperCase, roomPlate } from '../copy';
import { ApiError, getApi, type ChatMessage } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { color, font, fontFamily, radius, spacing, glass, gradient } from '../theme';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';

const BackIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

const DotsIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill={color.ink}>
    <Circle cx={5} cy={12} r={2} />
    <Circle cx={12} cy={12} r={2} />
    <Circle cx={19} cy={12} r={2} />
  </Svg>
);

/** On the warm disc, so it wears the dark ink the gradient can carry. */
const SendIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
      {/* The sheet's one header row (13:154): the way back, the person, the
          bond in one small line, and the dots. It does not scroll away. */}
      <View style={styles.headRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.common.back}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}
          testID="chat-back"
        >
          <BackIcon />
        </Pressable>
        {theirPhoto ? (
          <Image source={{ uri: theirPhoto }} style={styles.headAvatar} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.headAvatar, styles.headAvatarEmpty]}>
            <Text style={styles.headInitial}>{upperCase(match.displayName.slice(0, 1))}</Text>
          </View>
        )}
        <View style={styles.headWords}>
          <Text style={styles.headName} numberOfLines={1}>{`${match.displayName}, ${match.age}`}</Text>
          <Text style={styles.headBond} numberOfLines={1} testID="chat-room">
            {hotel ? `${roomPlate(match.room)} · ${hotel.name}` : roomPlate(match.room)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.chat.moreActions}
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((open) => !open)}
          style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}
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
              {/* A lone "today" would only say what the clock already says
                  (13:153 shows none); the label earns its line when the
                  thread spans more than one day. */}
              {grouped.length > 1 ? <Text style={styles.daySeparator}>{group.label}</Text> : null}
              {group.items.map((message) => {
                const mine = message.senderId === selfId;
                return (
                  /* The sheet's bubbles (13:163/13:167): glass for theirs,
                     the warm gradient for mine, the clock inside each. */
                  <View key={message.id} style={mine ? styles.rowMine : styles.rowTheirs}>
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
        /* The sheet's composer (13:174): one glass pill holding the words
           and the warm send disc together. */
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
            <LinearGradient
              colors={[...gradient.primary]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <SendIcon />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** The sheet's head row (13:154): 12 between everything, one line. */
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: spacing.sm,
  },
  /** The 40 glass squares (13:155/13:160) holding the back and the dots. */
  squareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4A2E5C',
  },
  headAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  headInitial: { fontFamily: fontFamily.display, fontSize: 20, color: color.accentDeep },
  headWords: { flex: 1, gap: 2 },
  headName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.ink,
  },
  headBond: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: color.inkMuted,
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
  thread: { paddingVertical: spacing.md, gap: 12, flexGrow: 1 },
  dayGroup: { gap: 12 },
  daySeparator: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    color: color.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  rowTheirs: { flexDirection: 'row' },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end' },
  /** The sheet's bubble (13:163): 18 corners, 14/10 inside, clock within. */
  bubble: {
    maxWidth: 260,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleTheirs: {
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
  },
  bubbleMine: { backgroundColor: color.accent, overflow: 'hidden' },
  bubbleText: {
    color: color.ink,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    fontFamily: fontFamily.body,
  },
  bubbleTextMine: { color: '#1A1A2E' },
  bubbleTime: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: 'rgba(163, 169, 201, 0.7)',
  },
  bubbleTimeMine: { color: 'rgba(26, 26, 46, 0.7)' },
  /** The sheet's composer pill (13:174): the words and the disc together. */
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.sm,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: radius.pill,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 10,
  },
  composerInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: color.ink,
    paddingVertical: 0,
  },
  /** The 40 warm disc (13:176), the gradient painted inside. */
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.accent,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonIdle: { opacity: 0.45 },
});
