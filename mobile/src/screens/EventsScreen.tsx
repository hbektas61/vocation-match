/**
 * Etkinlikler — the fourth primary feature (D-056).
 *
 * Two things this screen is careful about, and they are the same thing twice:
 *
 *   1. **It never calls the provider on its own.** Not on focus, not on mount,
 *      not because a GPS reading refreshed. Every request here is downstream of
 *      somebody choosing an area, a bucket or a chip (§3.2). A tab that polls
 *      is a tab that spends a quota on people who are not looking.
 *
 *   2. **It says which of the nine "no"s happened.** Nothing found, provider
 *      down, day's ceiling reached, offline, feature off, permission denied —
 *      §3.4 requires those to be distinguishable, because a spinner that means
 *      all of them makes the screen look broken in most of them.
 *
 * Everything drawn from the provider is a lease: it lives in this component's
 * state while the list is on screen and is written down nowhere.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  Button,
  Caption,
  Chip,
  ContextRibbon,
  Field,
  Notice,
  PhotoScrim,
  Screen,
  ScreenHeader,
} from '../components/ui';
import { COPY, COPY_FOR, upperCase } from '../copy';
import {
  deviceLocation,
  getApi,
  type EventArea,
  type EventCard,
  type EventCategory,
  type EventSearchResult,
  type ForegroundLocationReader,
  type MyEvent,
} from '../data';
import { formatDayMonth } from '../domain/dates';
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

/** ED-01: the search pill says it is a search before a word is typed. */
const MagnifierIcon = () => (
  <Svg {...iconStroke(color.inkMuted, 18)}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="m20 20-3.5-3.5" />
  </Svg>
);

/** 138:82: the pin before "use my current location". */
const PinIcon = () => (
  <Svg {...iconStroke(color.ink, 16)}>
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** ED-01's empty-state mark: a pennant — an event, not a hotel, not a pin. */
const PennantIcon = () => (
  <Svg {...iconStroke(color.accentDeep, 26)}>
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

/** "12 Ağu · 21:00" in the reader's own language, from the provider's local time. */
function whenLabel(event: EventCard): string {
  if (event.dateTbd || !event.localDate) return COPY.events.dateTbd;
  const day = formatDayMonth(event.localDate);
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
  const [category, setCategory] = useState<EventCategory>('all');
  const [today, setToday] = useState<EventSearchResult | null>(null);
  const [upcoming, setUpcoming] = useState<EventSearchResult | null>(null);
  const [mine, setMine] = useState<MyEvent[]>([]);
  /** eventId → the provider's leased name, for the memberships list. */
  const [mineNames, setMineNames] = useState<Record<string, string | null>>({});
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  /** E-01 (131:132): which card each bucket's carousel rests on. */
  const [pageIndex, setPageIndex] = useState<{ today: number; upcoming: number }>({
    today: 0,
    upcoming: 0,
  });
  // One card fills the view between the Screen's 20pt gutters.
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
  /** Provider image URLs that failed to load — a lease can lapse mid-list. */
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

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
          setMineNames(
            Object.fromEntries(leases.map((lease) => [lease.eventId, lease.name])),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []));

  const look = useCallback(async (next: EventArea, chip: EventCategory, keep = false) => {
    setBusy(true);
    // D-057 (E-06): a refresh does not erase what is already on screen. The
    // header shows it is busy and the previous list stays readable until the
    // new one arrives — a spinner where results used to be reads as "gone".
    // A *new area* is the one case that must clear: İstanbul's concerts under
    // a heading that says Paris would be a lie rather than a stale view.
    if (!keep) {
      setToday(null);
      setUpcoming(null);
    }
    try {
      const api = getApi();
      // Two buckets, two requests — and each is cached server-side on an area
      // key rather than on the person asking, so the second person to look at
      // İstanbul today costs nothing.
      const [todayResult, upcomingResult] = await Promise.all([
        api.searchEvents(next, 'today', chip),
        api.searchEvents(next, 'upcoming', chip),
      ]);
      setToday(todayResult);
      setUpcoming(upcomingResult);
    } finally {
      setBusy(false);
    }
  }, []);

  const chooseCity = async () => {
    const city = areaDraft.trim();
    if (city.length < 2) return;
    const next: EventArea = { kind: 'city', city, label: city };
    setArea(next);
    setChoosingArea(false);
    setPermissionDenied(false);
    await look(next, category);
  };

  const chooseHere = async () => {
    // §3.2: permission is requested at the moment of the action, never before,
    // and the reading is used to derive a coarse area and then dropped.
    setPermissionDenied(false);
    const reading = await reader.read();
    if (reading.status !== 'granted') {
      setPermissionDenied(true);
      return;
    }
    const next: EventArea = {
      kind: 'here',
      latitude: reading.latitude,
      longitude: reading.longitude,
      label: COPY.events.useMyLocation,
    };
    setArea(next);
    setChoosingArea(false);
    await look(next, category);
  };

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
        setToday((current) => (current?.kind === 'ok' ? { kind: 'unavailable' } : current));
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
  const card = (event: EventCard, bucket: 'today' | 'upcoming', testID: string) => {
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
          : bucket === 'today'
            ? COPY.events.badgeToday
            : COPY.events.badgeUpcoming;
    const place = [event.venueName ?? COPY.venue.nameUnavailable, event.city]
      .filter(Boolean)
      .join(' · ');
    const showImage = event.imageUrl !== null && !failedImages.has(event.imageUrl);
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
        {showImage ? (
          <View>
            <Image
              source={{ uri: event.imageUrl as string }}
              style={[styles.cardImage, bad && styles.dimmed]}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              onError={() =>
                setFailedImages((current) => new Set(current).add(event.imageUrl as string))
              }
            />
            <View style={styles.badgeOnImage}>
              <StatusBadge label={badge} bad={bad} />
            </View>
            {/* E-01: the words move onto the artwork, over the same scrim
                every on-photo text in the app uses. */}
            <PhotoScrim />
            <View style={styles.heroText}>
              <Text style={styles.heroName} numberOfLines={2}>
                {event.name}
              </Text>
              {/* D-062: the facts are one dotted line, as drawn — a name too
                  long for it ends in an ellipsis rather than a second row. */}
              <Text style={styles.heroMeta} numberOfLines={1}>
                {`${whenLabel(event)} · ${place}`}
              </Text>
              <Text style={styles.heroAttribution}>{COPY.events.attribution}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.cardBody}>
            <StatusBadge label={badge} bad={bad} />
            <Text style={styles.cardName} numberOfLines={2}>
              {event.name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {`${place} · ${whenLabel(event)}`}
            </Text>
            <Text style={styles.cardAttribution}>{COPY.events.attribution}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const section = (
    heading: string,
    result: EventSearchResult | null,
    bucket: 'today' | 'upcoming',
    testID: string,
    /** Both buckets failed the same way: one notice, and no heading over it. */
    sharedRefusal = false,
  ) => {
    if (result === null) return null;
    if (result.kind === 'ok') {
      // E-01 (131:127/132): one card at a time, swiped sideways, with the
      // dots underneath — never a column of cards stacked down the screen.
      return (
        <View testID={testID} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.heading}>{upperCase(heading)}</Text>
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
              const page = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12));
              setPageIndex((current) => ({ ...current, [bucket]: page }));
            }}
            contentContainerStyle={styles.carousel}
          >
            {result.events.map((event, index) => (
              <View key={event.selectionToken} style={{ width: cardWidth }}>
                {card(event, bucket, `${testID}-option-${index}`)}
              </View>
            ))}
          </ScrollView>
          {result.events.length > 1 ? (
            <View style={styles.dots} testID={`${testID}-dots`}>
              {result.events.map((event, index) => (
                <View
                  key={event.selectionToken}
                  style={[styles.dot, index === pageIndex[bucket] && styles.dotActive]}
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
        {sharedRefusal ? null : <Text style={styles.heading}>{upperCase(heading)}</Text>}
        <Notice message={message} tone={tone} testID={`${testID}-empty`} />
      </View>
    );
  };

  return (
    <Screen safeTop testID="screen-events">
      <ScreenHeader title={COPY.events.title} ringTestID="events-profile-ring" />
      <Text style={styles.subtitle}>{COPY.events.subtitle}</Text>

      {choosingArea || !area ? (
        /* ED-01's vertical rhythm: the pill, the two buttons, each standing
           14pt apart rather than touching (owner screenshot, 2026-08-03). */
        <View style={styles.areaPicker} testID="events-area-picker">
          <Text style={styles.heading}>{upperCase(COPY.events.chooseArea)}</Text>
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
          {/* 138:81: the white pill with the pin standing before the words. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.events.useMyLocation}
            onPress={chooseHere}
            style={({ pressed }) => [styles.hereButton, pressed && styles.cardPressed]}
            testID="events-area-here"
          >
            <PinIcon />
            <Text style={styles.hereButtonText}>{COPY.events.useMyLocation}</Text>
          </Pressable>
          {permissionDenied ? (
            <Notice
              message={COPY.events.permissionDenied}
              tone="error"
              testID="events-permission-denied"
            />
          ) : null}
        </View>
      ) : (
        /* E-05: the chosen area is a standing header, not a line that
           scrolls away — it is the one piece of context every result below
           depends on, and changing it is one press from anywhere in the list.
           The ribbon is the shared deep-navy plate every venue/event context
           uses; the "Değiştir" link sits beside it rather than inside it, so
           it stays its own reachable control rather than being swallowed by
           the ribbon's single `accessibilityLabel`. */
        <View style={styles.areaBlock}>
          <Text style={styles.areaKicker}>{upperCase(COPY.events.areaLabel)}</Text>
          <View style={styles.areaRow}>
            <ContextRibbon label={area.label} glyph="•" testID="events-area-label" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.events.changeArea}
              onPress={() => setChoosingArea(true)}
              // It was 95×15 with an 8pt hitSlop — 31 effective, still short of
              // the 44 everything else operable in this product meets. The slop
              // stays; the row now carries the height itself.
              style={styles.changeAreaRow}
              hitSlop={8}
              testID="events-change-area"
            >
              <Text style={styles.changeArea}>{COPY.events.changeArea}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {area && !choosingArea ? (
        <View style={styles.chipRow}>
          {CHIPS.map((chip) => {
            const selected = chip.key === category;
            return (
              <Chip
                key={chip.key}
                label={chip.label()}
                selected={selected}
                onPress={() => chooseChip(chip.key)}
                testID={`events-chip-${chip.key}`}
              />
            );
          })}
        </View>
      ) : null}

      {/* E-06: while results are already up, busy is a quiet line rather than
          a spinner standing where the list was. */}
      {busy ? (
        today || upcoming ? (
          <View style={styles.busyLine} testID="events-loading">
            <ActivityIndicator accessibilityLabel={COPY.events.refreshing} />
            <Text style={styles.busyText}>{COPY.events.refreshing}</Text>
          </View>
        ) : (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="events-loading" />
        )
      ) : null}

      {/* Both buckets fail for the same reason far more often than not — the
          provider is down for both, the ceiling is spent for both. Saying it
          twice, once under each heading, reads as two problems. */}
      {today && upcoming && today.kind !== 'ok' && today.kind === upcoming.kind
        ? section(COPY.events.todayHeading, today, 'today', 'events-today', true)
        : (
          <>
            {section(COPY.events.todayHeading, today, 'today', 'events-today')}
            {section(COPY.events.upcomingHeading, upcoming, 'upcoming', 'events-upcoming')}
          </>
        )}

      {today || upcoming ? (
        <>
          {/* §3.4: never imply the list is the world. */}
          <Caption testID="events-coverage-note">{COPY.events.notEverything}</Caption>
          <Caption testID="events-attribution">{COPY.events.attribution}</Caption>
        </>
      ) : null}

      {mine.length > 0 ? (
        <View testID="events-mine">
          <Text style={styles.heading}>{upperCase(COPY.events.myEvents)}</Text>
          {mine.map((event) => (
            <Pressable
              key={event.eventId}
              accessibilityRole="button"
              accessibilityLabel={mineNames[event.eventId] ?? COPY.events.pastEvent}
              // Opening one of your own events means looking at its deck: the
              // focus moves, and nothing else does.
              onPress={async () => {
                await getApi()
                  .setEventFocus(
                    event.eventId,
                    event.hereNowOpen ? 'EVENT_HERE_NOW' : 'EVENT_UPCOMING',
                  )
                  .catch(() => undefined);
                navigation.navigate('Tabs');
              }}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              testID={`events-mine-${event.eventId}`}
            >
              <View style={styles.cardBody}>
                <StatusBadge
                  label={event.hereNowOpen ? COPY.events.liveRoomCta : COPY.events.joinedRoomCta}
                  bad={false}
                />
                <Text style={styles.cardName} numberOfLines={2}>
                  {mineNames[event.eventId] ?? COPY.events.pastEvent}
                </Text>
                <Text style={styles.cardMeta}>
                  {event.hereNowOpen ? COPY.events.hereNowOpen : COPY.events.joined}
                </Text>
              </View>
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
      )}

      {/* ED-01 keeps the first open clean: the no-ticket sentence stands
          only once something checkable — results or memberships — is up. */}
      {today || upcoming || mine.length > 0 ? (
        <Caption>{COPY.events.noTicketClaim}</Caption>
      ) : null}
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
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: color.inkMuted,
    marginBottom: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
    color: color.inkMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  /** E-05: the standing area header — the ribbon and its "Değiştir" pair. */
  areaBlock: { marginBottom: spacing.sm, gap: 4 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  areaKicker: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 9,
    letterSpacing: 0.6,
    color: color.inkMuted,
  },
  changeAreaRow: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  changeArea: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    color: color.accentDeep,
  },
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
  sectionCount: { fontFamily: fontFamily.body, fontSize: 11, color: color.inkMuted },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    overflow: 'hidden',
    marginBottom: spacing.xs,
    ...elevation.card,
  },
  cardPressed: { opacity: 0.7 },
  cardImage: { width: '100%', height: 300, backgroundColor: color.veil },
  /** E-01: the words on the artwork. */
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 14, gap: 3 },
  heroName: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 28,
    color: color.onPhoto,
  },
  heroMeta: { fontFamily: fontFamily.bodyMedium, fontSize: 13, color: color.onPhoto },
  heroAttribution: { fontFamily: fontFamily.body, fontSize: 10, color: color.onPhoto },
  cardBody: { paddingVertical: 11, paddingHorizontal: 14, gap: 4 },
  cardName: { fontFamily: fontFamily.bodySemi, fontSize: 16, color: color.ink },
  cardMeta: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
  /** Required wherever the provider's answer is on screen. */
  cardAttribution: { fontFamily: fontFamily.bodyMedium, fontSize: 10, color: color.inkMuted },
  /** ED-01's empty state. */
  emptyWrap: { alignItems: 'center', gap: 10, paddingTop: 56 },
  emptyDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.accentSoft,
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
