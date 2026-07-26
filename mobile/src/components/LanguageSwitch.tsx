/**
 * EN | TR, wherever the language can be chosen.
 *
 * Two labelled pills rather than a dropdown, because there are exactly two
 * answers and both fit on screen — a menu would hide one tap behind another.
 * Each label is written in its own language ("English", "Türkçe"): the person
 * who needs to switch is precisely the person who cannot read the current one.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COPY, type Locale } from '../copy';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: 'en', label: 'English' },
  { locale: 'tr', label: 'Türkçe' },
];

export function LanguageSwitch({ testID = 'language-switch' }: { testID?: string }) {
  const { state, chooseLocale } = useAppStore();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={COPY.language.label} testID={testID}>
      {OPTIONS.map((option) => {
        const selected = state.locale === option.locale;
        return (
          <Pressable
            key={option.locale}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => chooseLocale(option.locale)}
            style={[styles.pill, selected && styles.pillSelected]}
            testID={`${testID}-${option.locale}`}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    minHeight: MIN_TOUCH - 12,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  pillSelected: { backgroundColor: color.accent, borderColor: color.accentDeep },
  label: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.ink,
  },
  labelSelected: { fontFamily: fontFamily.bodySemi },
});
