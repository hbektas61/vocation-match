import { LinearGradient } from 'expo-linear-gradient';
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
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COPY, upperCase } from '../copy';
import { ProfileRing } from './ProfileRing';

import {
  ACTION_TOUCH,
  color,
  font,
  fontFamily,
  MIN_TOUCH,
  radius,
  roomTone,
  spacing,
  gradient, glass, backgroundGradient } from '../theme';

export function Screen({
  children,
  scroll = true,
  /** Lets a screen run its own content to the edges — a photo, mostly. */
  bleed = false,
  /**
   * Tabs stay mounted, so a screen navigated *to* opens wherever it was
   * left. The rooms after choosing a hotel must open at the top instead.
   */
  resetScrollOnFocus = false,
  /**
   * On for every screen that has no native header over it — the five tabs,
   * and bootstrap. A screen under a stack header must leave this off: the
   * header already consumes the status-bar inset, and taking it again pushes
   * the content down twice. Off by default because forgetting it under a
   * header is invisible, while forgetting it on a tab puts the title under
   * the clock — which is exactly how this prop got here.
   */
  safeTop = false,
  testID,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  bleed?: boolean;
  resetScrollOnFocus?: boolean;
  safeTop?: boolean;
  testID?: string;
}) {
  const scrollRef = React.useRef<ScrollView>(null);
  useFocusEffect(
    React.useCallback(() => {
      if (resetScrollOnFocus) scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [resetScrollOnFocus]),
  );
  // The keyboard must never sit on top of what it is for. Scrolling screens
  // let iOS inset the scroll view so the focused field rides above the
  // keyboard; fixed screens (the chat, with its composer pinned to the
  // bottom) get the padding treatment instead. Android resizes the window
  // itself, which is why both branches are iOS-only.
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={bleed ? styles.screenBleed : styles.screenContent}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {children}
    </ScrollView>
  ) : (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[bleed ? styles.screenBleed : styles.screenContent, styles.flex]}>{children}</View>
    </KeyboardAvoidingView>
  );
  return (
    <SafeAreaView style={styles.screen} edges={safeTop ? ['top', 'bottom'] : ['bottom']} testID={testID}>
      <LinearGradient
        colors={[...backgroundGradient]}
        locations={[0, 0.45, 0.78, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {content}
    </SafeAreaView>
  );
}

/** The largest thing on a screen: a name, or the screen's own subject. */
export function Display({
  children,
  tone = 'ink',
}: {
  children: React.ReactNode;
  /** `onPhoto` when the text sits on a photograph, over the scrim. */
  tone?: 'ink' | 'onPhoto';
}) {
  return (
    <Text accessibilityRole="header" style={[styles.display, tone === 'onPhoto' && styles.displayOnPhoto]}>
      {children}
    </Text>
  );
}

/**
 * A primary screen's head: the title, and the ring to yourself on the right.
 *
 * D-057 made this a shape worth naming. Before it, three screens each drew the
 * pair by hand and two more drew only the title — which is how Etkinlikler and
 * Keşfet ended up with no route to Settings at all once the tab was removed.
 */
export function ScreenHeader({
  title,
  /** The right slot, for a screen whose corner does a more useful job. */
  right,
  /** Names this screen's ring, so a test can press the one it is looking at. */
  ringTestID,
  testID,
}: {
  title: string;
  right?: React.ReactNode;
  ringTestID?: string;
  testID?: string;
}) {
  return (
    <View style={styles.screenHeader} testID={testID}>
      <Text accessibilityRole="header" style={styles.screenHeaderTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <ProfileRing testID={ringTestID} />}
    </View>
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

export function Body({
  children,
  numberOfLines,
}: {
  children: React.ReactNode;
  /** For previews: a preview that wraps to four lines is not a preview. */
  numberOfLines?: number;
}) {
  return (
    <Text style={styles.body} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
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
      {typeof children === 'string' ? upperCase(children) : children}
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
      {({ pressed }) => (
        <>
          {variant === 'primary' && !disabled && !busy ? (
            // The owner's gradient (D-043): gold into pink, the pressed state
            // its lighter ramp. Behind the label, inside the pill's clip.
            <LinearGradient
              colors={[...(pressed ? gradient.primaryPressed : gradient.primary)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          ) : null}
          <Text
        style={[
          styles.buttonLabel,
          compact && styles.buttonLabelCompact,
          variant === 'primary' && styles.buttonLabelOnColor,
          variant === 'secondary' && styles.buttonLabelSecondary,
          variant === 'danger' && styles.buttonLabelDanger,
          // Last, so it wins over the variant colour.
          (disabled || busy) && styles.buttonLabelDisabled,
        ]}
          >
            {label}
          </Text>
        </>
      )}
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
        // A glyph, not a label: fading it is legible in a way faded text is not.
        disabled && styles.actionDisabled,
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
/**
 * Every bordered single-line input in the app.
 *
 * Two things here are the whole reason it exists rather than each screen
 * rolling its own `TextInput`:
 *
 * - **Focus.** The owner asked for the focused border to be exactly the brand
 *   lavender, and it is. But that colour is 1.55:1 against white, well under
 *   the 3:1 WCAG 1.4.11 wants from the thing marking a control — so on its own
 *   it would be a focus state a good number of people simply cannot see. The
 *   exact colour is kept and given a companion: the border thickens, and a
 *   ring in the darker sibling (5.96:1) is drawn outside it. Colour, weight
 *   and a second edge, so no one signal has to carry it.
 * - **Vertical centring.** Android puts extra room under the baseline and
 *   top-aligns the text in a fixed-height box, which is what made every field
 *   look like the text had been pushed up against the ceiling.
 *   `textAlignVertical` and `includeFontPadding` are the two knobs for it, and
 *   they are Android-only; iOS gets there through symmetric padding instead.
 *   Horizontal alignment is deliberately untouched — text stays left.
 *
 * A caller's own `onFocus`, `onBlur` and `style` are honoured rather than
 * swallowed, because a field that quietly drops the handler you passed it is
 * worse than one that never offered the prop.
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
    /** Marks the field as the one an error is about, and draws it that way. */
    invalid?: boolean;
    /** Rendered inside the box, before the text. The `+90` on the phone step. */
    prefix?: React.ReactNode;
    /**
     * The Figma search shape (10:77): a full-round glass pill with the pink
     * edge at half strength, instead of the squared panel input.
     */
    pill?: boolean;
  },
) {
  const { label, hint, hideLabel, invalid, prefix, pill, style, onFocus, onBlur, ...inputProps } = props;
  const [focused, setFocused] = useState(false);
  const multiline = inputProps.multiline === true;

  return (
    <View style={styles.field}>
      {hideLabel ? null : <Text style={styles.fieldLabel}>{upperCase(label)}</Text>}
      <View
        // The box carries the border, so the border is only assertable if the
        // box can be found.
        testID={inputProps.testID ? `${inputProps.testID}-box` : undefined}
        style={[
          styles.inputShell,
          pill && styles.inputShellPill,
          multiline && styles.inputShellMultiline,
          focused && styles.inputShellFocused,
          invalid && styles.inputShellInvalid,
        ]}
      >
        {prefix}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={color.inkMuted}
          underlineColorAndroid="transparent"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          {...inputProps}
        />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * The signature object: a hotel key card.
 *
 * A rounded panel crossed near the top by one flat band — the magstripe, the
 * most touched object in the product's world. A lavender band is an open
 * door; a hollow hairline band is a closed one. Deliberately nothing else of
 * the artefact is drawn (no chip, no hologram): one band keeps it a reference
 * rather than a costume. Used in exactly two places — the rooms, and the
 * match moment — so it stays a signature rather than wallpaper.
 */
export function KeyCard({
  open,
  children,
  testID,
}: {
  /** Whether this door is open. The band shows it; the content must say it too. */
  open: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.keyCard} testID={testID}>
      <View style={[styles.keyStripe, open ? styles.keyStripeOpen : styles.keyStripeClosed]} />
      <View style={styles.keyBody}>{children}</View>
    </View>
  );
}

/**
 * Open / closed, as a word with a mark. The Figma pair (10:89/10:127) wears
 * no container at all: a dot and the word, green and semibold when live,
 * muted when shut — the word is the first signal, the dot the second.
 */
export function StateChip({ open, label, testID }: { open: boolean; label: string; testID?: string }) {
  return (
    <View
      style={styles.stateChip}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={[styles.stateDot, open ? styles.stateDotOpen : styles.stateDotClosed]} />
      <Text style={[styles.stateChipText, open ? styles.stateChipTextOpen : styles.stateChipTextClosed]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The small plate a hotel screws beside a door: the room's name, tracked and
 * quiet. Structure, never prose.
 */
export function DoorPlate({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.doorPlate}>
      {typeof children === 'string' ? upperCase(children) : children}
    </Text>
  );
}

/**
 * A labelled checkbox.
 *
 * The box is drawn rather than imported so the checked state is a mark and a
 * fill, not a tint — the brand colour cannot carry a state on its own, and a
 * checkbox whose only "on" signal is a pale lavender square is one a lot of
 * people would read as off.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  testID,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      hitSlop={8}
      style={styles.checkboxRow}
      testID={testID}
    >
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxOn]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
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
  // The label already says which room this is; the fill and the edge are the
  // second and third signals, never the first. Here Now takes the brand fill,
  // Upcoming stays open with a drawn edge, so the pair survives being seen by
  // someone who cannot separate the two hues.
  const room = tone === 'hereNow' ? roomTone.HERE_NOW : roomTone.UPCOMING;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: room.fill },
        room.solid ? null : styles.badgeOpen,
      ]}
    >
      <Text style={[styles.badgeText, { color: room.text }]}>{upperCase(label)}</Text>
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
  /** Null while the card carrying it has not been fetched yet. */
  hotelName: string | null;
  onPhoto?: boolean;
  testID?: string;
}) {
  const state = room === 'HERE_NOW' ? COPY.rooms.hereNowPlate : COPY.rooms.upcomingPlate;
  return (
    <View
      style={[styles.ribbon, onPhoto ? styles.ribbonOnPhoto : styles.ribbonInline]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={hotelName ? `${state} at ${hotelName}` : state}
      testID={testID}
    >
      {/* Filled for Here Now, a hollow ring for Upcoming. The word beside it
          already carries the meaning; this is so the two are still a pair when
          the colours are not doing any work. */}
      <View style={[styles.ribbonDot, room === 'UPCOMING' && styles.ribbonDotOpen]} />
      <Text style={[styles.ribbonText, onPhoto && styles.ribbonTextOnPhoto]} numberOfLines={1}>
        {hotelName ? `${state.toUpperCase()} · ${hotelName.toUpperCase()}` : state.toUpperCase()}
      </Text>
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

export function EmptyState({ message, testID }: { message: string; testID?: string }) {
  return (
    <View style={styles.empty} accessibilityRole="text" testID={testID}>
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
 * the reverse gap is just as bad: tapping "send a new code", hearing
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
 * does not. So swapping the phone form for "enter the code" leaves a
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
  /** The Figma screen shell (10:71/10:111): 20 aside, 24 above, 16 below, 14 between. */
  screenContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: spacing.md, gap: 14 },
  screenBleed: { paddingBottom: spacing.xl, gap: 14 },

  /** The Figma head (10:74/12:167): title left, 46 ring right, centred on it. */
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  screenHeaderTitle: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 34 * 1.15,
    color: color.ink,
  },

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
    color: color.inkMuted,
  },

  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    // The Figma action (10:92): 14 above and below the label.
    paddingVertical: 14,
  },
  buttonCompact: { paddingHorizontal: spacing.sm },
  /**
   * The brand fill with a dark label on it — 11.68:1 — rather than white,
   * which the lavender cannot carry. The border is the darker sibling at
   * 5.96:1 on white, because the fill alone is 1.55:1 and a primary action
   * whose edge nobody can find is not a primary action.
   */
  buttonPrimary: {
    // The gradient is painted inside; the fill is its fallback frame and the
    // clip that keeps it a pill.
    backgroundColor: color.accent,
    overflow: 'hidden',
    shadowColor: '#FB7185',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buttonSecondary: {
    backgroundColor: glass.fill,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.5)',
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: color.danger,
  },
  /**
   * A real state rather than a fade. Half-opacity white on ocean measured
   * 1.99:1 — the label of a button somebody is being asked to read and act on.
   * This is 4.61:1, and it still reads as unavailable because the fill is flat
   * and the label is grey.
   */
  buttonDisabled: { backgroundColor: color.accentSoft, borderColor: color.border, shadowOpacity: 0, elevation: 0 },
  buttonLabelDisabled: { color: color.inkMuted },
  actionDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  buttonLabel: {
    // The Figma label (10:93): semibold at 15, which the warm gradient can
    // carry now that the ink on it is dark rather than white.
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  buttonLabelCompact: { fontSize: font.caption + 1, letterSpacing: 0 },
  buttonLabelOnColor: { color: color.onAccent },
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
    borderColor: 'rgba(236, 72, 153, 0.35)',
  },
  actionLike: {
    backgroundColor: color.accent,
    borderWidth: 1.5,
    borderColor: color.accentDeep,
  },
  actionGlyph: {
    fontSize: 26,
    lineHeight: 30,
    color: color.inkMuted,
  },
  actionGlyphLike: { color: color.onAccent },

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
    color: color.inkMuted,
  },
  /**
   * The box. It owns the border and the height so the `TextInput` inside can
   * be a plain line of text that centres itself, which is the only arrangement
   * that behaves the same on both platforms.
   */
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: color.surface,
  },
  /** The Figma search pill (10:77): glass fill, half-pink edge at 1.2. */
  inputShellPill: {
    borderRadius: radius.pill,
    backgroundColor: glass.fill,
    borderWidth: 1.2,
    borderColor: 'rgba(236, 72, 153, 0.5)',
  },
  /** A composer grows downward, so its text starts at the top and stays there. */
  inputShellMultiline: { alignItems: 'stretch', paddingVertical: spacing.sm },
  /**
   * The exact colour the owner asked for, on the border and only on the border
   * — the owner tried the filled version and asked for it to go. What keeps
   * the state perceivable without the fill is the weight: 1.5 to 2.5 is a
   * visible change even for someone the hue does not register for.
   */
  inputShellFocused: {
    borderColor: color.accent,
    borderWidth: 2.5,
  },
  inputShellInvalid: { borderColor: color.danger },
  input: {
    flex: 1,
    paddingHorizontal: 0,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    // No lineHeight on purpose: a single-line TextInput on a real iPhone
    // draws a set lineHeight asymmetrically and the text slides off the
    // vertical centre — which is exactly the "+90 and the number are not on
    // one line" the owner kept seeing. The shell centres the natural line.
    color: color.ink,
    // Android top-aligns inside a fixed-height box and reserves room under the
    // baseline; both are why the text sat against the ceiling. iOS ignores
    // these and is centred by the shell instead — once its own default
    // vertical padding is removed.
    textAlignVertical: 'center',
    includeFontPadding: false,
    paddingVertical: 0,
  },
  /** A paragraph reads from the top, however tall the box has grown. */
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: MIN_TOUCH * 2,
    // A paragraph does want breathing room between lines; only the
    // single-line case cannot afford it.
    lineHeight: font.body * 1.3,
  },

  /**
   * The surface and the ground are both white now, so a card is told apart by
   * its edge and its lift rather than by its fill. Neither alone was enough at
   * 375pt: the border is quiet by design and the shadow disappears on Android
   * without `elevation`.
   */
  card: {
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  keyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  keyStripe: { height: 14, marginTop: spacing.md },
  keyStripeOpen: { backgroundColor: color.accent },
  keyStripeClosed: {
    backgroundColor: 'transparent',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: color.rule,
  },
  keyBody: { padding: spacing.md, gap: spacing.sm },
  stateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  /* The Figma pair (10:89/10:127): no pill, no border — "● Açık" in the live
     green, "● Kapalı" in the muted line colour, both at 11. */
  stateChipText: {
    fontSize: 11,
    lineHeight: 14,
  },
  stateChipTextOpen: { fontFamily: fontFamily.bodySemi, color: '#34D399' },
  stateChipTextClosed: { fontFamily: fontFamily.bodyMedium, color: color.inkMuted },
  stateDot: { width: 6, height: 6, borderRadius: radius.pill },
  stateDotOpen: { backgroundColor: '#34D399' },
  stateDotClosed: { backgroundColor: color.inkMuted },
  doorPlate: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.6,
    color: color.inkMuted,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    // A control has to look pressable while unchecked; the hairline tint is
    // too quiet for that job.
    borderColor: color.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxOn: { backgroundColor: color.accent, borderColor: color.accentDeep },
  checkboxMark: { color: color.ink, fontSize: 14, lineHeight: 16, fontWeight: '900' },
  checkboxLabel: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  badgeOpen: { borderWidth: 1.5, borderColor: color.border },
  badgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1,
  },

  displayOnPhoto: { color: color.onPhoto },
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
  ribbonDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.accentDeep,
  },
  ribbonDotOpen: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: color.inkMuted,
  },
  ribbonText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.3,
    color: color.ink,
  },
  ribbonTextOnPhoto: { color: color.onPhoto },


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
  // 4.76:1 for the error text on it.
  noticeError: { backgroundColor: color.dangerSoft },
  noticeSuccess: { backgroundColor: color.accentSoft },
  noticeErrorText: { color: color.danger },

  rule: { height: 1, backgroundColor: color.rule },
});
