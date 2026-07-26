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
  wide = false,
  trailing,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  /** A full-width pill: one decision per line, as the reference lays them out. */
  wide?: boolean;
  /** A glyph at the trailing edge, for a choice that opens more choices. */
  trailing?: string;
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
        // After the state styles on purpose: the wide pill's thin lavender
        // border must win over the idle grey, and the array is the cascade.
        wide && styles.chipWide,
        wide && selected && styles.chipWideSelected,
        disabled && !selected && styles.chipDisabled,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      {trailing ? <Text style={styles.chipTrailing}>{trailing}</Text> : null}
    </Pressable>
  );
}

/**
 * A choice as a plain list row rather than a pill.
 *
 * The reference uses this shape wherever the list is long enough that pills
 * would wrap into an unreadable block. Selection is carried by a tick and a
 * weight change as well as colour, for the same reason it is everywhere else.
 */
export function ChoiceRow({
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
        styles.row,
        disabled && !selected && styles.chipDisabled,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
      {selected ? <Text style={styles.rowTick}>✓</Text> : null}
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
  /**
   * One decision per line, sized like the reference's pills: tall enough to
   * feel like the main event on the screen rather than a tag that escaped the
   * passions grid.
   */
  chipWide: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'center',
    // Switching to row made justifyContent horizontal and left the vertical
    // axis to its default — which is why every label sat against the top of
    // its pill on a real phone.
    alignItems: 'center',
    minHeight: 56,
    // The owner's colour, thin. At 1.55:1 the lavender is not the boundary's
    // only job here: the label inside is the affordance, and the selected
    // state still changes fill and weight.
    borderWidth: 1.5,
    borderColor: color.accent,
  },
  /** Selected keeps the deeper edge so the state is more than a fill. */
  chipWideSelected: { borderColor: color.accentDeep },
  chipTrailing: {
    position: 'absolute',
    right: spacing.md,
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.inkMuted,
  },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    fontFamily: fontFamily.body,
    fontSize: font.heading,
    color: color.ink,
  },
  rowLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  rowTick: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.accentDeep,
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
