/**
 * Discovery before any door is open — the designer's second pass
 * (2026-07-27): the door itself moved to the centre of the orbit, ajar,
 * with an empty armchair waiting on a small stage at the disc's foot. The
 * room exists; nobody is in it; the way in is a door. The earlier
 * three-bubble version is gone at the owner's request.
 *
 * Static on purpose: unlike the in-room empty state, nothing is being
 * scanned here — the app is not looking for anyone until a door opens.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color } from '../theme';

const SIZE = 300;

/** The designer's ring tone: deep lavender, faint. */
const RING = 'rgba(123, 79, 168, 0.14)';
const SATELLITE = 'rgba(123, 79, 168, 0.35)';

/** The door, ajar, at the centre of everything. */
const DoorIcon = () => (
  <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z" />
    <Path d="M11 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
    <Path d="M14 12h.01" />
  </Svg>
);

/** A filled armchair — the empty seat the reference leaves waiting. */
const ArmchairIcon = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill={color.accentDeep} stroke={color.accentDeep} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" fill="none" />
    <Path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z" />
    <Path d="M5 18v2M19 18v2" fill="none" />
  </Svg>
);

/** Small dots resting on the orbits, placed by eye against the reference. */
const SATELLITES = [
  { top: 62, left: 74, size: 9 },
  { top: 84, right: 60, size: 6 },
  { top: 160, left: 34, size: 6 },
  { top: 168, right: 44, size: 8 },
  { bottom: 96, left: 106, size: 5 },
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
      {SATELLITES.map(({ size: dot, ...position }, index) => (
        <View
          key={index}
          style={[styles.satellite, position, { width: dot, height: dot, borderRadius: dot / 2 }]}
        />
      ))}
      <View style={styles.stageFloor} />
      <View style={styles.centreHalo}>
        <DoorIcon />
      </View>
      <View style={styles.seatBubble}>
        <ArmchairIcon />
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
    backgroundColor: SATELLITE,
  },
  /** The deeper pool of lavender the door stands in. */
  centreHalo: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'rgba(123, 79, 168, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
  },
  /** The stage at the disc's foot the armchair sits on. */
  stageFloor: {
    position: 'absolute',
    bottom: 16,
    width: 190,
    height: 34,
    borderRadius: 95,
    backgroundColor: color.surface,
    shadowColor: color.accentDeep,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  seatBubble: {
    position: 'absolute',
    bottom: 26,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
