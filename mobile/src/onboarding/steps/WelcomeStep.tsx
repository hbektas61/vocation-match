import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { LanguageSwitch } from '../../components/LanguageSwitch';
import { COPY } from '../../copy';
import { useAppStore } from '../../state/AppStore';
import { color, elevation, fontFamily, gradient } from '../../theme';
import type { StepProps } from './types';

/**
 * The mark itself, filling the screen behind the words (owner, 2026-08-05):
 * the way the dating apps open, and the way somebody learns what this app is
 * called before they have read a word of it. It replaces the stock couple
 * photograph, which said "a holiday" but never said "us".
 *
 * The artwork carries its own pale field, so it *is* the background rather
 * than a picture on one — and a white veil rises over its lower half so the
 * ink below stays ink instead of becoming on-photo white.
 */
const MARK = require('../../../assets/brand-src/logo-1024.png');

const ShieldDisc = () => (
  <View style={styles.shieldDisc}>
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={color.accentDeep} stroke={color.accentDeep} strokeWidth={1.5} strokeLinejoin="round">
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <Path d="M8.5 11.8l2.6 2.6 4.8-4.8" stroke={color.surface} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </Svg>
  </View>
);

/**
 * Phone OTP deliberately has no separate sign-up and sign-in journeys: the
 * same number/code exchange creates or restores the account without revealing
 * which one happened.
 */
export function WelcomeStep({ go }: StepProps) {
  const { dispatch } = useAppStore();
  const insets = useSafeAreaInsets();

  // The headline's full stop is the sheet's heart (4:10).
  const headline = COPY.onboarding.welcome.headline.replace(/[.。]\s*$/, '');

  return (
    // The mark bleeds to the very top, so only the bottom edge takes the
    // inset; the language pills carry the top inset themselves.
    <SafeAreaView style={styles.screen} edges={['bottom']} testID="screen-welcome">
      <ImageBackground
        source={MARK}
        style={styles.mark}
        imageStyle={styles.markImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        testID="welcome-mark"
      >
        {/* The words sit on the mark's own pale field, so the veil is white
            rather than the usual dark photo scrim. */}
        <LinearGradient
          colors={[...gradient.paperVeil]}
          locations={[0, 0.42, 0.66]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {/* The first decision on the first screen: which language the rest
            of this conversation happens in. Floats over the mark (4:4). */}
        <View style={[styles.languageRow, { top: insets.top + 14 }]}>
          <LanguageSwitch testID="welcome-language" />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.markRoom} />
          <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.wordmark}>{COPY.appName}</Text>
          <Text accessibilityRole="header" style={styles.headline}>
            {headline} ❤
          </Text>
          <Text style={styles.body}>{COPY.onboarding.welcome.body}</Text>

          {/* The trust card (4:12): a white card at 18, the 44 disc, 14/12 words. */}
          <View style={styles.trustCard}>
            <ShieldDisc />
            <View style={styles.trustWords}>
              <Text style={styles.trustTitle}>{COPY.onboarding.welcome.trustTitle}</Text>
              <Text style={styles.trustBody}>{COPY.onboarding.welcome.trustBody}</Text>
            </View>
          </View>

          {/* The sheet's outsized welcome action (4:17): flat coral,
              a hundred tall, with the coral glow under it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.onboarding.welcome.continueWithPhone}
            onPress={() => {
              dispatch({ type: 'CONFIRM_AGE' });
              go('promise');
            }}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            testID="welcome-phone"
          >
            <Text style={styles.ctaLabel}>{COPY.onboarding.welcome.continueWithPhone}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  /** The mark is the ground, so it owns the whole screen. */
  mark: { flex: 1 },
  /** Anchored high: the pin stays whole while the words take the foot. */
  markImage: { resizeMode: 'cover', top: 0 },
  /** What the mark keeps for itself before the words begin. */
  markRoom: { height: 300 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  languageRow: {
    position: 'absolute',
    right: 16,
  },
  /** The sheet's column (4:2): 20 aside, 14 between, everything centred. */
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    alignItems: 'center',
    gap: 14,
  },
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    color: color.accentDeep,
    textAlign: 'center',
  },
  headline: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 26 * 1.2,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: color.inkMuted,
    textAlign: 'center',
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...elevation.card,
  },
  shieldDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustWords: { flex: 1, gap: 3 },
  trustTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
  trustBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * 1.45,
    color: color.inkMuted,
  },
  cta: {
    alignSelf: 'stretch',
    height: 100,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    overflow: 'hidden',
    marginTop: 'auto',
    shadowColor: color.accent,
    shadowOpacity: 0.45,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    color: color.onAccent,
  },
});
