import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { PermissionPrimer } from '../components/PermissionPrimer';
import { PresenceResult } from '../components/PresenceResult';
import { Body, Button, Card, Caption, Gap, Notice, Screen } from '../components/ui';
import { color, font, fontFamily, leading, radius, spacing, tileTone, tracking } from '../theme';
import { apiErrorMessage, COPY, upperCase } from '../copy';
import {
  ApiError,
  deniedLocation,
  deviceLocation,
  fixedLocation,
  getApi,
  isFakeApiEnabled,
  type ForegroundLocationReader,
} from '../data';
import { getHotelById } from '../fixtures/hotels';
import type { RootScreenProps } from '../navigation/types';
import { useActiveVenueName } from '../state/useActiveVenueName';
import { useAppStore } from '../state/AppStore';

/** The primer's crown mark (176:2554): the pin, at the tile's own scale. */
function PinMark() {
  return (
    <Svg
      width={48}
      height={48}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color.accent}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <Circle cx={12} cy={10} r={2.6} />
    </Svg>
  );
}

/** One mark per reason (176:2564/2575/2584). Decorative; the words carry it. */
function ReasonMark({ kind }: { kind: 'privacy' | 'live' | 'battery' }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (kind === 'privacy') {
    // An eye, closed: the exact position is never looked at.
    return (
      <Svg {...common} stroke={color.success}>
        <Path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
        <Path d="m4 4 16 16" />
      </Svg>
    );
  }
  if (kind === 'live') {
    return (
      <Svg {...common} stroke={color.accentDeep}>
        <Circle cx={12} cy={8} r={3.2} />
        <Path d="M5.5 19c0-3.2 2.9-5.2 6.5-5.2s6.5 2 6.5 5.2" />
      </Svg>
    );
  }
  return (
    <Svg {...common} stroke={color.inkMuted}>
      <Path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
    </Svg>
  );
}

/** The pin again, in white, for the filled discs the two states wear. */
function PinMarkOnColor({ size }: { size: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color.onAccent}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <Circle cx={12} cy={10} r={2.6} />
    </Svg>
  );
}

/** 176:4263 — the green tick that closes the success mark. */
function CheckMark() {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color.onAccent}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="m4 13 5 5L20 7" />
    </Svg>
  );
}

type CheckOutcome =
  | { kind: 'in-range' }
  | { kind: 'too-far' }
  | { kind: 'unavailable' }
  /** D-055a: the device answered, but not precisely enough to be an answer. */
  | { kind: 'inaccurate' }
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

  /**
   * Which rooms the server says are open, read here rather than inherited.
   *
   * R-011's way out is named after where it goes, and which way that is
   * depends on whether Before the Trip is open. The trip tab happens to have
   * loaded that already on the usual path — but "happens to" is not a source
   * of truth, and on any other way in (a deep link, a store that was reset)
   * the screen would have guessed. So it asks.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rooms = await getApi().getRooms().catch(() => null);
      if (rooms && !cancelled) dispatch({ type: 'ROOMS_LOADED', rooms });
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // The venue by name, from the app's one shared answer — a Google venue's
  // cached card holds the `(google)` marker instead of a name (D-054).
  const { name: venueName } = useActiveVenueName();
  // The fixture catalog only knows the fake's hotels; on a real project it
  // knows nothing, and requiring it here told people with a real active
  // hotel that they had none. It now gates only the simulation card, which
  // is the one thing that genuinely needs the fixture's coordinates.
  //
  // The fixture catalog is *bundled*, though, so "the catalog knows this id"
  // was never a safe gate on its own: a real member whose active venue
  // happened to carry a fixture id would have been handed three buttons that
  // fake a location reading. The build flag is the actual gate — the same one
  // `CheckinScreen` uses — and it is inlined at build time, so in a real
  // export this card is not merely hidden, it is not there.
  const simulationSource = isFakeApiEnabled()
    ? getHotelById(state.activeHotel?.hotelId ?? null)
    : null;

  if (!state.activeHotel) {
    return (
      <Screen testID="screen-here-now">
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
        ? await api.verifyPresenceAtVenue(
            reading.latitude,
            reading.longitude,
            reading.accuracyMeters,
          )
        : await api.recordPresenceCheck(
            reading.latitude,
            reading.longitude,
            reading.accuracyMeters,
          );
      // Three answers, not two. "We could not tell" is not "you are not here",
      // and the server writes nothing for it — so nothing on this screen may
      // imply the check happened and failed.
      setOutcome({
        kind: answer.outcome === 'LOCATION_INACCURATE'
          ? 'inaccurate'
          : answer.withinRange ? 'in-range' : 'too-far',
      });
    } catch (err) {
      setOutcome({
        kind: 'error',
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
      });
    } finally {
      setChecking(false);
    }
  };

  /**
   * The one place somebody can still get to without moving.
   *
   * Before the Trip is the room that does not need you to be anywhere, so it
   * is the honest offer next to a failed proximity check — but only when the
   * server says it is open. If no stay is declared the deck would be empty,
   * so the offer becomes the step that fills it instead. Either way the
   * button is named for where it goes.
   */
  const upcomingOpen = state.rooms.find((r) => r.room === 'UPCOMING')?.eligible === true;
  const wayOut = upcomingOpen
    ? {
        label: COPY.hereNow.seeUpcoming,
        // Pushed over the tabs, this screen's own navigator cannot see the
        // deck — the way there is the root's nested route (owner report,
        // 2026-08-05: 'NAVIGATE … not handled by any navigator').
        go: () =>
          navigation.navigate('Tabs', {
            screen: 'Discovery',
            params: { source: 'UPCOMING' as const },
          }),
      }
    : { label: COPY.hereNow.addDates, go: () => navigation.navigate('Upcoming') };

  // Roughly 5.5 km north of the hotel — far outside the 500 m radius. Only
  // built when the fixture knows the hotel, i.e. in the credential-free run.
  const farAway = simulationSource
    ? fixedLocation(simulationSource.latitude + 0.05, simulationSource.longitude)
    : null;
  const atHotel = simulationSource
    ? fixedLocation(simulationSource.latitude, simulationSource.longitude)
    : null;

  /*
    177:4751 — the wait is a state, not a spinner inside a button. The check
    can take a device several seconds to answer, and the drawing spends that
    time saying what is being asked and what is not being kept, rather than
    leaving the primer's three reasons on screen with one control greyed out.
  */
  if (checking) {
    return (
      <Screen testID="screen-here-now" scroll={false}>
        <View style={styles.stage} testID="here-now-checking">
          <View style={styles.checkingDisc}>
            <PinMarkOnColor size={40} />
          </View>
          <Text accessibilityRole="header" style={styles.stageTitle}>
            {COPY.hereNow.checkingTitle}
          </Text>
          <Text style={styles.stageBody}>{COPY.hereNow.checkingBody}</Text>
        </View>
        {/* 177:4757: the promise stands at the foot while the wait happens,
            which is the moment it is actually worth reading. */}
        <View style={styles.trustFoot}>
          <Text style={styles.trustLabel}>{upperCase(COPY.hereNow.primerPrivacy)}</Text>
          <Text style={styles.trustFine}>{COPY.trust.noExactLocation}</Text>
        </View>
      </Screen>
    );
  }

  /*
    176:4237 — arriving is the one good answer this screen has, and it used to
    be a green banner with a button under it. The drawing gives it the mark,
    the sentence and two ways on.

    The file also stacks three faces and a "+42" beside them. Who is in a room,
    and how many, is not something any endpoint hands this screen, so the stack
    is not drawn rather than filled with invented people.
  */
  if (outcome?.kind === 'in-range') {
    return (
      <Screen testID="screen-here-now" scroll={false}>
        <View style={styles.stage}>
          <View style={styles.successWash}>
            <View style={styles.successPlate}>
              <PinMarkOnColor size={56} />
            </View>
            <View style={styles.successTick}>
              <CheckMark />
            </View>
          </View>
          <Text accessibilityRole="header" style={styles.stageTitle}>
            {COPY.hereNow.inRangeTitle}
          </Text>
          {/* The banner keeps its `tone="success"`, which is what a screen
              reader hears; the heading above is what a sighted person reads. */}
          <Notice message={COPY.hereNow.inRange} tone="success" />
        </View>
        {/* The check is finished, so this returns to the tabs rather than one
            step back. It used to be the same thing: the room opened straight
            off the trip tab. D-065 put the rooms behind the venue card's
            "Odaya Gir", so a single `goBack` would now land on the venue
            details screen — one press short of the deck this button names. */}
        <Button
          label={COPY.hereNow.goToDiscovery}
          onPress={() => navigation.popToTop()}
          testID="here-now-done"
        />
        <Button
          label={COPY.hereNow.refreshLocation}
          variant="secondary"
          onPress={() => runCheck(reader)}
          testID="here-now-refresh"
        />
        <Caption>{COPY.trust.noExactLocation}</Caption>
      </Screen>
    );
  }

  return (
    <Screen testID="screen-here-now">
      {/*
        D-065's location primer (176:2550), standing where the app actually
        asks. It is not an onboarding step: the wizard's ten steps are a
        counted sequence D-065 adopts without reordering, and proximity is
        opt-in for the life of the account rather than a condition of getting
        in. "Not now" simply leaves — the room stays closed and everything
        else in the app still works, which is the whole reason the primer is
        allowed to exist at all.
      */}
      <PermissionPrimer
        icon={<PinMark />}
        title={COPY.hereNow.primerTitle}
        body={COPY.hereNow.explainer}
        reasons={[
          {
            icon: <ReasonMark kind="privacy" />,
            tint: tileTone.green,
            title: COPY.hereNow.primerPrivacy,
            body: COPY.trust.noExactLocation,
          },
          {
            icon: <ReasonMark kind="live" />,
            tint: tileTone.orange,
            title: COPY.hereNow.primerLive,
            body: COPY.hereNow.primerLiveBody,
          },
          {
            icon: <ReasonMark kind="battery" />,
            tint: tileTone.blue,
            title: COPY.hereNow.primerBattery,
            body: COPY.hereNow.realCheckIntro,
          },
        ]}
        actionLabel={checking ? COPY.hereNow.checking : COPY.hereNow.realCheckButton}
        actionBusy={checking}
        onAction={() => runCheck(reader)}
        declineLabel={COPY.onboarding.skip}
        onDecline={() => navigation.goBack()}
        testID="here-now-primer"
        actionTestID="check-presence"
        declineTestID="here-now-not-now"
      />
      {atHotel && farAway ? (
        <Card>
          <Caption>{`${COPY.hereNow.simulateIntroPrefix} ${venueName ?? ''}.`}</Caption>
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
      {/*
        R-011. These two refusals are the recoverable ones, and they are
        recoverable differently — one wants you somewhere else, the other
        wants the same place with a clearer sky — so each gets the whole
        result rather than a shared red line. `wayOut` never leads to a shut
        door: it offers the deck only when the server says that room is open,
        and otherwise offers the step that opens it.
      */}
      {outcome?.kind === 'inaccurate' ? (
        <PresenceResult
          title={COPY.hereNow.inaccurateTitle}
          message={COPY.hereNow.inaccurate}
          explanation={COPY.hereNow.inaccurateWhat}
          onRetry={() => runCheck(reader)}
          retryBusy={checking}
          wayOutLabel={wayOut.label}
          onWayOut={wayOut.go}
          testID="here-now-inaccurate"
        />
      ) : null}
      {outcome?.kind === 'too-far' ? (
        <PresenceResult
          title={COPY.hereNow.tooFarTitle}
          message={COPY.hereNow.tooFar}
          explanation={COPY.hereNow.tooFarWhat}
          onRetry={() => runCheck(reader)}
          retryBusy={checking}
          wayOutLabel={wayOut.label}
          onWayOut={wayOut.go}
          testID="here-now-too-far"
        />
      ) : null}
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}

/** 176:4256 — the success mark's coral plate, and the wash it stands on. */
const SUCCESS_PLATE = 128;
const SUCCESS_WASH = 192;
/** 176:4263 — the tick's disc, overhanging the plate's corner. */
const SUCCESS_TICK = 48;
/** 177:4754 — the waiting mark, a plain coral disc. */
const CHECKING_DISC = 80;

const styles = StyleSheet.create({
  /** Both states are one centred column on an otherwise empty screen. */
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  stageTitle: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
    textAlign: 'center',
  },
  stageBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },
  checkingDisc: {
    width: CHECKING_DISC,
    height: CHECKING_DISC,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successWash: {
    width: SUCCESS_WASH,
    height: SUCCESS_WASH,
    borderRadius: radius.pill,
    backgroundColor: color.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** The plate is a squircle rather than a disc — the file's one soft square. */
  successPlate: {
    width: SUCCESS_PLATE,
    height: SUCCESS_PLATE,
    borderRadius: radius.xxl,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTick: {
    position: 'absolute',
    right: spacing.wide,
    bottom: spacing.wide,
    width: SUCCESS_TICK,
    height: SUCCESS_TICK,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.surface,
    backgroundColor: color.successMark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 177:4757: the promise, in the structure voice rather than as prose. */
  trustFoot: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg },
  trustLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.accentDeep,
  },
  trustFine: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    textAlign: 'center',
  },
});
