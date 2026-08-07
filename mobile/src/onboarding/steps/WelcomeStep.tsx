import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageSwitch } from '../../components/LanguageSwitch';
import { COPY } from '../../copy';
import { useAppStore } from '../../state/AppStore';
import {
  ACTION_TOUCH,
  color,
  elevation,
  font,
  fontFamily,
  leading,
  radius,
  spacing,
  tracking,
} from '../../theme';
import type { StepProps } from './types';

/**
 * The logo, whole (owner, 2026-08-06): its pale field and the waves in it are
 * part of the drawing, not a background somebody put behind it — so the mark
 * is shown as the tile it is, rounded like an app icon, on the white page.
 * The cut-out version this replaces threw that field away.
 */
const MARK = require('../../../assets/brand-src/logo-1024.png');

/**
 * The promise, as a picture (176:2373).
 *
 * The contract draws a generated beach-club sunset here. That image was never
 * exported into this repository, and putting a stock photograph on the first
 * screen anybody sees is the owner's call rather than a build step — so the
 * app's own social photograph stands in until a brand shot arrives. It is the
 * same picture Çevremde uses, and it makes the same promise this screen does.
 */
const HERO = require('../../../assets/nearby-hero.jpg');

/** Drawings sized to their container rather than to type (D-059 addendum). */
export const WELCOME_MARK = 128;
export const WELCOME_HERO = 236;

/**
 * Phone OTP deliberately has no separate sign-up and sign-in journeys: the
 * same number/code exchange creates or restores the account without revealing
 * which one happened.
 *
 * D-065 (176:2352) gave this screen the thing it was missing: it drew the mark
 * and the name and then asked for a phone number, without ever saying what the
 * app was for. `welcome.headline` and `welcome.body` had been sitting in the
 * copy file unused since D-044; the contract puts them on screen between the
 * wordmark and the button, which is where somebody decides.
 */
export function WelcomeStep({ go }: StepProps) {
  const { dispatch } = useAppStore();
  const insets = useSafeAreaInsets();

  return (
    // The mark bleeds to the very top, so only the bottom edge takes the
    // inset; the language pills carry the top inset themselves.
    <SafeAreaView style={styles.screen} edges={['bottom']} testID="screen-welcome">
      {/* The first decision on the first screen: which language the rest of
          this conversation happens in. */}
      <View style={[styles.languageRow, { top: insets.top + spacing.snug }]}>
        <LanguageSwitch testID="welcome-language" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* The mark, the name, and what the name is for — one block, centred
            in whatever room the button leaves it (owner, 2026-08-06). */}
        <View style={styles.centre}>
          <View style={styles.markWell}>
            <Image
              source={MARK}
              style={styles.mark}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              testID="welcome-mark"
            />
          </View>
          <Text accessibilityRole="header" style={styles.wordmark}>{COPY.appName}</Text>

          <View style={styles.pitch}>
            <Text style={styles.pitchHeadline}>{COPY.onboarding.welcome.headline}</Text>
            <Text style={styles.pitchBody}>{COPY.onboarding.welcome.body}</Text>
          </View>

          <Image
            source={HERO}
            style={styles.hero}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            // Decorative: everything it says is already said in words above it.
            accessibilityElementsHidden
            importantForAccessibility="no"
            testID="welcome-hero"
          />
        </View>

        <View style={styles.footer}>
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
          {/* The quiet line under the button (176:2379): what continuing means. */}
          <Text style={styles.footnote}>{COPY.onboarding.welcome.trustBody}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** White, like the apps this screen is answering (owner, 2026-08-05). */
  screen: { flex: 1, backgroundColor: color.surface },
  /** The mark sits in the brand wash (176:2363), so the tile is the brand's
      own field rather than a photograph pasted on the page. */
  markWell: {
    width: WELCOME_MARK,
    height: WELCOME_MARK,
    borderRadius: radius.xxl,
    backgroundColor: color.accentWash,
    overflow: 'hidden',
  },
  mark: { width: WELCOME_MARK, height: WELCOME_MARK },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  /**
   * The block, centred in the room above the button — and allowed to *grow*
   * past it rather than `flex: 1`, which would also let it shrink and squeeze
   * the fixed-height picture on a small phone.
   */
  centre: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  languageRow: {
    position: 'absolute',
    right: spacing.md,
  },
  /**
   * The name, in the brand coral (owner, 2026-08-06). The dark sibling is
   * what coral *text* normally has to be — but a wordmark is a logotype, not
   * prose, and WCAG exempts one. It is drawn large for the same reason. The
   * contract draws it near-black; the owner's colour stands, because D-065
   * adopts the file's layout and D-058's palette survives it.
   */
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    letterSpacing: tracking.display,
    color: color.accent,
    textAlign: 'center',
  },
  /** The value proposition (176:2367): held narrow so it reads as two lines. */
  pitch: { alignItems: 'center', gap: spacing.sm, maxWidth: 300 },
  pitchHeadline: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    color: color.ink,
    textAlign: 'center',
  },
  pitchBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },
  /** The picture floats on the page the way every card does now (D-060). */
  hero: {
    alignSelf: 'stretch',
    height: WELCOME_HERO,
    borderRadius: radius.xxl,
    ...elevation.raised,
  },
  footer: { gap: spacing.md, paddingTop: spacing.lg },
  cta: {
    alignSelf: 'stretch',
    minHeight: ACTION_TOUCH,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    overflow: 'hidden',
    shadowColor: color.accent,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.body,
    color: color.onAccent,
  },
  footnote: {
    fontFamily: fontFamily.body,
    fontSize: font.label,
    lineHeight: font.label * leading.normal,
    color: color.inkFaint,
    textAlign: 'center',
  },
});
