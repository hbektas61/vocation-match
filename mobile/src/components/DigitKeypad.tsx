/**
 * The designer's in-app keypad (D-044): digits with their letter rows, and
 * a backspace, exactly as the birthdate mock draws them. It writes through
 * callbacks so the field it serves stays the single owner of the value.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { COPY } from '../copy';
import { color, font, fontFamily, radius, spacing, tracking } from '../theme';

const LETTERS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
};

const BackspaceIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 6H8l-5 6 5 6h13a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" />
    <Path d="m12 9 6 6m0-6-6 6" />
  </Svg>
);

export function DigitKeypad({
  onDigit,
  onDelete,
  disabled = false,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const key = (label: string, action: () => void, child?: React.ReactNode, testID?: string) => (
    <Pressable
      key={testID ?? label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={action}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
      testID={testID}
    >
      {child ?? (
        <>
          <Text style={styles.keyDigit}>{label}</Text>
          {LETTERS[label] ? <Text style={styles.keyLetters}>{LETTERS[label]}</Text> : null}
        </>
      )}
    </Pressable>
  );

  return (
    <View style={styles.pad} testID="digit-keypad">
      {[
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
      ].map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((digit) => key(digit, () => onDigit(digit), undefined, `bd-key-${digit}`))}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.key} />
        {key('0', () => onDigit('0'), undefined, 'bd-key-0')}
        {key(COPY.common.back, onDelete, <BackspaceIcon />, 'bd-key-delete')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  key: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { opacity: 0.75 },
  keyDigit: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.ink,
  },
  keyLetters: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    letterSpacing: tracking.none,
    color: color.inkMuted,
  },
});
