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

import { ACTION_TOUCH, color, elevation, font, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.snug },
  /**
   * The wrapping chip (D-065, 180:6345 / 180:6420): a white pill that floats,
   * its label at reading size rather than at control size — on these screens a
   * chip is the answer, not a filter above somebody else's list.
   */
  chip: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.cozy,
    paddingHorizontal: spacing.wide,
    paddingVertical: spacing.snug,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipIcon: { marginRight: spacing.tight },
  chipBadge: { position: 'absolute', right: spacing.wide },
  /**
   * One decision per line (180:6158): the action's own height, the softest
   * corner on the ladder, and the answer read from the left rather than
   * centred — a list of options is read down its leading edge.
   *
   * The contract leaves an unselected pill with no edge at all and lets the
   * coral ring be the whole selection signal. That is one signal carried by
   * colour, which is the thing D-058 forbids, so the quiet rule stays on the
   * idle pill and the selected one keeps its wash and its badge as well as
   * the ring.
   */
  chipWide: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    // Switching to row made justifyContent horizontal and left the vertical
    // axis to its default — which is why every label sat against the top of
    // its pill on a real phone.
    alignItems: 'center',
    minHeight: ACTION_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xxl,
    borderWidth: 2,
    ...elevation.card,
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
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  /**
   * The owner read the medium-weight ink on these airy pills as bold and
   * black. Regular weight at body size is still an 18:1 read; the pill's
   * border and fill carry the structure, so the label can speak quietly.
   */
  chipLabelWide: { fontFamily: fontFamily.bodySemi, fontSize: font.body },
  chipLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
});
