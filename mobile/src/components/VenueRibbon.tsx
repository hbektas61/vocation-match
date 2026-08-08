/**
 * The venue every primary screen is scoped to, in the corner it is scoped from.
 *
 * D-061 took the tab titles off the page and left a row with a profile ring
 * hanging in it. The word that used to sit there said something the tab bar
 * already said; what belongs there instead is the one fact none of these
 * screens was showing at all — **which vacation venue you are in**. Keşfet,
 * Etkinlikler, Çevremde and Mesajlar are every one of them scoped to it, and
 * until now you could only find out by opening Tatilim.
 *
 * Two states, and no third: a venue, or the way to choose one. It never draws
 * a placeholder — a chosen venue whose name has not arrived yet says so, and
 * an account with no venue is offered the thing it actually needs.
 *
 * Tatilim does not draw this. There the venue *is* the screen.
 *
 * One screen is not scoped to the vacation venue at all times, though. Keşfet
 * hosts five rooms and the person picks which one they are browsing, so its
 * head takes an explicit `context` and the chip names *that* — the event, or
 * the checked-in place. See `RibbonContext`.
 */
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { COPY, upperCase } from '../copy';
import type { TabParamList } from '../navigation/types';
import { useActiveVenueName } from '../state/useActiveVenueName';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, MIN_TOUCH, radius, spacing, tracking } from '../theme';

/** The mark, drawn rather than typeset, like every other glyph in the app. */
const PinMark = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"
      stroke={color.accentDeep}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
    <Circle cx={12} cy={10} r={2.4} fill={color.accentDeep} />
  </Svg>
);

/**
 * What a screen is scoped to, when that is not the vacation venue.
 *
 * Only Keşfet supplies one. Its context selector already names the room the
 * deck is drawn from — an event, or the place a check-in put you beside — and
 * the chip above was still saying the hotel, so the head and the control under
 * it named two different places at once (owner photo, 2026-08-08). The same
 * rule Slice 4 applied to a match's venue line: a name that belongs to a place
 * this room is not about is worse than no name.
 */
export interface RibbonContext {
  /** The name to print. Null means "not known yet" — the venue chip stands in. */
  name: string | null;
  /** Where pressing goes, since this chip no longer always means Tatilim. */
  tab: 'Vacation' | 'Nearby' | 'Events';
  /** What the chip is naming, spoken: "Etkinlikler: Demet Akalın". */
  spokenAs: string;
}

export function VenueRibbon({ context = null }: { context?: RibbonContext | null } = {}) {
  const { state } = useAppStore();
  const navigation = useNavigation<NavigationProp<TabParamList>>();
  // The id the server remembers is the only thing allowed to answer "is a
  // venue chosen" — the cached card may simply not have arrived yet, and
  // reading that as "no venue" is the bug `activeHotelSingleSource` pins.
  const activeId = state.activeHotel?.hotelId ?? null;
  // The name itself is one shared question for the whole app (D-054), asked
  // once per session — not once per screen that happens to draw this chip.
  // Still asked when a context is supplied: the hook is what makes it one
  // question per session, and switching back to a vacation room must not have
  // to start it over.
  const { name: resolvedName, unavailable } = useActiveVenueName();

  const named = context?.name ?? null;
  const target = named ? context!.tab : 'Vacation';
  const goToScope = () => navigation.navigate(target);

  // An account with no venue is offered one — but only when the venue is what
  // this chip would have been naming. Somebody browsing an event room has a
  // scope already, and it is not a hotel they have not chosen.
  if (!named && !activeId) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.vacation.subtitle}
        onPress={goToScope}
        style={({ pressed }) => [styles.ribbon, styles.ribbonEmpty, pressed && styles.pressed]}
        testID="venue-ribbon-empty"
      >
        <PinMark />
        <Text style={styles.chooseText} numberOfLines={1}>
          {COPY.vacation.whereWillYouBe}
        </Text>
      </Pressable>
    );
  }

  const rawName = named ?? resolvedName ?? (unavailable ? COPY.venue.nameUnavailable : null);
  // The Figma frame draws "SPIAGGIA GRANDE, ALAÇATI" — the venue and the
  // place it is in. This screen has no destination field to add safely for
  // every venue (D-054 forbids storing or fetching one for a Google venue,
  // and appending the wrong thing is worse than the plainer line), so only
  // the name itself is uppercased here — through the locale-aware helper
  // rather than CSS `textTransform`, which turns a Turkish "i" into "I"
  // instead of "İ".
  const name = rawName ? upperCase(rawName) : null;

  return (
    <Pressable
      accessibilityRole="button"
      // The name alone would read as a heading; this says what pressing does.
      accessibilityLabel={`${named ? context!.spokenAs : COPY.tabs.vacation}: ${rawName ?? COPY.common.loading}`}
      onPress={goToScope}
      style={({ pressed }) => [styles.ribbon, pressed && styles.pressed]}
      testID="venue-ribbon"
    >
      <PinMark />
      <Text style={styles.venueName} numberOfLines={1} testID="venue-ribbon-name">
        {name ?? COPY.common.loading}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * A pill rather than a card: it sits in a row with the ring and has to read
   * as one control beside another, not as a surface the page rests on.
   */
  ribbon: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.cozy,
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.cozy,
  },
  ribbonEmpty: { backgroundColor: color.veil },
  pressed: { opacity: 0.8 },
  venueName: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontSize: font.label,
    letterSpacing: tracking.label,
    // The Figma frame draws this line in the raw brand coral. That measures
    // 2.99:1 on the wash behind it — under AA even for large text — so it
    // stays on `brand.ink`, the coral's text-safe sibling (6.5:1 on white,
    // 5.3:1 on this exact wash), same as every other coral word in the app.
    color: color.accentDeep,
  },
  chooseText: {
    flexShrink: 1,
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.accentDeep,
  },
});
