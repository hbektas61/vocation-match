/**
 * One event, and the two ways into its room (D-056 §3.3).
 *
 * "Etkinliğe Gideceğim" is a declaration and asks for nothing — no ticket, no
 * booking, no QR code, no document. "Şu An Etkinlikteyim" is a one-time
 * foreground check the server decides, and it has five distinct ways of saying
 * no: too early, too late, cancelled, no published venue, and a reading too
 * vague to settle a 500 m question. Each of them says which one it was.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Body, Button, Caption, Card, Gap, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import {
  ApiError,
  deviceLocation,
  getApi,
  type EventPresenceAnswer,
  type ForegroundLocationReader,
  type MyEvent,
} from '../data';
import type { RootScreenProps } from '../navigation/types';
import { color, fontFamily, spacing } from '../theme';

/** Which sentence a refusal earns. Never a generic "try again". */
function outcomeMessage(outcome: EventPresenceAnswer['outcome']): string {
  switch (outcome) {
    case 'IN_RANGE':
      return COPY.events.hereNowOpen;
    case 'EVENT_NOT_STARTED':
      return COPY.events.hereNowNotStarted;
    case 'EVENT_FINISHED':
      return COPY.events.hereNowFinished;
    case 'EVENT_CANCELLED':
      return COPY.events.cancelled;
    case 'EVENT_TIME_UNCONFIRMED':
      return COPY.events.hereNowUnavailableTbd;
    case 'EVENT_LOCATION_UNAVAILABLE':
      return COPY.events.hereNowLocationUnavailable;
    case 'LOCATION_INACCURATE':
      return COPY.events.hereNowInaccurate;
    case 'TOO_FAR':
    default:
      return COPY.events.hereNowTooFar;
  }
}

export function EventDetailScreen({
  route,
  navigation,
  reader = deviceLocation,
}: RootScreenProps<'EventDetail'> & { reader?: ForegroundLocationReader }) {
  const [joined, setJoined] = useState<MyEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EventPresenceAnswer['outcome'] | null>(null);

  const join = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const mine = await getApi().joinEventUpcoming(route.params.selectionToken);
      setJoined(mine);
    } catch (error) {
      setProblem(error instanceof ApiError ? apiErrorMessage(error.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!joined) return;
    setBusy(true);
    setProblem(null);
    setOutcome(null);
    try {
      // The reading is taken at the moment of the action, handed to the server
      // once, and never stored on the device or shown to anybody (§9).
      const reading = await reader.read();
      if (reading.status !== 'granted') {
        setProblem(COPY.events.permissionDenied);
        return;
      }
      const answer = await getApi().verifyEventPresence(
        joined.eventId,
        reading.latitude,
        reading.longitude,
        reading.accuracyMeters,
      );
      setOutcome(answer.outcome);
      if (answer.withinRange) {
        setJoined(
          (await getApi().getMyEvents()).find((row) => row.eventId === joined.eventId) ?? joined,
        );
      }
    } catch (error) {
      setProblem(error instanceof ApiError ? apiErrorMessage(error.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="screen-event-detail">
      <Title>{route.params.name || COPY.events.pastEvent}</Title>
      <Gap size="sm" />

      {joined ? (
        <Card>
          <Body>{COPY.events.joined}</Body>
          <Button
            label={COPY.events.joinedRoomCta}
            onPress={() => navigation.navigate('Tabs')}
            testID="event-open-upcoming-deck"
          />
          <Button
            label={COPY.events.withdraw}
            variant="secondary"
            disabled={busy}
            onPress={async () => {
              // Withdrawing closes the room and deletes nothing else: the
              // matches and the conversations are as much theirs as anybody's.
              await getApi().withdrawFromEvent(joined.eventId);
              setJoined(null);
            }}
            testID="event-withdraw"
          />
        </Card>
      ) : (
        <Card>
          <Text style={styles.question}>{COPY.events.roomChoiceTitle}</Text>
          <Button
            label={COPY.events.joinUpcoming}
            onPress={join}
            disabled={busy}
            testID="event-join-upcoming"
          />
        </Card>
      )}

      {joined ? (
        <Card>
          <Body>{COPY.events.joinHereNow}</Body>
          <Button
            label={COPY.events.joinHereNow}
            onPress={verify}
            disabled={busy}
            testID="event-verify-here-now"
          />
          {joined.hereNowOpen ? (
            <Button
              label={COPY.events.liveRoomCta}
              variant="secondary"
              onPress={() => navigation.navigate('Tabs')}
              testID="event-open-live-deck"
            />
          ) : null}
        </Card>
      ) : null}

      {outcome ? (
        <Notice
          message={outcomeMessage(outcome)}
          tone={outcome === 'IN_RANGE' ? 'info' : 'error'}
          testID={`event-outcome-${outcome}`}
        />
      ) : null}
      {problem ? <Notice message={problem} tone="error" testID="event-problem" /> : null}

      {/* D-007, in the event room's own words: proximity is not a ticket. */}
      <Caption>{COPY.events.noTicketClaim}</Caption>
      <Caption testID="event-attribution">{COPY.events.attribution}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    color: color.ink,
    marginBottom: spacing.xs,
  },
});
