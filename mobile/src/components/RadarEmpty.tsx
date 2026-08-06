/**
 * The empty room, drawn as a scan still running.
 *
 * From the owner's reference (2026-07-26): when a room has nobody in it, the
 * screen should not shrug — it should look like the app is still listening.
 * Concentric rings around a glowing point, a pulse sweeping outward, and the
 * words underneath it. The reference was a dark theme; D-058 moved the whole
 * app to a light one, so the rings are drawn in the brand coral instead of
 * the retired pink, deepening toward the centre, the dot in the brand's dark
 * sibling — every ring is a real token, faded with the view's own `opacity`
 * rather than a bespoke rgba, since no translucent-coral token exists.
 *
 * The pulse animates only when the platform's reduce-motion setting allows
 * it; otherwise the rings simply stand still, which reads fine — the point
 * of the drawing is the geometry, the motion is garnish.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { color, radius } from '../theme';

const SIZE = 280;

/** Diameter and opacity pairs, outermost first — the reference's graduated depth. */
const RINGS = [
  { diameter: 280, opacity: 0.12 },
  { diameter: 210, opacity: 0.2 },
  { diameter: 148, opacity: 0.34 },
  { diameter: 90, opacity: 0.55 },
];

export function RadarEmpty({ testID }: { testID?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 1] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.35, 0.12, 0] });

  return (
    <View
      style={styles.stage}
      testID={testID}
      // One drawing, one description: the rings are decoration to a reader.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {RINGS.map((ring) => (
        <View
          key={ring.diameter}
          style={[
            styles.ring,
            {
              width: ring.diameter,
              height: ring.diameter,
              borderRadius: ring.diameter / 2,
              opacity: ring.opacity,
            },
          ]}
        />
      ))}
      {reduceMotion ? null : (
        <Animated.View
          style={[styles.pulse, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]}
        />
      )}
      <View style={styles.halo} />
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  /**
   * The border carries the coral, the fill the same brand wash a selected
   * chip uses — `opacity` on the whole view is what fades it ring by ring,
   * since the palette has no translucent-coral token to reach for instead.
   */
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
  /** The outward sweep: a ring the size of the field, born at the centre. */
  pulse: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: color.accentDeep,
  },
  /** The reference's `0 0 0 6px` glow, as a soft disc behind the dot. */
  halo: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: color.accentSoft,
    opacity: 0.85,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: color.accentDeep,
  },
});
