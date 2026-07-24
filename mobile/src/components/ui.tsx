import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, font, MIN_TOUCH, radius, spacing } from '../theme';

export function Screen({
  children,
  scroll = true,
  testID,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, styles.flex]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']} testID={testID}>
      {content}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant === 'secondary' ? styles.buttonLabelSecondary : styles.buttonLabelOnColor,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A labelled text input. `hint` is for a format requirement or similar: it is
 * rendered under the field AND passed as an accessibility hint, because a
 * placeholder disappears the moment someone types and is not reliably read out
 * — leaving a screen-reader user to guess the expected format.
 */
export function Field(props: TextInputProps & { label: string; hint?: string }) {
  const { label, hint, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={color.textSecondary}
        style={styles.input}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export function Badge({ label, tone }: { label: string; tone: 'upcoming' | 'hereNow' }) {
  return (
    <View
      style={[styles.badge, tone === 'upcoming' ? styles.badgeUpcoming : styles.badgeHereNow]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'upcoming' ? styles.badgeTextUpcoming : styles.badgeTextHereNow,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty} accessibilityRole="text">
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

export function Notice({
  message,
  tone = 'info',
  testID,
}: {
  message: string;
  tone?: 'info' | 'error';
  testID?: string;
}) {
  return (
    <View
      style={[styles.notice, tone === 'error' && styles.noticeError]}
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'polite' : 'none'}
    >
      <Text style={[styles.body, tone === 'error' && styles.noticeErrorText]}>{message}</Text>
    </View>
  );
}

export function Gap({ size = 'md' }: { size?: keyof typeof spacing }) {
  return <View style={{ height: spacing[size] }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.background },
  screenContent: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: font.title, fontWeight: '700', color: color.textPrimary },
  heading: { fontSize: font.heading, fontWeight: '600', color: color.textPrimary },
  body: { fontSize: font.body, color: color.textSecondary, lineHeight: 22 },
  caption: { fontSize: font.caption, color: color.textSecondary },
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonPrimary: { backgroundColor: color.accent },
  buttonSecondary: {
    backgroundColor: color.background,
    borderWidth: 1,
    borderColor: color.border,
  },
  buttonDanger: { backgroundColor: color.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { fontSize: font.body, fontWeight: '600' },
  buttonLabelOnColor: { color: color.onAccent },
  buttonLabelSecondary: { color: color.textPrimary },
  field: { gap: spacing.xs },
  fieldHint: {
    color: color.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  fieldLabel: { fontSize: font.caption, fontWeight: '600', color: color.textPrimary },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: font.body,
    color: color.textPrimary,
    backgroundColor: color.background,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeUpcoming: { backgroundColor: color.badgeUpcoming },
  badgeHereNow: { backgroundColor: color.badgeHereNow },
  badgeText: { fontSize: font.caption, fontWeight: '600' },
  badgeTextUpcoming: { color: color.badgeTextUpcoming },
  badgeTextHereNow: { color: color.badgeTextHereNow },
  empty: {
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  noticeError: { backgroundColor: '#FBEAE9' },
  noticeErrorText: { color: color.danger },
});
