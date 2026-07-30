import React, { useState } from 'react';

import { Body, Button, Card, Caption, Gap, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import {
  ApiError,
  deniedLocation,
  deviceLocation,
  fixedLocation,
  getApi,
  type ForegroundLocationReader,
} from '../data';
import { getHotelById } from '../fixtures/hotels';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

type CheckOutcome =
  | { kind: 'in-range' }
  | { kind: 'too-far' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/**
 * Presence check. The real path reads the device's own foreground location
 * through `reader` (the actual GPS on a device, `deviceLocation` by
 * default) and sends it straight to `recordPresenceCheck` — the server, not
 * this screen, decides and stores only the boolean answer.
 *
 * The three "simulate" controls stay so the flow is testable without a
 * device: they build the same kind of reading from `fixedLocation`/
 * `deniedLocation` and run through the identical `runCheck` path, so a
 * simulated run and a real one behave identically.
 *
 * The hotel's coordinates never travel over the API (`HotelCard` omits
 * them, D-005); the fixture catalog is used here purely to synthesize a
 * plausible reading for the simulation, exactly as a device's own GPS would.
 */
export function HereNowScreen({
  navigation,
  reader = deviceLocation,
}: RootScreenProps<'HereNow'> & { reader?: ForegroundLocationReader }) {
  const { state, dispatch } = useAppStore();
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [checking, setChecking] = useState(false);

  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  // The fixture catalog only knows the fake's hotels; on a real project it
  // knows nothing, and requiring it here told people with a real active
  // hotel that they had none. It now gates only the simulation card, which
  // is the one thing that genuinely needs the fixture's coordinates.
  const simulationSource = getHotelById(state.activeHotel?.hotelId ?? null);

  if (!state.activeHotel) {
    return (
      <Screen testID="screen-here-now">
        <Title>{COPY.hereNow.roomTitle}</Title>
        <Notice message={`${COPY.roomReason.NO_ACTIVE_HOTEL} ${COPY.trust.oneHotel}`} />
      </Screen>
    );
  }

  // D-036: Here Now is a Premium room. The server refuses the check anyway;
  // this simply tells a free member the truth instead of offering a button
  // that can only fail.
  if (state.profile && !state.profile.isPremium) {
    return (
      <Screen testID="screen-here-now">
        <Title>{COPY.hereNow.roomTitle}</Title>
        <Body>{COPY.hereNow.explainer}</Body>
        <Gap size="sm" />
        <Notice message={COPY.hereNow.premiumOnly} testID="here-now-premium-only" />
        <Caption>{COPY.trust.noExactLocation}</Caption>
      </Screen>
    );
  }

  const runCheck = async (source: ForegroundLocationReader) => {
    setChecking(true);
    setOutcome(null);
    const reading = await source.read();

    if (reading.status === 'denied') {
      // Withdrawing consent has to reach the server: the stored answer is
      // what keeps Here Now open, and it survives for up to thirty minutes.
      // So nothing is assumed here — only once the clear actually succeeds
      // do we record the denial and re-read rooms from the server, and a
      // failure is surfaced rather than swallowed, because until it
      // succeeds sharing has not actually stopped.
      try {
        await getApi().clearPresenceCheck();
        dispatch({ type: 'SET_LOCATION_PERMISSION', permission: 'denied' });
        dispatch({ type: 'ROOMS_LOADED', rooms: await getApi().getRooms() });
      } catch {
        setOutcome({ kind: 'error', message: COPY.hereNow.stopSharingError });
      }
      setChecking(false);
      return;
    }
    if (reading.status === 'unavailable') {
      // Distinct from "too far": the read itself failed, so nothing was
      // actually checked (no simulator/emulator fix, airplane mode, a
      // browser refusing geolocation, and so on).
      setOutcome({ kind: 'unavailable' });
      setChecking(false);
      return;
    }

    dispatch({ type: 'SET_LOCATION_PERMISSION', permission: 'granted' });
    try {
      const api = getApi();
      // D-054: a Google venue has no coordinate of ours to measure against, so
      // the backend resolves its position from the Place ID and runs the same
      // 500 m test there. Both paths answer identically — a boolean and an
      // expiry — and neither ever returns a coordinate or a distance.
      const venue = await api.getActiveVenue().catch(() => null);
      const answer = venue?.provider === 'google'
        ? await api.verifyPresenceAtVenue(reading.latitude, reading.longitude)
        : await api.recordPresenceCheck(reading.latitude, reading.longitude);
      setOutcome({ kind: answer.withinRange ? 'in-range' : 'too-far' });
    } catch (err) {
      setOutcome({
        kind: 'error',
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
      });
    } finally {
      setChecking(false);
    }
  };

  // Roughly 5.5 km north of the hotel — far outside the 500 m radius. Only
  // built when the fixture knows the hotel, i.e. in the credential-free run.
  const farAway = simulationSource
    ? fixedLocation(simulationSource.latitude + 0.05, simulationSource.longitude)
    : null;
  const atHotel = simulationSource
    ? fixedLocation(simulationSource.latitude, simulationSource.longitude)
    : null;

  return (
    <Screen testID="screen-here-now">
      <Title>{COPY.hereNow.roomTitle}</Title>
      <Body>{COPY.hereNow.explainer}</Body>
      <Gap size="sm" />
      <Card>
        <Body>{COPY.hereNow.realCheckIntro}</Body>
        <Button
          label={COPY.hereNow.realCheckButton}
          onPress={() => runCheck(reader)}
          disabled={checking}
          testID="check-presence"
        />
      </Card>
      {atHotel && farAway ? (
        <Card>
          <Caption>{`${COPY.hereNow.simulateIntroPrefix} ${hotel?.name ?? ''}.`}</Caption>
          <Button
            label={COPY.hereNow.simulateAtHotel}
            onPress={() => runCheck(atHotel)}
            disabled={checking}
            testID="simulate-near"
          />
          <Button
            label={COPY.hereNow.simulateFarAway}
            variant="secondary"
            onPress={() => runCheck(farAway)}
            disabled={checking}
            testID="simulate-far"
          />
          <Button
            label={COPY.hereNow.simulateDeny}
            variant="secondary"
            onPress={() => runCheck(deniedLocation())}
            disabled={checking}
            testID="simulate-deny"
          />
        </Card>
      ) : null}
      {outcome?.kind === 'error' ? (
        <Notice message={outcome.message} tone="error" testID="here-now-error" />
      ) : null}
      {state.locationPermission === 'denied' ? (
        <Notice message={COPY.hereNow.permissionDenied} tone="error" />
      ) : null}
      {outcome?.kind === 'unavailable' ? (
        <Notice message={COPY.hereNow.unavailable} tone="error" testID="here-now-unavailable" />
      ) : null}
      {outcome?.kind === 'too-far' ? <Notice message={COPY.hereNow.tooFar} tone="error" /> : null}
      {outcome?.kind === 'in-range' ? (
        <>
          <Notice message={COPY.hereNow.inRange} />
          <Button label={COPY.hereNow.goToDiscovery} onPress={() => navigation.goBack()} testID="here-now-done" />
        </>
      ) : null}
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}
