/**
 * Çevremde, to the owner's three designer screens (2026-07-29, "birebir"):
 *
 *  1. the intro — headline and how-it-works bullets beside the bar
 *     photograph cropped from the mock, the vivid find-places button, the
 *     expired-check-in card (only when a check-in actually expired), and
 *     the privacy card;
 *  2. the around-you list — brand line, big title with the locate button,
 *     the search pill, and venue rows wearing category icons and chips
 *     (D-041) with the chevron;
 *  3. the active check-in — the venue's photograph on the card, the green
 *     active chip, the clock line, and the three actions.
 *
 * Deliberate departures from the mocks, each because the control would lie:
 * no unread dot on the inbox tab (no read-state exists), no heart button on
 * the venue photo (no favourites exist), and the privacy sentences describe
 * what the feature actually does. The status-bar chrome belongs to the OS.
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

import { color, font, fontFamily, gradient, radius, spacing } from '../theme';

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

const CheckCircleIcon = ({ tone = '#199A62', size = 16 }: { tone?: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

const HeartGlyph = ({ tone = VIVID, size = 16 }: { tone?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={tone}>
    <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
  </Svg>
);

/** The mock's corner doodle on the active screen: a dotted heart and plane. */
const HeartPlaneDoodle = () => (
  <Svg width={84} height={56} viewBox="0 0 84 56" fill="none" stroke="rgba(236, 72, 153, 0.45)" strokeWidth={1.6} strokeLinecap="round">
    <Path d="M8 34c-4-6 1-13 7-11 2-6 11-5 12 1 4 8-9 14-12 20-2-4-5-6-7-10z" strokeDasharray="4 4" />
    <Path d="M34 44c10-4 22-10 34-22" strokeDasharray="4 4" />
    <Path d="M68 10l12 6-9 3-1 8z" fill="rgba(236, 72, 153, 0.35)" stroke="none" />
  </Svg>
);

/** The intro's bottom flourish: palm — dashes — heart — dashes — cocktail. */
const FlourishRow = () => (
  <View style={styles.flourishRow} accessible={false} importantForAccessibility="no-hide-descendants">
    <Svg {...stroke('rgba(236, 72, 153, 0.5)', 18)}>
      <Path d="M12 21v-8m0 0c-1-3-4-4-7-3 2-3 6-3 7-1 1-2 5-2 7 1-3-1-6 0-7 3z" />
    </Svg>
    <View style={styles.flourishDash} />
    <HeartGlyph size={20} />
    <View style={styles.flourishDash} />
    <CocktailIcon tone="rgba(236, 72, 153, 0.5)" />
  </View>
);

/* ------------------------------------------------------- category styling */

const KIND_META: Record<string, { label: () => string; tint: string; tone: string }> = {
  hotel: { label: () => COPY.checkin.kindHotel, tint: 'rgba(236, 72, 153, 0.14)', tone: DEEP },
  area: { label: () => COPY.checkin.kindArea, tint: 'rgba(236, 72, 153, 0.14)', tone: DEEP },
  cafe: { label: () => COPY.checkin.kindCafe, tint: '#FDEBD2', tone: '#B4690E' },
  restaurant: { label: () => COPY.checkin.kindRestaurant, tint: '#FBDCE4', tone: '#D6336C' },
  bar: { label: () => COPY.checkin.kindBar, tint: 'rgba(236, 72, 153, 0.14)', tone: DEEP },
  beach: { label: () => COPY.checkin.kindBeach, tint: '#D9F2EE', tone: '#0E8A78' },
};

function kindMeta(kind: string | null) {
  return (
    (kind && KIND_META[kind]) || {
      label: () => COPY.checkin.kindVenue,
      tint: 'rgba(236, 72, 153, 0.14)',
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
            <PinIcon tone={color.inkMuted} size={14} />
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
          <Text accessibilityRole="header" style={styles.title}>{COPY.tabs.nearbyTab}</Text>
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <HeartPlaneDoodle />
          </View>
        </View>
        <Text style={styles.subtitle}>{COPY.checkin.activeSubtitle}</Text>

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
            <View style={styles.activePhotoBand} />
          )}
          <View style={styles.activeBody}>
            <View style={[styles.venueDisc, { backgroundColor: meta.tint }]}>
              {checkin.kind === 'hotel' ? (
                <BedIcon tone={meta.tone} />
              ) : (
                <KindArt kind={checkin.kind} tone={meta.tone} />
              )}
            </View>
            <View style={styles.activeWords}>
              <Text style={styles.activeName}>{checkin.venueName}</Text>
              <View style={styles.activeChip}>
                <View style={styles.activeChipDot} />
                <Text style={styles.activeChipText}>{COPY.checkin.activeChip}</Text>
              </View>
              <View style={styles.untilRow}>
                <ClockIcon tone={color.inkMuted} />
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
          <PeopleIcon tone={DEEP} />
          <Text style={styles.bigFilledLabel}>{COPY.checkin.seeNearby}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setCheckin(null)}
          disabled={busy}
          style={({ pressed }) => [styles.bigOutline, pressed && styles.pressed]}
          testID="checkin-change"
        >
          <RefreshIcon />
          <Text style={styles.bigOutlineLabel}>{COPY.checkin.changeCheckin}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={endCheckin}
          disabled={busy}
          style={({ pressed }) => [styles.bigOutline, pressed && styles.pressed]}
          testID="checkin-clear"
        >
          <StopIcon tone={color.ink} />
          <Text style={[styles.bigOutlineLabel, { color: color.ink }]}>{COPY.checkin.checkOut}</Text>
        </Pressable>

        <View style={styles.infoCard}>
          <View style={styles.infoDisc}>
            <ShieldLockIcon />
          </View>
          <View style={styles.infoWords}>
            <Text style={styles.infoTitle}>{COPY.checkin.safeTitle}</Text>
            <Caption>{COPY.checkin.cardBody}</Caption>
            <View style={styles.safeCheckRow}>
              <CheckCircleIcon />
              <Text style={styles.safeCheckText}>{COPY.checkin.safeCheck}</Text>
            </View>
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
          <HeartGlyph />
        </View>
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.title}>{COPY.tabs.nearbyTab}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.checkin.findVenues}
            onPress={() => lookAround(reader)}
            disabled={busy}
            style={({ pressed }) => [styles.cornerButton, pressed && styles.pressed]}
            testID="checkin-look-again"
          >
            <LocateIcon />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
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
          <PinIcon tone="#1A1A2E" size={20} />
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
            <Caption>{COPY.checkin.expiredBody}</Caption>
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
          <Caption>{COPY.checkin.privacyCardBody}</Caption>
        </View>
        <View style={styles.infoMiniDisc}>
          <ShieldLockIcon size={16} />
        </View>
      </View>

      {notice ? (
        <Notice
          message={notice.message}
          tone={notice.tone === 'error' ? 'error' : undefined}
          testID="checkin-notice"
        />
      ) : null}
      <FlourishRow />
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
  brandText: {
    fontFamily: fontFamily.display,
    fontSize: font.body + 2,
    color: VIVID,
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
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
  },
  subtitleHeart: { color: VIVID },
  cornerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },

  /* list */
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.veil,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
    paddingVertical: 12,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
    shadowColor: color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  venueDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueWords: { flex: 1, gap: 2 },
  venueName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 1,
    color: color.ink,
  },
  venuePlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueCity: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    color: color.inkMuted,
    flexShrink: 1,
  },
  kindChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  kindChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
  },
  chevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 24,
    color: color.inkMuted,
    paddingHorizontal: 2,
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
  },

  /* intro */
  heroCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg + 6,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: color.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroColumns: { flexDirection: 'row', gap: spacing.md },
  heroWords: { flex: 1, gap: spacing.sm },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.heading + 2,
    lineHeight: (font.heading + 2) * 1.2,
    color: color.ink,
  },
  heroBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption + 1,
    lineHeight: (font.caption + 1) * 1.5,
    color: color.inkMuted,
  },
  howTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: DEEP,
    marginTop: 2,
  },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  howDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.caption + 1,
    color: color.ink,
  },
  heroPhoto: {
    width: '44%',
    borderRadius: radius.lg,
    aspectRatio: 372 / 628,
    alignSelf: 'stretch',
  },
  findButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: VIVID,
    overflow: 'hidden',
    borderRadius: radius.pill,
    minHeight: 60,
    shadowColor: VIVID,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  findButtonLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 2,
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  infoDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoMiniDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoWords: { flex: 1, gap: 4 },
  infoTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 1,
    color: color.ink,
  },
  safeCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  safeCheckText: {
    flex: 1,
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.ink,
  },
  flourishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  flourishDash: {
    flex: 1,
    maxWidth: 110,
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(236, 72, 153, 0.4)',
  },

  /* active */
  activeCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg + 6,
    overflow: 'hidden',
    shadowColor: color.ink,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activePhoto: { width: '100%', height: 210 },
  activePhotoBand: { width: '100%', height: 120, backgroundColor: color.veil },
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
    gap: spacing.md,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  activeWords: { flex: 1, gap: spacing.xs + 2 },
  activeName: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    color: color.ink,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(25, 154, 98, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  activeChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#199A62',
  },
  activeChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: '#127B4E',
  },
  untilRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  untilText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    color: color.inkMuted,
  },
  bigFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(236, 72, 153, 0.28)',
    borderRadius: radius.pill,
    minHeight: 58,
  },
  bigFilledLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 2,
    color: DEEP,
  },
  bigOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.45)',
    borderRadius: radius.pill,
    minHeight: 56,
  },
  bigOutlineLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 1,
    color: DEEP,
  },
});
