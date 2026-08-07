/**
 * The screen that asks for a permission before the system does (D-065,
 * 176:2550 for location and 176:2599 for notifications).
 *
 * The shape is one composition: a large tinted tile with a mark in it, the
 * ask as a centred title and sentence, then the reasons as rows — each a
 * small tinted tile, a short heading and one quiet line — and finally the two
 * answers. The second answer is the load-bearing part. **Not now is a real
 * way on, not a dismissal**: the proximity check is opt-in for the whole life
 * of the account, so a primer that could only be agreed with would be a gate
 * wearing an explanation.
 *
 * It is deliberately a component rather than a screen. The onboarding wizard's
 * ten steps are a counted sequence and D-065 adopts layouts without reordering
 * them, so this stands wherever the app already asks — today that is the
 * proximity check itself.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ACTION_TOUCH, color, font, fontFamily, leading, MIN_TOUCH, radius, spacing, tileTone } from '../theme';

export interface PrimerReason {
  /** A tinted tile and the mark inside it. Decorative — the words carry it. */
  icon: React.ReactNode;
  tint: string;
  title: string;
  body: string;
}

export function PermissionPrimer({
  icon,
  title,
  body,
  reasons,
  actionLabel,
  actionBusy = false,
  onAction,
  declineLabel,
  onDecline,
  testID,
  actionTestID,
  declineTestID,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  reasons: PrimerReason[];
  actionLabel: string;
  actionBusy?: boolean;
  onAction: () => void;
  /** Absent only where there is genuinely nothing to decline. */
  declineLabel?: string;
  onDecline?: () => void;
  testID?: string;
  actionTestID?: string;
  declineTestID?: string;
}) {
  return (
    <View style={styles.host} testID={testID}>
      <View style={styles.crown}>
        <View
          style={styles.mark}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {icon}
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      <View style={styles.reasons}>
        {reasons.map((reason) => (
          <View key={reason.title} style={styles.reason}>
            <View
              style={[styles.reasonTile, { backgroundColor: reason.tint }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {reason.icon}
            </View>
            <View style={styles.reasonText}>
              <Text style={styles.reasonTitle}>{reason.title}</Text>
              <Text style={styles.reasonBody}>{reason.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled: actionBusy, busy: actionBusy }}
        disabled={actionBusy}
        onPress={onAction}
        style={({ pressed }) => [styles.cta, actionBusy && styles.ctaBusy, pressed && styles.ctaPressed]}
        testID={actionTestID}
      >
        <Text style={styles.ctaLabel}>{actionLabel}</Text>
      </Pressable>

      {declineLabel && onDecline ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={declineLabel}
          onPress={onDecline}
          style={({ pressed }) => [styles.decline, pressed && styles.ctaPressed]}
          testID={declineTestID}
        >
          <Text style={styles.declineLabel}>{declineLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { gap: spacing.lg },
  crown: { alignItems: 'center', gap: spacing.md },
  /** The 96pt tile (176:2553): the file's own coral ground, softest corner. */
  mark: {
    width: 96,
    height: 96,
    borderRadius: radius.xxl,
    backgroundColor: tileTone.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },
  reasons: { gap: spacing.lg },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  reasonTile: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonText: { flex: 1, gap: spacing.xs },
  reasonTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  reasonBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: ACTION_TOUCH,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    shadowColor: color.accent,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  ctaBusy: { backgroundColor: color.accentSoft, shadowOpacity: 0, elevation: 0 },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.body,
    color: color.onAccent,
  },
  /**
   * The way past (176:2597). Quiet, but a full target — declining a permission
   * is a decision somebody is entitled to make without hunting for the words.
   */
  decline: {
    alignSelf: 'center',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  declineLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.control,
    color: color.inkFaint,
  },
});
