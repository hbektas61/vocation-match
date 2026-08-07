import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COPY } from '../../copy';
import { color, font, fontFamily, leading, radius, spacing } from '../../theme';
import { OnboardingScaffold } from '../OnboardingScaffold';
import { pledgeIcon } from '../stepIcons';
import type { StepProps } from './types';

/**
 * The 18+ rule and what the room is expected to be like, in one place.
 *
 * The age rule itself is not enforced here — the database trigger is the
 * enforcement point and refuses an underage birthdate whatever this screen
 * says. This is the part where somebody agrees to it.
 */

/**
 * One tint per rule (180:6103/6112/6122/6131).
 *
 * The contract picks four hues from outside this product's palette (peach,
 * pink, blue, red). D-058 locked the palette and D-065 is a layout adoption,
 * not a repaint — so the four tiles take the four soft fills the theme
 * actually owns. They stay four *different* fills, which is the whole job the
 * contract's colours were doing: telling one rule from the next at a glance.
 */
const TILES = [
  { fill: color.accentSoft, mark: color.accentDeep },
  { fill: color.premiumSoft, mark: color.premium },
  { fill: color.successSoft, mark: color.success },
  { fill: color.infoSoft, mark: color.inkMuted },
];

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
      {/* The rules list (180:6101): no card around them any more — each rule is
          its own row, a tinted tile beside the sentence, on the open page.
          The contract splits every rule into a bold title and a muted line
          under it; ours are single sentences that do not split without being
          rewritten, and D-065 adopts layouts rather than reopening copy. */}
      <View style={styles.list}>
        {COPY.onboarding.promise.points.map((point, index) => {
          const tile = TILES[index % TILES.length];
          return (
            <View key={point} style={styles.point}>
              <View
                style={[styles.tile, { backgroundColor: tile.fill }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {pledgeIcon(index, tile.mark)}
              </View>
              <Text style={styles.pointText}>{point}</Text>
            </View>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  point: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  /** 48 square, softly cornered — the contract's rounded tile, not a disc. */
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    paddingTop: spacing.cozy,
  },
});
