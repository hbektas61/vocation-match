import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
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
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COPY, upperCase } from '../copy';
import { ProfileRing } from './ProfileRing';

import {
  ACTION_TOUCH,
  color,
  elevation,
  font,
  fontFamily,
  gradient,
  MIN_TOUCH,
  overlay,
  radius,
  roomTone,
  spacing,
} from '../theme';

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
  /**
   * Lets the content own the whole screen when it is shorter than one.
   *
   * A scroll view's content container is content-height by default, so a
   * short screen stacks from the top and leaves whatever is left over as a
   * void underneath. That is right for a list and wrong for an empty state,
   * which is a composition and wants to sit in the middle of what it has.
   *
   * Opt-in rather than default: it only changes anything for a child that
   * asks to grow, but every scrolling screen shares this container and a
   * silent layout change is not worth the convenience.
   */
  fill = false,
  /**
   * A screen that is a white sheet rather than the cream ground: the chat,
   * and anything presented modally over another screen.
   */
  tone = 'ground',
  testID,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  bleed?: boolean;
  resetScrollOnFocus?: boolean;
  safeTop?: boolean;
  fill?: boolean;
  tone?: 'ground' | 'sheet';
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
      contentContainerStyle={[
        bleed ? styles.screenBleed : styles.screenContent,
        fill && styles.screenFill,
      ]}
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
    <SafeAreaView
      style={[styles.screen, tone === 'sheet' && styles.screenSheet]}
      edges={safeTop ? ['top', 'bottom'] : ['bottom']}
      testID={testID}
    >
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
        // Outlined rather than filled, now that the brand itself is coral: two
        // solid red buttons on one screen, one of which deletes an account,
        // would be the same shout for two very different things.
        variant === 'danger' && styles.buttonDanger,
        (disabled || busy) && styles.buttonDisabled,
        pressed && !disabled && !busy && variant === 'primary' && styles.buttonPrimaryPressed,
        pressed && !disabled && !busy && variant !== 'primary' && styles.buttonPressed,
        // The spring under the thumb (owner, 2026-08-04): every button gives
        // the same slight, immediate acknowledgement.
        pressed && !disabled && !busy && styles.buttonSpring,
      ]}
    >
      <View style={styles.buttonInner}>
        {busy ? (
          <Spinner size={16} tone={variant === 'primary' ? color.onAccent : color.inkMuted} />
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
      </View>
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
 * - **Focus.** D-058's ground is light, so the focus state is drawn in the
 *   brand's dark sibling (6.5:1 on white) rather than the coral itself, which
 *   is 2.99:1 there and would be a focus ring a good number of people simply
 *   cannot see. Colour is not asked to carry it alone either: the border
 *   thickens and the box takes the brand wash, so weight and fill say the same
 *   thing.
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
    /** The search shape: a full-round white pill instead of the squared box. */
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
          placeholderTextColor={color.inkFaint}
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
      {hint ? <Text style={[styles.fieldHint, invalid && styles.fieldHintInvalid]}>{hint}</Text> : null}
    </View>
  );
}

/**
 * The signature object: a hotel key card.
 *
 * A rounded panel crossed near the top by one flat band — the magstripe, the
 * most touched object in the product's world. A coral band is an open door; a
 * hollow hairline band is a closed one. Deliberately nothing else of the
 * artefact is drawn (no chip, no hologram): one band keeps it a reference
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
 * Open / closed, as a word with a mark: a dot and the word, dark green and
 * semibold when live, muted when shut — the word is the first signal, the dot
 * the second.
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
 * checkbox whose only "on" signal is a pale coral square is one a lot of
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
  /** `flat` drops the lift for a card nested inside another surface. */
  tone = 'raised',
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'raised' | 'flat' | 'brand';
  testID?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        tone === 'flat' && styles.cardFlat,
        tone === 'brand' && styles.cardBrand,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/**
 * A selectable pill: a filter, an interest, a room mode.
 *
 * Selected is three signals deep — the wash fills, the label goes coral and
 * semibold, and `accessibilityState` says so — because the brief's own rule is
 * that colour never carries a state alone.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const content = (
    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected, disabled && styles.chipLabelDisabled]}>
      {label}
    </Text>
  );
  if (!onPress) {
    return (
      <View style={[styles.chip, selected && styles.chipSelected]} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

/**
 * The compact deep plate that keeps a screen's context visible: the venue,
 * the event, the place you checked into. Deep navy with cream type, so it
 * reads as a fixed piece of chrome rather than another card.
 */
export function ContextRibbon({
  label,
  glyph,
  right,
  testID,
}: {
  label: string;
  /** A small mark before the label. Decorative — the label carries the meaning. */
  glyph?: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.contextRibbon} testID={testID} accessible accessibilityRole="text" accessibilityLabel={label}>
      {glyph ? (
        <Text style={styles.contextRibbonGlyph} accessibilityElementsHidden importantForAccessibility="no">
          {glyph}
        </Text>
      ) : null}
      <Text style={styles.contextRibbonText} numberOfLines={1}>
        {label}
      </Text>
      {right}
    </View>
  );
}

/**
 * Premium, as a plate rather than a colour: pale sand with dark gold type.
 * The metal on its own is 2.1:1 on white and could not carry the word.
 */
export function PremiumBadge({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.premiumBadge} testID={testID} accessible accessibilityRole="text" accessibilityLabel={label}>
      <Text style={styles.premiumBadgeGlyph} accessibilityElementsHidden importantForAccessibility="no">
        ★
      </Text>
      <Text style={styles.premiumBadgeText}>{upperCase(label)}</Text>
    </View>
  );
}

/** A confirmed fact: pale green, dark green type, and a tick that is not the colour. */
export function SuccessBadge({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.successBadge} testID={testID} accessible accessibilityRole="text" accessibilityLabel={label}>
      <Text style={styles.successBadgeGlyph} accessibilityElementsHidden importantForAccessibility="no">
        ✓
      </Text>
      <Text style={styles.successBadgeText}>{label}</Text>
    </View>
  );
}

/**
 * The fixed readability scrim under anything printed on a photograph. A photo
 * can be any brightness, so the text over it is only safe if the darkness is
 * drawn rather than hoped for.
 */
export function PhotoScrim({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={[...gradient.photoScrim]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[StyleSheet.absoluteFillObject, style]}
      pointerEvents="none"
    />
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
      <Text style={styles.ribbonText} numberOfLines={1}>
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

/**
 * Nothing here yet, said as a card rather than as a hole.
 *
 * D-058's rule: an empty state keeps the same hierarchy a full one has — a
 * surface, a mark, a sentence — because a centred line of grey text in forty
 * points of dead space reads as a screen that failed to load.
 */
export function EmptyState({
  message,
  /** The one thing worth doing from here, when there is one. */
  action,
  /**
   * Off when the screen already carries its own drawing.
   *
   * The generic disc is a stand-in for a picture, and a stand-in beside the
   * real thing is just two marks stacked — which is exactly what the empty
   * inbox looked like once R-009 put a drawing above this card.
   */
  mark = true,
  testID,
}: {
  message: string;
  action?: React.ReactNode;
  mark?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.empty} accessibilityRole="text" testID={testID}>
      {mark ? (
        <View style={styles.emptyMark}>
          <Text style={styles.emptyGlyph} accessibilityElementsHidden importantForAccessibility="no">
            ·
          </Text>
        </View>
      ) : null}
      <Text style={styles.emptyText}>{message}</Text>
      {action}
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
 *
 * Each tone carries a glyph as well as a fill: on a light ground a pale green
 * and a pale red panel are close enough in value that the fill alone is not a
 * signal for everybody.
 */
/**
 * A blocking question over a dimmed screen (owner, 2026-08-03): destructive
 * confirmations pop rather than growing under the button that opened them —
 * an inline card below the fold was a question half the screen never saw.
 * The scrim press and the hardware back both mean "no".
 */
/**
 * The one spinner (owner, 2026-08-04): a coral arc turning at the same pace
 * everywhere, instead of each screen borrowing the platform's grey dots at
 * whatever size it happened to pick. Decorative by itself — the accessible
 * name lives on the `Loading` wrapper, or on the control that is busy.
 */
export function Spinner({ size = 28, tone = color.accent }: { size?: number; tone?: string }) {
  const turn = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Decoration only: under jest the loop is pure timer churn that slowed
    // whole parallel runs into timeouts, so it simply does not start there.
    if (process.env.NODE_ENV === 'test') return;
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={{ width: size, height: size, transform: [{ rotate }] }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={tone}
        strokeWidth={2.6}
        strokeLinecap="round"
      >
        <Path d="M12 2.5a9.5 9.5 0 1 1-9.5 9.5" />
      </Svg>
    </Animated.View>
  );
}

/**
 * A breathing placeholder block (owner, 2026-08-04): lists wait as the shape
 * of their content rather than as an arc in a void — the screen reads as
 * "almost here" instead of "empty".
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Same rule as the Spinner: decorative motion sits out the test runner.
    if (process.env.NODE_ENV === 'test') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });
  return <Animated.View style={[styles.skeletonBase, style, { opacity }]} />;
}

/** A list waiting as rows — a disc and two lines, repeated. */
export function SkeletonRows({
  rows = 3,
  avatar = true,
  testID,
}: {
  rows?: number;
  avatar?: boolean;
  testID?: string;
}) {
  return (
    <View
      style={styles.skeletonList}
      accessibilityRole="progressbar"
      accessibilityLabel={COPY.common.loading}
      testID={testID}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          {avatar ? <Skeleton style={styles.skeletonDisc} /> : null}
          <View style={styles.skeletonLines}>
            <Skeleton style={styles.skeletonLineWide} />
            <Skeleton style={styles.skeletonLineNarrow} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A card-shaped wait — the hero that is about to be there. */
export function SkeletonCard({
  height = 300,
  fill = false,
  testID,
}: {
  height?: number;
  /** Own the whole remaining screen, the way the deck's card does. */
  fill?: boolean;
  testID?: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={COPY.common.loading}
      style={fill ? styles.skeletonFill : undefined}
      testID={testID}
    >
      <Skeleton style={fill ? styles.skeletonFillInner : [styles.skeletonCard, { height }]} />
    </View>
  );
}

/** A waiting state, said once and the same way on every screen. */
export function Loading({
  label,
  testID,
}: {
  /** Spoken and shown under the arc; defaults to the shared "Loading…". */
  label?: string;
  testID?: string;
}) {
  return (
    <View
      style={styles.loading}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? COPY.common.loading}
      testID={testID}
    >
      <Spinner />
    </View>
  );
}

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
  testID,
  confirmTestID,
  cancelTestID,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
  confirmTestID?: string;
  cancelTestID?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={styles.dialogScrim}
        onPress={busy ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      >
        {/* The card swallows the press so only the scrim cancels. */}
        <Pressable style={styles.dialogCard} onPress={() => {}} testID={testID}>
          <Text accessibilityRole="header" style={styles.dialogTitle}>
            {title}
          </Text>
          <Text style={styles.dialogBody}>{body}</Text>
          <Button
            label={confirmLabel}
            variant="danger"
            busy={busy}
            disabled={busy}
            onPress={onConfirm}
            testID={confirmTestID}
          />
          <Button
            label={cancelLabel}
            variant="secondary"
            disabled={busy}
            onPress={onCancel}
            testID={cancelTestID}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
      <Text
        style={[
          styles.noticeGlyph,
          tone === 'error' && styles.noticeGlyphError,
          tone === 'success' && styles.noticeGlyphSuccess,
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i'}
      </Text>
      <Text
        style={[
          styles.noticeText,
          tone === 'error' && styles.noticeErrorText,
          tone === 'success' && styles.noticeSuccessText,
        ]}
      >
        {message}
      </Text>
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
  screenSheet: { backgroundColor: color.surface },
  /** The screen shell: 20 aside, 24 above, 16 below, 14 between. */
  screenContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: spacing.md, gap: 14 },
  buttonSpring: { transform: [{ scale: 0.97 }] },
  /** The breathing placeholders. */
  skeletonBase: { backgroundColor: color.veil, borderRadius: 8 },
  skeletonList: { gap: 14 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonDisc: { width: 48, height: 48, borderRadius: 24 },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLineWide: { height: 14, borderRadius: 7, width: '72%' },
  skeletonLineNarrow: { height: 11, borderRadius: 5.5, width: '44%' },
  skeletonCard: { borderRadius: 24, width: '100%' },
  skeletonFill: { flex: 1 },
  skeletonFillInner: { flex: 1, borderRadius: 0 },
  /** The shared waiting state: centred, with air around it. */
  loading: { alignItems: 'center', paddingVertical: spacing.lg },
  /** The dimmed ground under a blocking question. */
  dialogScrim: {
    flex: 1,
    backgroundColor: overlay.photo,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    backgroundColor: color.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dialogTitle: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    lineHeight: 25,
    color: color.ink,
  },
  dialogBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    color: color.inkMuted,
  },
  screenBleed: { paddingBottom: spacing.xl, gap: 14 },
  /** `fill`: at least the height of the scroll view, never less than content. */
  screenFill: { flexGrow: 1 },

  /** The head: title left, 46 ring right, centred on it. */
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  screenHeaderTitle: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontWeight: '700',
    fontSize: 32,
    lineHeight: 32 * 1.2,
    color: color.ink,
  },

  display: {
    fontFamily: fontFamily.display,
    fontWeight: '700',
    fontSize: font.display,
    lineHeight: font.display * 1.2,
    color: color.ink,
  },
  title: {
    fontFamily: fontFamily.display,
    fontWeight: '700',
    fontSize: font.title,
    lineHeight: font.title * 1.2,
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
    paddingVertical: 14,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: { paddingHorizontal: spacing.sm },
  /**
   * Flat coral with a navy label — 5.71:1. White is not an option here: the
   * brand coral carries white at 2.99:1, under even the 3:1 large-text floor,
   * and D-058 asks for a CTA whose contrast is verified rather than assumed.
   */
  buttonPrimary: {
    backgroundColor: color.accent,
    ...elevation.card,
    shadowColor: color.accent,
    shadowOpacity: 0.28,
  },
  buttonPrimaryPressed: { backgroundColor: color.accentPressed, shadowOpacity: 0.16 },
  buttonSecondary: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  buttonDanger: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.danger,
  },
  /**
   * A real state rather than a fade: the fill goes flat and neutral and the
   * label goes grey, so it reads as unavailable without becoming a label
   * nobody can make out.
   */
  buttonDisabled: {
    backgroundColor: color.veil,
    borderColor: color.rule,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonLabelDisabled: { color: color.inkFaint },
  actionDisabled: { opacity: 0.45 },
  buttonPressed: { backgroundColor: color.veil },
  buttonLabel: {
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
    ...elevation.card,
  },
  actionPass: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.rule,
  },
  actionLike: {
    backgroundColor: color.accent,
    borderWidth: 1.5,
    borderColor: color.accent,
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
  fieldHintInvalid: { color: color.danger },
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
  /** The search shape: a white pill on the cream ground. */
  inputShellPill: {
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  /** A composer grows downward, so its text starts at the top and stays there. */
  inputShellMultiline: { alignItems: 'stretch', paddingVertical: spacing.sm },
  /**
   * Focus, in the brand's dark sibling rather than the coral itself — the
   * coral is 2.99:1 on white and would be a state some people cannot see.
   * Weight and fill say it too, so no one signal has to carry it.
   */
  inputShellFocused: {
    borderColor: color.focus,
    borderWidth: 2.5,
    backgroundColor: color.accentWash,
  },
  inputShellInvalid: { borderColor: color.danger, backgroundColor: color.dangerSoft },
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
   * White on cream: the card is told apart from the ground by a quiet edge and
   * a soft lift rather than by a different fill. Neither alone is enough at
   * 375pt — the border is deliberately quiet and the shadow disappears on
   * Android without `elevation`.
   */
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...elevation.card,
  },
  cardFlat: { ...elevation.none, backgroundColor: color.veil, borderColor: color.rule },
  cardBrand: { backgroundColor: color.accentWash, borderColor: color.rule },

  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: { backgroundColor: color.ink, borderColor: color.ink },
  chipDisabled: { backgroundColor: color.veil, borderColor: color.rule },
  chipLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption + 1,
    color: color.ink,
  },
  chipLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.onInverse },
  chipLabelDisabled: { color: color.inkFaint },

  contextRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.pill,
    backgroundColor: color.inverse,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 1,
  },
  contextRibbonGlyph: { fontSize: font.caption, color: color.accent },
  contextRibbonText: {
    flexShrink: 1,
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.onInverse,
  },

  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: color.premiumSoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
  },
  premiumBadgeGlyph: { fontSize: font.label, color: color.premium },
  premiumBadgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label - 1,
    letterSpacing: 0.8,
    color: color.premium,
  },

  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
  },
  successBadgeGlyph: { fontSize: font.label, color: color.success },
  successBadgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.success,
  },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  keyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    overflow: 'hidden',
    ...elevation.card,
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
  stateChipText: {
    fontSize: 11,
    lineHeight: 14,
  },
  stateChipTextOpen: { fontFamily: fontFamily.bodySemi, color: color.success },
  stateChipTextClosed: { fontFamily: fontFamily.bodyMedium, color: color.inkMuted },
  stateDot: { width: 6, height: 6, borderRadius: radius.pill },
  stateDotOpen: { backgroundColor: color.successMark },
  stateDotClosed: { backgroundColor: color.inkFaint },
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
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxOn: { backgroundColor: color.accent, borderColor: color.accent },
  checkboxMark: { color: color.onAccent, fontSize: 14, lineHeight: 16, fontWeight: '900' },
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
    maxWidth: '100%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 3,
  },
  /** Inline and on a photo are the same deep plate, so the pair reads as one thing. */
  ribbonInline: { backgroundColor: color.inverse },
  ribbonOnPhoto: { backgroundColor: overlay.plate },
  ribbonDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  ribbonDotOpen: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: color.onInverse,
  },
  ribbonText: {
    flexShrink: 1,
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.3,
    color: color.onInverse,
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
    fontWeight: '700',
    fontSize: font.heading,
    color: color.inkMuted,
  },

  empty: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...elevation.card,
  },
  emptyMark: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGlyph: {
    fontFamily: fontFamily.display,
    fontWeight: '700',
    fontSize: 34,
    lineHeight: 38,
    color: color.ink,
  },
  emptyText: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.45,
    color: color.inkMuted,
    textAlign: 'center',
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: color.infoSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  noticeError: { backgroundColor: color.dangerSoft },
  noticeSuccess: { backgroundColor: color.successSoft },
  noticeGlyph: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    lineHeight: font.body * 1.45,
    color: color.inkMuted,
  },
  noticeGlyphError: { color: color.danger },
  noticeGlyphSuccess: { color: color.success },
  noticeText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.45,
    color: color.inkMuted,
  },
  noticeErrorText: { color: color.danger },
  noticeSuccessText: { color: color.success },

  rule: { height: 1, backgroundColor: color.rule },
});
