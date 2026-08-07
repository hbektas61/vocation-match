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
import Svg, { Circle, Path } from 'react-native-svg';
import Ghost from 'lucide-react-native/icons/ghost';
import Unplug from 'lucide-react-native/icons/unplug';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COPY, upperCase } from '../copy';
import { ProfileRing } from './ProfileRing';
import { VenueRibbon } from './VenueRibbon';

import {
  ACTION_TOUCH,
  color,
  elevation,
  font,
  fontFamily,
  gradient,
  leading,
  MIN_TOUCH,
  overlay,
  radius,
  roomTone,
  spacing,
  tracking,
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
 * A primary screen's head: the venue, the ring, and now the screen's own name
 * again.
 *
 * D-057 made this a shape worth naming. Before it, three screens each drew the
 * pair by hand and two more drew only the title — which is how Etkinlikler and
 * Keşfet ended up with no route to Settings at all once the tab was removed.
 *
 * D-061 took the title out of it (owner, 2026-08-07): the tab bar already said
 * which of the five you were on, so a 32pt word repeating it was the largest
 * thing on the screen. What took its place was the fact it was standing on —
 * the vacation venue this screen is scoped to.
 *
 * D-065 puts the word back, under the venue rather than instead of it: the
 * generated screens draw a title on every tab, and the owner's read of D-061
 * was "the ribbon should survive, not that a screen may never say its own
 * name." The announcement-on-focus stays exactly as it was — a screen that
 * stays mounted needs naming again on every visit, sight or no sight — it is
 * simply no longer the *only* way the name reaches anyone. A second row below
 * the venue/ring row carries the title, an optional subtitle under it, and an
 * optional action in the corner a title used to have nothing to share with.
 */
export function ScreenHeader({
  title,
  /** A line under the title — a sentence, not a second heading. */
  subtitle,
  /** The second row's right slot: a screen's one corner action, if it has one. */
  right,
  /** Off for a screen with nothing to scope — every primary tab has one now. */
  venue = true,
  /** Names this screen's ring, so a test can press the one it is looking at. */
  ringTestID,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  venue?: boolean;
  ringTestID?: string;
  testID?: string;
}) {
  // On focus rather than on mount: a tab stays mounted once visited, so a
  // mount-time announcement would name the screen the first time you opened it
  // and stay silent for every switch after — which is precisely the visit that
  // needs naming. Focus is the event that actually means "you are here now".
  useFocusEffect(
    React.useCallback(() => {
      AccessibilityInfo.announceForAccessibility(title);
    }, [title]),
  );
  return (
    <View style={styles.screenHead} testID={testID}>
      <View style={styles.screenHeadTop}>
        {venue ? <VenueRibbon /> : null}
        <ProfileRing testID={ringTestID} />
      </View>
      <View style={styles.screenHeadBottom}>
        <View style={styles.screenHeadTitleBlock}>
          <Text accessibilityRole="header" style={styles.screenHeadTitle}>
            {title}
          </Text>
          {subtitle ? (
            // Sentence case in the copy file, tracked structure on screen —
            // the same split `SectionLabel` draws, applied to a line whose job
            // is also to be found rather than read.
            <Text style={styles.screenHeadSubtitle}>{upperCase(subtitle)}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

/**
 * The way back, as the D-065 contract draws it everywhere it appears
 * (180:6460, 176:2384, 176:2419): a round white button that floats, with a
 * stroked chevron in it.
 *
 * It replaces the bare "←" and "‹" characters the flows had grown. A glyph
 * typed as text is a different weight, a different optical size and a
 * different vertical seat in every font on every platform, and it has no
 * target of its own — which is why the arrow on one screen looked nothing
 * like the arrow on the next.
 */
export function BackButton({
  onPress,
  label,
  testID,
}: {
  onPress: () => void;
  /** Defaults to the shared "Back"; pass one when it undoes something named. */
  label?: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? COPY.common.back}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
      testID={testID}
    >
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.ink}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="m15 5-7 7 7 7" />
      </Svg>
    </Pressable>
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
 * Tracked and uppercase. The only job is to name what follows — a section, a
 * state — so it is deliberately not usable for prose. Where a label appears,
 * the structure it marks should be real.
 *
 * D-060 took the capitals off, on the theory that tracked uppercase over a
 * block of content reads as a print eyebrow. D-064 puts them back for this
 * component specifically (the generated screens draw every section this way,
 * and the owner's read was that a label wants to be *found*, not read) — this
 * one clause of D-060 is superseded; the rest of it, sentence case on prose
 * and on button labels, is untouched.
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
 * - **Focus.** The ring is the brand coral on a white interior (owner,
 *   2026-08-05) — the wash-filled, dark-ringed box read as a different
 *   control from every other input on the screen. Coral alone is 2.99:1 on
 *   white, so colour is not asked to carry it by itself: the border thickens
 *   from 1.5 to 2.5, and weight says the same thing the colour does.
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
    /**
     * The onboarding shape (D-065, 180:6472): a box the height of the primary
     * action with a softer corner, so the one thing being asked for on the
     * screen is the size of the one thing offered at the bottom of it.
     */
    tall?: boolean;
  },
) {
  const { label, hint, hideLabel, invalid, prefix, pill, tall, style, onFocus, onBlur, ...inputProps } = props;
  const [focused, setFocused] = useState(false);
  const multiline = inputProps.multiline === true;

  return (
    <View style={styles.field}>
      {/* Sentence case (D-060): a label over an input is read, not indexed. */}
      {hideLabel ? null : <Text style={styles.fieldLabel}>{label}</Text>}
      <View
        // The box carries the border, so the border is only assertable if the
        // box can be found.
        testID={inputProps.testID ? `${inputProps.testID}-box` : undefined}
        style={[
          styles.inputShell,
          pill && styles.inputShellPill,
          tall && styles.inputShellTall,
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
          style={[styles.input, tall && styles.inputTall, multiline && styles.inputMultiline, style]}
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

/**
 * A published-or-not decision, as the card the D-065 contract draws for it
 * (180:6164 / 180:6361): the question on the left with its consequence
 * underneath, a switch on the right, and the whole card the target.
 *
 * It is a switch rather than a checkbox because that is what it is: a thing
 * about the profile that is on or off right now, not an item being ticked on
 * the way to submitting a form. The role goes with it, so assistive tech says
 * "on"/"off" rather than "checked"/"unchecked" — and the knob's *position*
 * carries the state as well as the fill, because a pale-versus-coral track is
 * not a state everybody can see.
 */
export function ToggleRow({
  label,
  caption,
  glyph,
  value,
  onChange,
  /** `flat` drops the lift for a row stacked inside a card that already floats. */
  tone = 'raised',
  testID,
}: {
  label: string;
  /** The quiet line under the question: what turning it on actually does. */
  caption?: string;
  /**
   * The contract's leading tile (176:4487): a 40pt rounded square with a 20pt
   * mark in it. Decorative — the label is the question, and the switch is the
   * answer; the tile is only there so a list of rows has a left edge.
   */
  glyph?: React.ReactNode;
  value: boolean;
  onChange: (next: boolean) => void;
  tone?: 'raised' | 'flat';
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={caption}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggleRow,
        tone === 'flat' && styles.toggleRowFlat,
        pressed && styles.togglePressed,
      ]}
      testID={testID}
    >
      {glyph ? (
        <View style={styles.toggleGlyph} accessibilityElementsHidden importantForAccessibility="no">
          {glyph}
        </View>
      ) : null}
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {caption ? <Text style={styles.toggleCaption}>{caption}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
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
  solid = false,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  selected?: boolean;
  /**
   * The filter-bar reading of "selected": the chip fills coral and its label
   * goes white, rather than taking the wash (owner's Events sheet,
   * 2026-08-05). Reserved for a row of chips that filters a list, where the
   * chosen one has to read as the switch that is on.
   */
  solid?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const chosen = selected && !disabled;
  const content = (
    <Text
      style={[
        styles.chipLabel,
        selected && (solid ? styles.chipLabelSolid : styles.chipLabelSelected),
        disabled && styles.chipLabelDisabled,
      ]}
    >
      {label}
    </Text>
  );
  if (!onPress) {
    return (
      <View
        style={[styles.chip, chosen && (solid ? styles.chipSolid : styles.chipSelected)]}
        testID={testID}
      >
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
        chosen && (solid ? styles.chipSolid : styles.chipSelected),
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
 * The disc every system state stands on (D-065, 176:4638 / 176:4653): a large
 * tinted circle with one line-drawn mark in it. Two tones, because the file
 * draws exactly two — the brand wash for "there is nothing here", the danger
 * wash for "this did not work" — and the mark is always decoration: the
 * heading and the sentence under it carry the state.
 */
const STATE_DISC = 96;
const STATE_GLYPH = 48;

/**
 * Nothing here yet, drawn as the contract draws it (176:4637).
 *
 * D-058 made this a card, on the rule that an empty state keeps the hierarchy
 * a full one has rather than being a line of grey text in dead space. D-065
 * keeps the hierarchy and drops the card: a 96pt wash disc, a heading, a
 * sentence and — when there is one thing worth doing — the thing worth doing.
 * A card was a second surface floating on a screen that had nothing on it.
 */
export function EmptyState({
  /** The state itself, in three or four words. Optional: some callers only have a sentence. */
  title,
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
  title?: string;
  message: string;
  action?: React.ReactNode;
  mark?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.stateBlock} accessibilityRole="text" testID={testID}>
      {mark ? (
        <View
          style={styles.stateDisc}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Ghost size={STATE_GLYPH} color={color.accent} strokeWidth={1.6} />
        </View>
      ) : null}
      {title ? (
        <Text accessibilityRole="header" style={styles.stateTitle}>
          {title}
        </Text>
      ) : null}
      <Text style={styles.stateText}>{message}</Text>
      {action}
    </View>
  );
}

/**
 * A standing failure with a way out of it (176:4652).
 *
 * The distinction `ToastHost` draws is the one that decides between this and a
 * toast: news that has been read and should go is a toast, and what the page
 * *is* while you look at it belongs on the page. A list that could not load is
 * the second kind, and until D-065 the app said it with an error `Notice` and
 * no way to try again — leaving the screen back is the only recovery a person
 * had, on a failure that is usually a tunnel.
 *
 * The retry is deliberately the outlined button rather than the coral one: the
 * loud button on a screen should be the thing you came to do, not the apology.
 */
export function ErrorState({
  title,
  message,
  /** Runs the same load again. Omitted when the caller genuinely has no retry. */
  onRetry,
  retryLabel,
  busy = false,
  testID,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
  testID?: string;
}) {
  // Announced for the same reason `Notice`'s error tone is: on iOS nothing is
  // spoken when a region appears, so a silent swap from a spinner to a failure
  // is indistinguishable from a load that never finished.
  useScreenChangeAnnouncement(message);
  return (
    <View
      style={styles.stateBlock}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View style={styles.stateDiscDanger} accessibilityElementsHidden importantForAccessibility="no">
        <Unplug size={STATE_GLYPH} color={color.danger} strokeWidth={1.6} />
      </View>
      <Text accessibilityRole="header" style={styles.stateTitle}>
        {title ?? COPY.errors.stateTitle}
      </Text>
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? (
        <Button
          label={retryLabel ?? COPY.common.retry}
          variant="secondary"
          busy={busy}
          onPress={onRetry}
          testID={testID ? `${testID}-retry` : undefined}
        />
      ) : null}
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

/**
 * A card-shaped wait — the hero that is about to be there.
 *
 * D-065 (177:5316) draws this as the card it is standing in for rather than as
 * one grey rectangle the size of one: the picture band on top, then the title,
 * the line under it, and the pill in the corner. `height` is the picture, not
 * the card, because that is the part a caller actually knows the size of.
 *
 * `fill` stays a plain block: its one caller is the deck, whose card *is* a
 * full-bleed photograph with nothing drawn beneath it.
 */
export function SkeletonCard({
  height = 300,
  fill = false,
  testID,
}: {
  /** The picture band's height. The body below it is the same on every card. */
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
      {fill ? (
        <Skeleton style={styles.skeletonFillInner} />
      ) : (
        <View style={styles.skeletonCard}>
          <Skeleton style={[styles.skeletonMedia, { height }]} />
          <View style={styles.skeletonCardBody}>
            <Skeleton style={styles.skeletonLineTitle} />
            <Skeleton style={styles.skeletonLineNarrow} />
            <View style={styles.skeletonCardFoot}>
              <Skeleton style={styles.skeletonLineFoot} />
              <Skeleton style={styles.skeletonPill} />
            </View>
          </View>
        </View>
      )}
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

/**
 * A sentence that arrives, is read, and leaves by itself (owner, 2026-08-05).
 *
 * For an answer somebody asked for and acted on — "you are not at the event
 * yet" — where a standing banner would sit on the screen long after it stopped
 * being news. It closes itself, and a press closes it sooner; it never carries
 * an action, because a message you cannot keep is the wrong place for one.
 *
 * It is announced to a screen reader like any other alert, and the dismissal
 * timer is deliberately generous enough to read two lines.
 */
export function Toast({
  message,
  tone = 'info',
  visible,
  onClose,
  testID,
}: {
  message: string;
  tone?: 'info' | 'error' | 'success';
  visible: boolean;
  onClose: () => void;
  testID?: string;
}) {
  useEffect(() => {
    if (!visible) return;
    if (message) AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onClose, 2400);
    return () => clearTimeout(timer);
  }, [visible, message, onClose]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.toastScrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={COPY.common.close}
      >
        <View
          style={styles.toastCard}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID={testID}
        >
          <NoticeMark tone={tone} />
          <Text style={styles.toastText}>{message}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  confirmVariant = 'danger',
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
  /** Destructive questions confirm in red; commitments confirm in coral. */
  confirmVariant?: 'danger' | 'primary';
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
            variant={confirmVariant}
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

/**
 * The notice's mark, drawn rather than typeset (owner, 2026-08-05): a lone
 * "i" character read as a typo, not an icon. Each tone keeps its own colour,
 * with the shape saying the same thing the colour does.
 */
function NoticeMark({ tone }: { tone: 'info' | 'error' | 'success' }) {
  const markStroke = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (tone === 'error') {
    return (
      <Svg {...markStroke} stroke={color.danger}>
        <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <Path d="M12 9v4m0 4h.01" />
      </Svg>
    );
  }
  if (tone === 'success') {
    return (
      <Svg {...markStroke} stroke={color.success}>
        <Circle cx={12} cy={12} r={9} />
        <Path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
      </Svg>
    );
  }
  return (
    <Svg {...markStroke} stroke={color.accent}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5m0-8h.01" />
    </Svg>
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
      <View
        style={styles.noticeMark}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <NoticeMark tone={tone} />
      </View>
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
  /** The screen shell: 20 aside, 24 above, 16 below, 16 between. */
  screenContent: {
    paddingHorizontal: spacing.wide,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  buttonSpring: { transform: [{ scale: 0.97 }] },
  /** The breathing placeholders. */
  skeletonBase: { backgroundColor: color.veil, borderRadius: radius.xs },
  skeletonList: { gap: spacing.snug },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.snug },
  skeletonDisc: { width: 48, height: 48, borderRadius: radius.pill },
  skeletonLines: { flex: 1, gap: spacing.sm },
  skeletonLineWide: { height: 12, borderRadius: radius.pill, width: '72%' },
  skeletonLineNarrow: { height: 10, borderRadius: radius.pill, width: '44%' },
  /** The card the wait is standing in for (177:5316). */
  skeletonCard: {
    width: '100%',
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: color.surface,
    ...elevation.card,
  },
  skeletonMedia: { width: '100%', borderRadius: 0 },
  skeletonCardBody: { padding: spacing.wide, gap: spacing.snug },
  skeletonLineTitle: { height: 20, borderRadius: radius.xs, width: '62%' },
  skeletonCardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skeletonLineFoot: { height: 14, borderRadius: radius.xs, width: '34%' },
  skeletonPill: { height: 32, borderRadius: radius.pill, width: 80 },
  skeletonFill: { flex: 1 },
  skeletonFillInner: { flex: 1, borderRadius: 0 },
  /** The shared waiting state: centred, with air around it. */
  loading: { alignItems: 'center', paddingVertical: spacing.lg },
  /** The dimmed ground under a blocking question. */
  /** The toast: a card in the middle of a dimmed screen, and nothing else. */
  toastScrim: {
    flex: 1,
    backgroundColor: overlay.photo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    maxWidth: 340,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.wide,
    ...elevation.raised,
  },
  toastText: {
    flex: 1,
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.ink,
  },
  dialogScrim: {
    flex: 1,
    backgroundColor: overlay.photo,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dialogCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dialogTitle: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    color: color.ink,
  },
  dialogBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  screenBleed: { paddingBottom: spacing.xl, gap: spacing.md },
  /** `fill`: at least the height of the scroll view, never less than content. */
  screenFill: { flexGrow: 1 },

  /**
   * The head (D-065): two rows, not one. `Screen`'s own content padding
   * already insets this horizontally (`spacing.wide`) and separates it from
   * whatever follows (its content-container `gap`); a second horizontal pad
   * here would only misalign the head from the rest of the screen, so only
   * what the parent does not already give — the room between the two rows,
   * and a little extra air below the head before the first card — is drawn.
   */
  screenHead: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  /** Row 1: the venue on the left, the ring in its usual corner. */
  screenHeadTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  /** Row 2: the screen's own name, under the venue rather than instead of it. */
  screenHeadBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  screenHeadTitleBlock: { flex: 1, gap: spacing.xs },
  screenHeadTitle: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.display,
    lineHeight: font.display * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  screenHeadSubtitle: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkFaint,
  },

  display: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    lineHeight: font.display * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  heading: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    color: color.ink,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /** Tracked uppercase structure (D-064) — see the doc comment above. */
  sectionLabel: {
    fontFamily: fontFamily.display,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkFaint,
  },

  /** The round white button that floats (180:6460). */
  backButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    ...elevation.card,
  },
  backButtonPressed: { backgroundColor: color.veil },

  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.snug,
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
  /** Filled, like every other loud button now (owner, 2026-08-05): the
      destructive confirm speaks in the same voice as the primary, in red. */
  buttonDanger: {
    backgroundColor: color.danger,
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
    fontSize: font.control,
    letterSpacing: tracking.control,
  },
  buttonLabelCompact: { fontSize: font.caption, letterSpacing: tracking.none },
  buttonLabelOnColor: { color: color.onAccent },
  buttonLabelSecondary: { color: color.ink },
  buttonLabelDanger: { color: color.onInverse },

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
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
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
    fontSize: font.caption,
    letterSpacing: tracking.none,
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
  /** The onboarding shape (180:6472): the action's height, a softer corner. */
  inputShellTall: {
    minHeight: ACTION_TOUCH,
    borderRadius: radius.md,
  },
  /** In a box that tall the value is the screen's subject, so it is set larger. */
  inputTall: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
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
    borderColor: color.accent,
    borderWidth: 2.5,
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
    lineHeight: font.body * leading.snug,
  },

  /**
   * White on cream: the card is told apart from the ground by a quiet edge and
   * a soft lift rather than by a different fill. Neither alone is enough at
   * 375pt — the border is deliberately quiet and the shadow disappears on
   * Android without `elevation`.
   */
  /**
   * No edge (D-060). A white card on a white ground used to be fenced with a
   * 1px rule, which is how a document panel is drawn — and a page of fenced
   * panels is what read as "old" to the owner. The lift does the whole job
   * now, and a border in this app means one thing only: you can operate it.
   */
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    ...elevation.card,
  },
  cardFlat: { ...elevation.none, backgroundColor: color.veil },
  cardBrand: { backgroundColor: color.accentWash },

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
  chipSelected: { backgroundColor: color.accentSoft, borderColor: color.accent },
  /** The filter bar's on-switch: coral through, like the primary button. */
  chipSolid: { backgroundColor: color.accent, borderColor: color.accent },
  chipDisabled: { backgroundColor: color.veil, borderColor: color.rule },
  chipLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.control,
    color: color.ink,
  },
  chipLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  /** White on coral, under the same ≥15pt-semibold rule the buttons keep. */
  chipLabelSolid: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.onAccent },
  chipLabelDisabled: { color: color.inkFaint },

  contextRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.pill,
    backgroundColor: color.inverse,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.sm,
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
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: color.premiumSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  premiumBadgeGlyph: { fontSize: font.label, color: color.premium },
  premiumBadgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.premium,
  },

  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.cozy,
  },
  keyCard: {
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    overflow: 'hidden',
    ...elevation.card,
  },
  keyStripe: { height: spacing.snug, marginTop: spacing.md },
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
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  stateChipText: {
    fontSize: font.label,
    lineHeight: font.label * leading.snug,
  },
  stateChipTextOpen: { fontFamily: fontFamily.bodySemi, color: color.success },
  stateChipTextClosed: { fontFamily: fontFamily.bodyMedium, color: color.inkMuted },
  stateDot: { width: spacing.cozy, height: spacing.cozy, borderRadius: radius.pill },
  stateDotOpen: { backgroundColor: color.successMark },
  stateDotClosed: { backgroundColor: color.inkFaint },
  doorPlate: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkMuted,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
  },
  checkboxBox: {
    width: spacing.lg,
    height: spacing.lg,
    borderRadius: radius.xs,
    borderWidth: 2,
    // A control has to look pressable while unchecked; the hairline tint is
    // too quiet for that job.
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxOn: { backgroundColor: color.accent, borderColor: color.accent },
  checkboxMark: { color: color.onAccent, fontSize: font.control, lineHeight: font.control, fontWeight: '900' },
  checkboxLabel: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  /** The visibility card (180:6164): a floating white row, generous inside. */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    borderRadius: radius.xxl,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...elevation.card,
  },
  /** Stacked inside a card that already floats: no second shadow, no second corner. */
  toggleRowFlat: {
    ...elevation.none,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: spacing.sm,
  },
  togglePressed: { backgroundColor: color.veil },
  /** The leading tile (176:4487). */
  toggleGlyph: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { flex: 1, gap: spacing.tight },
  toggleLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  toggleCaption: {
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.inkFaint,
  },
  /** The track and its knob. Position says the state as loudly as the fill. */
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: color.veil,
    borderWidth: 1.5,
    borderColor: color.border,
    justifyContent: 'center',
    paddingHorizontal: spacing.tight,
  },
  toggleTrackOn: { backgroundColor: color.accent, borderColor: color.accent },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignSelf: 'flex-start',
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  badgeOpen: { borderWidth: 1.5, borderColor: color.border },
  badgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
  },

  displayOnPhoto: { color: color.onPhoto },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.cozy,
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
    letterSpacing: tracking.label,
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
    fontSize: font.heading,
    color: color.inkMuted,
  },

  /** The shared system-state composition (176:4637 / 176:4652). */
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.snug,
  },
  stateDisc: {
    width: STATE_DISC,
    height: STATE_DISC,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateDiscDanger: {
    width: STATE_DISC,
    height: STATE_DISC,
    borderRadius: radius.pill,
    backgroundColor: color.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    color: color.ink,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },

  /** The info ground is the brand wash (owner, 2026-08-05): the grey-blue
      plate was the one surface on screen from outside the palette. */
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: color.accentWash,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeError: { backgroundColor: color.dangerSoft },
  noticeSuccess: { backgroundColor: color.successSoft },
  /** Seats the 16pt mark on the first line's centre. */
  noticeMark: { marginTop: spacing.tight },
  noticeText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.ink,
  },
  noticeErrorText: { color: color.danger },
  noticeSuccessText: { color: color.success },

  rule: { height: 1, backgroundColor: color.rule },
});
