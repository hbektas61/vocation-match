/**
 * A postcard for a hotel that has no photograph.
 *
 * The catalogue comes from OpenStreetMap, which knows where hotels are but
 * not what they look like, and licensed photography is a different project.
 * Rather than a grey placeholder pretending a photo failed to load, each
 * hotel gets a deterministic little postcard: a wash from the brand family,
 * its initial set large, and an arc of "postmark" rings — the same hotel
 * always renders the same card, because the *name* is the seed.
 *
 * Deliberately abstract. A generative palm tree is a lie about the hotel; a
 * monogram is just a monogram.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, fontFamily, radius } from '../theme';

/** Stable tiny hash so a hotel keeps its card between renders and launches. */
function seedOf(name: string): number {
  let seed = 0;
  for (let i = 0; i < name.length; i += 1) {
    seed = (seed * 31 + name.charCodeAt(i)) % 997;
  }
  return seed;
}

/** Three arrangements inside the pinned palette — variety without new hues. */
const VARIANTS = [
  { background: color.accentSoft, ring: color.accent, letter: color.accentDeep },
  { background: color.accent, ring: color.accentSoft, letter: color.accentDeep },
  { background: color.veil, ring: color.accentDeep, letter: color.accent },
] as const;

export function HotelCover({
  name,
  size = 'sm',
  testID,
}: {
  name: string;
  /** `sm` is a list thumbnail; `lg` fills the active card's cover slot. */
  size?: 'sm' | 'lg';
  testID?: string;
}) {
  const seed = seedOf(name);
  const variant = VARIANTS[seed % VARIANTS.length];
  const large = size === 'lg';
  // Where the postmark sits also comes from the name, so two hotels with the
  // same variant still read apart at a glance.
  const ringRight = seed % 2 === 0;

  return (
    <View
      style={[
        styles.card,
        large ? styles.cardLg : styles.cardSm,
        { backgroundColor: variant.background },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
      testID={testID}
    >
      <View
        style={[
          styles.ring,
          large ? styles.ringLg : styles.ringSm,
          { borderColor: variant.ring },
          ringRight ? styles.ringRight : styles.ringLeft,
        ]}
      />
      <Text style={[styles.letter, large ? styles.letterLg : styles.letterSm, { color: variant.letter }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSm: { width: 56, height: 56 },
  cardLg: { width: '100%', height: 96, borderRadius: radius.md },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.6,
  },
  ringSm: { width: 44, height: 44, borderWidth: 3, top: -14 },
  ringLg: { width: 120, height: 120, borderWidth: 6, top: -48 },
  ringLeft: { left: -14 },
  ringRight: { right: -14 },
  letter: { fontFamily: fontFamily.display },
  letterSm: { fontSize: 26, lineHeight: 30 },
  letterLg: { fontSize: 54, lineHeight: 60 },
});
