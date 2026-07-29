/**
 * EN | TR, wherever the language can be chosen.
 *
 * Two labelled pills rather than a dropdown, because there are exactly two
 * answers and both fit on screen — a menu would hide one tap behind another.
 * Each label is written in its own language ("English", "Türkçe"): the person
 * who needs to switch is precisely the person who cannot read the current one.
 *
 * The Figma pair (4:5/4:7): the resting pill is glass with the light
 * hairline, the chosen one wears the warm gradient with dark ink on it.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COPY, type Locale } from '../copy';
import { useAppStore } from '../state/AppStore';
import { color, fontFamily, glass, gradient, radius, spacing } from '../theme';

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
            {selected ? (
              <LinearGradient
                colors={[...gradient.primary]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
            ) : null}
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
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.edge,
    backgroundColor: glass.fill,
    overflow: 'hidden',
  },
  /** The fill is the gradient's fallback frame and the clip keeping it a pill. */
  pillSelected: { backgroundColor: color.accent, borderWidth: 0 },
  label: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13,
    color: color.ink,
  },
  labelSelected: { color: color.onAccent },
});
