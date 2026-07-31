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
  /**
   * Which action is in flight, not merely *that* one is. A single boolean
   * disabled both CTAs and changed neither label, so pressing one left the
   * screen inert and silent — and this check waits on a location prompt, so
   * "inert and silent" can last a while. Knowing which one lets exactly that
   * button say what it is doing.
   */
  const [pending, setPending] = useState<'join' | 'live' | 'verify' | null>(null);
  const busy = pending !== null;
  /** E-24: the withdraw confirmation is open. */
  const [withdrawing, setWithdrawing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EventPresenceAnswer['outcome'] | null>(null);

  const join = async () => {
    setPending('join');
    setProblem(null);
    try {
      const mine = await getApi().joinEventUpcoming(route.params.selectionToken);
      setJoined(mine);
    } catch (error) {
      setProblem(error instanceof ApiError ? apiErrorMessage(error.code) : COPY.errors.unknown);
    } finally {
      setPending(null);
    }
  };

  /**
   * E-21: the live check straight from the selection, with no declaration
   * first and none created. The membership path below still exists for
   * somebody who *has* joined — it needs no token and re-uses their event.
   */
  const verifyFromSelection = async () => {
    setPending('live');
    setProblem(null);
    setOutcome(null);
    try {
      const reading = await reader.read();
      if (reading.status !== 'granted') {
        setProblem(COPY.events.permissionDenied);
        return;
      }
      const answer = await getApi().verifyEventPresenceFromSelection(
        route.params.selectionToken,
        reading.latitude,
        reading.longitude,
        reading.accuracyMeters,
      );
      setOutcome(answer.outcome);
      // Nothing is joined by this: only a live answer, and only when it worked.
    } catch (error) {
      setProblem(error instanceof ApiError ? apiErrorMessage(error.code) : COPY.errors.unknown);
    } finally {
      setPending(null);
    }
  };

  const verify = async () => {
    if (!joined) return;
    setPending('verify');
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
      setPending(null);
    }
  };

  return (
    <Screen testID="screen-event-detail">
      <Title>{route.params.name || COPY.events.pastEvent}</Title>
      {/* Where and when. The screen used to carry the name alone, so the two
          facts a person decides on were only on the list behind them. */}
      {route.params.where || route.params.when ? (
        <Body>{[route.params.where, route.params.when].filter(Boolean).join(' · ')}</Body>
      ) : null}
      <Gap size="sm" />

      {joined ? (
        <Card>
          <Body>{COPY.events.joined}</Body>
          <Button
            label={COPY.events.joinedRoomCta}
            onPress={() => navigation.navigate('Tabs')}
            testID="event-open-upcoming-deck"
          />
          {/* E-24: withdrawing shuts a room you are in. Switching a vacation
              place asks first; this fired on the first press. It deletes
              nothing either way — the matches and the conversations are as
              much theirs as anybody's — but leaving a room is still a thing
              to mean rather than a thing to graze. */}
          {withdrawing ? (
            <>
              <Text style={styles.question}>{COPY.events.withdrawConfirm}</Text>
              <Body>{COPY.events.withdrawBody}</Body>
              <Button
                label={COPY.events.withdrawYes}
                variant="danger"
                disabled={busy}
                onPress={async () => {
                  await getApi().withdrawFromEvent(joined.eventId);
                  setWithdrawing(false);
                  setJoined(null);
                }}
                testID="event-withdraw-confirm"
              />
              <Button
                label={COPY.common.cancel}
                variant="secondary"
                onPress={() => setWithdrawing(false)}
                testID="event-withdraw-cancel"
              />
            </>
          ) : (
            <Button
              label={COPY.events.withdraw}
              variant="secondary"
              disabled={busy}
              onPress={() => setWithdrawing(true)}
              testID="event-withdraw"
            />
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.question}>{COPY.events.roomChoiceTitle}</Text>
          {/* E-22: what "going" means, before it is declared rather than after
              — the whole product risk of this feature is somebody reading it
              as a ticket. */}
          <Body>{COPY.events.joinExplainer}</Body>
          {/* E-21: two independent ways in. Pressing either must not quietly
              create the other — being at an event and planning to go are
              separate claims, and the hotel room has been protected from that
              same inversion since D-002. */}
          <Button
            label={pending === 'join' ? COPY.events.joining : COPY.events.joinUpcoming}
            busy={pending === 'join'}
            onPress={join}
            disabled={busy}
            testID="event-join-upcoming"
          />
          <Button
            label={pending === 'live' ? COPY.events.checkingLive : COPY.events.joinHereNow}
            busy={pending === 'live'}
            variant="secondary"
            onPress={verifyFromSelection}
            disabled={busy}
            testID="event-verify-from-selection"
          />
        </Card>
      )}

      {joined ? (
        <Card>
          {/* Not the button's own label again: the card says what the live
              room is, the button says what pressing it does. */}
          <Body>{COPY.events.hereNowExplainer}</Body>
          <Button
            label={pending === 'verify' ? COPY.events.checkingLive : COPY.events.joinHereNow}
            busy={pending === 'verify'}
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
          tone={outcome === 'IN_RANGE' ? 'success' : 'error'}
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
