/**
 * The hero-state action button from the owner's mocks (2026-07-28): a tall
 * pill with a leading icon, the label, and a trailing chevron — filled flat
 * coral with the navy the fill can carry, or outlined white with the navy
 * type. Used on the empty hero screens (Discovery before a room, the empty
 * inbox), where the mocks size actions louder than the app's regular
 * buttons.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { color, fontFamily, radius, spacing } from '../theme';

export type BigActionIcon = 'door' | 'compass' | 'sparkle';

function Icon({ name, color: stroke }: { name: BigActionIcon; color: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'door') {
    return (
      <Svg {...common}>
        <Path d="M11 20H2m9-15.438v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561zM11 4H8a2 2 0 0 0-2 2v14m8-8h.01M22 20h-3" />
      </Svg>
    );
  }
  if (name === 'compass') {
    return (
      <Svg {...common}>
        <Circle cx={12} cy={12} r={10} />
        <Path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
      </Svg>
    );
  }
  return (
    <Svg {...common}>
      <Path d="M12 3l2 5.4L19.4 10 14 12l-2 5.4L10 12 4.6 10 10 8.4z" />
    </Svg>
  );
}

export function BigActionButton({
  label,
  icon,
  filled = false,
  onPress,
  testID,
}: {
  label: string;
  icon: BigActionIcon;
  filled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  // Filled: navy on the coral fill, the same rule as every coral surface —
  // the fill cannot carry white at 4.5:1. Outline: navy on white.
  const tone = filled ? color.onAccent : color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled ? styles.filled : styles.outline,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <View style={styles.iconSeat}>
        <Icon name={icon} color={tone} />
      </View>
      <Text style={[styles.label, { color: tone }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.chevron, { color: tone }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  /** A flat coral fill — never a gradient, per D-058. */
  filled: {
    backgroundColor: color.accent,
    shadowColor: color.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  outline: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  pressed: { opacity: 0.85 },
  iconSeat: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bodySemi,
    fontSize: 18,
  },
  chevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 22,
    lineHeight: 24,
  },
});
