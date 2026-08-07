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
 */
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { COPY, upperCase } from '../copy';
import { resolveOwnVenue, resolveOwnVenueLabel } from '../data/venueLabels';
import type { TabParamList } from '../navigation/types';
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

export function VenueRibbon() {
  const { state } = useAppStore();
  const navigation = useNavigation<NavigationProp<TabParamList>>();
  // The id the server remembers is the only thing allowed to answer "is a
  // venue chosen" — the cached card may simply not have arrived yet, and
  // reading that as "no venue" is the bug `activeHotelSingleSource` pins.
  const activeId = state.activeHotel?.hotelId ?? null;
  const catalogueName = state.hotels.find((h) => h.id === activeId)?.name ?? null;
  const [googleName, setGoogleName] = useState<string | null | false>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeId || catalogueName) {
      setGoogleName(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const venue = await resolveOwnVenue(activeId);
      if (cancelled) return;
      if (venue?.provider !== 'google' || !venue.googlePlaceId) {
        setGoogleName(false);
        return;
      }
      // D-054: resolved live, held in memory, never written down.
      const name = await resolveOwnVenueLabel(venue.googlePlaceId);
      if (!cancelled) setGoogleName(name ?? false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, catalogueName]);

  const goToVacation = () => navigation.navigate('Vacation');

  if (!activeId) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.vacation.subtitle}
        onPress={goToVacation}
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

  const rawName =
    catalogueName ?? (googleName === false ? COPY.venue.nameUnavailable : googleName);
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
      accessibilityLabel={`${COPY.tabs.vacation}: ${rawName ?? COPY.common.loading}`}
      onPress={goToVacation}
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
