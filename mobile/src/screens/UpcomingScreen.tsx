import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, Field, Loading, Notice, Screen } from '../components/ui';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type UpcomingStay } from '../data';
import { formatLongDate } from '../domain/dates';
import { validateStayDates } from '../domain/upcoming';
import type { RootScreenProps } from '../navigation/types';
import { color, elevation, font, fontFamily, leading, radius, spacing, tracking } from '../theme';

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

/** "12 Ağustos 2026", the way the sheet prints a date (13:117). */
function longDate(value: string): string {
  return formatLongDate(value);
}

/**
 * One date, as the sheet's card (13:115): the tracked pink label over the
 * long date — with the platform's own picker behind it (owner, 2026-07-28:
 * nobody should type "2026" by hand). iOS shows its compact calendar control
 * in place; Android opens its dialog from the pressable value. The web
 * fallback keeps the typed field, since the community picker has no web half.
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
      <Text style={styles.dateLabel}>{label}</Text>
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
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
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
              {value ? longDate(value) : COPY.upcoming.pickDate}
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
    </View>
  );
}

export function UpcomingScreen({ navigation }: RootScreenProps<'Upcoming'>) {
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
      <Text accessibilityRole="header" style={styles.title}>{COPY.upcoming.roomTitle}</Text>
      <Text style={styles.subtitle}>{COPY.upcoming.explainer}</Text>

      {existing === undefined ? (
        <Loading testID="upcoming-loading" />
      ) : null}

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
  /** The sheet's head (13:113): 28, left, on the cream ground. */
  title: {
    fontFamily: fontFamily.display,
    fontSize: font.display,
    lineHeight: font.display * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /** The date card (13:115): white, the card radius, 16 inside, 10 between. */
  dateCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.snug,
    ...elevation.card,
  },
  dateLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    letterSpacing: tracking.none,
    color: color.accentDeep,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  valueText: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    color: color.ink,
  },
  /** The privacy line's card (13:121): white with the quiet edge, deliberately
      without the card shadow — a standing note rather than another surface
      competing with the two date cards above it. */
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: color.veil,
    borderRadius: radius.xl,
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
