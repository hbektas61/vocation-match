import React, { useState } from 'react';

import { Body, Button, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { nowMs, todayIsoDate } from '../clock';
import { COPY } from '../copy';
import { validateStayDates } from '../domain/upcoming';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

const VALIDATION_MESSAGES = {
  INVALID_FORMAT: 'Enter both dates as YYYY-MM-DD.',
  CHECKOUT_NOT_AFTER_CHECKIN: 'Check-out must be after check-in.',
  STAY_ALREADY_ENDED: 'That stay has already ended. Enter a current or future stay.',
} as const;

export function UpcomingScreen({ navigation }: RootScreenProps<'Upcoming'>) {
  const { state, dispatch } = useAppStore();
  const [checkIn, setCheckIn] = useState(state.upcoming?.checkInDate ?? '');
  const [checkOut, setCheckOut] = useState(state.upcoming?.checkOutDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const today = todayIsoDate();
    const validation = validateStayDates(checkIn.trim(), checkOut.trim(), today);
    if (!validation.ok) {
      setError(VALIDATION_MESSAGES[validation.reason]);
      return;
    }
    setError(null);
    dispatch({
      type: 'DECLARE_UPCOMING',
      checkInDate: checkIn.trim(),
      checkOutDate: checkOut.trim(),
      now: nowMs(),
    });
    navigation.goBack();
  };

  return (
    <Screen testID="screen-upcoming">
      <Title>{COPY.upcoming.roomTitle}</Title>
      <Body>{COPY.upcoming.explainer}</Body>
      <Gap size="sm" />
      <Body>{COPY.upcoming.formTitle}</Body>
      <Field
        label="Check-in date (YYYY-MM-DD)"
        value={checkIn}
        onChangeText={setCheckIn}
        placeholder="2026-08-01"
        autoCapitalize="none"
        testID="upcoming-check-in"
      />
      <Field
        label="Check-out date (YYYY-MM-DD)"
        value={checkOut}
        onChangeText={setCheckOut}
        placeholder="2026-08-08"
        autoCapitalize="none"
        testID="upcoming-check-out"
      />
      {error ? <Notice message={error} tone="error" /> : null}
      <Gap size="sm" />
      <Button label="Save stay dates" onPress={save} testID="save-upcoming" />
      {state.upcoming ? (
        <Button
          label="Remove declaration"
          variant="secondary"
          onPress={() => {
            dispatch({ type: 'CLEAR_UPCOMING' });
            navigation.goBack();
          }}
          testID="clear-upcoming"
        />
      ) : null}
    </Screen>
  );
}
