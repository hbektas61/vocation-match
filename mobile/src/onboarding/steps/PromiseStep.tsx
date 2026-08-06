import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COPY } from '../../copy';
import { color, font, fontFamily, leading, radius, spacing } from '../../theme';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

/**
 * The 18+ rule and what the room is expected to be like, in one place.
 *
 * The age rule itself is not enforced here — the database trigger is the
 * enforcement point and refuses an underage birthdate whatever this screen
 * says. This is the part where somebody agrees to it.
 */
export function PromiseStep({ step, total, go, onBack }: StepProps) {
  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.promise.headline}
      body={COPY.onboarding.promise.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.promise.accept}
      actionEnabled
      onAction={() => go('phone')}
      testID="screen-onboarding-promise"
    >
      {/* The sheet's rules card (8:91): a white card at 20, the coral point
          before each promise, every word in ink at 13. */}
      <View style={styles.rulesCard}>
        {COPY.onboarding.promise.points.map((point) => (
          <View key={point} style={styles.point}>
            <View style={styles.dot} />
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rulesCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.snug,
  },
  point: { flexDirection: 'row', gap: spacing.snug, alignItems: 'flex-start' },
  /** The brand coral, not its dark sibling: a dot carries no text (owner). */
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    marginTop: spacing.cozy,
  },
  pointText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.ink,
  },
});
