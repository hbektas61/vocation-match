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
import Svg, { Circle, Path } from 'react-native-svg';

import { color, font, fontFamily, radius, spacing } from '../theme';

function iconFor(routeName: string, active: boolean) {
  const stroke = active ? color.accentDeep : color.inkMuted;
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (routeName) {
    case 'Hotel':
      return (
        <Svg {...common}>
          <Path d="M10 12h4m-4-4h4m0 13v-3a2 2 0 0 0-4 0v3" />
          <Path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
          <Path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
        </Svg>
      );
    case 'Rooms':
      return (
        <Svg {...common}>
          <Path d="M11 20H2m9-15.438v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561zM11 4H8a2 2 0 0 0-2 2v14m8-8h.01M22 20h-3" />
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
  dock: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    marginBottom: Platform.OS === 'web' ? spacing.sm : 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconSeat: {
    width: 44,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSeatActive: { backgroundColor: color.veil },
  label: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
  },
  labelActive: { color: color.accentDeep },
  labelIdle: { color: color.inkMuted },
});
