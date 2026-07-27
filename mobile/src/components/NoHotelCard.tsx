/**
 * The shared shape of the designer's two no-hotel screens (2026-07-27):
 * one soft card carrying a drawing, the invitation, the one-hotel rule as
 * a quiet info pill, the way in as the primary action, and one
 * screen-specific secondary under it. Rooms and Discovery differ only in
 * what they put in the slots, which is exactly why this is one component.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from './ui';
import { COPY } from '../copy';
import { color, font, fontFamily, radius, spacing } from '../theme';

const InfoIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 16v-4M12 8h.01" />
  </Svg>
);

export function NoHotelCard({
  illustration,
  title,
  body,
  primaryLabel,
  onPrimary,
  primaryTestID,
  secondary,
  testID,
}: {
  illustration: React.ReactNode;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryTestID: string;
  secondary?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.art}>{illustration}</View>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.pill}>
        <InfoIcon />
        <Text style={styles.pillText}>{COPY.trust.oneHotel}</Text>
      </View>
      <View style={styles.actions}>
        <Button label={primaryLabel} onPress={onPrimary} testID={primaryTestID} />
        {secondary}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  art: { marginBottom: spacing.xs },
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(123, 79, 168, 0.06)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 7,
    marginTop: spacing.xs,
  },
  pillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.accentDeep,
    flexShrink: 1,
  },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});
