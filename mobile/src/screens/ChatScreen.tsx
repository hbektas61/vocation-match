import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';

import { nowMs } from '../clock';
import { Body, Button, Loading, Notice, Screen, SkeletonRows } from '../components/ui';
import { useToast } from '../components/ToastHost';
import { apiErrorMessage, COPY, upperCase, roomPlate } from '../copy';
import { ApiError, getApi, type ChatMessage } from '../data';
import type { RootScreenProps } from '../navigation/types';
import {
  color,
  elevation,
  font,
  fontFamily,
  leading,
  MIN_TOUCH,
  radius,
  spacing,
  tracking,
} from '../theme';
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

// On the coral disc, so it wears the navy the fill can carry (`onAccent`) —
// the same rule that keeps every coral fill off white text.
const SendIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.onAccent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

/**
 * A name for one composed message. Not a crypto key — it only has to be
 * unlikely to repeat within one conversation.
 */
function newToken(): string {
  const rand = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${rand()}-${rand().slice(0, 4)}-4${rand().slice(0, 3)}-a${rand().slice(0, 3)}-${rand()}${rand().slice(0, 4)}`;
}

export function ChatScreen({ navigation, route }: RootScreenProps<'Chat'>) {
  const { state, dispatch } = useAppStore();
  const { matchId } = route.params;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** The synchronous half of `sending`; see `send` below. */
  const sendingRef = useRef(false);
  /**
   * Names the message currently in the composer.
   *
   * `sendingRef` closes the double-tap window inside one frame, but it cannot
   * help with the case that actually loses data: the send reached the server
   * and the *response* did not. From here that is indistinguishable from a
   * failure, so the retry has to be safe rather than merely discouraged — and
   * it is safe because it carries this same token, which the server keys on.
   * A new token is minted only once a send has genuinely landed.
   */
  const draftToken = useRef<string>(newToken());
  /** Unmatching asks first, the way blocking and leaving an event room do. */
  const [unmatching, setUnmatching] = useState(false);
  /** A send's refusal is news about that send, not page content. */
  const toast = useToast();
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
  /**
   * Loading the conversation, and marking it read only while it is genuinely
   * being looked at.
   *
   * Mounted is not the same as visible. A pushed screen stays mounted
   * underneath whatever is opened on top of it, and a backgrounded app keeps
   * its whole tree — so marking read on arrival meant a message that landed
   * while the phone was in a pocket, or while the report screen was over this
   * one, was silently counted as seen. Unread is a claim about what somebody
   * has actually had a chance to read.
   *
   * `useIsFocused` answers the first question and `AppState` the second, and
   * both have to be true.
   */
  const focused = useIsFocused();
  // `!== 'background' && !== 'inactive'` rather than `=== 'active'`: the
  // initial value is undefined until the platform reports one, and treating
  // "not yet known" as backgrounded would leave a conversation that is plainly
  // on screen marked unread. The states that must block a read are the two
  // that actually mean nobody can see it.
  const [appActive, setAppActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppActive(next !== 'background' && next !== 'inactive');
    });
    return () => subscription.remove();
  }, []);

  const visible = focused && appActive;

  const markRead = useCallback(async () => {
    try {
      await getApi().markMatchRead(matchId);
      dispatch({ type: 'MATCH_READ', matchId });
    } catch {
      // Left unread on purpose. The next time this screen is genuinely
      // visible it will try again; pretending it worked would not.
    }
  }, [matchId, dispatch]);

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

  /**
   * The read itself, driven by visibility rather than by arrival.
   *
   * Runs when the screen becomes visible, and again whenever the messages it
   * is showing change while it stays visible — which covers both "opened it"
   * and "a message arrived while I was reading". Coming back to the
   * foreground re-reads the conversation first, so what gets marked is what is
   * actually on screen rather than what was there when the app was put down.
   */
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const history = await getApi().getMessages(matchId);
        if (cancelled) return;
        setMessages(history);
      } catch {
        // A failed refresh is not a reason to skip the mark: what is already
        // on screen has still been seen.
      }
      if (!cancelled) await markRead();
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, matchId, markRead, messages?.length]);

  if (!match) {
    if (!checkedServer) {
      return (
        <Screen safeTop tone="sheet" testID="screen-chat">
          <Loading testID="chat-match-loading" />
        </Screen>
      );
    }
    return (
      <Screen safeTop tone="sheet" testID="screen-chat">
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
    // `sending` is React state, so it is not true yet for a second press that
    // arrives in the same tick as the first: three taps inside one frame sent
    // three copies of the same message to the other person. Measured on the
    // running app — a human double-tap (180ms apart) was always fine, so this
    // only bites on a stalled frame, which is exactly when somebody taps
    // again. The ref closes the window synchronously; `sending` still drives
    // what the screen shows.
    if (!text || sending || sendingRef.current || closed) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await getApi().sendMessage(matchId, text, draftToken.current);
      setDraft('');
      // Landed: the next thing typed is a different message.
      draftToken.current = newToken();
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
      toast.error(
        err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        'chat-send-error',
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const unmatch = async () => {
    setUnmatching(false);
    setMenuOpen(false);
    try {
      await getApi().unmatch(matchId);
      dispatch({ type: 'MATCH_UNMATCHED', matchId, unmatchedAt: nowMs() });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        await refreshMatches();
      }
      toast.error(
        err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        'chat-send-error',
      );
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
    <Screen safeTop tone="sheet" testID="screen-chat" scroll={false}>
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
          {/* D-057: where the two of you met. The venue is appended only for
              the two hotel rooms — an event or a check-in match wearing the
              *currently active* hotel's name was naming a place neither of
              you had been together.

              176:4007 sets this line uppercase and tracked, which it now is.
              It does not take the file's green: green is this app's live
              mark, and the room a match *came from* is history rather than a
              claim about where anybody is standing now. */}
          <Text style={styles.headBond} numberOfLines={1} testID="chat-room">
            {upperCase(
              hotel && (match.room === 'UPCOMING' || match.room === 'HERE_NOW')
                ? `${roomPlate(match.room)} · ${hotel.name}`
                : roomPlate(match.room),
            )}
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
            unmatching ? (
              /*
                Unmatching closes the conversation for both people and there is
                no way back from this screen. Blocking asks first, leaving an
                event room asks first, switching a vacation place asks first —
                this was the one that fired on the first press, from a menu item
                sitting directly above "Report or block". Same in-place
                confirmation the event room uses, rather than a system dialog.
              */
              <>
                <Text style={styles.menuQuestion}>{COPY.chat.unmatchConfirm}</Text>
                <Text style={styles.menuBody}>{COPY.chat.unmatchBody}</Text>
                <Button
                  label={COPY.chat.unmatchYes}
                  variant="danger"
                  compact
                  onPress={unmatch}
                  testID="chat-unmatch-confirm"
                />
                <Button
                  label={COPY.common.cancel}
                  variant="secondary"
                  compact
                  onPress={() => setUnmatching(false)}
                  testID="chat-unmatch-cancel"
                />
              </>
            ) : (
              <Button
                label={COPY.chat.unmatchButton}
                variant="secondary"
                compact
                onPress={() => setUnmatching(true)}
                testID="chat-unmatch"
              />
            )
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
          <SkeletonRows rows={4} avatar={false} testID="chat-loading" />
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
              {grouped.length > 1 ? (
                /* 176:3960: the day rides in a small grey pill rather than
                   floating as a bare centred line. */
                <View style={styles.dayRow}>
                  <Text style={styles.daySeparator}>{upperCase(group.label)}</Text>
                </View>
              ) : null}
              {group.items.map((message) => {
                const mine = message.senderId === selfId;
                return (
                  /*
                   * 176:3965/176:3968. The file gives each bubble a tail — the
                   * one corner nearest its author squared off — and lifts the
                   * received bubble onto white with a shadow instead of a grey
                   * fill. Both are here.
                   *
                   * What is not here is the file's coral fill under white
                   * message text. A bubble is prose, and the brand coral
                   * carries white at 2.99:1; D-058's rule that only navy reads
                   * on a coral fill is not suspended by a drawing. Mine
                   * stays the pale `accentSoft` wash with `color.ink` on it,
                   * which keeps the two voices as far apart as the drawing
                   * does — one white and floating, one coral and flat — while
                   * both remain readable.
                   */
                  <View key={message.id} style={mine ? styles.rowMine : styles.rowTheirs}>
                    {!mine ? (
                      /* 176:3964: the sender's face at the foot of the bubble.
                         Decorative — the bubble already says who spoke. */
                      theirPhoto ? (
                        <Image
                          source={{ uri: theirPhoto }}
                          style={styles.bubbleAvatar}
                          resizeMode="cover"
                          accessibilityIgnoresInvertColors
                          accessibilityElementsHidden
                          importantForAccessibility="no"
                        />
                      ) : (
                        <View style={[styles.bubbleAvatar, styles.bubbleAvatarEmpty]} />
                      )
                    ) : null}
                    <View
                      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${mine ? COPY.chat.senderYou : match.displayName}: ${message.body}`}
                    >
                      <Text style={styles.bubbleText}>{message.body}</Text>
                      <Text style={styles.bubbleTime}>{timeOf(message.createdAt)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        {closed ? <Notice message={COPY.chat.closedNotice} testID="chat-closed" /> : null}
      </ScrollView>

      {!closed ? (
        /*
          176:3979: the coral disc steps out of the field and stands beside it,
          and the field itself becomes a filled track on a hairline-topped
          footer.

          The field keeps a border the file does not draw. The drawing's grey
          fill sits about 1.1:1 against the white under it, which does not meet
          WCAG 1.4.11's 3:1 for the boundary of a control — that field is
          identifiable only because a drawing has nothing else on the page.

          The file's two extra controls are absent: a "+" attachment disc and a
          camera inside the field. Messages in this product are text; there is
          no attachment path to open, and a button that opens nothing is worse
          than an honest gap.
        */
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={`${COPY.chat.messageLabel} ${match.displayName}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={COPY.chat.messagePlaceholder}
            placeholderTextColor={color.inkFaint}
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

/** 176:4001 — the face in the head row. */
const HEAD_AVATAR = 40;
/** 176:3964 — the smaller face beside a received bubble. */
const BUBBLE_AVATAR = 24;

const styles = StyleSheet.create({
  menuQuestion: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  menuBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /**
   * The head row (176:3995): 12 between everything, one line, and — new here —
   * a hairline under it, so the thread scrolls beneath a fixed edge rather
   * than up against nothing.
   */
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    paddingBottom: spacing.snug,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
  },
  /**
   * The discs holding the back and the dots. Drawn at 40 in D-057's Figma;
   * the D-058 device sweep measured them as the one control in the app under
   * the 44 minimum, so they are 44 — the rule is a floor, not a preference.
   */
  squareButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: color.veil,
    borderWidth: 1,
    borderColor: color.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 176:4001 — the face in the head, at the drawing's 40. */
  headAvatar: {
    width: HEAD_AVATAR,
    height: HEAD_AVATAR,
    borderRadius: radius.pill,
    backgroundColor: color.veil,
  },
  headAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  headInitial: { fontFamily: fontFamily.display, fontSize: font.heading, color: color.accentDeep },
  headWords: { flex: 1, gap: spacing.tight },
  headName: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.body,
    color: color.ink,
  },
  /** 176:4007: the bond as tracked structure rather than as a sentence. */
  headBond: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.accentDeep,
  },
  pressed: { opacity: 0.8 },
  menu: {
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...elevation.raised,
  },
  thread: { paddingVertical: spacing.md, gap: spacing.snug, flexGrow: 1 },
  dayGroup: { gap: spacing.snug },
  /** 176:3959: the pill is centred; the row is what centres it. */
  dayRow: { alignItems: 'center', marginBottom: spacing.xs },
  daySeparator: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkMuted,
    backgroundColor: color.veil,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.xs,
  },
  /** 176:3962: the face sits at the foot of the bubble, so the row bottoms out. */
  rowTheirs: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end' },
  /** 176:3964 — the small face beside a received bubble. */
  bubbleAvatar: {
    width: BUBBLE_AVATAR,
    height: BUBBLE_AVATAR,
    borderRadius: radius.pill,
    backgroundColor: color.veil,
  },
  bubbleAvatarEmpty: { borderWidth: 1, borderColor: color.rule },
  /**
   * 176:3965: 20pt corners, 16/12 inside — with the corner nearest the author
   * squared off, which is the tail the drawing gives each side.
   */
  bubble: {
    maxWidth: 260,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
    gap: spacing.xs,
  },
  /**
   * 176:3965: white and lifted rather than filled — which is also what gives
   * the two voices a difference that survives being read in greyscale.
   */
  bubbleTheirs: {
    backgroundColor: color.surface,
    borderBottomLeftRadius: 0,
    ...elevation.card,
  },
  /**
   * The own bubble, D-058: a pale coral wash rather than a coral fill — the
   * fill cannot carry the reading text a bubble is full of at 4.5:1, only
   * `color.ink` can, and this is the "selected/highlighted surface" job
   * `accentSoft` is for.
   */
  bubbleMine: { backgroundColor: color.accentSoft, borderBottomRightRadius: 0 },
  bubbleText: {
    color: color.ink,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    fontFamily: fontFamily.body,
  },
  bubbleTime: {
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.inkMuted,
  },
  /** 176:3979: the footer row — a hairline, the field, and the disc beside it. */
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    paddingTop: spacing.snug,
    borderTopWidth: 1,
    borderTopColor: color.rule,
  },
  /** 176:3983: the words sit in their own filled pill now, not in the disc's. */
  composerInput: {
    flex: 1,
    minHeight: MIN_TOUCH,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
    backgroundColor: color.veil,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
  },
  /** The coral send disc (176:3991): a flat fill, never a gradient. */
  sendButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonIdle: { opacity: 0.45 },
});
