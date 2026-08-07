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

import { COPY, upperCase } from '../copy';
import { formatDateInput, toDateDigits } from '../domain/dateInput';
import { color, font, fontFamily, leading, MIN_TOUCH, radius, spacing, tracking } from '../theme';

export function DateField({
  digits,
  onDigits,
  label,
  hint,
  invalid = false,
  autoFocus = false,
  editable = true,
  softKeyboard = true,
  tall = false,
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
  /**
   * The onboarding shape (D-065, 180:6050): a tall softly-cornered plate with
   * the field's name in small capitals above a large centred value.
   *
   * The contract splits the date into three of these — day, month, year. This
   * stays one, because one `TextInput` owns the value here: the digits are
   * typed on the app's own keypad (D-044, which the contract has no room for
   * beside three plates), and both the input's value and the printed mask are
   * what the birthdate tests read. So the plate's *voice* is adopted and its
   * count is not.
   */
  tall?: boolean;
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
          tall && styles.shellTall,
          focused && styles.shellFocused,
          invalid && styles.shellInvalid,
        ]}
      >
        <View style={[styles.maskColumn, tall && styles.maskColumnTall]} pointerEvents="none">
          {/* The plate's own name, in small capitals (180:6053). Hidden from
              assistive tech: the input below already carries `label`. */}
          {tall ? (
            <Text
              style={styles.plate}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {upperCase(label)}
            </Text>
          ) : null}
          <View style={styles.mask}>
            <Text style={[styles.typed, tall && styles.valueTall]}>{typed}</Text>
            <Text style={[styles.remaining, tall && styles.valueTall]}>{remaining}</Text>
          </View>
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
  /** The contract's plate (180:6051): tall, softly cornered, centred. */
  shellTall: {
    minHeight: 80,
    borderRadius: radius.xxl,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  shellFocused: { borderColor: color.accent, borderWidth: 2.5 },
  shellInvalid: { borderColor: color.danger },
  maskColumn: { alignSelf: 'stretch' },
  maskColumnTall: { alignItems: 'center', gap: spacing.cozy },
  plate: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkFaint,
    textAlign: 'center',
  },
  /** In a plate this size the date is the screen's subject, so it is set big. */
  valueTall: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
  },
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
