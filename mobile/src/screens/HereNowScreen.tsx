import React, { useState } from 'react';

import { Body, Button, Caption, Card, Gap, Notice, Screen, Title } from '../components/ui';
import { nowMs } from '../clock';
import { COPY } from '../copy';
import { isHereNowEligible } from '../domain/hereNow';
import type { ForegroundReading } from '../domain/hereNow';
import { getHotelById } from '../fixtures/hotels';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

/**
 * Presence check with a simulated foreground reading (ADR-005). The tester
 * chooses an outcome; the chosen coordinates flow through the same domain
 * evaluation a real GPS read would use and are discarded immediately.
 * `expo-location` is intentionally absent in this milestone.
 */
export function HereNowScreen({ navigation }: RootScreenProps<'HereNow'>) {
  const { state, dispatch } = useAppStore();
  const [lastResult, setLastResult] = useState<'in-range' | 'too-far' | null>(null);
  const hotel = getHotelById(state.activeHotel.activeHotelId);

  if (!hotel) {
    return (
      <Screen testID="screen-here-now">
        <Title>{COPY.hereNow.roomTitle}</Title>
        <Notice message={`Activate a hotel first. ${COPY.trust.oneHotel}`} />
      </Screen>
    );
  }

  const runCheck = (reading: ForegroundReading) => {
    dispatch({ type: 'SET_LOCATION_PERMISSION', permission: 'granted' });
    dispatch({ type: 'RECORD_PRESENCE_CHECK', hotel, reading });
  };

  const simulateAtHotel = () => {
    runCheck({ latitude: hotel.latitude, longitude: hotel.longitude, timestamp: nowMs() });
    setLastResult('in-range');
  };

  // Roughly 5.5 km north of the hotel — far outside the 500 m radius.
  const simulateFarAway = () => {
    runCheck({ latitude: hotel.latitude + 0.05, longitude: hotel.longitude, timestamp: nowMs() });
    setLastResult('too-far');
  };

  const denyPermission = () => {
    dispatch({ type: 'SET_LOCATION_PERMISSION', permission: 'denied' });
    setLastResult(null);
  };

  const eligible = isHereNowEligible(state.hereNow, state.activeHotel.activeHotelId, nowMs());

  return (
    <Screen testID="screen-here-now">
      <Title>{COPY.hereNow.roomTitle}</Title>
      <Body>{COPY.hereNow.explainer}</Body>
      <Gap size="sm" />
      <Card>
        <Caption>
          Preview build: the location check is simulated. Choose what a real phone would report
          near {hotel.name}.
        </Caption>
        <Button label="Simulate: I am at the hotel" onPress={simulateAtHotel} testID="simulate-near" />
        <Button
          label="Simulate: I am far away"
          variant="secondary"
          onPress={simulateFarAway}
          testID="simulate-far"
        />
        <Button
          label="Simulate: deny location permission"
          variant="secondary"
          onPress={denyPermission}
          testID="simulate-deny"
        />
      </Card>
      {state.locationPermission === 'denied' ? (
        <Notice message={COPY.hereNow.permissionDenied} tone="error" />
      ) : null}
      {lastResult === 'too-far' ? <Notice message={COPY.hereNow.tooFar} tone="error" /> : null}
      {eligible ? (
        <>
          <Notice message="You are in. Here Now is open for this hotel." />
          <Button label="Go to discovery" onPress={() => navigation.goBack()} testID="here-now-done" />
        </>
      ) : null}
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}
