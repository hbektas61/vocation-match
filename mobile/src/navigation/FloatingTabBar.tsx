/**
 * The designer's tab bar (2026-07-27): a floating rounded card with five
 * drawn icons, the active one sitting in a filled pill. One component
 * replaces the platform bar everywhere, which is what keeps the five
 * screens' footers identical.
 *
 * D-058 moved it from a floating glass dock to the flat white surface the
 * contract asks for: `color.surface` with a `color.rule` hairline on top
 * and `elevation.nav`, so it reads as one continuous strip rather than a
 * card lifted off the ground.
 *
 * Accessibility is the platform's contract kept by hand: each item is a
 * button carrying its title and selected state, so tests and screen
 * readers see exactly what they saw before the redesign.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { COPY_FOR } from '../copy';
import { useAppStore } from '../state/AppStore';

import { color, elevation, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

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
    case 'Events':
      // A ticket stub with its perforation — the object an event is, without
      // claiming we sell one.
      return (
        <Svg {...common}>
          <Path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z" />
          <Path d="M14 7v10" />
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
  // Read from the store the inbox already fills, rather than polled here: the
  // bar is drawn on every screen and must not become a request every screen.
  const { state: appState } = useAppStore();
  const unread = appState.matches.reduce((total, match) => total + (match.unreadCount ?? 0), 0);
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const active = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : {}}
              // The dot is decoration; the count has to reach a screen reader
              // some other way, so it goes in the tab's own name.
              accessibilityLabel={
                route.name === 'Inbox' && unread > 0
                  ? `${options.tabBarAccessibilityLabel ?? label}. ${COPY_FOR.unreadMessages(unread)}`
                  : options.tabBarAccessibilityLabel ?? label
              }
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
                {route.name === 'Inbox' && unread > 0 ? (
                  /* A mark, not a number. The count is on the row inside;
                     out here the only question is "is there anything?" — and
                     a two-digit badge on a 44pt target is a smudge. */
                  <View
                    style={styles.unreadDot}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    testID="tab-Inbox-unread"
                  />
                ) : null}
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
  /**
   * D-058: a flat white strip, not a floating glass dock. The hairline on
   * top is the only edge — the same quiet `color.rule` a card uses — and
   * `elevation.nav` lifts it off whatever scrolls underneath.
   */
  /** The waiting mark: coral, on the seat's top-right corner. */
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.surface,
  },
  bar: {
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.rule,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    ...elevation.nav,
  },
  row: {
    flexDirection: 'row',
  },
  /**
   * D-057 / R-06: 44 is the floor, and measuring found 40 — the icon seat plus
   * the label came to it and nothing enforced the rest. The bar's own vertical
   * padding sits *outside* the pressable, so it never counted toward the
   * target somebody actually has to hit.
   */
  item: {
    flex: 1,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
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
  // The selected surface, same job a selected chip does: a pale brand wash,
  // never the coral fill itself, which would put the small glyph on top of
  // a colour that cannot carry it.
  iconSeatActive: { backgroundColor: color.accentSoft },
  label: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
  },
  // The coral itself is 2.99:1 on white — too faint for a 10px label — so the
  // active tab reads in its dark sibling instead, same as every other small
  // brand glyph in this theme.
  labelActive: { color: color.accentDeep },
  labelIdle: { color: color.inkMuted },
});
