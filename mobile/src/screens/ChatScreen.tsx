import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { nowMs } from '../clock';
import { Body, Button, Field, Notice, Screen } from '../components/ui';
import { getCandidateById, SELF_ID } from '../fixtures/candidates';
import type { RootScreenProps } from '../navigation/types';
import { color, radius, spacing } from '../theme';
import { useAppStore } from '../state/AppStore';

export function ChatScreen({ navigation, route }: RootScreenProps<'Chat'>) {
  const { state, dispatch } = useAppStore();
  const [draft, setDraft] = useState('');
  const match = state.matches.find((m) => m.id === route.params.matchId) ?? null;
  const otherUserId = match?.userIds.find((id) => id !== SELF_ID) ?? null;
  const other = otherUserId ? getCandidateById(otherUserId) : null;
  const messages = state.messages.filter((m) => m.matchId === route.params.matchId);

  if (!match || !otherUserId) {
    return (
      <Screen testID="screen-chat">
        <Notice message="This conversation is no longer available." />
        <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch({ type: 'SEND_MESSAGE', matchId: match.id, text, now: nowMs() });
    setDraft('');
  };

  return (
    <Screen testID="screen-chat">
      {messages.length === 0 ? (
        <Body>Say hello to {other?.displayName ?? 'your match'}!</Body>
      ) : (
        messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.bubble,
              message.senderId === SELF_ID ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
            accessibilityLabel={`${
              message.senderId === SELF_ID ? 'You' : other?.displayName ?? 'Match'
            }: ${message.text}`}
          >
            <Text
              style={message.senderId === SELF_ID ? styles.bubbleTextMine : styles.bubbleTextTheirs}
            >
              {message.text}
            </Text>
          </View>
        ))
      )}
      <Field
        label={`Message ${other?.displayName ?? 'your match'}`}
        value={draft}
        onChangeText={setDraft}
        placeholder="Type a message"
        testID="chat-input"
      />
      <Button label="Send" onPress={send} disabled={!draft.trim()} testID="chat-send" />
      <Button
        label="Unmatch"
        variant="secondary"
        onPress={() => {
          dispatch({ type: 'UNMATCH', matchId: match.id });
          navigation.goBack();
        }}
        testID="chat-unmatch"
      />
      <Button
        label="Report or block"
        variant="danger"
        onPress={() => navigation.navigate('ReportBlock', { userId: otherUserId, matchId: match.id })}
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
