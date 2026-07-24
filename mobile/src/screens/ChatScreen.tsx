import React, { useEffect, useState } from 'react';
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
            accessibilityLabel={`${
              message.senderId === selfId ? 'You' : match?.displayName ?? 'Match'
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
