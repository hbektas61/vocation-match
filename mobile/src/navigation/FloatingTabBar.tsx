/**
 * The designer's tab bar (2026-07-27): a floating rounded card with five
 * drawn icons, the active one sitting in a filled lavender pill. One
 * component replaces the platform bar everywhere, which is what keeps the
 * five screens' footers identical.
 *
 * Accessibility is the platform's contract kept by hand: each item is a
 * button carrying its title and selected state, so tests and screen
 * readers see exactly what they saw before the redesign.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color, fontFamily, radius, spacing, warmEnd } from '../theme';

function iconFor(routeName: string, active: boolean) {
  const stroke = active ? color.accentDeep : color.inkMuted;
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (routeName) {
    case 'Vacation':
      // The designer's suitcase (2026-07-29): the trip, packed.
      return (
        <Svg {...common}>
          <Rect x={4} y={8} width={16} height={12} rx={2} />
          <Path d="M9 8V6a3 3 0 0 1 6 0v2M9 12v4m6-4v4" />
        </Svg>
      );
    case 'Nearby':
      return (
        <Svg {...common}>
          <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <Circle cx={12} cy={10} r={3} />
        </Svg>
      );
    case 'Discovery':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={10} />
          <Path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
        </Svg>
      );
    case 'Inbox':
      return (
        <Svg {...common}>
          <Path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z" />
          <Path d="M8.5 10.5h7M8.5 13.5h4" />
        </Svg>
      );
    default:
      return (
        <Svg {...common}>
          <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
          <Circle cx={12} cy={12} r={3} />
        </Svg>
      );
  }
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom - 6, 0) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const active = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={styles.item}
              testID={`tab-${route.name}`}
            >
              <View style={[styles.iconSeat, active && styles.iconSeatActive]}>
                {iconFor(route.name, active)}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.label, active ? styles.labelActive : styles.labelIdle]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The floating card sits on the ground, not glued to the screen edge. */
  /* The dock wears the gradient's warm end, so the bar never floats on a
     stray white band (the owner's screenshot bug) and the glass reads like
     the reference. */
  dock: {
    backgroundColor: warmEnd,
    paddingHorizontal: spacing.sm,
  },
  /** The Figma bar (10:95): the deep wash at .92, the light hairline, 22 corners. */
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(58, 49, 104, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    marginBottom: Platform.OS === 'web' ? spacing.sm : 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  /** The 38×24 seat (10:97); only the active one shows its fill. */
  iconSeat: {
    width: 38,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSeatActive: { backgroundColor: color.veil },
  label: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
  },
  labelActive: { color: color.accentDeep },
  labelIdle: { color: color.inkMuted },
});
