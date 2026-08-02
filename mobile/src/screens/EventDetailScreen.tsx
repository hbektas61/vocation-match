/**
 * One event, and the two ways into its room (D-056 §3.3, drawn as D-062).
 *
 * "Etkinliğe Gideceğim" is a declaration and asks for nothing — no ticket, no
 * booking, no QR code, no document. "Şu An Etkinlikteyim" is a one-time
 * foreground check the server decides, and it has five distinct ways of saying
 * no: too early, too late, cancelled, no published venue, and a reading too
 * vague to settle a 500 m question. Each of them says which one it was.
 *
 * The screen draws its own back pill and hero (ED-02): the leased artwork
 * with the name, date and venue on a scrim, and the provider attribution on
 * the photograph it belongs to. Without artwork — or once its URL lapses —
 * the same facts stand as plain text (E-20), and the attribution moves to a
 * caption, because it follows the provider's content wherever that is.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Caption, Notice, PhotoScrim, Screen } from '../components/ui';
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
import { color, fontFamily, MIN_TOUCH, overlay, radius, spacing, tokens } from '../theme';

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

/**
 * The two rooms' marks, drawn rather than pictured (D-058): a pair of heads
 * for the goers, a reading in progress for the live check. Both sit in the
 * same sand chip so the cards read as siblings.
 */
function GoersMark() {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
      <View style={styles.markHead} />
      <View style={[styles.markHead, styles.markHeadSecond]} />
    </View>
  );
}

function LiveMark() {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
      <View style={styles.markRing} />
      <View style={styles.markDot} />
    </View>
  );
}

/** ED-02's declaration card: chip, claim, its one sentence, and the way in. */
function ChoiceCard({
  mark,
  title,
  sub,
  disabled,
  onPress,
  testID,
}: {
  mark: React.ReactNode;
  title: string;
  sub: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={styles.chip}>{mark}</View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceSub}>{sub}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
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
   * control say what it is doing.
   */
  const [pending, setPending] = useState<'join' | 'live' | 'verify' | null>(null);
  const busy = pending !== null;
  /** E-24: the withdraw confirmation is open. */
  const [withdrawing, setWithdrawing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EventPresenceAnswer['outcome'] | null>(null);
  /** A leased URL can lapse mid-screen; the fallback is the text layout. */
  const [imageFailed, setImageFailed] = useState(false);

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

  const name = route.params.name || COPY.events.pastEvent;
  const meta = [route.params.when, route.params.where].filter(Boolean).join(' · ');
  const showHero = Boolean(route.params.imageUrl) && !imageFailed;

  return (
    <Screen safeTop testID="screen-event-detail">
      {/* The way back, drawn like the wizard's chevron rather than a bar. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.common.back}
        onPress={() => navigation.goBack()}
        hitSlop={4}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        testID="event-detail-back"
      >
        <Text style={styles.backChevron}>‹</Text>
      </Pressable>

      {showHero ? (
        /* ED-02: the leased artwork carries the facts — and the attribution,
           which belongs on the provider's content, not under it. */
        <View style={styles.hero}>
          <Image
            source={{ uri: route.params.imageUrl as string }}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
          />
          <PhotoScrim />
          {route.params.badge ? (
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeGlyph}>{'○'}</Text>
              <Text style={styles.heroBadgeText} numberOfLines={1}>
                {route.params.badge}
              </Text>
            </View>
          ) : null}
          <View style={styles.heroText}>
            <Text style={styles.heroName} numberOfLines={2}>
              {name}
            </Text>
            {meta ? (
              <Text style={styles.heroMeta} numberOfLines={2}>
                {meta}
              </Text>
            ) : null}
            <Text style={styles.heroAttribution} testID="event-attribution">
              {COPY.events.attribution}
            </Text>
          </View>
        </View>
      ) : (
        /* E-20: no artwork is a first-class layout, not a hole. The same two
           facts a person decides on, as plain text (E-21). */
        <View style={styles.plainHead}>
          <Text style={styles.plainName}>{name}</Text>
          {meta ? <Text style={styles.plainMeta}>{meta}</Text> : null}
        </View>
      )}

      {joined ? (
        withdrawing ? (
          /* ED-04 (E-24): withdrawing shuts a room you are in, so it is a
             question card, not a first-press action. It deletes nothing either
             way — the matches and the conversations are as much theirs as
             anybody's — but leaving a room is a thing to mean, not to graze. */
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{COPY.events.withdrawConfirm}</Text>
            <Text style={styles.confirmBody}>{COPY.events.withdrawBody}</Text>
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
          </View>
        ) : (
          /* ED-03: the goers room, open. */
          <View style={styles.roomCard}>
            <View style={styles.roomHead}>
              <View style={styles.chipSmall}>
                <GoersMark />
              </View>
              <Text style={styles.roomTitle}>{COPY.events.upcomingRoomTitle}</Text>
            </View>
            <Text style={styles.roomBody}>{COPY.events.joined}</Text>
            <Button
              label={COPY.events.joinedRoomCta}
              onPress={() => navigation.navigate('Tabs')}
              testID="event-open-upcoming-deck"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.events.withdraw}
              disabled={busy}
              onPress={() => setWithdrawing(true)}
              style={({ pressed }) => [styles.withdrawRow, pressed && styles.pressed]}
              testID="event-withdraw"
            >
              <Text style={styles.withdrawText}>{COPY.events.withdraw}</Text>
            </Pressable>
          </View>
        )
      ) : (
        /* ED-02 (E-21/E-22): two independent ways in, and what "going" means
           before it is declared — the whole product risk of this feature is
           somebody reading it as a ticket. Pressing either must not quietly
           create the other; the hotel room has been protected from that same
           inversion since D-002. */
        <>
          <Text style={styles.question}>{COPY.events.roomChoiceTitle}</Text>
          <Text style={styles.explainer}>{COPY.events.joinExplainer}</Text>
          <ChoiceCard
            mark={<GoersMark />}
            title={pending === 'join' ? COPY.events.joining : COPY.events.joinUpcoming}
            sub={COPY.events.joinUpcomingSub}
            disabled={busy}
            onPress={join}
            testID="event-join-upcoming"
          />
          <ChoiceCard
            mark={<LiveMark />}
            title={pending === 'live' ? COPY.events.checkingLive : COPY.events.joinHereNow}
            sub={COPY.events.joinHereNowSub}
            disabled={busy}
            onPress={verifyFromSelection}
            testID="event-verify-from-selection"
          />
        </>
      )}

      {joined && !withdrawing ? (
        /* ED-03: the live room — the card says what it is, the control says
           what pressing it does, and the green line says what is true now. */
        <View style={styles.roomCard}>
          <View style={styles.roomHead}>
            <View style={styles.chipSmall}>
              <LiveMark />
            </View>
            <Text style={styles.roomTitle}>{COPY.events.liveRoomTitle}</Text>
          </View>
          <Text style={styles.roomBody}>{COPY.events.hereNowExplainer}</Text>
          {joined.hereNowOpen ? (
            <>
              <View style={styles.livePill}>
                <Text style={styles.livePillDot}>{'●'}</Text>
                <Text style={styles.livePillText}>{COPY.events.hereNowOpen}</Text>
              </View>
              <Button
                label={COPY.events.liveRoomCta}
                variant="secondary"
                onPress={() => navigation.navigate('Tabs')}
                testID="event-open-live-deck"
              />
            </>
          ) : (
            <Button
              label={pending === 'verify' ? COPY.events.checkingLive : COPY.events.joinHereNow}
              busy={pending === 'verify'}
              onPress={verify}
              disabled={busy}
              testID="event-verify-here-now"
            />
          )}
        </View>
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
      {showHero ? null : (
        <Caption testID="event-attribution">{COPY.events.attribution}</Caption>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  /** The 40pt pill from ED-02, with the slop that makes it a 44pt target. */
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  backChevron: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 20,
    lineHeight: 24,
    color: color.ink,
  },
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  heroImage: { width: '100%', height: 300, backgroundColor: color.veil },
  heroBadge: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: tokens.border.inverse,
    backgroundColor: overlay.plate,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  heroBadgeGlyph: { fontFamily: fontFamily.bodySemi, fontSize: 9, color: color.onInverse },
  heroBadgeText: { fontFamily: fontFamily.bodySemi, fontSize: 10, color: color.onInverse },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 14, gap: 4 },
  heroName: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 28,
    color: color.onPhoto,
  },
  heroMeta: { fontFamily: fontFamily.bodyMedium, fontSize: 13, lineHeight: 18, color: color.onPhoto },
  heroAttribution: { fontFamily: fontFamily.body, fontSize: 10, color: color.onPhoto },
  plainHead: { gap: 4, marginBottom: spacing.sm },
  plainName: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 28,
    color: color.ink,
  },
  plainMeta: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, color: color.inkMuted },
  question: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    color: color.ink,
  },
  explainer: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    color: color.inkMuted,
    marginBottom: spacing.xs,
  },
  /** ED-02's declaration rows. */
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginBottom: spacing.xs,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.premiumSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.premiumSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { fontFamily: fontFamily.bodySemi, fontSize: 15, lineHeight: 20, color: color.ink },
  choiceSub: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 17, color: color.inkMuted },
  chevron: { fontFamily: fontFamily.body, fontSize: 18, lineHeight: 25, color: color.inkMuted },
  /** The drawn marks in the sand chips. */
  mark: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  markHead: {
    position: 'absolute',
    left: 1,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: color.accentDeep,
  },
  markHeadSecond: { left: 7, backgroundColor: color.premiumSoft },
  markRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.4,
    borderColor: color.accentDeep,
    opacity: 0.55,
  },
  markDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color.accentDeep,
  },
  /** ED-03's room cards. */
  roomCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    padding: spacing.md,
    gap: 12,
    marginBottom: spacing.xs,
  },
  roomHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomTitle: { fontFamily: fontFamily.bodySemi, fontSize: 15, lineHeight: 20, color: color.ink },
  roomBody: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 17, color: color.inkMuted },
  withdrawRow: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13,
    lineHeight: 18,
    color: color.accentDeep,
  },
  /** ED-03's "what is true now" line. */
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  livePillDot: { fontFamily: fontFamily.bodySemi, fontSize: 9, color: color.successMark },
  livePillText: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: color.success },
  /** ED-04's question card (E-24). */
  confirmCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: color.accentDeep,
    backgroundColor: color.surface,
    paddingVertical: 18,
    paddingHorizontal: spacing.md,
    gap: 12,
    marginBottom: spacing.xs,
  },
  confirmTitle: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    lineHeight: 25,
    color: color.ink,
  },
  confirmBody: { fontFamily: fontFamily.body, fontSize: 12.5, lineHeight: 18, color: color.inkMuted },
});
