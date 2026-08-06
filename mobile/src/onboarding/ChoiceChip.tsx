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
        // After the state styles on purpose: `chipWideSelected`'s brand edge
        // must win over the idle rule colour, and the array is the cascade.
        wide && styles.chipWide,
        wide && selected && styles.chipWideSelected,
        disabled && !selected && styles.chipDisabled,
        pressed && styles.chipPressed,
      ]}
    >
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
    gap: spacing.cozy,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipIcon: { marginRight: spacing.tight },
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
    borderWidth: 1.5,
    // Idle takes the same quiet edge every chip does (`chipIdle`); only the
    // size differs here. The border colour used to be brand-coloured on every
    // wide pill regardless of state, which is what the contract's "unselected
    // white + rule" rule is for.
  },
  /** Selected keeps the brand edge so the state is more than a fill. */
  chipWideSelected: {
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
    shadowColor: color.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  chipLabelSelectedWide: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
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
    borderColor: color.rule,
    backgroundColor: color.surface,
    marginBottom: spacing.sm,
  },
  rowLabel: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  rowLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  chipIdle: { backgroundColor: color.surface, borderColor: color.rule },
  chipSelected: { backgroundColor: color.accentSoft, borderColor: color.accent },
  chipDisabled: { opacity: 0.45 },
  chipPressed: { opacity: 0.85 },
  chipLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.control,
    color: color.ink,
  },
  /**
   * The owner read the medium-weight ink on these airy pills as bold and
   * black. Regular weight at body size is still an 18:1 read; the pill's
   * border and fill carry the structure, so the label can speak quietly.
   */
  chipLabelWide: { fontFamily: fontFamily.body, fontSize: font.body },
  chipLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
});
