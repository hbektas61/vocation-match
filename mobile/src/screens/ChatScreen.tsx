import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { nowMs } from '../clock';
import { Body, Button, Field, Notice, Screen } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type ChatMessage } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { color, radius, spacing } from '../theme';
import { useAppStore } from '../state/AppStore';

export function ChatScreen({ navigation, route }: RootScreenProps<'Chat'>) {
  const { state, dispatch } = useAppStore();
  const { matchId } = route.params;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // True once a server lookup for a not-yet-cached match has finished,
  // whichever way it went — gates the "no longer available" fallback.
  const [checkedServer, setCheckedServer] = useState(false);

  const match = state.matches.find((m) => m.matchId === matchId) ?? null;
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
  // Nothing to look up once it is already in the cache — `checkedServer`
  // is only ever read from the `!match` branch below.
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
        <Screen testID="screen-chat">
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="chat-match-loading" />
        </Screen>
      );
    }
    return (
      <Screen testID="screen-chat">
        <Notice message={COPY.chat.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const closed = match.unmatchedAt != null;

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
      // person deleting their account takes it and its messages with them — and
      // the cached copy makes the screen look alive either way. So the server
      // is asked, and whatever it says wins.
      //
      // Both codes are refreshed on, and the refresh is what decides, not the
      // code: an unmatch also answers FORBIDDEN, and `my_matches` still returns
      // that match, so the screen stays and shows the closed notice. A block
      // answers the same way and `my_matches` does not return it, so the screen
      // goes to "no longer available" — the same place a deleted account leads,
      // which is the point. Nothing the blocked person sees should tell them
      // which of the two happened.
      if (err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN')) {
        await refreshMatches();
      }
      setSendError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSending(false);
    }
  };

  const unmatch = async () => {
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

  return (
    <Screen testID="screen-chat">
      {loadError ? <Notice message={loadError} tone="error" testID="chat-load-error" /> : null}
      {messages === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="chat-loading" />
      ) : messages.length === 0 ? (
        <Body>
          {COPY.chat.sayHelloTo} {match?.displayName ?? 'your match'}!
        </Body>
      ) : (
        messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.bubble,
              message.senderId === selfId ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
            // Without `accessible`, a View is not a stop in the accessibility
            // tree: the reader drills into the Text and reads the body alone,
            // so a screen-reader user cannot tell who said what.
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${
              message.senderId === selfId ? COPY.chat.senderYou : match?.displayName ?? COPY.chat.senderMatch
            }: ${message.body}`}
          >
            <Text style={message.senderId === selfId ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {message.body}
            </Text>
          </View>
        ))
      )}

      {closed ? <Notice message={COPY.chat.closedNotice} testID="chat-closed" /> : null}
      {sendError ? <Notice message={sendError} tone="error" testID="chat-send-error" /> : null}

      {!closed ? (
        <>
          <Field
            label={`${COPY.chat.messageLabel} ${match?.displayName ?? 'your match'}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={COPY.chat.messagePlaceholder}
            editable={!sending}
            testID="chat-input"
          />
          <Button
            label={sending ? COPY.chat.sendingButton : COPY.chat.sendButton}
            busy={sending}
            onPress={send}
            disabled={!draft.trim() || sending}
            testID="chat-send"
          />
          <Button
            label={COPY.chat.unmatchButton}
            variant="secondary"
            onPress={unmatch}
            testID="chat-unmatch"
          />
        </>
      ) : null}
      <Button
        label={COPY.chat.reportBlockButton}
        variant="danger"
        onPress={() =>
          navigation.navigate('ReportBlock', {
            userId: match.otherUserId,
            displayName: match.displayName,
            matchId: match.matchId,
          })
        }
        testID="chat-report-block"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: color.accent },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: color.surface },
  bubbleTextMine: { color: color.onAccent, fontSize: 16 },
  bubbleTextTheirs: { color: color.textPrimary, fontSize: 16 },
});
