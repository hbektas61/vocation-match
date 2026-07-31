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

import { Caption, EmptyState, Notice, PhotoScrim, Screen, StateChip } from '../components/ui';
import { ProfileRing } from '../components/ProfileRing';
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
  type GooglePlaceHit,
  type HotelCard,
  type CheckinEntitlement,
} from '../data';
import { MIN_QUERY_WEIGHT, normalizeQuery, queryWeight } from '../domain/searchQuery';
import { getHotelById } from '../fixtures/hotels';
import type { TabParamList } from '../navigation/types';

import { color, elevation, font, fontFamily, radius, spacing } from '../theme';

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

const CoffeeIcon = ({ tone = color.premium }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M4 11h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <Path d="M16 12h1.5a2.5 2.5 0 0 1 0 5H16" />
    <Path d="M8 8c0-1 .8-1.2.8-2.2M11.5 8c0-1 .8-1.2.8-2.2" strokeWidth={1.6} />
  </Svg>
);

const CutleryIcon = ({ tone = color.accentDeep }: { tone?: string }) => (
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

const WavesIcon = ({ tone = color.success }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
  </Svg>
);

/** A crowd's place (D-049): a stage under its arch. */
const StageIcon = ({ tone = DEEP }: { tone?: string }) => (
  <Svg {...stroke(tone)}>
    <Path d="M3 21h18M5 21V10l7-5 7 5v11" />
    <Path d="M9 21v-5h6v5" />
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
    case 'venue':
      return <StageIcon tone={tone} />;
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
  /**
   * N-07: the allowance, as the server reports it. Never derived here — a
   * screen that computes what it is entitled to is a screen that can disagree
   * with the server about somebody's rights.
   */
  const [entitlement, setEntitlement] = useState<CheckinEntitlement | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
  const searchSeq = useRef(0);
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
      .then((name) => {
        if (cancelled || !name) return;
        resolvedNames.current.set(placeId, name);
        setActiveLabel(name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [checkin?.googlePlaceId]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        // D-051: this asks "what is this place I am in", not "where am I
        // staying" — so it may answer with a café, a bar, a stadium.
        const found = await getApi().searchVenues(trimmed);
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
    // A new reading is a new place: the old predictions were restricted to a
    // circle around a point we no longer stand on.
    forgetGoogle();
    try {
      const found = await getApi().nearbyVenues(read.latitude, read.longitude);
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
          // A catalogue pick carries no Google label (D-052).
          googlePlaceId: null,
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
        setReading(null);
        setQuery('');
        setResults([]);
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
          <ProfileRing testID="checkin-profile-ring" />
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
                <>
                  {/* Mandatory under any text on a photograph — the credit is
                      real text sitting on real photos of any brightness. */}
                  <PhotoScrim />
                  <Text style={styles.photoCredit} numberOfLines={1}>{checkin.photoAttribution}</Text>
                </>
              ) : null}
            </View>
          ) : (
            /* No photo yet: the same inert well a thumbnail uses elsewhere. */
            <View style={styles.activePhotoBand} />
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
                {checkin.venueName ?? activeLabel ?? COPY.checkin.hereLabel}
              </Text>
              {/* Google's terms ask for the credit wherever its answer shows. */}
              {checkin.googlePlaceId && activeLabel ? (
                <Text style={styles.attribution}>{COPY.checkin.googleAttribution}</Text>
              ) : null}
              <StateChip open label={COPY.checkin.activeChip} />
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
          <PeopleIcon tone={color.onAccent} size={18} />
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

        {/* The sheet's safety card (11:166): a white card, 18 corners, the 44 well. */}
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
          <EmptyState message={COPY.checkin.noVenues} testID="checkin-no-venues" />
        ) : (
          shown.map((venue) => venueRow(venue, searching ? 'found' : 'near'))
        )}

        {/* Step three (D-052): opened by hand, after our own catalogue and the
            written search have both had their turn. Google's answers stay in
            their own list, credited, and nothing about them is stored. */}
        {googlePlaces && googlePlaces.length > 0 ? (
          <View style={styles.googleBlock} testID="checkin-google-list">
            <Text style={styles.attribution}>{COPY.checkin.googleAttribution}</Text>
            {googlePlaces.map((place) => (
              <Pressable
                key={place.selectionToken}
                accessibilityRole="button"
                accessibilityLabel={
                  place.detail ? `${place.name}, ${place.detail}` : place.name
                }
                disabled={busy}
                onPress={() => checkInAtGoogle(place)}
                style={({ pressed }) => [styles.venueRow, pressed && styles.pressed]}
                testID={`checkin-google-${place.selectionToken}`}
              >
                <View style={[styles.venueDisc, { backgroundColor: color.accentSoft }]}>
                  <PinIcon tone={DEEP} size={18} />
                </View>
                <View style={styles.venueWords}>
                  <Text style={styles.venueName} numberOfLines={1}>{place.name}</Text>
                  {place.detail ? (
                    <Text style={styles.venueCity} numberOfLines={1}>{place.detail}</Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : googleAsked.has(fingerprint) ||
          queryWeight(query) < MIN_QUERY_WEIGHT ||
          shown.length > 0 ? null : (
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
            style={({ pressed }) => [styles.bigOutline, pressed && styles.pressed]}
            testID="checkin-google-more"
          >
            <MagnifierIcon />
            <Text style={styles.bigOutlineLabel}>{COPY.checkin.googleMore}</Text>
          </Pressable>
        )}

        {/* N-07: what pressing that button costs, before it is pressed. The
            server counts; this only reads. */}
        {entitlement ? (
          <Caption testID="checkin-entitlement">
            {entitlement.remaining > 0
              ? COPY.checkin.entitlementLeft(entitlement.remaining, entitlement.limit)
              : COPY.checkin.entitlementNone}
          </Caption>
        ) : null}

        {/* Always here, never only under an emptiness: the map missing the
            place you are standing in is the ordinary case (D-048). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.checkin.hereCta}
          accessibilityState={{ disabled: !reading || busy }}
          disabled={!reading || busy}
          onPress={checkInHere}
          style={({ pressed }) => [
            shown.length === 0 ? styles.bigFilled : styles.bigOutline,
            pressed && styles.pressed,
          ]}
          testID="checkin-here"
        >
          <PinIcon tone={shown.length === 0 ? color.onAccent : color.ink} size={16} />
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
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.inkMuted,
  },
  subtitleHeart: { color: color.accentDeep },
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
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 18,
    padding: 12,
    ...elevation.card,
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
  activeCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 22,
    overflow: 'hidden',
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
    fontFamily: fontFamily.bodySemi,
    fontSize: 17,
    color: color.ink,
  },
  untilRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  untilText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.inkMuted,
  },
  /** Flat coral, the same recipe the shared `Button`'s primary variant uses. */
  bigFilled: {
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
  bigOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
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
