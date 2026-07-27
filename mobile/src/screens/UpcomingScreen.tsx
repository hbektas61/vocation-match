import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Body, Button, Caption, Field, Gap, Heading, Notice, Screen, Title } from '../components/ui';
import { ShieldLock } from '../components/RoomIllustrations';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, COPY, upperCase } from '../copy';
import { ApiError, getApi, type UpcomingStay } from '../data';
import { validateStayDates } from '../domain/upcoming';
import type { RootScreenProps } from '../navigation/types';
import { color, font, fontFamily, radius, spacing } from '../theme';

const CalendarGlyph = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3} y={5} width={18} height={16} rx={3} />
    <Path d="M8 3v4M16 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01" />
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
 * One date, as the designer's field card — with the platform's own picker
 * behind it (owner, 2026-07-28: nobody should type "2026" by hand). iOS
 * shows its compact calendar control in place; Android opens its dialog
 * from the pressable value. The web fallback keeps the typed field, since
 * the community picker has no web half.
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
      <View style={styles.dateDisc}>
        <CalendarGlyph />
      </View>
      <View style={styles.dateField}>
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
          <View style={styles.pickerRow}>
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
              style={({ pressed }) => [styles.androidValue, pressed && styles.pressed]}
              testID={testID}
            >
              <Text style={styles.androidValueText}>
                {value ? value.split('-').reverse().join('.') : COPY.upcoming.pickDate}
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

  return (
    <Screen safeTop testID="screen-upcoming">
      {/* The designer's back pill, since the native header is gone. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.rooms.plainTitle}
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}
        testID="upcoming-back"
      >
        <Text style={styles.backChevron}>‹</Text>
        <Text style={styles.backLabel}>{COPY.rooms.plainTitle}</Text>
      </Pressable>

      <Title>{COPY.upcoming.roomTitle}</Title>
      <Body>{COPY.upcoming.explainer}</Body>

      <View style={styles.privacyCard}>
        <ShieldLock />
        <View style={styles.privacyWords}>
          <Text style={styles.privacyTitle}>{COPY.rooms.privacyTitle}</Text>
          <Caption>{COPY.upcoming.privacyNote}</Caption>
        </View>
      </View>

      {existing === undefined ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="upcoming-loading" />
      ) : null}
      {existing ? (
        <Caption testID="upcoming-current">
          {`${COPY.upcoming.currentPrefix} ${existing.startDate} → ${existing.endDate}.`}
        </Caption>
      ) : null}

      <Heading>{COPY.upcoming.formTitle}</Heading>
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

      <View style={styles.infoStrip}>
        <View style={styles.infoDot}>
          <Text style={styles.infoGlyph}>i</Text>
        </View>
        <View style={styles.infoWords}>
          <Caption>{COPY.upcoming.updateLater}</Caption>
        </View>
      </View>

      {error ? <Notice message={error} tone="error" testID="upcoming-error" /> : null}
      <Gap size="sm" />
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
        <>
          <Gap size="sm" />
          {/* A presence answer can already be taken back. Taking back
              something you said about yourself should not be harder. */}
          <Body>{COPY.upcoming.withdrawExplainer}</Body>
          <Button
            label={withdrawing ? COPY.upcoming.withdrawing : COPY.upcoming.withdrawButton}
            variant="danger"
            busy={withdrawing}
            disabled={busy}
            onPress={withdraw}
            testID="upcoming-withdraw"
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { opacity: 0.8 },
  backChevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    lineHeight: font.heading + 2,
    color: color.accentDeep,
  },
  backLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.accentDeep,
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(123, 79, 168, 0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  privacyWords: { flex: 1, gap: 2 },
  privacyTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dateDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateField: { flex: 1, gap: 6 },
  dateLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.2,
    color: color.inkMuted,
  },
  pickerRow: { alignItems: 'flex-start' },
  androidValue: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.border,
    paddingHorizontal: spacing.md,
    backgroundColor: color.surface,
  },
  androidValueText: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    color: color.ink,
  },
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(123, 79, 168, 0.05)',
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  infoDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyph: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: '#FFFFFF',
  },
  infoWords: { flex: 1 },
});
