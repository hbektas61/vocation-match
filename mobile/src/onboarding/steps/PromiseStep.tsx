import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COPY } from '../../copy';
import { color, font, fontFamily, spacing } from '../../theme';
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
      <View style={styles.points}>
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
  points: { gap: spacing.md, marginTop: spacing.xs },
  point: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: color.ocean,
    marginTop: 8,
  },
  pointText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.45,
    color: color.ink,
  },
});
