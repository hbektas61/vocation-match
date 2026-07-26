/**
 * A popular-destination card from the designer's hotel screen (2026-07-27).
 *
 * The reference uses photographs; these use gradients from the brand family
 * instead — a photo we do not have the rights to would be a worse lie than
 * a wash of colour. The reference also prints hotel counts ("2.734 otel");
 * those are omitted on purpose: the catalogue fills lazily from OSM, so any
 * number we printed would be an invention (D-007's rule about claims we
 * cannot back applies to inventory as much as to identity).
 *
 * Tapping one runs the search for that city — the card is a pre-typed
 * query, nothing more.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '../theme';

export function DestinationCard({
  name,
  colors,
  onPress,
  testID,
}: {
  name: string;
  colors: readonly [string, string];
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={testID}
    >
      <LinearGradient colors={[colors[0], colors[1]]} style={styles.fill} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
        <View style={styles.chevron}>
          <Text style={styles.chevronGlyph}>›</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 148,
    height: 112,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85 },
  fill: {
    flex: 1,
    padding: spacing.sm + 4,
    justifyContent: 'space-between',
  },
  chevron: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronGlyph: {
    color: '#FFFFFF',
    fontFamily: fontFamily.bodySemi,
    fontSize: 18,
    lineHeight: 20,
  },
  name: {
    color: '#FFFFFF',
    fontFamily: fontFamily.display,
    fontSize: 18,
  },
});
