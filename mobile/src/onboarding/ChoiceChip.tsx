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
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font, fontFamily, gradient, MIN_TOUCH, radius, spacing, glass } from '../theme';
import { CheckBadge } from './stepIcons';

export function ChoiceChip({
  label,
  selected,
  disabled = false,
  wide = false,
  trailing,
  icon,
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
  /** The designer's leading glyph (D-044). Decorative: the label carries meaning. */
  icon?: React.ReactNode;
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
        // After the state styles on purpose: the wide pill's pink border
        // must win over the idle grey, and the array is the cascade.
        wide && styles.chipWide,
        wide && selected && styles.chipWideSelected,
        disabled && !selected && styles.chipDisabled,
        pressed && styles.chipPressed,
      ]}
    >
      {selected && !wide ? (
        // The mock's selected passion chip is the brand gradient itself.
        <LinearGradient
          colors={[...gradient.primary]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.chipGradient}
          pointerEvents="none"
        />
      ) : null}
      {icon ? <View style={styles.chipIcon}>{icon}</View> : null}
      <Text
        style={[
          styles.chipLabel,
          wide && styles.chipLabelWide,
          selected && (wide ? styles.chipLabelSelectedWide : styles.chipLabelSelected),
        ]}
      >
        {label}
      </Text>
      {wide && selected ? (
        <View style={styles.chipBadge}>
          <CheckBadge />
        </View>
      ) : trailing ? (
        <Text style={styles.chipTrailing}>{trailing}</Text>
      ) : null}
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
      {selected ? <CheckBadge size={20} /> : null}
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
  /** The sheet's chip (9:93): 16/11 inside, the light hairline at 1. */
  chip: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipGradient: { ...StyleSheet.absoluteFillObject },
  chipIcon: { marginRight: 2 },
  chipBadge: { position: 'absolute', right: spacing.sm + 2 },
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
  chipWideSelected: {
    borderColor: color.border,
    backgroundColor: color.accentSoft,
    shadowColor: color.border,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  chipLabelSelectedWide: { fontFamily: fontFamily.bodySemi, color: color.ink },
  chipTrailing: {
    position: 'absolute',
    right: spacing.md,
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.inkMuted,
  },
  /** The mock's orientation rows: thin outlined pills, one per line. */
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: glass.edge,
    backgroundColor: glass.fill,
    marginBottom: spacing.sm,
  },
  rowLabel: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  rowLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  chipIdle: { backgroundColor: glass.fill, borderColor: glass.edge },
  chipSelected: { backgroundColor: color.accentSoft, borderColor: 'transparent' },
  chipDisabled: { opacity: 0.45 },
  chipPressed: { opacity: 0.85 },
  chipLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    color: color.ink,
  },
  /**
   * The owner read the medium-weight ink on these airy pills as bold and
   * black. Regular weight at body size is still an 18:1 read; the pill's
   * border and fill carry the structure, so the label can speak quietly.
   */
  chipLabelWide: { fontFamily: fontFamily.body, fontSize: font.body },
  /** On the gradient: the dark ink, which survives its worst stop (D-043). */
  chipLabelSelected: { fontFamily: fontFamily.bodySemi, color: '#1A1A2E' },
});
