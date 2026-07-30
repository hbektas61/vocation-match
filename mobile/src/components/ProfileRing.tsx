/**
 * The way to your own profile and to Settings — D-057's replacement for the
 * sixth bottom tab.
 *
 * It was already drawn on three screens (10:74, 11:76, 12:167) as three copies
 * of the same forty-six-pixel ring, each with its own `navigate('Settings')`.
 * Now that Settings is a stack destination rather than a tab, those three
 * copies would have had to be corrected in three places, which is the argument
 * for the component existing at all.
 *
 * Two things it is careful about:
 *
 * - **It is a real target.** 46×46 clears the 44 minimum on its own, so it does
 *   not depend on `hitSlop` being remembered at each call site.
 * - **It says what it opens.** The accessible name is "your profile and
 *   settings", not "settings": after D-057 this is also the only route to the
 *   profile, and a ring announced as "Settings" would leave a screen-reader
 *   user with no way to find their own photo.
 */
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { COPY } from '../copy';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme';

export function ProfileRing({
  /**
   * Marks an unread safety or account notice. Drawn as a thicker, fully-opaque
   * ring plus a dot — never a colour change alone, which nobody who does not
   * separate pink from grey would see.
   */
  alert = false,
  testID,
}: {
  alert?: boolean;
  testID?: string;
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={COPY.settings.ringLabel}
      onPress={() => navigation.navigate('Settings')}
      style={({ pressed }) => [styles.ring, alert && styles.ringAlert, pressed && styles.pressed]}
      testID={testID ?? 'profile-ring'}
    >
      {alert ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** The Figma ring (10:74): 46 across, 1.4 of half-pink. */
  ring: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.4,
    borderColor: 'rgba(244, 114, 182, 0.5)',
    alignItems: 'flex-end',
  },
  ringAlert: { borderWidth: 2, borderColor: color.accent },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.accent,
    marginTop: -2,
    marginRight: -2,
  },
  pressed: { opacity: 0.8 },
});
