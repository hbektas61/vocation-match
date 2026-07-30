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
import { COPY, upperCase } from '../copy';
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
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState(false);

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
      if (!cancelled) setMine(events);
    })();
    return () => {
      cancelled = true;
    };
  }, []));

  const look = useCallback(async (next: EventArea, chip: EventCategory) => {
    setBusy(true);
    setToday(null);
    setUpcoming(null);
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
    if (area) await look(area, chip);
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

  const section = (heading: string, result: EventSearchResult | null, testID: string) => {
    if (result === null) return null;
    if (result.kind === 'ok') {
      return (
        <View testID={testID}>
          <Text style={styles.heading}>{upperCase(heading)}</Text>
          {result.events.map((event, index) => (
            <Pressable
              key={event.selectionToken}
              accessibilityRole="button"
              accessibilityLabel={event.name ?? heading}
              disabled={busy}
              onPress={() => openEvent(event)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              testID={`${testID}-option-${index}`}
            >
              {event.imageUrl ? (
                <Image
                  source={{ uri: event.imageUrl }}
                  style={styles.cardImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{event.name}</Text>
                <Text style={styles.cardMeta}>{whenLabel(event)}</Text>
                <Text style={styles.cardMeta}>
                  {[event.venueName, event.city, event.country].filter(Boolean).join(' · ')}
                </Text>
                {/* §3.1: a status the provider flags is worth saying outright. */}
                {event.status.toLowerCase() === 'cancelled' ? (
                  <Text style={styles.cardWarning}>{COPY.events.cancelled}</Text>
                ) : null}
                {event.status.toLowerCase() === 'postponed' ? (
                  <Text style={styles.cardWarning}>{COPY.events.postponed}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
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
    return (
      <View testID={testID}>
        <Text style={styles.heading}>{upperCase(heading)}</Text>
        <EmptyState message={message} testID={`${testID}-empty`} />
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
        <View style={styles.areaRow}>
          <PinIcon />
          <Text style={styles.areaLabel} testID="events-area-label">{area.label}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosingArea(true)}
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

      {busy ? <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="events-loading" /> : null}

      {section(COPY.events.todayHeading, today, 'events-today')}
      {section(COPY.events.upcomingHeading, upcoming, 'events-upcoming')}

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
                <Text style={styles.cardName}>{event.providerEventId}</Text>
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
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  areaLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    color: color.ink,
    flex: 1,
  },
  changeArea: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.accentDeep,
  },
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: glass.edge,
    backgroundColor: glass.fill,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  cardPressed: { opacity: 0.7 },
  cardImage: { width: '100%', height: 120, backgroundColor: color.veil },
  cardBody: { padding: spacing.md, gap: 2 },
  cardName: { fontFamily: fontFamily.bodySemi, fontSize: 16, color: color.ink },
  cardMeta: { fontFamily: fontFamily.body, fontSize: 13, color: color.inkMuted },
  cardWarning: { fontFamily: fontFamily.bodySemi, fontSize: 13, color: color.danger },
});
