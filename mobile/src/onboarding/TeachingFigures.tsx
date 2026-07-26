/**
 * The three figures on the teaching cards.
 *
 * Each one is the thing it is teaching, drawn from the same tokens the real
 * screen uses: the Upcoming badge as it actually appears, the single 500 m
 * check as a ring rather than a map, and two cards meeting. A large numeral in
 * the same colour as its background — which is what these replaced — reads as a
 * picture that failed to load, and teaches nothing.
 *
 * All three are decoration: the headline and the sentence under it carry the
 * meaning, so a screen reader is told to skip them.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COPY } from '../copy';
import { color, font, fontFamily, radius, spacing } from '../theme';

function Figure({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={styles.figure}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

/** A room card carrying the self-declared badge, which is the whole idea. */
export function UpcomingFigure() {
  return (
    <Figure>
      <View style={styles.card}>
        <View style={[styles.badge, { backgroundColor: color.accent }]}>
          <Text style={styles.badgeText}>{COPY.upcoming.statusBadge}</Text>
        </View>
        <View style={[styles.line, { width: '70%' }]} />
        <View style={[styles.line, { width: '45%' }]} />
      </View>
    </Figure>
  );
}

/** One check, and a boundary you are either inside or outside. */
export function HereNowFigure() {
  return (
    <Figure>
      <View style={styles.ringOuter}>
        <View style={styles.ringInner}>
          <View style={styles.pin} />
        </View>
      </View>
      <Text style={styles.ringLabel}>{COPY.onboarding.teaching.hereNow.figureLabel}</Text>
    </Figure>
  );
}

/** Two cards meeting — the moment a conversation is allowed to exist. */
export function MatchingFigure() {
  return (
    <Figure>
      <View style={styles.pair}>
        <View style={[styles.pairCard, styles.pairLeft]} />
        <View style={[styles.pairCard, styles.pairRight]} />
      </View>
    </Figure>
  );
}

const styles = StyleSheet.create({
  figure: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  card: {
    width: '78%',
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  badgeText: { fontFamily: fontFamily.bodySemi, fontSize: font.caption, color: color.ink },
  line: { height: 10, borderRadius: 5, backgroundColor: color.rule },

  ringOuter: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: color.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.accentDeep },
  ringLabel: { fontFamily: fontFamily.bodySemi, fontSize: font.caption, color: color.accentDeep },

  // Fixed rather than proportional: absolutely-positioned children measured
  // against a parent that had shrunk to nothing, and the two cards rendered as
  // a pair of hairlines.
  pair: { width: 264, height: 176, justifyContent: 'center' },
  pairCard: {
    position: 'absolute',
    width: 150,
    height: 168,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
  },
  pairLeft: { left: 0, transform: [{ rotate: '-6deg' }] },
  pairRight: { right: 0, backgroundColor: color.accentSoft, transform: [{ rotate: '6deg' }] },
});
