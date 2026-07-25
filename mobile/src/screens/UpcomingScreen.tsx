import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Body, Button, Caption, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type UpcomingStay } from '../data';
import { validateStayDates } from '../domain/upcoming';
import type { RootScreenProps } from '../navigation/types';

const VALIDATION_MESSAGES = {
  INVALID_FORMAT: 'Enter both dates as YYYY-MM-DD.',
  CHECKOUT_NOT_AFTER_CHECKIN: 'Check-out must be after check-in.',
  STAY_ALREADY_ENDED: 'That stay has already ended. Enter a current or future stay.',
} as const;

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
      setError(VALIDATION_MESSAGES[validation.reason]);
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
    <Screen testID="screen-upcoming">
      <Title>{COPY.upcoming.roomTitle}</Title>
      <Body>{COPY.upcoming.explainer}</Body>
      <Gap size="sm" />
      {existing === undefined ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="upcoming-loading" />
      ) : null}
      {existing ? (
        <Caption testID="upcoming-current">
          {`${COPY.upcoming.currentPrefix} ${existing.startDate} → ${existing.endDate}.`}
        </Caption>
      ) : null}
      <Body>{COPY.upcoming.formTitle}</Body>
      <Field
        label={COPY.upcoming.checkInLabel}
        hint={COPY.upcoming.dateHint}
        value={checkIn}
        onChangeText={setCheckIn}
        placeholder={COPY.upcoming.checkInPlaceholder}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        editable={!busy}
        testID="upcoming-check-in"
      />
      <Field
        label={COPY.upcoming.checkOutLabel}
        hint={COPY.upcoming.dateHint}
        value={checkOut}
        onChangeText={setCheckOut}
        placeholder={COPY.upcoming.checkOutPlaceholder}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        editable={!busy}
        testID="upcoming-check-out"
      />
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
