/**
 * A date field whose mask never disappears.
 *
 * The plain field showed `GG/AA/YYYY` only while empty: type `14` and the
 * placeholder vanished, taking the format with it — the owner watched people
 * lose track of what came next. Here the template is always on screen; the
 * digits you have typed replace it from the left in ink, and the part you have
 * not typed yet stays put in muted: `14/AA/YYYY`.
 *
 * The trick is that the visible text is not the input. A real `TextInput`
 * lies invisibly over the whole box — it owns the keyboard, the digits and
 * deletion (its value is bare digits, so backspace always removes a digit,
 * never a template letter) — and the two `Text` runs underneath are just a
 * faithful drawing of its state. Screen readers talk to the input, which
 * carries the label and the live value.
 */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COPY } from '../copy';
import { formatDateInput, toDateDigits } from '../domain/dateInput';
import { color, font, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

export function DateField({
  digits,
  onDigits,
  label,
  hint,
  invalid = false,
  autoFocus = false,
  editable = true,
  softKeyboard = true,
  testID,
}: {
  /** Bare digits, `DDMMYYYY` order — the same state the parsers speak. */
  digits: string;
  onDigits: (digits: string) => void;
  label: string;
  hint?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
  /** Off when the screen draws its own keypad (D-044). */
  softKeyboard?: boolean;
  testID?: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  // The template comes from copy so it reads GG/AA/YYYY in Turkish and
  // DD/MM/YYYY in English; the slash positions are the same in both.
  const template = COPY.profileSetup.birthdatePlaceholder;
  const typed = formatDateInput(digits);
  const remaining = template.slice(typed.length);

  return (
    <View style={styles.field}>
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.shell,
          focused && styles.shellFocused,
          invalid && styles.shellInvalid,
        ]}
      >
        <View style={styles.mask} pointerEvents="none">
          <Text style={styles.typed}>{typed}</Text>
          <Text style={styles.remaining}>{remaining}</Text>
        </View>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={digits}
          onChangeText={(text) => onDigits(toDateDigits(text))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={8}
          caretHidden
          autoFocus={autoFocus}
          editable={editable}
          showSoftInputOnFocus={softKeyboard}
          style={styles.hiddenInput}
          testID={testID}
        />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  // The same box every Field draws, including the border-only focus (D-021).
  shell: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: color.surface,
  },
  shellFocused: { borderColor: color.accent, borderWidth: 2.5 },
  shellInvalid: { borderColor: color.danger },
  mask: { flexDirection: 'row', alignItems: 'center' },
  typed: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  remaining: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.inkMuted,
  },
  /** Owns the touch, the keyboard and the digits; draws nothing. */
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    color: color.inkMuted,
  },
});
