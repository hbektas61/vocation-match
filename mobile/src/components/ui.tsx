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

import {
  ACTION_TOUCH,
  color,
  font,
  fontFamily,
  MIN_TOUCH,
  radius,
  roomTone,
  spacing,
} from '../theme';

export function Screen({
  children,
  scroll = true,
  /** Lets a screen run its own content to the edges — a photo, mostly. */
  bleed = false,
  testID,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  bleed?: boolean;
  testID?: string;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={bleed ? styles.screenBleed : styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[bleed ? styles.screenBleed : styles.screenContent, styles.flex]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']} testID={testID}>
      {content}
    </SafeAreaView>
  );
}

/** The largest thing on a screen: a name, or the screen's own subject. */
export function Display({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.display}>
      {children}
    </Text>
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

/**
 * Tracked, uppercase, small. The only job is to name what follows — a section,
 * a state — so it is deliberately not usable for prose. Where a label appears,
 * the structure it marks should be real.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionLabel}>
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
  /** For a button sharing a row: trims the padding so the label fits on one line. */
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  compact?: boolean;
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
        compact && styles.buttonCompact,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        // Outlined rather than filled, now that the brand itself is red: two
        // solid red buttons on one screen, one of which deletes an account,
        // would be the same shout for two very different things.
        variant === 'danger' && styles.buttonDanger,
        (disabled || busy) && styles.buttonDisabled,
        pressed && !disabled && !busy && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          compact && styles.buttonLabelCompact,
          variant === 'primary' && styles.buttonLabelOnColor,
          variant === 'secondary' && styles.buttonLabelSecondary,
          variant === 'danger' && styles.buttonLabelDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The pass and like pair at the foot of a profile.
 *
 * Round, large, and side by side, because at that point in the scroll they are
 * the only two things on the screen and the decision is the whole reason the
 * profile was read.
 */
export function ActionButton({
  label,
  glyph,
  tone,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  glyph: string;
  tone: 'pass' | 'like';
  onPress: () => void;
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
        styles.action,
        tone === 'like' ? styles.actionLike : styles.actionPass,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        // The glyph is decoration; the button already has a real label, and a
        // screen reader announcing "heavy multiplication x" helps nobody.
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.actionGlyph, tone === 'like' && styles.actionGlyphLike]}
      >
        {glyph}
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
export function Field(
  props: TextInputProps & {
    label: string;
    hint?: string;
    /**
     * Hides the printed label without removing it. The accessible name still
     * comes from `label`, so a screen reader is unaffected — this is only for
     * the places where position and placeholder already say what the box is,
     * and printing it again is noise.
     */
    hideLabel?: boolean;
  },
) {
  const { label, hint, hideLabel, ...inputProps } = props;
  return (
    <View style={styles.field}>
      {hideLabel ? null : <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={color.inkMuted}
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
  const palette = tone === 'hereNow' ? roomTone.HERE_NOW : roomTone.UPCOMING;
  return (
    <View style={[styles.badge, { backgroundColor: palette.fill }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

/**
 * The one element this app has that no other dating app does: the fact that
 * this person is connected to the hotel you are standing in, either right now
 * or for a stay they have declared.
 *
 * It sits over the foot of the photo rather than under it, above even the name,
 * because it is the more decision-relevant fact. Everything else on the card is
 * what any dating app would show.
 */
export function RoomRibbon({
  room,
  hotelName,
  onPhoto = false,
  testID,
}: {
  room: 'UPCOMING' | 'HERE_NOW';
  hotelName: string;
  onPhoto?: boolean;
  testID?: string;
}) {
  const state = room === 'HERE_NOW' ? 'Here now' : 'Upcoming';
  return (
    <View
      style={[styles.ribbon, onPhoto ? styles.ribbonOnPhoto : styles.ribbonInline]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${state} at ${hotelName}`}
      testID={testID}
    >
      <View
        style={[
          styles.ribbonDot,
          { backgroundColor: room === 'HERE_NOW' ? color.ember : color.inkMuted },
        ]}
      />
      <Text style={[styles.ribbonText, onPhoto && styles.ribbonTextOnPhoto]}>
        {`${state.toUpperCase()} · ${hotelName.toUpperCase()}`}
      </Text>
    </View>
  );
}

/**
 * A profile photo at the size the product actually uses it.
 *
 * The missing-photo case is designed rather than handled: on the first day of a
 * pilot almost nobody has uploaded one, so a broken frame would be the normal
 * experience. An initial set enormous in the fill colour reads as a decision.
 */
export function PhotoFrame({
  url,
  name,
  children,
  testID,
}: {
  url: string | null;
  name: string;
  /** Overlaid at the foot of the photo, over the scrim. */
  children?: React.ReactNode;
  testID?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && url !== failedUrl;

  return (
    <View style={[styles.photoFrame, !showImage && styles.photoFrameEmpty]} testID={testID}>
      <View
        style={styles.photoFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={showImage ? `Photo of ${name}` : `${name} has no photo`}
      >
        {showImage ? (
          <Image
            source={{ uri: url }}
            style={styles.photoImage}
            resizeMode="cover"
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <Text style={styles.photoInitial}>{initialOf(name)}</Text>
        )}
      </View>
      {children ? (
        <View style={styles.photoOverlay} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
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

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty} accessibilityRole="text">
      <Text style={styles.emptyGlyph} accessibilityElementsHidden importantForAccessibility="no">
        ·
      </Text>
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

export function Gap({ size = 'md' }: { size?: keyof typeof spacing }) {
  return <View style={{ height: spacing[size] }} />;
}

/** A hairline that separates without drawing attention to itself. */
export function Rule() {
  return <View style={styles.rule} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.background },
  screenContent: { padding: spacing.md, gap: spacing.md },
  screenBleed: { paddingBottom: spacing.xl, gap: spacing.md },

  display: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    lineHeight: font.display * 1.1,
    color: color.ink,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * 1.15,
    color: color.ink,
  },
  heading: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    lineHeight: font.heading * 1.25,
    color: color.ink,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.45,
    color: color.inkMuted,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * 1.4,
    color: color.inkMuted,
  },
  sectionLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: color.inkMuted,
  },

  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  buttonCompact: { paddingHorizontal: spacing.sm },
  buttonPrimary: { backgroundColor: color.ember },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: color.border,
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: color.danger,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  buttonLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    letterSpacing: 0.2,
  },
  buttonLabelCompact: { fontSize: font.caption + 1, letterSpacing: 0 },
  buttonLabelOnColor: { color: color.onEmber },
  buttonLabelSecondary: { color: color.ink },
  buttonLabelDanger: { color: color.danger },

  action: {
    width: ACTION_TOUCH,
    height: ACTION_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPass: {
    backgroundColor: color.background,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  actionLike: { backgroundColor: color.ember },
  actionGlyph: {
    fontSize: 26,
    lineHeight: 30,
    color: color.inkMuted,
  },
  actionGlyphLike: { color: color.onEmber },

  field: { gap: spacing.xs },
  fieldHint: {
    fontFamily: fontFamily.body,
    color: color.inkMuted,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  fieldLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.inkMuted,
  },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
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
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  badgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 3,
  },
  ribbonInline: { backgroundColor: color.surface },
  ribbonOnPhoto: { backgroundColor: 'rgba(25, 16, 22, 0.78)' },
  ribbonDot: { width: 7, height: 7, borderRadius: radius.pill },
  ribbonText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.3,
    color: color.ink,
  },
  ribbonTextOnPhoto: { color: color.onPhoto },

  photoFrame: {
    width: '100%',
    aspectRatio: 4 / 5,
  },
  photoFrameEmpty: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.veil,
  },
  photoFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
  photoInitial: {
    fontFamily: fontFamily.display,
    fontSize: 128,
    lineHeight: 140,
    // 3.6:1 on the veil. Quiet, but a person can actually see it — white on
    // veil read as a rendering failure rather than a placeholder.
    color: '#C9B9BC',
  },
  photoOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
  },

  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.veil,
    overflow: 'hidden',
  },
  avatarMd: { width: 56, height: 56, borderRadius: radius.pill },
  avatarLg: { width: 120, height: 120, borderRadius: radius.pill },
  avatarImage: { resizeMode: 'cover' },
  avatarInitial: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.inkMuted,
  },

  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyGlyph: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 40,
    color: color.veil,
  },

  notice: {
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  noticeError: { backgroundColor: color.emberSoft },
  noticeSuccess: { backgroundColor: color.surface },
  noticeErrorText: { color: color.emberDeep },

  rule: { height: 1, backgroundColor: color.veil },
});
