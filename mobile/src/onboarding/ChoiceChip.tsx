/**
 * A large rounded choice, and the group that holds them.
 *
 * The selected state is carried by a fill, a border and the word "selected" in
 * the accessibility state — never by colour alone, because a chip whose only
 * difference is a tint is not a state to anyone who cannot see the tint.
 *
 * Where a group has a limit, the limit is said out loud rather than discovered
 * by tapping: `ChoiceGroup` prints it and gives the group an accessibility hint
 * carrying the same sentence.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

export function ChoiceChip({
  label,
  selected,
  disabled = false,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        disabled && !selected && styles.chipDisabled,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceGroup({
  hint,
  children,
  testID,
}: {
  /** Said aloud as well as printed — a limit discovered by tapping is not a limit. */
  hint?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.group} testID={testID}>
      {hint ? (
        <Text style={styles.groupHint} accessibilityRole="text">
          {hint}
        </Text>
      ) : null}
      <View style={styles.chips} accessibilityHint={hint}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  groupHint: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    color: color.inkMuted,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipIdle: { backgroundColor: color.surface, borderColor: color.border },
  chipSelected: { backgroundColor: color.accentSoft, borderColor: color.accentDeep },
  chipDisabled: { opacity: 0.45 },
  chipPressed: { opacity: 0.85 },
  chipLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    color: color.ink,
  },
  chipLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
});
