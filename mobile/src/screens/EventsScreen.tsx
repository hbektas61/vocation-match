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
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Caption, EmptyState, Field, Notice, Screen, ScreenHeader } from '../components/ui';
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
import type { RootStackParamList } from '../navigation/types';
import { color, fontFamily, glass, radius, spacing } from '../theme';

const PinIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
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
  const day = new Date(`${event.localDate}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
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

  const openEvent = async (card: EventCard) => {
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
        onPress={() => openEvent(event)}
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
          </View>
        ) : null}
        <View style={styles.cardBody}>
          {showImage ? null : <StatusBadge label={badge} bad={bad} />}
          <Text style={styles.cardName} numberOfLines={2}>
            {event.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={2}>
            {`${place} · ${whenLabel(event)}`}
          </Text>
          <Text style={styles.cardAttribution}>{COPY.events.attribution}</Text>
        </View>
      </Pressable>
    );
  };

  const section = (
    heading: string,
    result: EventSearchResult | null,
    bucket: 'today' | 'upcoming',
    testID: string,
  ) => {
    if (result === null) return null;
    if (result.kind === 'ok') {
      return (
        <View testID={testID} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.heading}>{upperCase(heading)}</Text>
            <Text style={styles.sectionCount}>{COPY_FOR.eventCount(result.events.length)}</Text>
          </View>
          {result.events.map((event, index) => card(event, bucket, `${testID}-option-${index}`))}
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
        <Text style={styles.heading}>{upperCase(heading)}</Text>
        <Notice message={message} tone={tone} testID={`${testID}-empty`} />
      </View>
    );
  };

  return (
    <Screen safeTop testID="screen-events">
      <ScreenHeader title={COPY.events.title} ringTestID="events-profile-ring" />
      <Text style={styles.subtitle}>{COPY.events.subtitle}</Text>

      {choosingArea || !area ? (
        <View testID="events-area-picker">
          <Text style={styles.heading}>{upperCase(COPY.events.chooseArea)}</Text>
          <Field
            label={COPY.events.areaLabel}
            hideLabel
            pill
            value={areaDraft}
            onChangeText={setAreaDraft}
            placeholder={COPY.events.areaPlaceholder}
            onSubmitEditing={chooseCity}
            testID="events-area-input"
          />
          <Button label={COPY.events.chooseArea} onPress={chooseCity} testID="events-area-confirm" />
          <Button
            label={COPY.events.useMyLocation}
            variant="secondary"
            onPress={chooseHere}
            testID="events-area-here"
          />
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
           depends on, and changing it is one press from anywhere in the list. */
        <View style={styles.areaRow}>
          <PinIcon />
          <View style={styles.areaWords}>
            <Text style={styles.areaKicker}>{upperCase(COPY.events.areaLabel)}</Text>
            <Text style={styles.areaLabel} numberOfLines={1} testID="events-area-label">
              {area.label}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.events.changeArea}
            onPress={() => setChoosingArea(true)}
            hitSlop={8}
            testID="events-change-area"
          >
            <Text style={styles.changeArea}>{COPY.events.changeArea}</Text>
          </Pressable>
        </View>
      )}

      {area && !choosingArea ? (
        <View style={styles.chipRow}>
          {CHIPS.map((chip) => {
            const selected = chip.key === category;
            return (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => chooseChip(chip.key)}
                style={[styles.chip, selected && styles.chipOn]}
                testID={`events-chip-${chip.key}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{chip.label()}</Text>
              </Pressable>
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

      {section(COPY.events.todayHeading, today, 'today', 'events-today')}
      {section(COPY.events.upcomingHeading, upcoming, 'upcoming', 'events-upcoming')}

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
        <EmptyState message={COPY.events.emptyBody} testID="events-empty" />
      )}

      <Caption>{COPY.events.noTicketClaim}</Caption>
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
  /** E-05: the standing area header — a glass box, not a bare row. */
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: glass.edge,
    backgroundColor: glass.strong,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: spacing.sm,
  },
  areaWords: { flex: 1, gap: 1 },
  areaKicker: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 9,
    letterSpacing: 0.6,
    color: color.inkMuted,
  },
  areaLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.ink,
  },
  changeArea: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    color: color.accentDeep,
  },
  /** E-06: busy, without taking the results away. */
  busyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: glass.strong,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  busyText: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: color.ink },
  section: { gap: spacing.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sectionCount: { fontFamily: fontFamily.body, fontSize: 11, color: color.inkMuted },
  /** E-18: the state as a word and a glyph first. */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: 'rgba(26, 26, 46, 0.72)',
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  badgeBad: { borderColor: color.danger, backgroundColor: color.dangerSoft },
  badgeGlyph: { fontFamily: fontFamily.bodySemi, fontSize: 9, color: color.inkMuted },
  badgeText: { fontFamily: fontFamily.bodySemi, fontSize: 10, color: color.ink },
  badgeTextBad: { color: color.danger },
  badgeOnImage: { position: 'absolute', left: 11, bottom: 9 },
  /** A cancelled or postponed event is dimmed as well as labelled. */
  dimmed: { opacity: 0.45 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.edge,
    backgroundColor: glass.fill,
  },
  chipOn: { borderColor: color.accentDeep, backgroundColor: color.accentSoft },
  chipText: { fontFamily: fontFamily.body, fontSize: 13, color: color.inkMuted },
  chipTextOn: { color: color.ink },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.edge,
    backgroundColor: glass.fill,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  cardPressed: { opacity: 0.7 },
  cardImage: { width: '100%', height: 120, backgroundColor: color.veil },
  cardBody: { paddingVertical: 11, paddingHorizontal: 14, gap: 4 },
  cardName: { fontFamily: fontFamily.bodySemi, fontSize: 16, color: color.ink },
  cardMeta: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
  /** Required wherever the provider's answer is on screen. */
  cardAttribution: { fontFamily: fontFamily.bodyMedium, fontSize: 10, color: color.inkMuted },
});
