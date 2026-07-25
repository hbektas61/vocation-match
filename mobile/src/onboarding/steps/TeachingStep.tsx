import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, useScreenChangeAnnouncement } from '../../components/ui';
import { COPY } from '../../copy';
import { useAppStore } from '../../state/AppStore';
import { color, font, fontFamily, spacing } from '../../theme';
import { OnboardingProgress } from '../OnboardingScaffold';
import { HereNowFigure, MatchingFigure, UpcomingFigure } from '../TeachingFigures';
import type { StepProps } from './types';

/**
 * Three cards, full bleed, at the end — because the two rooms are the part of
 * this product nobody arrives already understanding, and the moment to say so
 * is when somebody is about to use them rather than eleven screens earlier.
 *
 * Each card is one idea, and the figure above it is that idea rather than an
 * ornament: the badge as it really appears, the single proximity check, two
 * cards meeting. There is no photography for this product yet, and inventing
 * some would be the one dishonest thing on an otherwise plain screen.
 */
const CARDS = [
  { key: 'upcoming', Figure: UpcomingFigure, ...COPY.onboarding.teaching.upcoming },
  { key: 'hereNow', Figure: HereNowFigure, ...COPY.onboarding.teaching.hereNow },
  { key: 'matching', Figure: MatchingFigure, ...COPY.onboarding.teaching.matching },
] as const;

export function TeachingStep(_props: StepProps) {
  const { dispatch } = useAppStore();
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const last = index === CARDS.length - 1;

  // A card replaces the one before it in place, so nothing moves the cursor
  // and the next idea would otherwise arrive silently.
  useScreenChangeAnnouncement(
    `${COPY.onboarding.progressLabel(index + 1, CARDS.length)}. ${card.title}. ${card.body}`,
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID="screen-onboarding-teaching">
      <OnboardingProgress step={index + 1} total={CARDS.length} />
      <View style={styles.art} testID={`teach-art-${card.key}`}>
        <card.Figure />
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {card.title}
        </Text>
        <Text style={styles.body}>{card.body}</Text>
      </View>
      <View style={styles.footer}>
        <Button
          label={last ? COPY.onboarding.teaching.start : COPY.onboarding.teaching.next}
          onPress={() =>
            last ? dispatch({ type: 'ONBOARDING_FINISHED' }) : setIndex(index + 1)
          }
          testID={last ? 'teaching-start' : 'teaching-next'}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  art: { flex: 1, margin: spacing.md, alignItems: 'center', justifyContent: 'center' },
  copy: { paddingHorizontal: spacing.md, gap: spacing.sm },
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    lineHeight: font.display * 1.15,
    color: color.ink,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.45,
    color: color.inkMuted,
  },
  footer: { padding: spacing.md },
});
