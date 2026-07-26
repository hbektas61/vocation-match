/**
 * Discovery before any door is open, from the designer's screen (2026-07-27).
 *
 * A pale orbit field: two rings around a solid centre, small satellites, and
 * three floating bubbles carrying the ways in — people, a door, a place.
 * The drawing tells the state's whole story (you are not in a room; rooms
 * and proximity are how you get in) before a single word is read, which is
 * why the words under it can stay short.
 *
 * Static on purpose: unlike the in-room empty state, nothing is being
 * scanned here — the app is not looking for anyone until a door opens.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { color } from '../theme';

const SIZE = 300;

/** The designer's ring tone: deep lavender, faint. */
const RING = 'rgba(123, 79, 168, 0.14)';
const SATELLITE = 'rgba(123, 79, 168, 0.35)';

function BubbleIcon({ children }: { children: React.ReactNode }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

const PeopleIcon = () => (
  <BubbleIcon>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx={9} cy={7} r={4} />
    <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </BubbleIcon>
);

const DoorIcon = () => (
  <BubbleIcon>
    <Path d="M11 20H2m9-15.438v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561zM11 4H8a2 2 0 0 0-2 2v14m8-8h.01M22 20h-3" />
  </BubbleIcon>
);

const PinIcon = () => (
  <BubbleIcon>
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </BubbleIcon>
);

/** Small dots resting on the orbits, placed by eye against the reference. */
const SATELLITES = [
  { top: 56, left: 186 },
  { top: 118, right: 26 },
  { top: 148, left: 22 },
  { bottom: 92, right: 58 },
  { bottom: 62, left: 92 },
  { top: 34, left: 118 },
];

export function OrbitEmpty({ testID, size = SIZE }: { testID?: string; size?: number }) {
  // The drawing is laid out once at 300 and scaled, so the satellite and
  // bubble positions stay a single set of numbers.
  const scale = size / SIZE;
  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.stage, { transform: [{ scale }] }]}>
      <View style={styles.disc} />
      <View style={[styles.ring, styles.ringOuter]} />
      <View style={[styles.ring, styles.ringInner]} />
      {SATELLITES.map((position, index) => (
        <View key={index} style={[styles.satellite, position]} />
      ))}
      <View style={[styles.bubble, styles.bubblePeople]}>
        <PeopleIcon />
      </View>
      <View style={[styles.bubble, styles.bubbleDoor]}>
        <DoorIcon />
      </View>
      <View style={[styles.bubble, styles.bubblePin]}>
        <PinIcon />
      </View>
      <View style={styles.centreRing}>
        <View style={styles.centre} />
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  stage: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  disc: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: color.veil,
    shadowColor: color.accentDeep,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: RING,
  },
  ringOuter: { width: 260, height: 260, borderRadius: 130 },
  ringInner: { width: 176, height: 176, borderRadius: 88 },
  satellite: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SATELLITE,
  },
  bubble: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bubblePeople: { top: 44, left: 34 },
  bubbleDoor: { top: 58, right: 30 },
  bubblePin: { bottom: 28, left: 124 },
  /** The white collar around the centre — the reference's raised button look. */
  centreRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accentDeep,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  centre: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.accentDeep,
  },
});
