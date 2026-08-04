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
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Caption, EmptyState, Loading, Notice, PhotoScrim, Screen, SkeletonRows } from '../components/ui';
import { ProfileRing } from '../components/ProfileRing';
import { apiErrorMessage, COPY, COPY_FOR, upperCase } from '../copy';
import {
  ApiError,
  deniedLocation,
  deviceLocation,
  fixedLocation,
  getApi,
  isFakeApiEnabled,
  type ActiveCheckin,
  type ForegroundLocationReader,
  type GooglePlaceHit,
  type HotelCard,
  type CheckinEntitlement,
} from '../data';
import { MIN_QUERY_WEIGHT, normalizeQuery, queryWeight } from '../domain/searchQuery';
import { getHotelById } from '../fixtures/hotels';
import type { TabParamList } from '../navigation/types';

import { color, elevation, font, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

const HERO = require('../../assets/nearby-hero.jpg');

/** The brand as text or a small glyph — the fill itself cannot carry a word. */
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

/* ------------------------------------------------------- category styling */

/**
 * The sheet's category tints, D-058 style: three semantic families rather
 * than one hue per kind — coral for the places a stay or a night out is
 * built around, gold for a stop along the way, green for the shore — each
 * the pale `Soft` fill with the matching dark-sibling `tone` for the glyph
 * and the chip label, so every combination clears text contrast on its own
 * tint (`__tests__/theme.test.ts` proves the pairs, not just this file).
 */
const KIND_META: Record<string, { label: () => string; tint: string; tone: string }> = {
  hotel: { label: () => COPY.checkin.kindHotel, tint: color.accentSoft, tone: color.accentDeep },
  area: { label: () => COPY.checkin.kindArea, tint: color.accentSoft, tone: color.accentDeep },
  cafe: { label: () => COPY.checkin.kindCafe, tint: color.premiumSoft, tone: color.premium },
  restaurant: { label: () => COPY.checkin.kindRestaurant, tint: color.accentSoft, tone: color.accentDeep },
  bar: { label: () => COPY.checkin.kindBar, tint: color.accentSoft, tone: color.accentDeep },
  beach: { label: () => COPY.checkin.kindBeach, tint: color.successSoft, tone: color.success },
  // D-049: places built for a crowd — arenas, açıkhavas, parks, museums.
  venue: { label: () => COPY.checkin.kindVenue, tint: color.premiumSoft, tone: color.premium },
};

function kindMeta(kind: string | null) {
  return (
    (kind && KIND_META[kind]) || {
      label: () => COPY.checkin.kindVenue,
      tint: color.accentSoft,
      tone: color.accentDeep,
    }
  );
}

/* ------------------------------------------------------------------ screen */

export function CheckinScreen({
  reader = deviceLocation,
}: { reader?: ForegroundLocationReader } = {}) {
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [checkin, setCheckin] = useState<ActiveCheckin | null | undefined>(undefined);
  const [reading, setReading] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearby, setNearby] = useState<HotelCard[] | null>(null);
  /** Live Google results for the current reading; never persisted. */
  const [nearbyGoogle, setNearbyGoogle] = useState<GooglePlaceHit[]>([]);
  /** The live provider had no answer — the one case the catalogue steps in. */
  const [googleDown, setGoogleDown] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * N-07: the allowance, as the server reports it. Never derived here — a
   * screen that computes what it is entitled to is a screen that can disagree
   * with the server about somebody's rights.
   */
  const [entitlement, setEntitlement] = useState<CheckinEntitlement | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
  /**
   * D-052/D-053: what Google has been asked, keyed by the same normalized query
   * the backend fingerprints. Three states per key, and the distinctions matter:
   *
   *   absent      — never asked for this name, so the option is on offer.
   *   an array    — what came back, an empty one included: Google answered and
   *                 knows no such place near here.
   *   `null`      — asked, and it could not be answered: no key, a spent
   *                 ceiling, a rate limit, an unwell provider. Not the same
   *                 fact as an empty street, and said differently.
   *
   * Keyed by query rather than a single "already tried" flag, because that flag
   * was the bug: one empty or failed answer retired the option for the rest of
   * the visit, so a person who mistyped a name had no second try.
   */
  const [googleAsked, setGoogleAsked] = useState<Map<string, GooglePlaceHit[] | null>>(
    () => new Map(),
  );
  /**
   * The open advanced-search session (D-053). Carried back so Google bills one
   * session rather than a request per keystroke; the server owns its limits.
   */
  const [googleSession, setGoogleSession] = useState<string | null>(null);
  /**
   * Google names resolved for display, for this session only. The schema
   * stores a Place ID and nothing else (D-052), so this map is the entire
   * lifetime of a Google name inside the app — and it exists so one name is
   * fetched once rather than per render.
   */
  const resolvedNames = useRef<Map<string, string>>(new Map());
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  /** The name in the box, as the backend would group it (D-053 §3). */
  const fingerprint = normalizeQuery(query);
  /** Google's answer for *that* name — never a previous name's list. */
  const googlePlaces = googleAsked.get(fingerprint) ?? null;

  /**
   * Records an answer against the query that produced it. A new Map rather than
   * a mutation, so the render that draws the list is the render that knows.
   */
  const rememberGoogle = (asked: string, places: GooglePlaceHit[] | null) => {
    setGoogleAsked((current) => new Map(current).set(asked, places));
  };

  /**
   * Forgets everything Google, and why that is not merely tidiness: the
   * selection tokens in those lists are single-use and short-lived, and the
   * predictions were restricted to a circle around the reading we no longer
   * hold. Offering either again would be offering something that cannot work.
   */
  const forgetGoogle = () => {
    setGoogleAsked(new Map());
    setGoogleSession(null);
  };

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

  /**
   * A Google-labelled check-in arrives from the server as an id (D-052), so
   * the name is fetched once here and kept in session memory. If it cannot be
   * resolved the card falls back to "where you are" — never to a blank.
   */
  useEffect(() => {
    const placeId = checkin?.googlePlaceId ?? null;
    if (!placeId) {
      setActiveLabel(null);
      return;
    }
    const remembered = resolvedNames.current.get(placeId);
    if (remembered) {
      setActiveLabel(remembered);
      return;
    }
    let cancelled = false;
    getApi()
      .resolveGooglePlace(placeId)
      .then((identity) => {
        const name = identity?.name;
        if (cancelled || !name) return;
        resolvedNames.current.set(placeId, name);
        setActiveLabel(name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [checkin?.googlePlaceId]);

  /** One reading serves both the list and every check-in made from it. */
  const lookAround = async (source: ForegroundLocationReader) => {
    setBusy(true);
    setNotice(null);
    // Never leave a previous reading armed while a fresh permission/location
    // request is in flight. If consent is denied or the device cannot produce
    // a fix, the old point must not remain usable for a new check-in.
    setReading(null);
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
    // D-048/D-049: the foreground reading is enough to check in "here".
    // Venue discovery is enrichment, not a prerequisite. Move to the list
    // state before asking the provider so a 503 still leaves the guaranteed
    // here-anchor reachable.
    setReading({ latitude: read.latitude, longitude: read.longitude });
    setNearby([]);
    setNearbyGoogle([]);
    // A new reading is a new place: the old predictions were restricted to a
    // circle around a point we no longer stand on.
    forgetGoogle();
    const api = getApi();
    const [catalogueResult, googleResult] = await Promise.allSettled([
      api.nearbyVenues(read.latitude, read.longitude),
      api.googleNearbyPlaces(read.latitude, read.longitude),
    ]);
    if (catalogueResult.status === 'fulfilled') {
      setNearby(catalogueResult.value);
    }
    if (googleResult.status === 'fulfilled' && googleResult.value) {
      setNearbyGoogle(googleResult.value.places);
    }
    setGoogleDown(googleResult.status === 'rejected' || googleResult.value === null);
    if (
      catalogueResult.status === 'rejected' &&
      (googleResult.status === 'rejected' || googleResult.value === null)
    ) {
      const error = catalogueResult.reason;
      setNotice({
        message: error instanceof ApiError ? apiErrorMessage(error.code) : COPY.errors.unknown,
        tone: 'error',
      });
    }
    setBusy(false);
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
          // A catalogue pick carries no Google label (D-052).
          googlePlaceId: null,
          expiresAt: answer.expiresAt ?? Date.now(),
        };
        lastSeenExpiry = active.expiresAt;
        setCheckin(active);
        setNearby(null);
        setNearbyGoogle([]);
        setReading(null);
        setQuery('');
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
        setNearbyGoogle([]);
        setReading(null);
        setQuery('');
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
   * D-052: the third step of the picker, and only on a press. Google is asked
   * for the ten nearest places, shown in their own list with the attribution
   * their terms require, and nothing about the answer is stored.
   */
  // N-07: read once the Google step is on the table, and again after a
  // completed labelled check-in — those are the only two moments the number
  // can have changed.
  useEffect(() => {
    let cancelled = false;
    getApi()
      .googleCheckinEntitlement()
      .then((summary) => {
        if (!cancelled) setEntitlement(summary);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [checkin]);

  const askGoogle = async () => {
    // D-053: a *typed* name, so there is nothing to ask until one exists.
    // D-053 §3: three non-whitespace characters, enforced again on the server.
    if (!reading || busy || queryWeight(query) < MIN_QUERY_WEIGHT) return;
    // This exact name has had its turn. The backend would answer `duplicate`
    // and charge its session cap for a request it did not make, so the client
    // does not ask — the same saving, one round trip earlier.
    if (googleAsked.has(fingerprint)) return;
    setBusy(true);
    setNotice(null);
    try {
      const answer = await getApi().googlePlaceSearch(
        query.trim(),
        reading.latitude,
        reading.longitude,
        googleSession ?? undefined,
      );
      if (!answer) {
        // Honest about which "no" this is: the option is unavailable, the
        // street is not empty. Recorded against this name only, so a different
        // name is a fresh attempt rather than a dead screen.
        rememberGoogle(fingerprint, null);
        setNotice({ message: COPY.checkin.googleUnavailable, tone: 'info' });
        return;
      }
      // The server owns the session; take a new id, never re-set the same one.
      setGoogleSession((current) => (current === answer.sessionId ? current : answer.sessionId));
      // `duplicate` means nothing was asked upstream, so whatever we already
      // hold for this name is the answer — and if we hold nothing, it is an
      // empty one. Reachable only if our memory was cleared while the server's
      // session survived, which the clearing below makes unlikely rather than
      // impossible.
      const places = answer.duplicate ? (googleAsked.get(fingerprint) ?? []) : answer.places;
      rememberGoogle(fingerprint, places);
      if (places.length === 0) {
        // Google answered, and knows no such place near here. A different
        // sentence from "the option is unavailable", because it is a different
        // fact — and without it an empty answer drew nothing at all.
        setNotice({ message: COPY.checkin.googleNoResults, tone: 'info' });
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * A Google-labelled check-in. The anchor is still our own cell, and what
   * travels is the single-use selection token the backend issued — the client
   * never holds a Place ID, so it cannot assert a label it was not given.
   */
  const checkInAtGoogle = async (place: GooglePlaceHit) => {
    if (!reading || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await getApi().checkinHere(reading.latitude, reading.longitude, place.selectionToken);
      const active = await getApi().getCheckin();
      if (active) {
        // The prediction text is good enough to show *this* user right away,
        // and it stays in session memory only (D-053 §5).
        if (active.googlePlaceId) resolvedNames.current.set(active.googlePlaceId, place.name);
        setActiveLabel(place.name);
        lastSeenExpiry = active.expiresAt;
        setCheckin(active);
        setNearby(null);
        setNearbyGoogle([]);
        setReading(null);
        setQuery('');
        forgetGoogle();
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
        <Loading testID="checkin-loading" />
      </Screen>
    );
  }

  const previewShore = isFakeApiEnabled() ? getHotelById('hotel-lara-shore') : null;
  const expiredRecently = !checkin && lastSeenExpiry !== null && lastSeenExpiry < Date.now();

  const venueRow = (venue: HotelCard, keyPrefix: string) => {
    const meta = kindMeta(venue.kind);
    const detail = venue.address ?? venue.city;
    return (
      <Pressable
        key={`${keyPrefix}-${venue.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${venue.name}, ${detail}`}
        onPress={() => checkInAt(venue)}
        disabled={busy}
        style={({ pressed }) => [styles.venueRow, pressed && styles.pressed]}
        testID={`checkin-venue-${venue.id}`}
      >
        {/* N-02 (153:85): the name, and the kind as its tracked word under
            it. The address stays in the accessible label, where two same-name
            places still need telling apart. */}
        <View style={styles.venueWords}>
          <Text style={styles.venueName} numberOfLines={1}>{venue.name}</Text>
          <Text style={styles.venueKind}>{upperCase(meta.label())}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  const googleVenueRow = (place: GooglePlaceHit, keyPrefix: string) => {
    const meta = kindMeta(place.kind);
    return (
      <Pressable
        key={`${keyPrefix}-${place.selectionToken}`}
        accessibilityRole="button"
        accessibilityLabel={place.detail ? `${place.name}, ${place.detail}` : place.name}
        disabled={busy}
        onPress={() => checkInAtGoogle(place)}
        style={({ pressed }) => [styles.venueRow, pressed && styles.pressed]}
        testID={`checkin-google-${place.selectionToken}`}
      >
        <View style={styles.venueWords}>
          <Text style={styles.venueName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.venueKind}>{upperCase(meta.label())}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  /* ---------------------------------------------------- 3: active check-in */
  if (checkin) {
    const meta = kindMeta(checkin.kind);
    // The live remainder, from the same clock the expiry watcher reads.
    const remainingMs = Math.max(0, checkin.expiresAt - Date.now());
    const remainH = Math.floor(remainingMs / 3_600_000);
    const remainM = Math.floor((remainingMs % 3_600_000) / 60_000);
    return (
      <Screen safeTop testID="screen-checkin">
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.titleSm}>{COPY.tabs.nearbyTab}</Text>
          <ProfileRing testID="checkin-profile-ring" />
        </View>
        <Text style={styles.subtitleSm}>{COPY.checkin.activeSubtitle}</Text>

        {/* N-03 (153:111): the state is one card — the green line, the
            place's name, its kind and validity, the live remainder, and the
            three ways out stacked inside. */}
        <View style={styles.activeCard} testID="checkin-active">
          <View style={styles.livePill}>
            <Text style={styles.livePillDot}>{'●'}</Text>
            <Text style={styles.livePillText}>{COPY.checkin.activeChip}</Text>
          </View>
          <Text style={styles.activeName}>
            {checkin.venueName ?? activeLabel ?? COPY.checkin.hereLabel}
          </Text>
          {/* Google's terms ask for the credit wherever its answer shows. */}
          {checkin.googlePlaceId && activeLabel ? (
            <Text style={styles.attribution}>{COPY.checkin.googleAttribution}</Text>
          ) : null}
          <Text style={styles.activeKindLine}>
            {`${upperCase(meta.label())} · ${COPY.checkin.validFor}`}
          </Text>
          <View style={styles.remainRow}>
            <ClockIcon tone={DEEP} size={13} />
            <Text style={styles.remainText}>{COPY_FOR.remainingTime(remainH, remainM)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => tabNavigation.navigate('Discovery', { source: 'NEARBY' })}
            style={({ pressed }) => [styles.bigFilled, pressed && styles.pressed]}
            testID="checkin-see-nearby"
          >
            <Text style={styles.bigFilledLabel}>{COPY.checkin.seeNearby}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCheckin(null)}
            disabled={busy}
            style={({ pressed }) => [styles.bigOutline, pressed && styles.pressed]}
            testID="checkin-change"
          >
            <Text style={styles.bigOutlineLabel}>{COPY.checkin.changeCheckin}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.checkin.checkOut}
            onPress={endCheckin}
            disabled={busy}
            style={({ pressed }) => [styles.checkOutRow, pressed && styles.pressed]}
            testID="checkin-clear"
          >
            <Text style={styles.checkOutText}>{COPY.checkin.checkOut}</Text>
          </Pressable>
        </View>
        <Caption>{COPY.checkin.safeCheck}</Caption>

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
    const matches = (parts: (string | null | undefined)[]) =>
      !searching || normalizeQuery(parts.filter(Boolean).join(' ')).includes(fingerprint);
    const liveShown = nearbyGoogle.filter((place) => matches([place.name, place.detail]));
    // Owner decision (2026-08-03): when the live provider answered, its list
    // IS the list. The open-data catalogue's kinds proved too wrong to stand
    // beside it — apartments as hotels, coffee brands as lodging — so it
    // steps in only when Google had no answer at all, and says so.
    const catalogueShown = nearbyGoogle.length > 0
      ? []
      : nearby.filter(
          (venue) =>
            // Hotels stay out of Çevremde (owner, 2026-08-03) — they are the
            // trip tab's subject, and here they drowned the places that are
            // actually around.
            venue.kind !== 'hotel' &&
            matches([venue.name, venue.address, venue.city, venue.country]),
        );
    const shownCount = liveShown.length + catalogueShown.length;
    return (
      <Screen safeTop testID="screen-checkin">
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.titleSm}>{COPY.tabs.nearbyTab}</Text>
          {/* The sheet's corner ring (11:76), still doing the useful job:
              another location read, for the list under it. */}
          {/* Two things belong in this corner here: another reading for the
              list under it, and the same route to Settings the other four
              primary screens have. */}
          <View style={styles.cornerPair}>
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
            <ProfileRing testID="checkin-list-profile-ring" />
          </View>
        </View>
        <Text style={styles.subtitleSm}>{COPY.checkin.listSubtitle}</Text>

        {/* N-02 (153:75), D-048: the anchor that always exists — where you
            are standing — first, in its wash card, never only under an
            emptiness. */}
        <View style={styles.hereCard}>
          <Text style={styles.hereLabel}>{upperCase(COPY.checkin.hereLabel)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.checkin.hereCta}
            accessibilityState={{ disabled: !reading || busy }}
            disabled={!reading || busy}
            onPress={checkInHere}
            style={({ pressed }) => [styles.bigFilled, pressed && styles.pressed]}
            testID="checkin-here"
          >
            <Text style={styles.bigFilledLabel}>{COPY.checkin.hereCta}</Text>
          </Pressable>
        </View>

        {/* The written search stands over the list it filters (owner,
            2026-08-03) — at the foot of a long list it was unfindable. */}
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

        <Text style={styles.kicker}>{upperCase(COPY.checkin.aroundYou)}</Text>

        {busy ? (
          <SkeletonRows avatar={false} testID="checkin-looking" />
        ) : null}
        {shownCount === 0 && !busy ? (
          <EmptyState message={COPY.checkin.noVenues} testID="checkin-no-venues" />
        ) : (
          <>
            {liveShown.length > 0 ? (
              <View style={styles.rowList} testID="checkin-live-google-list">
                {liveShown.map((place) => googleVenueRow(place, 'live'))}
                <Text style={styles.attribution}>{COPY.checkin.googleAttribution}</Text>
              </View>
            ) : null}
            {catalogueShown.length > 0 && googleDown ? (
              <Notice message={COPY.checkin.nearbyProviderUnavailable} testID="checkin-live-down" />
            ) : null}
            {catalogueShown.length > 0 ? (
              <View style={styles.rowList}>
                {catalogueShown.map((venue) => venueRow(venue, searching ? 'found' : 'near'))}
              </View>
            ) : null}
          </>
        )}


        {/* Step three (D-052): opened by hand, after our own catalogue and the
            written search have both had their turn. Google's answers stay in
            their own list, credited, and nothing about them is stored. */}
        {googlePlaces && googlePlaces.length > 0 ? (
          <View style={[styles.googleBlock, styles.rowList]} testID="checkin-google-list">
            <Text style={styles.attribution}>{COPY.checkin.googleAttribution}</Text>
            {googlePlaces.map((place) => googleVenueRow(place, 'advanced'))}
          </View>
        ) : googleAsked.has(fingerprint) ||
          queryWeight(query) < MIN_QUERY_WEIGHT ||
          shownCount > 0 ? null : (
          /* D-053's order, exactly: this appears only once a name has been
             typed *and* our own catalogue came up empty — "kullanıcı
             bulamazsa". A button that cannot do anything yet is a button that
             lies.

             The first test is per *name*, not per visit: an empty or failed
             answer retires the option for that spelling only, so the next name
             typed gets its own turn. Retyping the same one does not, which is
             what keeps a spent ceiling from being hammered. */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.checkin.googleMore}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={askGoogle}
            style={({ pressed }) => [styles.googleMoreRow, pressed && styles.pressed]}
            testID="checkin-google-more"
          >
            <Text style={styles.googleMoreText}>{COPY.checkin.googleMore}</Text>
          </Pressable>
        )}

        {/* N-07: what pressing that button costs, before it is pressed. The
            server counts; this only reads. */}
        {entitlement ? (
          <Text style={styles.entitlementText} testID="checkin-entitlement">
            {entitlement.remaining > 0
              ? COPY.checkin.entitlementLeft(entitlement.remaining, entitlement.limit)
              : COPY.checkin.entitlementNone}
          </Text>
        ) : null}

        {notice ? (
          <Notice
            message={notice.message}
            tone={notice.tone === 'error' ? 'error' : undefined}
            testID="checkin-notice"
          />
        ) : null}
        {/* ODbL. The catalogue under this list is OpenStreetMap/Overture data
            and had no credit on screen at all — only Google's answers did,
            which is the wrong way round given whose data is shown by default. */}
        <Caption testID="checkin-catalog-attribution">{COPY.checkin.catalogAttribution}</Caption>
      </Screen>
    );
  }

  /* -------------------------------------------------------------- 2: intro */
  return (
    <Screen safeTop testID="screen-checkin">
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.title}>{COPY.tabs.nearbyTab}</Text>
        {/* D-057: this corner held a decorative pin, so Çevremde was the one
            primary screen with no way to Settings at all. */}
        <ProfileRing testID="checkin-profile-ring" />
      </View>
      <Text style={styles.subtitle}>{COPY.checkin.idleSubtitle}</Text>

      {/* N-01 (152:75): the photo as a full-width band with the claim on
          its scrim — not a tall column beside a hole of empty space. */}
      <View style={styles.heroBand}>
        <Image
          source={HERO}
          style={styles.heroBandPhoto}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <PhotoScrim />
        <View style={styles.heroBandText}>
          <Text style={styles.heroBandTitle}>{COPY.checkin.introTitle}</Text>
          <Text style={styles.heroBandBody}>{COPY.checkin.introShort}</Text>
        </View>
      </View>

      {/* N-01 (152:80): the four facts as a 2×2 grid, not a column. */}
      <Text style={styles.kicker}>{upperCase(COPY.checkin.howTitle)}</Text>
      <View style={styles.factsGrid}>
        {[
          [
            { icon: <PinIcon tone={DEEP} size={14} />, text: COPY.checkin.howLocation },
            { icon: <SparkleIcon size={14} />, text: COPY.checkin.howFree },
          ],
          [
            { icon: <ClockIcon size={14} />, text: COPY.checkin.howDuration },
            { icon: <ShieldPlusIcon size={14} />, text: COPY.checkin.howPrivacy },
          ],
        ].map((rowItems, rowIndex) => (
          <View key={rowIndex} style={styles.factsRow}>
            {rowItems.map((fact, index) => (
              <View key={index} style={styles.factCell}>
                <View style={styles.factDisc}>{fact.icon}</View>
                <Text style={styles.factText}>{fact.text}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => lookAround(reader)}
        disabled={busy}
        style={({ pressed }) => [styles.findButton, pressed && styles.pressed]}
        testID="checkin-look-around"
      >
        <Text style={styles.findButtonLabel}>{COPY.checkin.findVenues}</Text>
      </Pressable>
      {busy ? (
        <SkeletonRows avatar={false} testID="checkin-looking" />
      ) : null}

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
        /* N-04 (154:72): the ended check-in gets a card of its own — the
           clock in its disc, the fact, and the way back as its foot. The
           whole card is the press. */
        <Pressable
          accessibilityRole="button"
          onPress={() => lookAround(reader)}
          disabled={busy}
          style={({ pressed }) => [styles.expiredCard, pressed && styles.pressed]}
          testID="checkin-expired"
        >
          <View style={styles.expiredDisc}>
            <ClockIcon size={24} />
          </View>
          <Text style={styles.expiredTitle}>{COPY.checkin.expiredTitle}</Text>
          <Text style={styles.expiredBody}>{COPY.checkin.expiredBody}</Text>
          <View style={styles.expiredCta}>
            <Text style={styles.findButtonLabel}>{COPY.checkin.findVenues}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* N-01 (152:101): the privacy sentence in one quiet row. */}
      <View style={styles.privacyRow}>
        <View style={styles.privacyDisc}>
          <ShieldLockIcon />
        </View>
        <Text style={styles.privacyText}>{COPY.checkin.privacyCardBody}</Text>
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
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** D-063: one head across all three states — Lora 30 on a 42 line. */
  title: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 42,
    color: color.ink,
  },
  titleSm: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 42,
    color: color.ink,
  },
  /** The corner ring (11:76): the empty frame, an operable control's edge. */
  profileRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.4,
    borderColor: color.border,
  },
  ringCentered: { alignItems: 'center', justifyContent: 'center' },
  cornerPair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
    fontSize: 14,
    lineHeight: 20,
    color: color.inkMuted,
  },
  /** The corner badge (1:5): the panel disc with the 1.5 control edge. */
  pressed: { opacity: 0.8 },

  /* list — the sheet's search pill (11:78) and venue rows (11:80). */
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
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
  /** 153:80: the row is the name and its kind — 16 corners, 13/14 seat. */
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    ...elevation.card,
  },
  venueDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueWords: { flex: 1, gap: 3 },
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
  /* intro — the Figma hero (1:7): a solid panel, 28 corners, 16 inside. */
  heroCard: {
    backgroundColor: color.surface,
    borderRadius: 28,
    padding: spacing.md,
    gap: spacing.md,
    ...elevation.card,
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
  /** Flat coral, same recipe as the shared `Button`'s primary variant. */
  findButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: color.accent,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingVertical: 16,
    ...elevation.card,
    shadowColor: color.accent,
    shadowOpacity: 0.28,
  },
  findButtonLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    color: color.onAccent,
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
    ...elevation.card,
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
  /** N-03 (153:111): the one card the active state is. */
  activeCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    ...elevation.card,
  },
  activePhoto: { width: '100%', height: 170 },
  /** No photo yet: the same inert well a thumbnail uses everywhere else. */
  activePhotoBand: { width: '100%', height: 170, backgroundColor: color.veil },
  photoCredit: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: color.onPhoto,
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
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    color: color.ink,
  },
  activeKindLine: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    letterSpacing: 0.8,
    color: color.accentDeep,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  livePillDot: { fontFamily: fontFamily.bodySemi, fontSize: 9, color: color.successMark },
  livePillText: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: color.success },
  remainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: color.accentWash,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
  },
  remainText: { fontFamily: fontFamily.bodyMedium, fontSize: 13, lineHeight: 18, color: color.ink },
  checkOutRow: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  checkOutText: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.accentDeep },
  /** N-01 (152:75): the photo as a band, the claim on its scrim. */
  heroBand: { borderRadius: 24, overflow: 'hidden' },
  heroBandPhoto: { width: '100%', height: 200, backgroundColor: color.veil },
  heroBandText: { position: 'absolute', left: 18, right: 18, bottom: 14, gap: 4 },
  heroBandTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    color: color.onPhoto,
  },
  heroBandBody: { fontFamily: fontFamily.bodyMedium, fontSize: 12, lineHeight: 17, color: color.onPhoto },
  kicker: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
    color: color.inkMuted,
  },
  /** N-01 (152:80): four facts, two by two. */
  factsGrid: { gap: 10 },
  factsRow: { flexDirection: 'row', gap: 10 },
  factCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    padding: 10,
  },
  factDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: { flex: 1, fontFamily: fontFamily.bodyMedium, fontSize: 11, lineHeight: 15, color: color.ink },
  /** N-01 (152:101): the privacy sentence in one row. */
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  privacyDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyText: { flex: 1, fontFamily: fontFamily.body, fontSize: 12, lineHeight: 17, color: color.inkMuted },
  /** N-04 (154:72): the ended check-in's own card. */
  expiredCard: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: 22,
    paddingHorizontal: 18,
  },
  expiredDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredTitle: { fontFamily: fontFamily.display, fontSize: 19, lineHeight: 25, color: color.ink },
  expiredBody: {
    fontFamily: fontFamily.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  expiredCta: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    paddingVertical: 14,
  },
  /** Rows inside a section stand 14 apart, like the screen's own rhythm. */
  rowList: { gap: 14 },
  /** N-02 (153:75): the standing-here anchor, first and in its wash. */
  hereCard: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: color.accentWash,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  entitlementText: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    lineHeight: 14,
    color: color.inkMuted,
    textAlign: 'center',
  },
  hereLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    letterSpacing: 1,
    color: color.accentDeep,
  },
  /** N-02: the kind as the tracked word under the name. */
  venueKind: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 9,
    letterSpacing: 0.8,
    color: color.accentDeep,
  },
  googleMoreRow: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  googleMoreText: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.accentDeep },
  untilRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  untilText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.inkMuted,
  },
  /** Flat coral, the same recipe the shared `Button`'s primary variant uses. */
  bigFilled: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: color.accent,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingVertical: 14,
    ...elevation.card,
    shadowColor: color.accent,
    shadowOpacity: 0.28,
  },
  bigFilledLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.onAccent,
  },
  /** White, 1.5 control edge — the shared `Button`'s secondary variant. */
  /**
   * 12 + a 19pt line + 12 comes to 43, one point under the minimum — measured
   * on the running app, on the pair that changes and *ends* a check-in. The
   * shared `Button` carries a `minHeight` for exactly this reason; these
   * hand-rolled pills did not.
   */
  bigOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
  bigOutlineLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
  /** The sheet's safety card (11:166): a white card, 18 corners, the 44 veil disc. */
  safeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
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
  googleBlock: { gap: spacing.sm },
  /** Small, quiet, and never omitted where Google's answer is drawn. */
  attribution: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: color.inkMuted,
  },
  safeTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 14,
    color: color.ink,
  },
});
