/**
 * What a proximity check answers with when the answer is "no".
 *
 * A refusal used to be one red banner and nothing else: the sentence said why,
 * and then the screen left you looking at the same button that had just
 * failed. The two location refusals are the ones worth a whole result — they
 * are recoverable, and they are recoverable in *different* ways, which a
 * shared "try again" cannot say.
 *
 * So: the state as a heading, the banner, then a card that says what actually
 * happened, and two named ways on — the one that retries, and the one that
 * goes where the person can still get somewhere without moving.
 *
 * The privacy line D-005 draws is the reason this component takes no numbers.
 * There is no distance prop, no coordinate prop, no radius prop, and nothing
 * here interpolates one: "not at the place" is the entire fact the server
 * returns, and the screen must not be able to say more than the server knows.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Notice } from './ui';
import { COPY } from '../copy';
import { color, fontFamily, spacing } from '../theme';

export function PresenceResult({
  title,
  message,
  explanation,
  onRetry,
  retryBusy = false,
  wayOutLabel,
  onWayOut,
  testID,
}: {
  /** The state, in the person's own terms. Never an enum name. */
  title: string;
  /** The banner's sentence — the same one the room's reason gives. */
  message: string;
  /** What happened, and what would make the next attempt different. */
  explanation: string;
  onRetry: () => void;
  retryBusy?: boolean;
  /** Where somebody can still go from here, named for where it goes. */
  wayOutLabel: string;
  onWayOut: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.result} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {/* `tone="error"` announces itself, which is what makes this audible on
          iOS as well as Android — a refusal a blind user cannot hear is a
          screen that did nothing. */}
      <Notice message={message} tone="error" testID={testID ? `${testID}-notice` : undefined} />
      <Card tone="flat">
        <Text style={styles.whatLabel}>{COPY.hereNow.whatHappened}</Text>
        <Body>{explanation}</Body>
      </Card>
      <Button
        label={retryBusy ? COPY.hereNow.checking : COPY.hereNow.retry}
        busy={retryBusy}
        onPress={onRetry}
        testID={testID ? `${testID}-retry` : undefined}
      />
      <Button
        label={wayOutLabel}
        variant="secondary"
        onPress={onWayOut}
        testID={testID ? `${testID}-way-out` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  result: { gap: spacing.sm },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 22 * 1.25,
    color: color.ink,
  },
  whatLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13,
    color: color.ink,
  },
});
