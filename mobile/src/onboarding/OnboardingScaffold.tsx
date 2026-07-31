/**
 * The shape every onboarding step has, so no step invents its own.
 *
 * One question per screen, the question set large and left-aligned at the top,
 * a hairline of progress above it, and the only way forward pinned to the
 * bottom where a thumb already is. A step supplies a headline, a body, and a
 * control; it never supplies a layout.
 *
 * Two things here are not decoration:
 *
 * - The action stays *visible* when it cannot be used, rather than vanishing.
 *   A button that disappears leaves someone looking for what they did wrong; a
 *   button that is plainly there and plainly inactive says "the form, not you".
 * - It sits above the keyboard. `KeyboardAvoidingView` costs nothing here and
 *   is the difference between a form that works one-handed and one where the
 *   thing you need is under the keys.
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice, useScreenChangeAnnouncement } from '../components/ui';
import { COPY } from '../copy';
import { color, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

export function OnboardingProgress({ step, total }: { step: number; total: number }) {
  const ratio = Math.max(0, Math.min(1, total > 0 ? step / total : 0));
  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: step }}
      accessibilityLabel={COPY.onboarding.progressLabel(step, total)}
      testID="onboarding-progress"
    >
      <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

export function OnboardingScaffold({
  step,
  total,
  headline,
  body,
  children,
  onBack,
  onSkip,
  actionLabel,
  actionEnabled,
  actionBusy = false,
  onAction,
  error,
  footer,
  testID,
  actionTestID = 'onboarding-continue',
  errorTestID = 'onboarding-error',
}: {
  step: number;
  total: number;
  headline: string;
  body?: string;
  children?: React.ReactNode;
  /** Omitted on the first step, where there is nowhere to go back to. */
  onBack?: () => void;
  /** Present only on genuinely optional steps — that is what makes it mean anything. */
  onSkip?: () => void;
  actionLabel: string;
  actionEnabled: boolean;
  actionBusy?: boolean;
  onAction: () => void;
  error?: string | null;
  /** Sits above the action, inside the safe area — a toggle the answer belongs to. */
  footer?: React.ReactNode;
  testID?: string;
  /** Lets a step give its primary action a stable, purpose-specific test id. */
  actionTestID?: string;
  errorTestID?: string;
}) {
  // Eleven steps swap in place inside one navigator screen, and a swap does not
  // move the screen-reader cursor the way a push does. Without this, tapping
  // Continue hands somebody a new question in silence, pointing at whatever now
  // occupies the old position. It lives here so no step can forget it.
  useScreenChangeAnnouncement(
    `${COPY.onboarding.progressLabel(step, total)}. ${headline}${body ? `. ${body}` : ''}`,
  );

  return (
    // D-058 dropped the sunset ground: onboarding is the same cream ground
    // and white cards as every other screen now, not a full-bleed gradient.
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID={testID}>
      {/* The sheet's one head row (8:85): the arrow and the progress side
          by side — and the skip, on the steps honest enough to offer one. */}
      <View style={styles.bar}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.common.back}
            onPress={onBack}
            hitSlop={12}
            style={styles.barButton}
            testID="onboarding-back"
          >
            <Text style={styles.barGlyph}>←</Text>
          </Pressable>
        ) : (
          <View style={styles.barButton} />
        )}
        <View style={styles.progressSeat}>
          <OnboardingProgress step={step} total={total} />
        </View>
        {onSkip ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.onboarding.skip}
            onPress={onSkip}
            hitSlop={12}
            style={styles.barButton}
            testID="onboarding-skip"
          >
            <Text style={styles.barSkip}>{COPY.onboarding.skip}</Text>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text accessibilityRole="header" style={styles.headline}>
            {headline}
          </Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          {error ? <Notice message={error} tone="error" testID={errorTestID} /> : null}
          {children}
        </ScrollView>

        <View style={styles.footer}>
          {footer}
          {/* The sheets' outsized action (8:108): the warm gradient, a
              hundred tall, the pink glow under it. Plainly there and plainly
              inactive when the form is not ready — never vanishing. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: !actionEnabled || actionBusy, busy: actionBusy }}
            disabled={!actionEnabled || actionBusy}
            onPress={onAction}
            style={({ pressed }) => [
              styles.cta,
              (!actionEnabled || actionBusy) && styles.ctaDisabled,
              pressed && actionEnabled && !actionBusy && styles.ctaPressed,
            ]}
            testID={actionTestID}
          >
            <Text style={[styles.ctaLabel, (!actionEnabled || actionBusy) && styles.ctaLabelDisabled]}>
              {actionLabel}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.background },
  /** The sheet's track (3:9): 6 tall over the inert well, a flat coral fill. */
  progressTrack: {
    height: 6,
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: color.accent },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  progressSeat: { flex: 1 },
  barButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barGlyph: { fontSize: 22, lineHeight: 26, color: color.ink },
  /** The sheet's Atla (9:89): 15, in the light pink. */
  barSkip: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.accentDeep,
  },
  /** The sheet's column (8:84): 20 aside, 14 between. */
  content: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: 14,
  },
  headline: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: color.ink,
    textAlign: 'left',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.inkMuted,
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  cta: {
    alignSelf: 'stretch',
    height: 100,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    overflow: 'hidden',
    shadowColor: color.accent,
    shadowOpacity: 0.45,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  ctaPressed: { opacity: 0.85 },
  /** A real state rather than a fade: flat fill, grey label — "the form,
      not you". The glow goes out with it. */
  ctaDisabled: { backgroundColor: color.accentSoft, shadowOpacity: 0, elevation: 0 },
  ctaLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    color: color.onAccent,
  },
  ctaLabelDisabled: { color: color.inkMuted },
});
