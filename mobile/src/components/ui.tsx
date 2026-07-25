import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
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

export function Caption({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <Text style={styles.caption} testID={testID}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /**
   * Work is in flight. Changing the label to "Saving…" is not enough on its
   * own: a screen reader does not re-announce the label of a control that
   * already has focus, so without `busy` a blind user taps submit and hears
   * nothing at all until the screen changes.
   */
  busy?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (disabled || busy) && styles.buttonDisabled,
        pressed && !disabled && !busy && styles.buttonPressed,
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

/**
 * An inline status banner.
 *
 * `accessibilityLiveRegion` is Android-only, so on iOS the banner appears and
 * nothing is spoken — a failed sign-in, a refused swipe, or a denied location
 * check would be a completely silent failure for a VoiceOver user. The explicit
 * announcement below is what makes it audible on both platforms, and it lives
 * here rather than at each call site so no screen can forget it.
 *
 * `success` announces for the same reason `error` does, and it exists because
 * the reverse gap is just as bad: tapping "send the email again", hearing
 * "Sending…", and then hearing nothing at all is indistinguishable from the
 * button having done nothing. `info` stays silent — it is for standing text
 * that was already there when the screen appeared.
 */
export function Notice({
  message,
  tone = 'info',
  testID,
}: {
  message: string;
  tone?: 'info' | 'error' | 'success';
  testID?: string;
}) {
  const announced = tone === 'error' || tone === 'success';

  useEffect(() => {
    if (announced && message) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [announced, message]);

  return (
    <View
      style={[
        styles.notice,
        tone === 'error' && styles.noticeError,
        tone === 'success' && styles.noticeSuccess,
      ]}
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={announced ? 'polite' : 'none'}
    >
      <Text style={[styles.body, tone === 'error' && styles.noticeErrorText]}>{message}</Text>
    </View>
  );
}

/**
 * Speaks a sentence when a screen replaces its own content in place.
 *
 * A navigation push resets the screen-reader cursor; a conditional re-render
 * does not. So swapping the sign-up form for "check your email" leaves a
 * VoiceOver user pointing at whatever now occupies that position, with nothing
 * said — they have to re-explore the screen to find out the tap worked. This is
 * the same mechanism `Notice` uses for errors, exposed for the case where the
 * thing that changed is the whole screen rather than a banner.
 */
export function useScreenChangeAnnouncement(message: string | null): void {
  useEffect(() => {
    if (message) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
}

/**
 * A profile photo, or the initial that stands in for one.
 *
 * `url` is a short-lived signed URL, never a permanent one — see
 * `getPhotoUrls`. When it is absent the fallback is not decoration: a card with
 * no image and no placeholder collapses, and a screen reader reading a row of
 * cards needs to hear something for each person either way, which is why the
 * whole thing carries one label rather than leaving an unlabelled image.
 */
export function Avatar({
  url,
  name,
  size = 'md',
  testID,
}: {
  url: string | null;
  name: string;
  size?: 'md' | 'lg';
  testID?: string;
}) {
  // A signed URL can lapse or be refused between being handed out and being
  // fetched. Remembering *which* URL failed means a refreshed one is tried
  // again instead of the card being stuck on the fallback for good.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && url !== failedUrl;

  const box = size === 'lg' ? styles.avatarLg : styles.avatarMd;
  const label = showImage ? `Photo of ${name}` : `${name} has no photo`;
  return (
    <View
      style={[styles.avatar, box]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID={testID}
    >
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={[styles.avatarImage, box]}
          resizeMode="cover"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <Text style={styles.avatarInitial}>{initialOf(name)}</Text>
      )}
    </View>
  );
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
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
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.badgeUpcoming,
    overflow: 'hidden',
  },
  avatarMd: { width: 64, height: 64, borderRadius: 32 },
  avatarLg: { width: 128, height: 128, borderRadius: 64 },
  avatarImage: { resizeMode: 'cover' },
  avatarInitial: {
    fontSize: font.heading,
    fontWeight: '700',
    color: color.badgeTextUpcoming,
  },
  notice: {
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  noticeError: { backgroundColor: '#FBEAE9' },
  noticeSuccess: { backgroundColor: color.badgeHereNow },
  noticeErrorText: { color: color.danger },
});
