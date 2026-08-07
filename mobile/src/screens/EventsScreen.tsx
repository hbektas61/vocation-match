/**
 * Etkinlikler — the fourth primary feature (D-056).
 *
 * Two things this screen is careful about, and they are the same thing twice:
 *
 *   1. **It calls the provider for exactly one unasked thing** (owner
 *      revision, 2026-08-04): the first open with no area tries the device's
 *      own location once, because "where am I" is the answer nearly everyone
 *      was typing by hand. Denied or unavailable falls back to the picker in
 *      silence. Beyond that one attempt, every request is still downstream of
 *      somebody choosing an area, a bucket or a chip (§3.2) — a tab that
 *      polls is a tab that spends a quota on people who are not looking.
 *
 *   2. **It says which of the nine "no"s happened.** Nothing found, provider
 *      down, day's ceiling reached, offline, feature off, permission denied —
 *      §3.4 requires those to be distinguishable, because a spinner that means
 *      all of them makes the screen look broken in most of them.
 *
 * Everything drawn from the provider is a lease: it lives in this component's
 * state while the list is on screen and is written down nowhere.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  Button,
  Caption,
  Chip,
  Field,
  Notice,
  Screen,
  ScreenHeader,
  SkeletonCard,
  Spinner,
} from '../components/ui';
import { CalendarIllustration } from '../components/RoomIllustrations';
import { COPY, COPY_FOR, getLocale, upperCase } from '../copy';
import {
  deviceLocation,
  getApi,
  type EventArea,
  type EventCard,
  type EventCategory,
  type EventContent,
  type EventSearchResult,
  type ForegroundLocationReader,
  type MyEvent,
} from '../data';
import {
  countryOptions,
  filterCountries,
  suggestedCountries,
  type CountryOption,
} from '../domain/countries';
import { nowMs } from '../clock';
import { dayMonthPlate, formatDayMonthLong } from '../domain/dates';
import type { RootStackParamList } from '../navigation/types';
import {
  color,
  elevation,
  font,
  fontFamily,
  leading,
  overlay,
  radius,
  spacing,
  tokens,
  tracking,
  MIN_TOUCH,
} from '../theme';

/** The shared outline recipe every drawn icon in this product uses (D-058). */
const iconStroke = (tone: string, size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: tone,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** ED-01: the search pill says it is a search before a word is typed —
    in coral, the same voice every drawn glyph speaks (owner, 2026-08-05). */
const MagnifierIcon = () => (
  <Svg {...iconStroke(color.accent, 18)}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="m20 20-3.5-3.5" />
  </Svg>
);

/* The owner's Events sheet (2026-08-05) draws four small marks: the pin on
   the area row, and the calendar / clock / pin that label a card's facts. */
const PinIcon = ({ tone = color.ink, size = 16 }: { tone?: string; size?: number }) => (
  <Svg {...iconStroke(tone, size)}>
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={2.6} />
  </Svg>
);

/** The saveable heart in the card's corner — outline until it is pressed. */
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <Svg
    {...iconStroke(color.accent, 18)}
    fill={filled ? color.accent : 'none'}
  >
    <Path d="M12 20c-4-2.9-8-5.9-8-9.8A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 3.2c0 3.9-4 6.9-8 9.8z" />
  </Svg>
);

/** The pair of people on the membership row's disc. */
const PeopleIcon = () => (
  <Svg {...iconStroke(color.accentDeep, 20)}>
    <Circle cx={9} cy={9} r={3.2} />
    <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <Path d="M16 7.5a3 3 0 0 1 0 5.6M17.5 19c0-2.2-.9-3.9-2.3-5" />
  </Svg>
);

/** The (i) that opens the sheet's closing sentence. */
const InfoIcon = () => (
  <Svg {...iconStroke(color.inkMuted, 16)}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 11v5m0-8h.01" />
  </Svg>
);

/** ED-01's empty-state mark: a pennant — an event, not a hotel, not a pin. */
const PennantIcon = ({ size = 26 }: { size?: number } = {}) => (
  <Svg {...iconStroke(color.accent, size)}>
    <Path d="M6 21V3" />
    <Path d="M6 4h11l-2.5 3.5L17 11H6" />
  </Svg>
);

const CHIPS: { key: EventCategory; label: () => string }[] = [
  { key: 'all', label: () => COPY.events.chipAll },
  { key: 'music', label: () => COPY.events.chipMusic },
  { key: 'sports', label: () => COPY.events.chipSports },
  { key: 'arts', label: () => COPY.events.chipArts },
];

/**
 * A word, a glyph and then a colour — in that order, so the state survives
 * being seen by somebody the red does not register for (`E-18`).
 */
function StatusBadge({ label, bad }: { label: string; bad: boolean }) {
  return (
    <View style={[styles.badge, bad && styles.badgeBad]}>
      <Text style={[styles.badgeGlyph, bad && styles.badgeTextBad]}>{bad ? '!' : '\u25CB'}</Text>
      <Text style={[styles.badgeText, bad && styles.badgeTextBad]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** "19 Ağustos · 21:00" — the full month, as E-01 and ED-02 both say it. */
function whenLabel(event: EventCard): string {
  if (event.dateTbd || !event.localDate) return COPY.events.dateTbd;
  const day = formatDayMonthLong(event.localDate);
  const time = event.localTime ? event.localTime.slice(0, 5) : null;
  return time ? `${day} · ${time}` : day;
}

export function EventsScreen({
  reader = deviceLocation,
}: { reader?: ForegroundLocationReader } = {}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [area, setArea] = useState<EventArea | null>(null);
  const [areaDraft, setAreaDraft] = useState('');
  const [choosingArea, setChoosingArea] = useState(true);
  /**
   * The country the city search is pinned to. Typed alone, "Paris" is an
   * ambiguity and "Las Vegas" a spelling test; picked from a local list it
   * costs no request and cannot be misspelt. Türkiye starts as the pin
   * because that is where the product launches — one press changes it.
   */
  const [areaCountry, setAreaCountry] = useState<CountryOption>(() => {
    const options = countryOptions(getLocale());
    return options.find((option) => option.code === 'TR') ?? options[0];
  });
  const [pickingCountry, setPickingCountry] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [category, setCategory] = useState<EventCategory>('all');
  const [upcoming, setUpcoming] = useState<EventSearchResult | null>(null);
  const [mine, setMine] = useState<MyEvent[]>([]);
  /** eventId → its lease, for the memberships list and the detail it opens. */
  const [mineLeases, setMineLeases] = useState<Record<string, EventContent>>({});
  const [permissionDenied, setPermissionDenied] = useState(false);
  /** The one unasked location attempt (owner, 2026-08-04) — never repeated. */
  const autoTried = useRef(false);
  const [busy, setBusy] = useState(false);
  /** Provider image URLs that failed to load — a lease can lapse mid-list. */
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  /**
   * The hearts in the cards' corners. Kept in this component and nowhere
   * else on purpose: a "saved event" is Ticketmaster content the moment it
   * outlives the lease, so it lives exactly as long as the list does.
   */
  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());


  const look = useCallback(async (next: EventArea, chip: EventCategory, keep = false) => {
    setBusy(true);
    // D-057 (E-06): a refresh does not erase what is already on screen. The
    // header shows it is busy and the previous list stays readable until the
    // new one arrives — a spinner where results used to be reads as "gone".
    // A *new area* is the one case that must clear: İstanbul's concerts under
    // a heading that says Paris would be a lie rather than a stale view.
    if (!keep) {
      setUpcoming(null);
    }
    try {
      const api = getApi();
      // One bucket, one request (owner, 2026-08-05): "Bugün" and "Yaklaşan"
      // were the same list said twice — the upcoming window starts now, so it
      // already contains today. A card that IS today still says so, on its
      // own badge rather than under a heading of its own.
      setUpcoming(await api.searchEvents(next, 'upcoming', chip));
    } finally {
      setBusy(false);
    }
  }, []);

  const chooseCity = async () => {
    const city = areaDraft.trim();
    if (city.length < 2) return;
    const next: EventArea = {
      kind: 'city',
      city,
      countryCode: areaCountry.code,
      label: city,
    };
    setArea(next);
    setChoosingArea(false);
    setPermissionDenied(false);
    await look(next, category);
  };

  const chooseHere = useCallback(async (auto = false) => {
    // The reading is used to derive a coarse area and then dropped. The
    // automatic first attempt fails in silence — a notice about an action
    // nobody took reads as a malfunction; a pressed retry still explains.
    setPermissionDenied(false);
    const reading = await reader.read();
    if (reading.status !== 'granted') {
      if (!auto) setPermissionDenied(true);
      return;
    }
    const next: EventArea = {
      kind: 'here',
      latitude: reading.latitude,
      longitude: reading.longitude,
      // The standing header needs a place's name, not the button's verb.
      label: COPY.events.hereArea,
    };
    setArea(next);
    setChoosingArea(false);
    await look(next, category);
  }, [reader, look, category]);

  // Only the switch and the account's own events are read on focus. Neither
  // touches Ticketmaster.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const flags: Record<string, boolean> = await getApi()
        .getFeatureFlags()
        .catch(() => ({}) as Record<string, boolean>);
      if (cancelled) return;
      setEnabled(flags.EVENTS_FEATURE_ENABLED === true);
      // Guarded by the ref alone: one attempt per screen life, ever.
      if (flags.EVENTS_FEATURE_ENABLED === true && !autoTried.current) {
        autoTried.current = true;
        void chooseHere(true);
      }
      const events = await getApi().getMyEvents().catch(() => []);
      if (cancelled) return;
      setMine(events);
      // E-11: the list names the events. The name lives in the lease, so it is
      // read from there rather than kept — and when the lease has lapsed the
      // row falls back to the app's own "Geçmiş etkinlik" instead of printing
      // a provider id at somebody.
      if (events.length > 0) {
        const leases = await getApi()
          .getEventContent(events.map((e) => e.eventId))
          .catch(() => []);
        if (!cancelled) {
          setMineLeases(Object.fromEntries(leases.map((lease) => [lease.eventId, lease])));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chooseHere]));

  const chooseChip = async (chip: EventCategory) => {
    setCategory(chip);
    // Same area, different filter: keep the list up while the next one loads.
    if (area) await look(area, chip, true);
  };

  const openEvent = async (card: EventCard, badge: string) => {
    setBusy(true);
    try {
      const opened = await getApi().openEvent(card.selectionToken);
      if (!opened) {
        // The provider could not confirm it. Better to say nothing happened
        // than to open a room around an event we cannot currently verify.
        setUpcoming((current) => (current?.kind === 'ok' ? { kind: 'unavailable' } : current));
        return;
      }
      navigation.navigate('EventDetail', {
        selectionToken: opened.selectionToken,
        name: opened.event.name ?? '',
        when: whenLabel(opened.event),
        where: [opened.event.venueName ?? COPY.venue.nameUnavailable, opened.event.city]
          .filter(Boolean)
          .join(' · '),
        // D-062: the detail hero draws the same leased artwork and the same
        // status word the list card carried — passed, like the name, for
        // exactly as long as the lease lives, and stored nowhere.
        imageUrl: opened.event.imageUrl,
        badge,
      });
    } finally {
      setBusy(false);
    }
  };

  if (enabled === false) {
    return (
      <Screen safeTop testID="screen-events">
        <ScreenHeader
          title={COPY.events.title}
          subtitle={COPY.events.subtitle}
          ringTestID="events-profile-ring"
        />
        <Notice message={COPY.events.disabled} testID="events-disabled" />
      </Screen>
    );
  }

  /**
   * One card. Three of the design's states live here rather than in three
   * components, because they differ only in what the provider gave us:
   *
   * - **no image** (`E-20`) is a first-class layout, not a hole. The provider
   *   image is a lease that expires, so the card has to look deliberate
   *   without one — and a URL that has lapsed since it was handed to us falls
   *   back to the same layout rather than a grey rectangle.
   * - **no venue name** (`E-19`) gets the app's own sentence. We do not invent
   *   one and we do not leave the line blank.
   * - **cancelled / postponed / date unconfirmed** (`E-18`) are said in words
   *   with a glyph, and the card is dimmed — never colour alone, and never
   *   hidden from the list, which would just send somebody there anyway.
   */
  // The device's own calendar date, for the one distinction the removed
  // "Bugün" heading still owes the card: tonight's concert says "Bugün".
  const deviceNow = new Date(nowMs());
  const todayIso = [
    deviceNow.getFullYear(),
    String(deviceNow.getMonth() + 1).padStart(2, '0'),
    String(deviceNow.getDate()).padStart(2, '0'),
  ].join('-');

  const card = (event: EventCard, testID: string) => {
    const status = event.status.toLowerCase();
    const cancelled = status === 'cancelled';
    const postponed = status === 'postponed';
    const bad = cancelled || postponed;
    const badge = cancelled
      ? COPY.events.cancelled
      : postponed
        ? COPY.events.postponed
        : event.dateTbd
          ? COPY.events.dateTbd
          : event.localDate === todayIso
            ? COPY.events.badgeToday
            : COPY.events.badgeUpcoming;
    const place = [event.venueName ?? COPY.venue.nameUnavailable, event.city]
      .filter(Boolean)
      .join(' · ');
    const showImage = event.imageUrl !== null && !failedImages.has(event.imageUrl);
    const day =
      event.dateTbd || !event.localDate ? COPY.events.dateTbd : formatDayMonthLong(event.localDate);
    const time = event.localTime ? event.localTime.slice(0, 5) : null;
    const saved = savedEvents.has(event.selectionToken);
    /** 176:3696: the plate exists only when there is a date to put on it. */
    const plate = event.dateTbd || !event.localDate ? null : dayMonthPlate(event.localDate);
    return (
      <Pressable
        key={event.selectionToken}
        accessibilityRole="button"
        accessibilityLabel={[event.name, badge, whenLabel(event), place].filter(Boolean).join('. ')}
        disabled={busy}
        onPress={() => openEvent(event, badge)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        testID={testID}
      >
        {/* Figma etkinlikler_view (176:3693): the artwork is a band across the
            card's head with the date on it, and the facts stand under it —
            the square-thumbnail-on-the-left card this replaces was the
            owner's earlier sheet (2026-08-05). */}
        <View style={styles.cardBand}>
          {showImage ? (
            <Image
              source={{ uri: event.imageUrl as string }}
              style={[styles.cardBandPhoto, bad && styles.dimmed]}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              onError={() =>
                setFailedImages((current) => new Set(current).add(event.imageUrl as string))
              }
            />
          ) : (
            /* E-20 / 176:3717: no artwork is a first-class layout, not a hole.
               The design fills the band with one large mark on the inert
               ground, which is what this draws. */
            <View style={[styles.cardBandPhoto, styles.cardBandEmpty]}>
              <PennantIcon size={CARD_BAND_GLYPH} />
            </View>
          )}
          {/* 176:3696: the date on a near-white plate over the artwork's
              top-left. Absent when the provider has not fixed a date — the
              status badge below already says so in words, and a plate reading
              "date to be confirmed" is not a date. */}
          {plate ? (
            <View style={styles.datePlate}>
              <Text style={styles.datePlateMonth}>{upperCase(plate.month)}</Text>
              <Text style={styles.datePlateDay}>{plate.day}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={event.name ?? COPY.events.pastEvent}
            accessibilityState={{ selected: saved }}
            hitSlop={8}
            onPress={() =>
              setSavedEvents((current) => {
                const next = new Set(current);
                if (next.has(event.selectionToken)) next.delete(event.selectionToken);
                else next.add(event.selectionToken);
                return next;
              })
            }
            style={styles.heartSeat}
            testID={`${testID}-save`}
          >
            <HeartIcon filled={saved} />
          </Pressable>
        </View>

        <View style={styles.cardBody}>
          {/* E-18: cancelled, postponed and date-unconfirmed are said in words
              with a glyph. It moved off the artwork and into the body, where
              the plate above now sits. */}
          <StatusBadge label={badge} bad={bad} />

          <Text style={styles.cardName} numberOfLines={2}>
            {event.name}
          </Text>

          {/* 176:3705: the place and the hour on one line. The design sets it
              in capitals; the venue is the provider's own proper noun and
              Turkish capitalisation of a leased name is a change to leased
              content, so the words stand as they were given. */}
          <Text style={styles.cardWhere} numberOfLines={2}>
            {[place, time].filter(Boolean).join(' · ')}
          </Text>
          {plate ? null : (
            <Text style={styles.cardWhere} numberOfLines={1}>
              {day}
            </Text>
          )}

          <View style={styles.cardFoot}>
            <Text style={styles.cardAttribution}>{COPY.events.attribution}</Text>
            {/* 176:3714's navy pill. The design labels it "join the room";
                this one opens the event, because joining is a declaration and
                E-22 requires its explainer to stand beside the button that
                makes it — which is on the screen this opens, not here. */}
            <View style={styles.openPill}>
              <Text style={styles.openPillText}>{COPY.events.seeWhoIsGoing}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const section = (heading: string, result: EventSearchResult | null, testID: string) => {
    if (result === null) return null;
    if (result.kind === 'ok') {
      // 176:3691: a column of cards down the screen. It was a sideways
      // carousel with page dots (E-01, 131:127/132); the generated screen
      // stacks them, which shows two events at once instead of one and does
      // not hide the rest behind a gesture.
      return (
        <View testID={testID} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{heading}</Text>
            <Text style={styles.sectionCount}>{COPY_FOR.eventCount(result.events.length)}</Text>
          </View>
          {result.events.map((event, index) => card(event, `${testID}-option-${index}`))}
        </View>
      );
    }
    const message = result.kind === 'empty'
      ? COPY.events.noResults
      : result.kind === 'ceiling'
        ? COPY.events.ceilingReached
        : result.kind === 'disabled'
          ? COPY.events.disabled
          : result.kind === 'offline'
            ? COPY.events.offline
            : COPY.events.providerUnavailable;
    if (result.kind === 'empty') {
      /* Figma etkinlikler_empty (177:4705): "nothing here" is the one refusal
         with an obvious next move, so it gets the whole centred state and the
         outlined action rather than a one-line notice. The other five are
         still notices: a ceiling or an outage is not fixed by changing city,
         and offering that would send somebody on an errand. */
      return (
        <View testID={testID} style={styles.section}>
          <View style={styles.emptyWrap} testID={`${testID}-empty`}>
            <CalendarIllustration size={EMPTY_ILLUSTRATION} />
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.events.noResults}
            </Text>
            <Text style={styles.emptyBody}>{COPY.events.emptyBody}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.events.changeArea}
              onPress={() => setChoosingArea(true)}
              style={({ pressed }) => [styles.emptyCta, pressed && styles.cardPressed]}
              testID="events-empty-change-area"
            >
              <Text style={styles.emptyCtaText}>{COPY.events.changeArea}</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    // Five more "no"s, and the tone separates the ones that are ours (a
    // ceiling, a switch) from the ones that are the provider's or the world's.
    return (
      <View testID={testID} style={styles.section}>
        <Text style={styles.sectionTitle}>{heading}</Text>
        <Notice message={message} tone="error" testID={`${testID}-empty`} />
      </View>
    );
  };

  /* The city step, shared between the first open (inline, ED-01) and the
     change (a sheet over the list — owner, 2026-08-05: "Değiştir" must not
     shove the results down the screen; it opens on top of them). */
  const cityStep = (
    <>
      <View style={styles.countryScope}>
        <Text style={styles.countryScopeName} testID="events-country-scope">
          {areaCountry.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.events.changeCountry}
          onPress={() => setPickingCountry(true)}
          hitSlop={8}
          style={styles.countryScopeChange}
          testID="events-change-country"
        >
          <Text style={styles.countryScopeChangeText}>{COPY.events.changeCountry}</Text>
        </Pressable>
      </View>
      <Field
        label={COPY.events.areaLabel}
        hideLabel
        pill
        prefix={<MagnifierIcon />}
        value={areaDraft}
        onChangeText={setAreaDraft}
        placeholder={COPY.events.areaPlaceholder}
        onSubmitEditing={chooseCity}
        testID="events-area-input"
      />
      {/* ED-01: the heading asks the question; the button says the deed. */}
      <Button label={COPY.events.showEvents} onPress={chooseCity} testID="events-area-confirm" />
      {permissionDenied ? (
        <Notice
          message={COPY.events.permissionDenied}
          tone="error"
          testID="events-permission-denied"
        />
      ) : null}
    </>
  );

  /* Either the country list or the city step rides the sheet — never two
     stacked Modals, which iOS refuses to present. */
  const sheetOpen = pickingCountry || (choosingArea && area !== null);
  const closeSheet = () => {
    if (pickingCountry) {
      setPickingCountry(false);
      setCountryQuery('');
      return;
    }
    setChoosingArea(false);
  };

  return (
    <Screen safeTop testID="screen-events">
      <ScreenHeader
        title={COPY.events.title}
        subtitle={COPY.events.subtitle}
        ringTestID="events-profile-ring"
      />

      {area === null ? (
        /* ED-01's vertical rhythm: the pill, the button, each standing
           14pt apart rather than touching (owner screenshot, 2026-08-03). */
        <View style={styles.areaPicker} testID="events-area-picker">
          <Text style={styles.heading}>{COPY.events.chooseArea}</Text>
          {cityStep}
        </View>
      ) : (
        /* E-05: the chosen area is a standing header, not a line that
           scrolls away — it is the one piece of context every result below
           depends on, and changing it is one press from anywhere in the list.
           The ribbon is the shared deep-navy plate every venue/event context
           uses; the "Değiştir" link sits beside it rather than inside it, so
           it stays its own reachable control rather than being swallowed by
           the ribbon's single `accessibilityLabel`. */
        /* The owner's sheet (2026-08-05): one white row — the pin and the
           area's name on the left, the coral change on the right. No kicker
           above it; the row says what it is. */
        <View style={styles.areaRow}>
          <PinIcon />
          <Text style={styles.areaName} numberOfLines={1} testID="events-area-label">
            {area.label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.events.changeArea}
            onPress={() => setChoosingArea(true)}
            hitSlop={8}
            style={styles.areaChange}
            testID="events-change-area"
          >
            <Text style={styles.areaChangeText}>{COPY.events.changeArea}</Text>
            <Text style={styles.areaChangeChevron}>›</Text>
          </Pressable>
        </View>
      )}

      {area ? (
        /* E-01 (131:118): one row of chips that scrolls off the edge —
           wrapping to a second line was spending a card's worth of screen. */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipStrip}
        >
          {CHIPS.map((chip) => {
            const selected = chip.key === category;
            return (
              <Chip
                key={chip.key}
                label={chip.label()}
                selected={selected}
                // The filter bar's chosen chip fills coral (owner's sheet).
                solid
                onPress={() => chooseChip(chip.key)}
                testID={`events-chip-${chip.key}`}
              />
            );
          })}
        </ScrollView>
      ) : null}

      {/* E-06: while results are already up, busy is a quiet line rather than
          a spinner standing where the list was. */}
      {busy ? (
        upcoming ? (
          <View style={styles.busyLine} testID="events-loading">
            <Spinner size={16} />
            <Text style={styles.busyText}>{COPY.events.refreshing}</Text>
          </View>
        ) : (
          <SkeletonCard height={300} testID="events-loading" />
        )
      ) : null}

      {section(COPY.events.upcomingHeading, upcoming, 'events-upcoming')}

      {upcoming ? (
        <>
          {/* §3.4: never imply the list is the world. */}
          <Caption testID="events-coverage-note">{COPY.events.notEverything}</Caption>
          <Caption testID="events-attribution">{COPY.events.attribution}</Caption>
        </>
      ) : null}

      {(() => {
        /* A membership whose lease no longer names it and whose live window
           has closed is a past event (owner, 2026-08-04): its room said what
           it had to say, and a list of "Geçmiş etkinlik" rows says nothing. */
        const mineShown = mine.filter(
          (event) =>
            (mineLeases[event.eventId]?.name ?? null) !== null ||
            (event.liveClosesAt !== null && event.liveClosesAt > nowMs()),
        );
        return mineShown.length > 0 ? (
        <View testID="events-mine" style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{COPY.events.myEvents}</Text>
            {mineShown.length > 1 ? (
              <Text style={styles.sectionLink}>{COPY.events.yourEventsAll}</Text>
            ) : null}
          </View>
          {mineShown.map((event) => (
            <Pressable
              key={event.eventId}
              accessibilityRole="button"
              accessibilityLabel={mineLeases[event.eventId]?.name ?? COPY.events.pastEvent}
              // The row opens the event's own screen (owner, 2026-08-04):
              // that is where both doors live — the deck, and the withdraw
              // for "actually, I am not going".
              onPress={() => {
                const lease = mineLeases[event.eventId];
                navigation.navigate('EventDetail', {
                  eventId: event.eventId,
                  name: lease?.name ?? COPY.events.pastEvent,
                  when: lease?.startsAt
                    ? `${formatDayMonthLong(lease.startsAt.slice(0, 10))}${
                        lease.startsAt.length >= 16 ? ` · ${lease.startsAt.slice(11, 16)}` : ''
                      }`
                    : undefined,
                  where: [lease?.venueName, lease?.city].filter(Boolean).join(' · ') || undefined,
                  imageUrl: lease?.imageUrl ?? null,
                });
              }}
              style={({ pressed }) => [styles.mineRow, pressed && styles.cardPressed]}
              testID={`events-mine-${event.eventId}`}
            >
              {/* The owner's sheet: the pair in their warm disc, the coral
                  line saying what the row does, the name, and the state. */}
              <View style={styles.mineDisc}>
                <PeopleIcon />
              </View>
              <View style={styles.mineWords}>
                <Text style={styles.mineKicker}>
                  {event.hereNowOpen ? COPY.events.liveRoomCta : COPY.events.seeWhoIsGoing}
                </Text>
                <Text style={styles.mineName} numberOfLines={2}>
                  {mineLeases[event.eventId]?.name ?? COPY.events.pastEvent}
                </Text>
                <Text style={styles.mineState}>
                  {event.hereNowOpen ? COPY.events.hereNowOpen : COPY.events.joined}
                </Text>
              </View>
              <Text style={styles.mineChevron}>›</Text>
            </Pressable>
          ))}
        </View>
        ) : area ? null : (
          /* ED-01: the empty state as its own drawing — a pennant in the warm
             disc, the fact as a heading, and the way forward as one sentence. */
          /* Figma etkinlikler_empty (177:4706): the drawing centred at 200,
             the fact as a heading, the sentence under it. The design's
             "change city" button is absent here on purpose — this is the
             first open, where no city has been chosen yet and the picker is
             already standing directly above. It *is* drawn on the other
             empty, below, where a city has been chosen and found nothing. */
          <View style={styles.emptyWrap} testID="events-empty">
            <CalendarIllustration size={EMPTY_ILLUSTRATION} />
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {COPY.events.emptyTitle}
            </Text>
            <Text style={styles.emptyBody}>{COPY.events.emptyBody}</Text>
          </View>
        );
      })()}

      {/* ED-01 keeps the first open clean: the no-ticket sentence stands
          only once something checkable — results or memberships — is up. It
          closes the sheet as its own quiet card with the (i) mark. */}
      {upcoming || mine.length > 0 ? (
        <View style={styles.claimCard} testID="events-no-ticket">
          <InfoIcon />
          <Text style={styles.claimText}>{COPY.events.noTicketClaim}</Text>
        </View>
      ) : null}

      {/* Changing the area or the country opens over the list, never under
          it (owner, 2026-08-05) — the results keep their place on the page. */}
      <Modal transparent visible={sheetOpen} animationType="fade" onRequestClose={closeSheet}>
        <Pressable
          style={styles.sheetScrim}
          onPress={closeSheet}
          accessibilityRole="button"
          accessibilityLabel={COPY.common.cancel}
        >
          {/* The sheet swallows the press so only the scrim closes. */}
          <Pressable style={styles.sheetCard} onPress={() => {}} testID="events-picker-sheet">
            {pickingCountry ? (
              /* The wizard's country step, borrowed whole (D-060): a local,
                 free, unmisspellable list — search above, the usual suspects
                 underneath. */
              <>
                <Field
                  label={COPY.venue.countryLabel}
                  hideLabel
                  pill
                  prefix={<MagnifierIcon />}
                  value={countryQuery}
                  onChangeText={setCountryQuery}
                  placeholder={COPY.venue.countryPlaceholder}
                  testID="events-country-input"
                />
                {countryQuery.trim() === '' ? (
                  <Text style={styles.heading}>{COPY.venue.countryPopular}</Text>
                ) : null}
                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollBody}
                  keyboardShouldPersistTaps="handled"
                >
                  {(countryQuery.trim()
                    ? filterCountries(countryOptions(getLocale()), countryQuery)
                    : suggestedCountries(getLocale())
                  ).map((option) => (
                    <Pressable
                      key={option.code}
                      accessibilityRole="button"
                      accessibilityLabel={option.name}
                      onPress={() => {
                        setAreaCountry(option);
                        setPickingCountry(false);
                        setCountryQuery('');
                      }}
                      style={({ pressed }) => [styles.countryRow, pressed && styles.cardPressed]}
                      testID={`events-country-${option.code}`}
                    >
                      <Text style={styles.countryName}>{option.name}</Text>
                      <Text style={styles.countryCode}>{option.code}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.heading}>{COPY.events.chooseArea}</Text>
                {cityStep}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** The change sheet rides high, so the keyboard under the city input never covers it. */
const SHEET_TOP = 96;

/**
 * Figma etkinlikler_view (176:3695): the card's artwork band, and the mark
 * that fills it when there is no artwork (176:3718). Geometry rather than a
 * rung, like the ladder's other width/height carve-outs — named because the
 * photo, its no-photo fallback and the plate over both must agree.
 */
const CARD_BAND_HEIGHT = 192;
const CARD_BAND_GLYPH = 60;
/** 177:4707: the empty state's drawing, at the width the design gives it. */
const EMPTY_ILLUSTRATION = 200;

const styles = StyleSheet.create({
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  /** Sentence case and ink (D-060) — a heading, not a tracked kicker. */
  heading: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.body,
    letterSpacing: tracking.none,
    color: color.ink,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  /** E-05, redrawn to the owner's sheet: one white row, pin to chevron. */
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    marginBottom: spacing.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.snug,
    paddingHorizontal: spacing.md,
    ...elevation.card,
  },
  areaName: { flex: 1, fontFamily: fontFamily.bodyMedium, fontSize: font.body, color: color.ink },
  areaChange: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 28 },
  areaChangeText: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.accent },
  areaChangeChevron: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.accent },
  /** E-06: busy, without taking the results away — the same neutral pill a
      standing notice uses, so "still working" never reads as an error. */
  busyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: color.infoSoft,
    paddingVertical: spacing.cozy,
    paddingHorizontal: spacing.snug,
  },
  busyText: { fontFamily: fontFamily.bodySemi, fontSize: font.label, color: color.ink },
  section: { gap: spacing.xs },
  /** The pinned country over the city box, and the way to change it. */
  countryScope: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
  },
  countryScopeName: { fontFamily: fontFamily.bodySemi, fontSize: font.caption, color: color.ink },
  countryScopeChange: { minHeight: 28, justifyContent: 'center' },
  countryScopeChangeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.ink,
  },
  /** A country row: the name, and the code as its quiet proof. */
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
  },
  countryName: { fontFamily: fontFamily.bodyMedium, fontSize: font.body, color: color.ink },
  countryCode: { fontFamily: fontFamily.bodySemi, fontSize: font.label, color: color.inkMuted },
  /** 138:81: the white location pill, its pin and its 15pt seat. */
  hereButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: spacing.md,
  },
  hereButtonText: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.ink },
  /** ED-01 (137:72): 14 between the search pill and each button under it. */
  areaPicker: { gap: spacing.md },
  /** The change sheet: the same scrim every dialog uses, the card held high
      so the keyboard rising under the city input never covers it. */
  sheetScrim: {
    flex: 1,
    backgroundColor: overlay.photo,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.wide,
    paddingTop: SHEET_TOP,
  },
  sheetCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '78%',
  },
  sheetScroll: { flexGrow: 0 },
  sheetScrollBody: { gap: spacing.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  /** The sheet's section heads: sentence case, ink, 17 — not a tracked kicker. */
  sectionTitle: { fontFamily: fontFamily.displaySemi, fontSize: font.body, color: color.ink },
  sectionCount: { fontFamily: fontFamily.body, fontSize: font.label, color: color.inkMuted },
  sectionLink: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.accent },
  /**
   * E-18: the state as a word and a glyph first. The plate is deliberately
   * self-contained (deep navy, near-opaque) rather than a scrim-dependent
   * label, because it sits both on a photo and, when there is none, directly
   * on a white card — one recipe that reads on either.
   */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: tokens.border.inverse,
    backgroundColor: overlay.plate,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  badgeBad: { borderColor: color.danger, backgroundColor: color.dangerSoft },
  badgeGlyph: { fontFamily: fontFamily.bodySemi, fontSize: font.label, color: color.onInverse },
  badgeText: { fontFamily: fontFamily.bodySemi, fontSize: font.label, color: color.onInverse },
  badgeTextBad: { color: color.danger },
  /** A cancelled or postponed event is dimmed as well as labelled. */
  dimmed: { opacity: 0.45 },
  chipStrip: { flexGrow: 0, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  /** 176:3693: artwork across the head, facts underneath, the 32 corner. */
  card: {
    borderRadius: radius.xxl,
    backgroundColor: color.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...elevation.card,
  },
  cardPressed: { opacity: 0.7 },
  cardBand: { width: '100%', height: CARD_BAND_HEIGHT },
  cardBandPhoto: { width: '100%', height: CARD_BAND_HEIGHT, backgroundColor: color.veil },
  cardBandEmpty: { alignItems: 'center', justifyContent: 'center' },
  /**
   * 176:3696 — the date on its own plate over the artwork's corner. The
   * design blurs the plate; a translucent white over an arbitrary photograph
   * cannot promise 4.5:1 behind navy digits, so the plate is opaque.
   */
  datePlate: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.cozy,
  },
  datePlateMonth: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkMuted,
  },
  datePlateDay: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.heading,
    lineHeight: font.heading * leading.tight,
    color: color.ink,
  },
  /** The save heart keeps its own corner, on the glass the deck's controls use. */
  heartSeat: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: overlay.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 176:3701: 20 inside, the lines 4 apart. */
  cardBody: { padding: spacing.wide, gap: spacing.xs },
  cardName: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  /** 176:3705: the place and the hour, one quiet line under the name. */
  cardWhere: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    lineHeight: font.label * leading.normal,
    color: color.inkFaint,
  },
  /** 176:3706: the credit on the left, the way in on the right. */
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.snug,
  },
  /** Required wherever the provider's answer is on screen. */
  cardAttribution: {
    flexShrink: 1,
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.inkFaint,
  },
  /** 176:3714: the navy pill. Not its own control — see the card's comment. */
  openPill: {
    borderRadius: radius.pill,
    backgroundColor: color.inverse,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  openPillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    color: color.onInverse,
  },
  /** "Etkinliklerin": the disc, the coral line, the name, the state. */
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.card,
  },
  mineDisc: {
    width: 44,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mineWords: { flex: 1, gap: spacing.tight },
  mineKicker: { fontFamily: fontFamily.bodyMedium, fontSize: font.label, color: color.accent },
  mineName: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  mineState: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  mineChevron: { fontFamily: fontFamily.bodySemi, fontSize: font.heading, color: color.inkMuted },
  /** The closing sentence, in its own quiet card with the (i). */
  claimCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.snug,
    borderRadius: radius.lg,
    backgroundColor: color.veil,
    paddingVertical: spacing.snug,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  claimText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /** 177:4705: the drawing, the fact, the sentence, the one way on. */
  emptyWrap: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  /** 177:4713: outlined rather than filled — this is a way out, not the deed. */
  emptyCta: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.ink,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.snug,
  },
  emptyCtaText: { fontFamily: fontFamily.bodySemi, fontSize: font.control, color: color.ink },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
