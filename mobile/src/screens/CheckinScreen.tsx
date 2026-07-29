/**
 * Çevremde, to the Figma sheets (1:2 intro, 11:71 list, 11:145 active):
 *
 *  1. the intro — headline and how-it-works rows beside the photo column
 *     on the solid panel, the gradient find-places button, the expired
 *     card (only when a check-in actually expired), and the privacy panel;
 *  2. the around-you list — brand line, the head with its corner ring
 *     (kept as the locate control, because a second read is a real job),
 *     the glass search pill, and venue rows wearing the category tints
 *     and chips (D-041) with the chevron;
 *  3. the active check-in — the venue's photograph over the card, the
 *     green active chip, the clock line, the gradient discover action and
 *     its two outlined companions, and the safety card.
 *
 * Deliberate departures from the sheets, each because the control would
 * lie: no unread dot on the inbox tab (no read-state exists), and the
 * privacy sentences describe what the feature actually does. The
 * status-bar chrome belongs to the OS.
 */
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Caption, Notice, Screen } from '../components/ui';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
import {
  ApiError,
  deniedLocation,
  deviceLocation,
  fixedLocation,
  getApi,
  isFakeApiEnabled,
  readBackendConfig,
  type ActiveCheckin,
  type ForegroundLocationReader,
  type HotelCard,
} from '../data';
import { getHotelById } from '../fixtures/hotels';
import type { TabParamList } from '../navigation/types';
import { LinearGradient } from 'expo-linear-gradient';

import { color, font, fontFamily, gradient, radius, spacing, glass } from '../theme';

const HERO = require('../../assets/nearby-hero.jpg');

const VIVID = '#EC4899';
const DEEP = color.accentDeep;

/**
 * Session memory for the expired-check-in card: the server forgets an
 * expired row entirely, so "it just ran out" is a fact only the running app
 * can remember. Nothing is persisted.
 */
let lastSeenExpiry: number | null = null;

/* ------------------------------------------------------------------ icons */

const stroke = (tone: string, size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: tone,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

const PinIcon = ({ tone = DEEP, size = 22 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** The list's "Mahalle" icon: a pin standing on a folded map. */
const AreaIcon = ({ tone = DEEP }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M3 20l5-2 4 2 5-2 4 2V8l-4-2" />
    <Path d="M12 12c2-2 4-4.2 4-6.5A4 4 0 0 0 8 5.5C8 7.8 10 10 12 12Z" />
  </Svg>
);

const BuildingIcon = ({ tone = DEEP }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <Path d="M4 21h16M10 8h1m2 0h1m-4 4h1m2 0h1m-4 4h1m2 0h1" />
  </Svg>
);

const CoffeeIcon = ({ tone = '#B4690E' }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M4 11h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <Path d="M16 12h1.5a2.5 2.5 0 0 1 0 5H16" />
    <Path d="M8 8c0-1 .8-1.2.8-2.2M11.5 8c0-1 .8-1.2.8-2.2" strokeWidth={1.6} />
  </Svg>
);

const CutleryIcon = ({ tone = '#D6336C' }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M8 3v7a2 2 0 0 1-2 2v9M6 3v5M10 3v5" />
    <Path d="M16 3c-1.5 1.5-2 4-2 6 0 1.5 1 3 2 3v9" />
  </Svg>
);

const BedIcon = ({ tone = DEEP }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18v2m18-2v2M3 15h18" />
    <Path d="M7 10V8.5A1.5 1.5 0 0 1 8.5 7h2A1.5 1.5 0 0 1 12 8.5V10" />
  </Svg>
);

const CocktailIcon = ({ tone = DEEP }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M5 4h14l-7 8zM12 12v7m-4 1h8" />
  </Svg>
);

const WavesIcon = ({ tone = '#0E8A78' }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
  </Svg>
);

/** The locate button on the list header. */
const LocateIcon = ({ tone = DEEP }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Circle cx={12} cy={12} r={4} />
    <Path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
  </Svg>
);

const MagnifierIcon = () => (
  <Svg {...stroke(color.inkMuted, 20)}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="m20 20-3.5-3.5" />
  </Svg>
);

const ClockIcon = ({ tone = DEEP, size = 18 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 7v5l3 2" />
  </Svg>
);

const SparkleIcon = ({ tone = DEEP, size = 18 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Path d="M12 4l1.5 4L18 9.5 13.5 11 12 15l-1.5-4L6 9.5 10.5 8z" />
    <Path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" strokeWidth={1.4} />
  </Svg>
);

const ShieldLockIcon = ({ tone = DEEP, size = 24 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <Rect x={9.4} y={10.5} width={5.2} height={4.4} rx={1} />
    <Path d="M10.6 10.5V9.4a1.4 1.4 0 0 1 2.8 0v1.1" />
  </Svg>
);

const ShieldPlusIcon = ({ tone = DEEP, size = 18 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <Path d="M12 9v6m-3-3h6" />
  </Svg>
);

const PeopleIcon = ({ tone = DEEP, size = 20 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={9} cy={8} r={3.2} />
    <Path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <Path d="M16 5.5a3.2 3.2 0 0 1 0 5M18 15.2c1.6.8 2.5 2.3 2.5 4.8" />
  </Svg>
);

const RefreshIcon = ({ tone = DEEP, size = 20 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
    <Path d="M20 4v4h-4M4 20v-4h4" />
  </Svg>
);

const StopIcon = ({ tone = DEEP, size = 20 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={12} r={9} />
    <Rect x={9} y={9} width={6} height={6} rx={1} fill={tone} />
  </Svg>
);

const HeartGlyph = ({ tone = VIVID, size = 16 }: { tone?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={tone}>
    <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
  </Svg>
);

/* ------------------------------------------------------- category styling */

/**
 * The sheet's category tints (11:81/11:97/11:105): each kind's colour at the
 * same 0.18 breath over the night ground, the label in the colour itself.
 */
const KIND_META: Record<string, { label: () => string; tint: string; tone: string }> = {
  hotel: { label: () => COPY.checkin.kindHotel, tint: 'rgba(244, 114, 182, 0.18)', tone: DEEP },
  area: { label: () => COPY.checkin.kindArea, tint: 'rgba(244, 114, 182, 0.18)', tone: DEEP },
  cafe: { label: () => COPY.checkin.kindCafe, tint: 'rgba(251, 191, 36, 0.18)', tone: '#FBBF24' },
  restaurant: { label: () => COPY.checkin.kindRestaurant, tint: 'rgba(251, 113, 133, 0.18)', tone: '#FB7185' },
  bar: { label: () => COPY.checkin.kindBar, tint: 'rgba(244, 114, 182, 0.18)', tone: DEEP },
  beach: { label: () => COPY.checkin.kindBeach, tint: 'rgba(52, 211, 153, 0.18)', tone: '#34D399' },
};

function kindMeta(kind: string | null) {
  return (
    (kind && KIND_META[kind]) || {
      label: () => COPY.checkin.kindVenue,
      tint: 'rgba(244, 114, 182, 0.18)',
      tone: DEEP,
    }
  );
}

function KindArt({ kind, tone }: { kind: string | null; tone: string }) {
  switch (kind) {
    case 'area':
      return <AreaIcon tone={tone} />;
    case 'cafe':
      return <CoffeeIcon tone={tone} />;
    case 'restaurant':
      return <CutleryIcon tone={tone} />;
    case 'bar':
      return <CocktailIcon tone={tone} />;
    case 'beach':
      return <WavesIcon tone={tone} />;
    case 'hotel':
      return <BuildingIcon tone={tone} />;
    default:
      return <PinIcon tone={tone} />;
  }
}

function photoSource(url: string) {
  const config = readBackendConfig();
  if (config && url.includes('/functions/v1/hotel-photo')) {
    // Only the apikey header: the gateway accepts the publishable key there.
    return { uri: `${url}&w=800`, headers: { apikey: config.anonKey } };
  }
  return { uri: url };
}

/* ------------------------------------------------------------------ screen */

export function CheckinScreen({
  reader = deviceLocation,
}: { reader?: ForegroundLocationReader } = {}) {
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [checkin, setCheckin] = useState<ActiveCheckin | null | undefined>(undefined);
  const [reading, setReading] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearby, setNearby] = useState<HotelCard[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HotelCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .getCheckin()
      .then((current) => {
        if (cancelled) return;
        if (current) lastSeenExpiry = current.expiresAt;
        setCheckin(current);
      })
      .catch(() => {
        if (!cancelled) setCheckin(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await getApi().searchHotels(trimmed);
        if (searchSeq.current === seq) setResults(found);
      } catch {
        if (searchSeq.current === seq) setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  /** One reading serves both the list and every check-in made from it. */
  const lookAround = async (source: ForegroundLocationReader) => {
    setBusy(true);
    setNotice(null);
    const read = await source.read();
    if (read.status === 'denied') {
      setNotice({ message: COPY.hereNow.permissionDenied, tone: 'error' });
      setBusy(false);
      return;
    }
    if (read.status === 'unavailable') {
      setNotice({ message: COPY.hereNow.unavailable, tone: 'error' });
      setBusy(false);
      return;
    }
    try {
      const found = await getApi().nearbyVenues(read.latitude, read.longitude);
      setReading({ latitude: read.latitude, longitude: read.longitude });
      setNearby(found);
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const checkInAt = async (venue: HotelCard) => {
    if (!reading || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const answer = await getApi().recordCheckin(venue.id, reading.latitude, reading.longitude);
      if (!answer.withinRange) {
        setNotice({ message: COPY.checkin.tooFar, tone: 'error' });
      } else {
        const active: ActiveCheckin = {
          venueId: venue.id,
          venueName: venue.name,
          photoUrl: venue.photoUrl,
          photoAttribution: venue.photoAttribution,
          kind: venue.kind,
          expiresAt: answer.expiresAt ?? Date.now(),
        };
        lastSeenExpiry = active.expiresAt;
        setCheckin(active);
        setNearby(null);
        setReading(null);
        setQuery('');
        setResults([]);
      }
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * D-048: check in to wherever the reading is, named or not. This is the
   * branch that cannot answer "nowhere" — a concert in a forest, a beach
   * nobody mapped, a café that opened last week. It stands beside the list
   * rather than only under an empty one, because the list being *wrong* is
   * the common case, not the list being empty.
   */
  const checkInHere = async () => {
    if (!reading || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await getApi().checkinHere(reading.latitude, reading.longitude);
      // Re-read rather than assemble it here: the server decides what the
      // anchor is called, and for a cell that is nothing at all.
      const active = await getApi().getCheckin();
      if (active) {
        lastSeenExpiry = active.expiresAt;
        setCheckin(active);
        setNearby(null);
        setReading(null);
        setQuery('');
        setResults([]);
      }
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const endCheckin = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await getApi().clearCheckin();
      lastSeenExpiry = null;
      setCheckin(null);
      setNotice({ message: COPY.checkin.checkedOut, tone: 'info' });
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  if (checkin === undefined) {
    return (
      <Screen safeTop testID="screen-checkin">
        <Text accessibilityRole="header" style={styles.title}>{COPY.tabs.nearbyTab}</Text>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="checkin-loading" />
      </Screen>
    );
  }

  const previewShore = isFakeApiEnabled() ? getHotelById('hotel-lara-shore') : null;
  const expiredRecently = !checkin && lastSeenExpiry !== null && lastSeenExpiry < Date.now();

  const venueRow = (venue: HotelCard, keyPrefix: string) => {
    const meta = kindMeta(venue.kind);
    return (
      <Pressable
        key={`${keyPrefix}-${venue.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${venue.city}`}
        onPress={() => checkInAt(venue)}
        disabled={busy}
        style={({ pressed }) => [styles.venueRow, pressed && styles.pressed]}
        testID={`checkin-venue-${venue.id}`}
      >
        <View style={[styles.venueDisc, { backgroundColor: meta.tint }]}>
          <KindArt kind={venue.kind} tone={meta.tone} />
        </View>
        <View style={styles.venueWords}>
          <Text style={styles.venueName} numberOfLines={1}>{venue.name}</Text>
          <View style={styles.venuePlace}>
            <PinIcon tone={color.inkMuted} size={11} />
            <Text style={styles.venueCity} numberOfLines={1}>{venue.city}</Text>
          </View>
        </View>
        <View style={[styles.kindChip, { backgroundColor: meta.tint }]}>
          <Text style={[styles.kindChipText, { color: meta.tone }]}>{meta.label()}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  /* ---------------------------------------------------- 3: active check-in */
  if (checkin) {
    const meta = kindMeta(checkin.kind);
    const hhmm = new Date(checkin.expiresAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <Screen safeTop testID="screen-checkin">
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.titleSm}>{COPY.tabs.nearbyTab}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.tabs.settings}
            onPress={() => tabNavigation.navigate('Settings')}
            style={({ pressed }) => [styles.profileRing, pressed && styles.pressed]}
            testID="checkin-profile-ring"
          />
        </View>
        <Text style={styles.subtitleSm}>{COPY.checkin.activeSubtitle}</Text>

        <View style={styles.activeCard} testID="checkin-active">
          {checkin.photoUrl ? (
            <View>
              <Image
                source={photoSource(checkin.photoUrl)}
                style={styles.activePhoto}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                testID="checkin-active-photo"
              />
              {checkin.photoAttribution ? (
                <Text style={styles.photoCredit} numberOfLines={1}>{checkin.photoAttribution}</Text>
              ) : null}
            </View>
          ) : (
            /* The sheet's photo band stand-in (11:151): warm copper into night. */
            <LinearGradient colors={['#A65940', '#1F1A33']} style={styles.activePhotoBand} />
          )}
          <View style={styles.activeBody}>
            <View style={[styles.activeDisc, { backgroundColor: meta.tint }]}>
              {checkin.kind === 'hotel' ? (
                <BedIcon tone={meta.tone} />
              ) : (
                <KindArt kind={checkin.kind} tone={meta.tone} />
              )}
            </View>
            <View style={styles.activeWords}>
              <Text style={styles.activeName}>
                {checkin.venueName ?? COPY.checkin.hereLabel}
              </Text>
              <View style={styles.activeChip}>
                <View style={styles.activeChipDot} />
                <Text style={styles.activeChipText}>{COPY.checkin.activeChip}</Text>
              </View>
              <View style={styles.untilRow}>
                <ClockIcon tone={color.inkMuted} size={14} />
                <Text style={styles.untilText}>{COPY_FOR.untilTime(hhmm)}</Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => tabNavigation.navigate('Discovery', { source: 'NEARBY' })}
          style={({ pressed }) => [styles.bigFilled, pressed && styles.pressed]}
          testID="checkin-see-nearby"
        >
          <LinearGradient
            colors={[...gradient.primary]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <PeopleIcon tone="#1A1A2E" size={18} />
          <Text style={styles.bigFilledLabel}>{COPY.checkin.seeNearby}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setCheckin(null)}
          disabled={busy}
          style={({ pressed }) => [styles.bigOutline, pressed && styles.pressed]}
          testID="checkin-change"
        >
          <RefreshIcon tone={color.ink} size={16} />
          <Text style={styles.bigOutlineLabel}>{COPY.checkin.changeCheckin}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={endCheckin}
          disabled={busy}
          style={({ pressed }) => [styles.bigOutline, pressed && styles.pressed]}
          testID="checkin-clear"
        >
          <StopIcon tone={color.ink} size={16} />
          <Text style={styles.bigOutlineLabel}>{COPY.checkin.checkOut}</Text>
        </Pressable>

        {/* The sheet's safety card (11:166): glass, 18 corners, the 44 disc. */}
        <View style={styles.safeCard}>
          <View style={styles.safeDisc}>
            <ShieldLockIcon size={22} />
          </View>
          <View style={styles.infoWords}>
            <Text style={styles.safeTitle}>{COPY.checkin.safeTitle}</Text>
            <Text style={styles.infoBody}>{COPY.checkin.cardBody}</Text>
          </View>
        </View>

        {notice ? (
          <Notice
            message={notice.message}
            tone={notice.tone === 'error' ? 'error' : undefined}
            testID="checkin-notice"
          />
        ) : null}
      </Screen>
    );
  }

  /* --------------------------------------------------- 1: around-you list */
  if (nearby !== null) {
    const searching = query.trim().length >= 2;
    const shown = searching ? results : nearby;
    return (
      <Screen safeTop testID="screen-checkin">
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>{COPY.appName}</Text>
          <HeartGlyph size={14} />
        </View>
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.titleSm}>{COPY.tabs.nearbyTab}</Text>
          {/* The sheet's corner ring (11:76), still doing the useful job:
              another location read, for the list under it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.checkin.findVenues}
            onPress={() => lookAround(reader)}
            disabled={busy}
            style={({ pressed }) => [styles.profileRing, styles.ringCentered, pressed && styles.pressed]}
            testID="checkin-look-again"
          >
            <LocateIcon />
          </Pressable>
        </View>
        <Text style={styles.subtitleSm}>
          {COPY.checkin.listSubtitle} <Text style={styles.subtitleHeart}>♥</Text>
        </Text>

        <View style={styles.searchPill}>
          <MagnifierIcon />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={COPY.checkin.searchPlaceholder}
            placeholderTextColor={color.inkMuted}
            style={styles.searchInput}
            testID="checkin-search"
          />
        </View>

        {busy ? (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="checkin-looking" />
        ) : null}
        {shown.length === 0 && !busy ? (
          <Text style={styles.emptyBody} testID="checkin-no-venues">
            {COPY.checkin.noVenues}
          </Text>
        ) : (
          shown.map((venue) => venueRow(venue, searching ? 'found' : 'near'))
        )}

        {/* Always here, never only under an emptiness: the map missing the
            place you are standing in is the ordinary case (D-048). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.checkin.hereCta}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={checkInHere}
          style={({ pressed }) => [
            shown.length === 0 ? styles.bigFilled : styles.bigOutline,
            pressed && styles.pressed,
          ]}
          testID="checkin-here"
        >
          {shown.length === 0 ? (
            <LinearGradient
              colors={[...gradient.primary]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          ) : null}
          <PinIcon tone={shown.length === 0 ? '#1A1A2E' : color.ink} size={16} />
          <Text style={shown.length === 0 ? styles.bigFilledLabel : styles.bigOutlineLabel}>
            {COPY.checkin.hereCta}
          </Text>
        </Pressable>

        {notice ? (
          <Notice
            message={notice.message}
            tone={notice.tone === 'error' ? 'error' : undefined}
            testID="checkin-notice"
          />
        ) : null}
        <Caption>{COPY.trust.noExactLocation}</Caption>
      </Screen>
    );
  }

  /* -------------------------------------------------------------- 2: intro */
  return (
    <Screen safeTop testID="screen-checkin">
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.title}>{COPY.tabs.nearbyTab}</Text>
        <View
          style={styles.cornerBadge}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <PinIcon tone={VIVID} size={26} />
        </View>
      </View>
      <Text style={styles.subtitle}>{COPY.checkin.idleSubtitle}</Text>

      <View style={styles.heroCard}>
        <View style={styles.heroColumns}>
          <View style={styles.heroWords}>
            <Text style={styles.heroTitle}>{COPY.checkin.introTitle}</Text>
            <Text style={styles.heroBody}>{COPY.checkin.introBody}</Text>
            <Text style={styles.howTitle}>{COPY.checkin.howTitle}</Text>
            {[
              { icon: <PinIcon tone={DEEP} size={16} />, text: COPY.checkin.howLocation },
              { icon: <SparkleIcon size={16} />, text: COPY.checkin.howFree },
              { icon: <ClockIcon size={16} />, text: COPY.checkin.howDuration },
              { icon: <ShieldPlusIcon size={16} />, text: COPY.checkin.howPrivacy },
            ].map((rowItem, index) => (
              <View key={index} style={styles.howRow}>
                <View style={styles.howDisc}>{rowItem.icon}</View>
                <Text style={styles.howText}>{rowItem.text}</Text>
              </View>
            ))}
          </View>
          <Image
            source={HERO}
            style={styles.heroPhoto}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => lookAround(reader)}
          disabled={busy}
          style={({ pressed }) => [styles.findButton, pressed && styles.pressed]}
          testID="checkin-look-around"
        >
          <LinearGradient
            colors={[...gradient.primary]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <Text style={styles.findButtonLabel}>{COPY.checkin.findVenues}</Text>
        </Pressable>
        {busy ? (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="checkin-looking" />
        ) : null}
      </View>

      {previewShore ? (
        <View style={styles.previewRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => lookAround(fixedLocation(previewShore.latitude, previewShore.longitude))}
            disabled={busy}
            style={({ pressed }) => [styles.previewChip, pressed && styles.pressed]}
            testID="checkin-simulate-shore"
          >
            <Text style={styles.previewChipText}>{COPY.checkin.simulateShore}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => lookAround(deniedLocation())}
            disabled={busy}
            style={({ pressed }) => [styles.previewChip, pressed && styles.pressed]}
            testID="checkin-simulate-deny"
          >
            <Text style={styles.previewChipText}>{COPY.hereNow.simulateDeny}</Text>
          </Pressable>
        </View>
      ) : null}

      {expiredRecently ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => lookAround(reader)}
          disabled={busy}
          style={({ pressed }) => [styles.infoCard, pressed && styles.pressed]}
          testID="checkin-expired"
        >
          <View style={styles.infoDisc}>
            <ClockIcon size={26} />
          </View>
          <View style={styles.infoWords}>
            <Text style={styles.infoTitle}>{COPY.checkin.expiredTitle}</Text>
            <Text style={styles.infoBody}>{COPY.checkin.expiredBody}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ) : null}

      <View style={styles.infoCard}>
        <View style={styles.infoDisc}>
          <ShieldLockIcon />
        </View>
        <View style={styles.infoWords}>
          <Text style={styles.infoTitle}>{COPY.rooms.privacyTitle}</Text>
          <Text style={styles.infoBody}>{COPY.checkin.privacyCardBody}</Text>
        </View>
      </View>

      {notice ? (
        <Notice
          message={notice.message}
          tone={notice.tone === 'error' ? 'error' : undefined}
          testID="checkin-notice"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  /** The brand line over the list (11:73): 15, in the light pink. */
  brandText: {
    fontFamily: fontFamily.display,
    fontSize: 15,
    color: DEEP,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    color: color.ink,
  },
  /** The list and active sheets' head (11:75/11:147): a size down from the intro. */
  titleSm: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 34 * 1.15,
    color: color.ink,
  },
  /** The corner ring (11:76): the empty frame, 1.4 of half-pink. */
  profileRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.4,
    borderColor: 'rgba(244, 114, 182, 0.5)',
  },
  ringCentered: { alignItems: 'center', justifyContent: 'center' },
  /** The Figma line under the head (1:6): 15, muted. */
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: color.inkMuted,
  },
  /** The line under the list/active heads (11:77/11:149): 13, muted. */
  subtitleSm: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.inkMuted,
  },
  subtitleHeart: { color: VIVID },
  /** The corner badge (1:5): the panel disc with the half-pink 1.5 edge. */
  cornerBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },

  /* list — the sheet's search pill (11:78) and venue rows (11:80). */
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: color.ink,
    paddingVertical: 12,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  venueDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueWords: { flex: 1, gap: 2 },
  venueName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
  venuePlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueCity: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: color.inkMuted,
    flexShrink: 1,
  },
  kindChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kindChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
  },
  chevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 18,
    color: color.inkMuted,
    paddingHorizontal: 2,
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
  },

  /* intro — the Figma hero (1:7): a solid panel, 28 corners, 16 inside. */
  heroCard: {
    backgroundColor: color.surface,
    borderRadius: 28,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroColumns: { flexDirection: 'row', gap: spacing.md },
  heroWords: { flex: 1, gap: 10 },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 22 * 1.2,
    color: color.ink,
  },
  heroBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.inkMuted,
  },
  howTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: DEEP,
    marginTop: 2,
  },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /** The 26 disc (1:14) on the how rows. */
  howDisc: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 12.5,
    color: color.ink,
  },
  /** The 150-wide photo column (1:25), stretched to the words beside it. */
  heroPhoto: {
    width: 150,
    borderRadius: 20,
    alignSelf: 'stretch',
    minHeight: 300,
  },
  findButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: VIVID,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingVertical: 16,
    shadowColor: VIVID,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  findButtonLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    color: '#1A1A2E',
  },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewChip: {
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  previewChipText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: DEEP,
  },
  /** The Figma privacy card (1:28): a solid panel, 20 corners, 48 disc. */
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  infoDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoWords: { flex: 1, gap: 4 },
  infoTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.ink,
  },
  infoBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * 1.45,
    color: color.inkMuted,
  },
  /* active — the sheet's card (11:150), buttons (11:160-164), safety (11:166). */
  activeCard: {
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activePhoto: { width: '100%', height: 170 },
  activePhotoBand: { width: '100%', height: 170 },
  photoCredit: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  activeBody: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    alignItems: 'flex-start',
  },
  /** The 48 square-ish disc beside the venue's name (11:153). */
  activeDisc: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeWords: { flex: 1, gap: 5 },
  activeName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 17,
    color: color.ink,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  activeChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    color: '#34D399',
  },
  untilRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  untilText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.inkMuted,
  },
  bigFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: color.accent,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingVertical: 14,
    shadowColor: '#FB7185',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bigFilledLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: '#1A1A2E',
  },
  bigOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: glass.fill,
    borderWidth: 1.4,
    borderColor: 'rgba(236, 72, 153, 0.5)',
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
  bigOutlineLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
  /** The sheet's safety card (11:166): glass, 18 corners, the 44 veil disc. */
  safeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  safeDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
});
