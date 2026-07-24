import React, { useState } from 'react';

import { Body, Button, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi } from '../data';
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
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
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

  return (
    <Screen testID="screen-upcoming">
      <Title>{COPY.upcoming.roomTitle}</Title>
      <Body>{COPY.upcoming.explainer}</Body>
      <Gap size="sm" />
      <Body>{COPY.upcoming.formTitle}</Body>
      <Field
        label={COPY.upcoming.checkInLabel}
        hint={COPY.upcoming.dateHint}
        value={checkIn}
        onChangeText={setCheckIn}
        placeholder={COPY.upcoming.checkInPlaceholder}
        autoCapitalize="none"
        editable={!submitting}
        testID="upcoming-check-in"
      />
      <Field
        label={COPY.upcoming.checkOutLabel}
        hint={COPY.upcoming.dateHint}
        value={checkOut}
        onChangeText={setCheckOut}
        placeholder={COPY.upcoming.checkOutPlaceholder}
        autoCapitalize="none"
        editable={!submitting}
        testID="upcoming-check-out"
      />
      {error ? <Notice message={error} tone="error" testID="upcoming-error" /> : null}
      <Gap size="sm" />
      <Button
        label={submitting ? COPY.upcoming.saving : COPY.upcoming.saveButton}
        onPress={save}
        disabled={submitting}
        testID="save-upcoming"
      />
    </Screen>
  );
}
