import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { color } from '../theme';

/**
 * Replaces the app with an opaque surface before the OS takes a background
 * snapshot. Phone entry is the obvious sensitive screen, but applying this at
 * the root also keeps chats and profile photos out of the app switcher.
 */
export function PrivacyShield() {
  // React mounts the app in the foreground; every later transition is driven
  // by the subscription below.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setHidden(nextState !== 'active');
    });
    return () => subscription.remove();
  }, []);

  return hidden ? (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="auto"
      style={styles.shield}
      testID="privacy-shield"
    />
  ) : null;
}

const styles = StyleSheet.create({
  shield: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10_000,
    elevation: 10_000,
    backgroundColor: color.background,
  },
});
