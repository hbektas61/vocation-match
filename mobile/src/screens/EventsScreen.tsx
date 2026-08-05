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
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
import { formatDayMonthLong } from '../domain/dates';
import type { RootStackParamList } from '../navigation/types';
import { color, elevation, fontFamily, overlay, radius, spacing, tokens, MIN_TOUCH } from '../theme';

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

const CalendarIcon = () => (
  <Svg {...iconStroke(color.inkMuted, 14)}>
    <Rect x={3} y={5} width={18} height={16} rx={2} />
    <Path d="M8 3v4m8-4v4M3 10h18" />
  </Svg>
);

const ClockIcon = () => (
  <Svg {...iconStroke(color.inkMuted, 14)}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 7v5l3 2" />
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
const PennantIcon = () => (
  <Svg {...iconStroke(color.accent, 26)}>
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
  /** E-01 (131:132): which card the carousel rests on. */
  const [pageIndex, setPageIndex] = useState(0);
  // One card fills the view between the Screen's 20pt gutters.
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
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
        <ScreenHeader title={COPY.events.title} ringTestID="events-profile-ring" />
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
        {/* The owner's sheet (2026-08-05): the artwork is a square held on
            the left, and the facts stand beside it in their own column —
            not a full-bleed photograph with the words on a scrim. */}
        {showImage ? (
          <Image
            source={{ uri: event.imageUrl as string }}
            style={[styles.cardThumb, bad && styles.dimmed]}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onError={() =>
              setFailedImages((current) => new Set(current).add(event.imageUrl as string))
            }
          />
        ) : (
          /* E-20: no artwork is a first-class layout, not a hole. */
          <View style={[styles.cardThumb, styles.cardThumbEmpty]}>
            <PennantIcon />
          </View>
        )}

        <View style={styles.cardColumn}>
          <View style={styles.cardTopRow}>
            <StatusBadge label={badge} bad={bad} />
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

          <Text style={styles.cardName} numberOfLines={2}>
            {event.name}
          </Text>

          <View style={styles.factRow}>
            <CalendarIcon />
            <Text style={styles.factText} numberOfLines={1}>
              {day}
            </Text>
            {time ? (
              <>
                <Text style={styles.factDot}>·</Text>
                <ClockIcon />
                <Text style={styles.factText}>{time}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.factRow}>
            <PinIcon tone={color.inkMuted} size={14} />
            <Text style={styles.factText} numberOfLines={2}>
              {place}
            </Text>
          </View>

          <Text style={styles.cardAttribution}>{COPY.events.attribution}</Text>
        </View>
      </Pressable>
    );
  };

  const section = (heading: string, result: EventSearchResult | null, testID: string) => {
    if (result === null) return null;
    if (result.kind === 'ok') {
      // E-01 (131:127/132): one card at a time, swiped sideways, with the
      // dots underneath — never a column of cards stacked down the screen.
      return (
        <View testID={testID} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{heading}</Text>
            <Text style={styles.sectionCount}>{COPY_FOR.eventCount(result.events.length)}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={cardWidth + 12}
            snapToAlignment="start"
            disableIntervalMomentum
            onMomentumScrollEnd={(e) => {
              setPageIndex(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)));
            }}
            contentContainerStyle={styles.carousel}
          >
            {result.events.map((event, index) => (
              <View key={event.selectionToken} style={{ width: cardWidth }}>
                {card(event, `${testID}-option-${index}`)}
              </View>
            ))}
          </ScrollView>
          {result.events.length > 1 ? (
            <View style={styles.dots} testID={`${testID}-dots`}>
              {result.events.map((event, index) => (
                <View
                  key={event.selectionToken}
                  style={[styles.dot, index === pageIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}
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
    // Six different "no"s, and the tone separates the two that are ours (a
    // ceiling, a switch) from the ones that are the provider's or the world's.
    const tone = result.kind === 'empty' ? 'info' : 'error';
    return (
      <View testID={testID} style={styles.section}>
        <Text style={styles.sectionTitle}>{heading}</Text>
        <Notice message={message} tone={tone} testID={`${testID}-empty`} />
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
      <ScreenHeader title={COPY.events.title} ringTestID="events-profile-ring" />

      {area === null ? (
        /* ED-01's vertical rhythm: the pill, the button, each standing
           14pt apart rather than touching (owner screenshot, 2026-08-03). */
        <View style={styles.areaPicker} testID="events-area-picker">
          <Text style={styles.heading}>{upperCase(COPY.events.chooseArea)}</Text>
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
          <View style={styles.emptyWrap} accessibilityRole="text" testID="events-empty">
            <View style={styles.emptyDisc}>
              <PennantIcon />
            </View>
            <Text style={styles.emptyTitle}>{COPY.events.emptyTitle}</Text>
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
                  <Text style={styles.heading}>{upperCase(COPY.venue.countryPopular)}</Text>
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
                <Text style={styles.heading}>{upperCase(COPY.events.chooseArea)}</Text>
                {cityStep}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    color: color.ink,
  },
  heading: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
    color: color.inkMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  /** E-05, redrawn to the owner's sheet: one white row, pin to chevron. */
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  areaName: { flex: 1, fontFamily: fontFamily.bodyMedium, fontSize: 14, color: color.ink },
  areaChange: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  areaChangeText: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.accent },
  areaChangeChevron: { fontFamily: fontFamily.bodySemi, fontSize: 15, color: color.accent },
  /** E-06: busy, without taking the results away — the same neutral pill a
      standing notice uses, so "still working" never reads as an error. */
  busyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: color.infoSoft,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  busyText: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: color.ink },
  section: { gap: spacing.xs },
  /** The pinned country over the city box, and the way to change it. */
  countryScope: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countryScopeName: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.ink },
  countryScopeChange: { minHeight: 28, justifyContent: 'center' },
  countryScopeChangeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    color: color.ink,
  },
  /** A country row: the name, and the code as its quiet proof. */
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countryName: { fontFamily: fontFamily.bodyMedium, fontSize: 14, color: color.ink },
  countryCode: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: color.inkMuted },
  /** 138:81: the white location pill, its pin and its 15pt seat. */
  hereButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: 15,
  },
  hereButtonText: { fontFamily: fontFamily.bodySemi, fontSize: 14, color: color.ink },
  /** ED-01 (137:72): 14 between the search pill and each button under it. */
  areaPicker: { gap: 14 },
  /** The change sheet: the same scrim every dialog uses, the card held high
      so the keyboard rising under the city input never covers it. */
  sheetScrim: {
    flex: 1,
    backgroundColor: overlay.photo,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 96,
  },
  sheetCard: {
    backgroundColor: color.surface,
    borderRadius: 24,
    padding: spacing.lg,
    gap: 14,
    maxHeight: '78%',
  },
  sheetScroll: { flexGrow: 0 },
  sheetScrollBody: { gap: spacing.xs },
  carousel: { gap: 12 },
  /** 131:132: the page dots — the resting one stretched into a coral pill. */
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.rule },
  dotActive: { width: 18, backgroundColor: color.accent },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  /** The sheet's section heads: sentence case, ink, 17 — not a tracked kicker. */
  sectionTitle: { fontFamily: fontFamily.bodySemi, fontSize: 17, color: color.ink },
  sectionCount: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
  sectionLink: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.accent },
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
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: tokens.border.inverse,
    backgroundColor: overlay.plate,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  badgeBad: { borderColor: color.danger, backgroundColor: color.dangerSoft },
  badgeGlyph: { fontFamily: fontFamily.bodySemi, fontSize: 9, color: color.onInverse },
  badgeText: { fontFamily: fontFamily.bodySemi, fontSize: 10, color: color.onInverse },
  badgeTextBad: { color: color.danger },
  /** Top-left, as ED-02 draws it — the bottom corner belongs to the words. */
  badgeOnImage: { position: 'absolute', left: 11, top: 11 },
  /** A cancelled or postponed event is dimmed as well as labelled. */
  dimmed: { opacity: 0.45 },
  chipStrip: { flexGrow: 0, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  /** The owner's card (2026-08-05): square artwork left, facts right. */
  card: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    marginBottom: spacing.xs,
    padding: 12,
    ...elevation.card,
  },
  cardPressed: { opacity: 0.7 },
  cardThumb: { width: 118, height: 118, borderRadius: 14, backgroundColor: color.veil },
  cardThumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.accentWash },
  cardColumn: { flex: 1, gap: 5 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heartSeat: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  cardName: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    lineHeight: 23,
    color: color.ink,
  },
  /** A fact is its mark and its words, on one line. */
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factText: { flexShrink: 1, fontFamily: fontFamily.body, fontSize: 12, lineHeight: 16, color: color.inkMuted },
  factDot: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
  /** Required wherever the provider's answer is on screen. */
  cardAttribution: { fontFamily: fontFamily.body, fontSize: 10, color: color.inkFaint, marginTop: 2 },
  /** "Etkinliklerin": the disc, the coral line, the name, the state. */
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: spacing.xs,
    ...elevation.card,
  },
  mineDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mineWords: { flex: 1, gap: 2 },
  mineKicker: { fontFamily: fontFamily.bodyMedium, fontSize: 12, color: color.accent },
  mineName: { fontFamily: fontFamily.display, fontSize: 16, lineHeight: 21, color: color.ink },
  mineState: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 16, color: color.inkMuted },
  mineChevron: { fontFamily: fontFamily.bodySemi, fontSize: 18, color: color.inkMuted },
  /** The closing sentence, in its own quiet card with the (i). */
  claimCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    backgroundColor: color.veil,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: spacing.sm,
  },
  claimText: { flex: 1, fontFamily: fontFamily.body, fontSize: 12, lineHeight: 17, color: color.inkMuted },
  /** ED-01's empty state. */
  emptyWrap: { alignItems: 'center', gap: 10, paddingTop: 56 },
  emptyDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    lineHeight: 24,
    color: color.ink,
  },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    color: color.inkMuted,
    textAlign: 'center',
    maxWidth: 270,
  },
});
