import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, Field, Loading, Notice, Screen } from '../components/ui';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, COPY, upperCase } from '../copy';
import { ApiError, getApi, type UpcomingStay } from '../data';
import { formatDayMonthLong, formatWeekday, languageTag } from '../domain/dates';
import { validateStayDates } from '../domain/upcoming';
import type { RootScreenProps } from '../navigation/types';
import { useActiveVenueName } from '../state/useActiveVenueName';
import { color, elevation, font, fontFamily, leading, radius, spacing, tileTone, tracking } from '../theme';

const CalendarGlyph = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3} y={5} width={18} height={16} rx={3} />
    <Path d="M8 3v4M16 3v4M3 11h18" />
  </Svg>
);

const ShieldGlyph = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.inkMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Svg>
);

/** ISO from local calendar parts — never through UTC, which shifts a day. */
function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Noon, so no timezone can nudge the calendar date it represents. */
function fromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

/**
 * "12 Ağustos", the way the contract's plate prints a date (176:2489).
 *
 * Shorter than the full date this used to print: two plates now stand side by
 * side in half a column each, and the year is the one part of a holiday date
 * nobody is uncertain about.
 */
function plateDate(value: string): string {
  return formatDayMonthLong(value);
}

/**
 * One date, as the contract's plate (D-065, 176:2486): a small-capitals name
 * over the date, with the weekday under it — the line that turns "17 Tem"
 * into something somebody can check against their own plans.
 *
 * The platform's own picker stays behind it (owner, 2026-07-28: nobody should
 * type "2026" by hand). The contract draws a hand-built month grid with the
 * range shaded across it; that is the one part not adopted, because building
 * one would replace a native control the owner chose with a calendar this app
 * would then own forever. iOS shows its compact control in place; Android
 * opens its dialog from the pressable value; the web fallback keeps the typed
 * field, since the community picker has no web half.
 */
function DateCard({
  label,
  value,
  onChange,
  minimumDate,
  editable,
  testID,
}: {
  label: string;
  /** ISO, YYYY-MM-DD — the only format the server speaks. */
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  editable: boolean;
  testID: string;
}) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const date = value ? fromIso(value) : new Date();

  const picked = (event: DateTimePickerEvent, selected?: Date) => {
    setAndroidOpen(false);
    if (event.type === 'set' && selected) onChange(toIso(selected));
  };

  return (
    <View style={styles.dateCard}>
      <Text style={styles.dateLabel}>{upperCase(label)}</Text>
      {Platform.OS === 'web' ? (
        <Field
          label={label}
          hideLabel
          hint={COPY.upcoming.dateHint}
          value={value}
          onChangeText={onChange}
          placeholder="2026-08-01"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          editable={editable}
          testID={testID}
        />
      ) : Platform.OS === 'ios' ? (
        <View style={styles.valueRow}>
          <CalendarGlyph />
          {/* The one date in the app the app does not print itself: the
              compact control draws its own value, and left alone it draws it
              in the device's language — an English month over a Turkish
              weekday (owner photo, 2026-08-07). `languageTag` is the same
              table `plateDate` reads its months from, so the two lines of one
              plate cannot end up in two languages again. iOS only, by the
              component's contract; Android's value beside its dialog is
              `plateDate`, which is already the app's own words. */}
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            locale={languageTag()}
            minimumDate={minimumDate}
            disabled={!editable}
            onChange={picked}
            accessibilityLabel={label}
            testID={testID}
          />
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={!editable}
            onPress={() => setAndroidOpen(true)}
            style={({ pressed }) => [styles.valueRow, pressed && styles.pressed]}
            testID={testID}
          >
            <CalendarGlyph />
            <Text style={styles.valueText}>
              {value ? plateDate(value) : COPY.upcoming.pickDate}
            </Text>
          </Pressable>
          {androidOpen ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              minimumDate={minimumDate}
              onChange={picked}
            />
          ) : null}
        </>
      )}
      {/* The weekday (176:2491). Hidden from assistive tech: the picker above
          already announces the whole date, and hearing "Monday" as a separate
          unlabelled item after it is noise rather than information. */}
      {value ? (
        <Text
          style={styles.weekday}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {formatWeekday(value)}
        </Text>
      ) : null}
    </View>
  );
}

export function UpcomingScreen({ navigation }: RootScreenProps<'Upcoming'>) {
  /**
   * The active venue by name. A Google venue keeps no stored name (D-054), so
   * this comes from the app's one shared answer rather than from the cached
   * card — reading the card printed the `(google)` marker over the dates.
   */
  const { name: venueName } = useActiveVenueName();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** `undefined` while loading; `null` once we know there is no stay. */
  const [existing, setExisting] = useState<UpcomingStay | null | undefined>(undefined);

  // The screen used to open blank whether or not something had already been
  // declared, so "update your stay dates" was a guess at what you had said.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const stay = await getApi().getUpcomingStay();
          if (cancelled) return;
          setExisting(stay);
          if (stay) {
            setCheckIn(stay.startDate);
            setCheckOut(stay.endDate);
          } else {
            // The pickers always display a date, so the state has to hold
            // the one displayed — a shown default that was not committed
            // would let "save" refuse dates the person can see.
            setCheckIn((current) => current || todayIsoDate());
            setCheckOut((current) => {
              if (current) return current;
              const week = fromIso(todayIsoDate());
              week.setDate(week.getDate() + 7);
              return toIso(week);
            });
          }
        } catch {
          // Not being able to read it back does not stop somebody declaring
          // one, so the form still opens — but it says so, because otherwise
          // an empty form looks like "you have not declared anything" and
          // somebody could overwrite dates they cannot see.
          if (!cancelled) {
            setExisting(null);
            setError(COPY.upcoming.loadError);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const busy = submitting || withdrawing;

  const save = async () => {
    if (busy) return;
    // Fast client-side feedback only — the server re-validates the same
    // coherence rules and its rejection wins if the two ever disagree.
    const validation = validateStayDates(checkIn.trim(), checkOut.trim(), todayIsoDate());
    if (!validation.ok) {
      setError(
        validation.reason === 'INVALID_FORMAT'
          ? COPY.upcoming.invalidFormat
          : validation.reason === 'CHECKOUT_NOT_AFTER_CHECKIN'
            ? COPY.upcoming.checkoutNotAfter
            : COPY.upcoming.stayEnded,
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await getApi().declareUpcomingStay(checkIn.trim(), checkOut.trim());
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (busy) return;
    setError(null);
    setWithdrawing(true);
    try {
      await getApi().withdrawUpcomingStay();
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.upcoming.withdrawError);
      setWithdrawing(false);
    }
  };

  // The Figma sheet (13:112) draws no chrome of its own: the way back is the
  // platform's — the iOS edge swipe and the Android back button.
  return (
    <Screen safeTop testID="screen-upcoming">
      {/* 176:4326: the one thing 176:2473 left out. A stay is declared *at* a
          venue, and the screen asked for dates without ever naming which — so
          the venue stands above the question, read from what is already
          cached rather than looked up to decorate a header. */}
      {venueName ? (
        <View style={styles.venueBanner} testID="upcoming-venue">
          <Text style={styles.venueLabel}>{upperCase(COPY.upcoming.venueLabel)}</Text>
          <Text style={styles.venueName} numberOfLines={1}>
            {venueName}
          </Text>
        </View>
      ) : null}
      <Text accessibilityRole="header" style={styles.title}>{COPY.upcoming.roomTitle}</Text>
      <Text style={styles.subtitle}>{COPY.upcoming.explainer}</Text>

      {existing === undefined ? (
        <Loading testID="upcoming-loading" />
      ) : null}

      {/* The contract's date panel (176:2484): the two plates side by side on
          the brand wash, so the stay reads as one range rather than as two
          unrelated questions stacked down the page. */}
      <View style={styles.datePanel}>
        <DateCard
          label={COPY.upcoming.checkInLabel}
          value={checkIn}
          onChange={setCheckIn}
          minimumDate={fromIso(todayIsoDate())}
          editable={!busy}
          testID="upcoming-check-in"
        />
        <DateCard
          label={COPY.upcoming.checkOutLabel}
          value={checkOut}
          onChange={setCheckOut}
          minimumDate={checkIn ? fromIso(checkIn) : fromIso(todayIsoDate())}
          editable={!busy}
          testID="upcoming-check-out"
        />
      </View>

      {/* The sheet's one privacy line (13:121), in place of the old card. */}
      <View style={styles.noteCard}>
        <ShieldGlyph />
        <Text style={styles.noteText}>{COPY.upcoming.datesPrivacy}</Text>
      </View>

      {error ? <Notice message={error} tone="error" testID="upcoming-error" /> : null}
      <Button
        label={
          submitting
            ? COPY.upcoming.saving
            : existing
              ? COPY.upcoming.updateButton
              : COPY.upcoming.saveButton
        }
        busy={submitting}
        onPress={save}
        disabled={busy}
        testID="save-upcoming"
      />
      {existing ? (
        <Button
          label={withdrawing ? COPY.upcoming.withdrawing : COPY.upcoming.withdrawButton}
          variant="secondary"
          busy={withdrawing}
          disabled={busy}
          onPress={withdraw}
          testID="upcoming-withdraw"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  /** The question (176:2480), at the size the other 176-series heads take. */
  /** 176:4326: the venue this stay is being declared at, on the brand wash. */
  venueBanner: {
    gap: spacing.tight,
    backgroundColor: color.accentWash,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
    marginBottom: spacing.sm,
  },
  venueLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.accentDeep,
  },
  venueName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  /** The line under it (176:2482): a sentence, so it reads at body size. */
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
  },
  /** The panel the pair stands on (176:2484): the brand wash, softest corner. */
  datePanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: color.accentWash,
    borderRadius: radius.xxl,
    padding: spacing.wide,
  },
  /** The plate (176:2486): white, centred, its own name in small capitals. */
  dateCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.md,
    gap: spacing.cozy,
    ...elevation.card,
  },
  dateLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.inkFaint,
    textAlign: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.cozy,
    alignSelf: 'stretch',
    flexWrap: 'wrap',
  },
  valueText: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.body,
    color: color.ink,
    textAlign: 'center',
  },
  /** The day the date falls on (176:2491). */
  weekday: {
    fontFamily: fontFamily.body,
    fontSize: font.label,
    color: color.inkFaint,
    textAlign: 'center',
  },
  /** The standing note (176:2538): the neutral information plate rather than
      the inert veil, so it reads as something told to you rather than as one
      more disabled surface. Deliberately unlifted — a note, not a card. */
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.snug,
    backgroundColor: tileTone.blue,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
});
