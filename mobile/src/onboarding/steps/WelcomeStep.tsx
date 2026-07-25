import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Gap } from '../../components/ui';
import { COPY } from '../../copy';
import { useAppStore } from '../../state/AppStore';
import { color, font, fontFamily, spacing } from '../../theme';
import type { StepProps } from './types';

/**
 * The only screen with two ways out, because "I already have an account" is a
 * different journey rather than a step in this one. It carries no progress bar:
 * nothing has been asked yet, and a bar at zero is a promise of work.
 */
export function WelcomeStep({ go, patch }: StepProps) {
  const { dispatch } = useAppStore();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID="screen-welcome">
      {/* Sea into sand, faintly. The subject is a hotel by water. */}
      <View style={styles.wash} />
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.wordmark}>
          {COPY.appName}
        </Text>
        <Gap size="sm" />
        <Text accessibilityRole="header" style={styles.headline}>
          {COPY.onboarding.welcome.headline}
        </Text>
        <Text style={styles.body}>{COPY.onboarding.welcome.body}</Text>
      </View>
      <View style={styles.footer}>
        <Button
          label={COPY.onboarding.welcome.create}
          onPress={() => {
            dispatch({ type: 'CONFIRM_AGE' });
            patch({ returning: false });
            go('promise');
          }}
          testID="welcome-create-account"
        />
        <Button
          label={COPY.onboarding.welcome.signIn}
          variant="secondary"
          onPress={() => {
            dispatch({ type: 'CONFIRM_AGE' });
            patch({ returning: true });
            go('email');
          }}
          testID="welcome-sign-in"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: color.seaSoft,
    borderBottomLeftRadius: 120,
  },
  content: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    letterSpacing: 0.4,
    color: color.ocean,
  },
  headline: {
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
    marginTop: spacing.sm,
  },
  footer: { padding: spacing.md, gap: spacing.sm },
});
