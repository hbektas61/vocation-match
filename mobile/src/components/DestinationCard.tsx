/**
 * A popular-destination card from the designer's hotel screen (2026-07-27).
 *
 * With the Places key in place these carry real photographs of the cities,
 * served through our own hotel-photo proxy exactly like a hotel's cover —
 * nothing of Google's at rest. Without a backend (the fake, tests, a
 * credential-free run) they fall back to the brand-family gradient. The
 * reference's hotel counts ("2.734 otel") stay omitted on purpose: the
 * catalogue fills lazily, so any number would be an invention.
 *
 * Tapping one runs the search for that city — the card is a pre-typed
 * query, nothing more.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '../theme';

export function DestinationCard({
  name,
  colors,
  source,
  onPress,
  testID,
}: {
  name: string;
  colors: readonly [string, string];
  /** A real photo of the place, when the backend can serve one. */
  source?: ImageSourcePropType | null;
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
      {source ? (
        <View style={styles.fill}>
          <Image source={source} style={StyleSheet.absoluteFillObject} resizeMode="cover" accessibilityIgnoresInvertColors />
          {/* The name has to read on any photograph, so it stands on its own
              scrim rather than trusting the picture to be dark. */}
          <LinearGradient
            colors={['transparent', 'rgba(10, 6, 20, 0.72)']}
            style={styles.scrim}
          />
          <View style={styles.content}>
            <View style={styles.chevron}>
              <Text style={styles.chevronGlyph}>›</Text>
            </View>
            <Text style={styles.name}>{name}</Text>
          </View>
        </View>
      ) : (
        <LinearGradient colors={[colors[0], colors[1]]} style={styles.fill} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
          <View style={styles.content}>
            <View style={styles.chevron}>
              <Text style={styles.chevronGlyph}>›</Text>
            </View>
            <Text style={styles.name}>{name}</Text>
          </View>
        </LinearGradient>
      )}
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
  fill: { flex: 1 },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  content: {
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
