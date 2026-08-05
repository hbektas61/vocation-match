import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageSwitch } from '../../components/LanguageSwitch';
import { COPY } from '../../copy';
import { useAppStore } from '../../state/AppStore';
import { color, fontFamily, MIN_TOUCH, radius } from '../../theme';
import type { StepProps } from './types';

/**
 * The mark, cut out of the artwork's own pale field so it can stand on white
 * (owner, 2026-08-05): the way the dating apps open — a white page, the logo,
 * one sentence, one button. It replaces the stock couple photograph, which
 * said "a holiday" but never said "us".
 *
 * `assets/brand-mark.png` is generated from `brand-src/logo-1024.png`: the
 * pin's shape is flood-filled out of the drawing, so the heart stays a hole
 * and the page shows through it.
 */
const MARK = require('../../../assets/brand-mark.png');

/**
 * Phone OTP deliberately has no separate sign-up and sign-in journeys: the
 * same number/code exchange creates or restores the account without revealing
 * which one happened.
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
      <View style={[styles.languageRow, { top: insets.top + 14 }]}>
        <LanguageSwitch testID="welcome-language" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* The mark and the name are one thing, and they sit in the middle of
            whatever room the button leaves them (owner, 2026-08-06) — not
            pinned under the language pills with a hole underneath. */}
        <View style={styles.centre}>
          <Image
            source={MARK}
            style={styles.mark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            testID="welcome-mark"
          />
          <Text accessibilityRole="header" style={styles.wordmark}>{COPY.appName}</Text>
        </View>

        {/* The one way forward, at the shared `Button`'s size (owner,
            2026-08-05) — the sheets' hundred-tall slab made onboarding the
            only place with a button that big. */}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** White, like the apps this screen is answering (owner, 2026-08-05). */
  screen: { flex: 1, backgroundColor: color.surface },
  mark: { width: 196, height: 222 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 24 },
  /** The mark and the name, centred in the room above the button. */
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  languageRow: {
    position: 'absolute',
    right: 16,
  },
  /**
   * The name, in the brand coral (owner, 2026-08-06). The dark sibling is
   * what coral *text* normally has to be — but a wordmark is a logotype, not
   * prose, and WCAG exempts one. It is drawn large for the same reason.
   */
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    color: color.accent,
    textAlign: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: MIN_TOUCH,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    overflow: 'hidden',
    shadowColor: color.accent,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.onAccent,
  },
});
