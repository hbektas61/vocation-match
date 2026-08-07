/**
 * The shape every onboarding step has, so no step invents its own.
 *
 * One question per screen, the question set large and left-aligned at the top,
 * a hairline of progress above it, and the only way forward pinned to the
 * bottom where a thumb already is. A step supplies a headline, a body, and a
 * control; it never supplies a layout.
 *
 * D-065 redrew the chrome from the Figma contract's ten account screens
 * (`auth_phone` 180:6454 and its nine siblings, which share one header,
 * one scroll body and one footer):
 *
 * - The progress is a **full-bleed 4pt rail at the very top edge**, not a
 *   rounded pill sharing a row with the back arrow. It reads as the screen's
 *   own loading edge rather than as a control.
 * - Back is a **round white button that floats**, on its own line under the
 *   rail, with the question below it — so the question, not the chrome, is
 *   the first thing at reading height.
 * - The question is the display step in the heaviest cut, and the supporting
 *   line went from caption to body: at 13pt it read as fine print under a
 *   32pt question, which is not what a sentence explaining the question is.
 * - The action is `ACTION_TOUCH` tall (the file draws 64) and carries the
 *   coral glow. The 2026-08-05 owner note that made this the shared `Button`'s
 *   size was aimed at the sheets' hundred-tall slab; 64 is the size the
 *   contract draws and the same rung the like/pass pair already stands on.
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

import { BackButton, Notice, useScreenChangeAnnouncement } from '../components/ui';
import { COPY } from '../copy';
import {
  ACTION_TOUCH,
  color,
  font,
  fontFamily,
  leading,
  MIN_TOUCH,
  radius,
  spacing,
  tracking,
} from '../theme';

/**
 * The rail (180:6457): the whole width, 4 tall, an inert well with a coral
 * fill running left to right. Square rather than pilled — it is the edge of
 * the screen, not an object sitting on it.
 */
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
      {/* The rail runs edge to edge, so it sits outside the column's gutter. */}
      <OnboardingProgress step={step} total={total} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.bar}>
            {onBack ? (
              <BackButton onPress={onBack} testID="onboarding-back" />
            ) : (
              <View style={styles.backButtonGhost} />
            )}
            {onSkip ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.onboarding.skip}
                onPress={onSkip}
                hitSlop={12}
                style={styles.skipButton}
                testID="onboarding-skip"
              >
                <Text style={styles.barSkip}>{COPY.onboarding.skip}</Text>
              </Pressable>
            ) : null}
          </View>

          <Text accessibilityRole="header" style={styles.headline}>
            {headline}
          </Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {error ? <Notice message={error} tone="error" testID={errorTestID} /> : null}
          {children}
        </ScrollView>

        <View style={styles.footer}>
          {footer}
          {/* The one way forward, at the contract's size (180:6479): the pill
              at `ACTION_TOUCH`, the label in the heaviest display cut, and a
              coral glow under it. Plainly there and plainly inactive when the
              form is not ready — never vanishing. */}
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
  /** The rail (180:6457): 4 tall, full bleed, square. */
  progressTrack: {
    height: spacing.xs,
    backgroundColor: color.veil,
    overflow: 'hidden',
  },
  progressFill: { height: spacing.xs, backgroundColor: color.accent },
  /** The head block (180:6459): the column's gutter, the question under the arrow. */
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  /** Holds the row's height on the steps with no way back. */
  backButtonGhost: { width: MIN_TOUCH, height: MIN_TOUCH },
  skipButton: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  barSkip: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.control,
    color: color.accentDeep,
  },
  /** The question (180:6464): the display step, heaviest cut, pulled tight. */
  headline: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.display,
    lineHeight: font.display * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
    textAlign: 'left',
  },
  /** The line under it (180:6466): body, not caption — it is a sentence. */
  body: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
  },
  /** The scroll body (180:6467): 40 of air under the question, 24 between. */
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  footer: {
    gap: spacing.snug,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: ACTION_TOUCH,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    overflow: 'hidden',
    shadowColor: color.accent,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  ctaPressed: { opacity: 0.85 },
  /** A real state rather than a fade: flat fill, grey label — "the form,
      not you". The glow goes out with it. */
  ctaDisabled: { backgroundColor: color.accentSoft, shadowOpacity: 0, elevation: 0 },
  ctaLabel: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.body,
    color: color.onAccent,
  },
  ctaLabelDisabled: { color: color.inkMuted },
});
