import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  ActionButton,
  Body,
  Button,
  Display,
  EmptyState,
  Gap,
  Notice,
  PhotoFrame,
  RoomRibbon,
  Rule,
  Screen,
  SectionLabel,
  Title,
} from '../components/ui';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type CandidateCard, type RoomKey, type RoomStatus } from '../data';
import type { RootStackParamList } from '../navigation/types';
import { spacing } from '../theme';
import { earliestRoomExpiry } from '../state/roomSchedule';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';

const ROOM_LABEL: Record<RoomKey, string> = {
  UPCOMING: COPY.upcoming.roomTitle,
  HERE_NOW: COPY.hereNow.roomTitle,
};

export function DiscoveryScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rooms, setRooms] = useState<RoomStatus[] | null>(null);
  const [room, setRoom] = useState<RoomKey | null>(null);
  const [deck, setDeck] = useState<CandidateCard[] | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Same as Rooms: whether there is an active hotel comes from the server, and
  // the cached card only ever supplies its name.
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  const hotelName = hotel?.name ?? null;
  const hasHotel = state.activeHotel !== null;

  // Room eligibility can change from another tab, so refresh it on focus,
  // and again at the soonest expiry (R-003) so an open deck closes itself
  // the moment the server would refuse it rather than at the next visit.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const load = async () => {
        try {
          const fetched = await getApi().getRooms();
          if (cancelled) return;
          setRooms(fetched);
          const eligible = fetched.filter((r) => r.eligible).map((r) => r.room);
          setRoom((current) => (current && eligible.includes(current) ? current : eligible[0] ?? null));
          const soonest = earliestRoomExpiry(fetched, nowMs());
          if (soonest !== null) {
            timer = setTimeout(load, soonest - nowMs());
          }
        } catch {
          if (!cancelled) setRooms([]);
        }
      };

      load();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, []),
  );

  // The deck belongs to one room at a time and is refetched when it changes.
  // (When there is no eligible room, the render below returns before the
  // deck is ever shown, so there is nothing to fetch or reset here.)
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    (async () => {
      setDeck(null);
      setDeckError(null);
      try {
        const feed = await getApi().getDiscoveryFeed(room);
        if (!cancelled) setDeck(feed);
      } catch (err) {
        if (!cancelled) {
          setDeckError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room]);

  // A mutual match interrupts the deck with the celebration screen.
  useEffect(() => {
    if (state.lastMatchId) {
      const matchId = state.lastMatchId;
      dispatch({ type: 'CLEAR_LAST_MATCH' });
      navigation.navigate('Match', { matchId });
    }
  }, [state.lastMatchId, dispatch, navigation]);

  const blockedIds = useMemo(() => new Set(state.blockedUsers.map((b) => b.userId)), [state.blockedUsers]);
  const visibleDeck = useMemo(
    () => (deck ?? []).filter((c) => !blockedIds.has(c.userId)),
    [deck, blockedIds],
  );
  const eligibleRooms = rooms?.filter((r) => r.eligible).map((r) => r.room) ?? [];
  const candidate = visibleDeck[0] ?? null;
  // Only the card on top: signing a URL for a deck of twenty would hand out
  // nineteen readable links for people the user may never actually see.
  const photoPaths = useMemo(() => [candidate?.photoPath ?? null], [candidate?.photoPath]);
  const photoUrls = usePhotoUrls(photoPaths);

  if (!hasHotel) {
    return (
      <Screen testID="screen-discovery">
        <Title>Discovery</Title>
        <Notice message={`${COPY.roomReason.NO_ACTIVE_HOTEL} ${COPY.trust.oneHotel}`} />
        <Button
          label={COPY.hotel.chooseCta}
          onPress={() => navigation.navigate('ChooseHotel')}
          testID="discovery-choose-hotel"
        />
      </Screen>
    );
  }

  if (rooms === null) {
    return (
      <Screen testID="screen-discovery">
        <Title>Discovery</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="discovery-loading" />
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen testID="screen-discovery">
        <Title>Discovery</Title>
        <Notice message={COPY.discovery.notEligible} />
      </Screen>
    );
  }

  const swipe = async (direction: 'LIKE' | 'PASS') => {
    if (!candidate || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await getApi().swipe(candidate.userId, room, direction);
      if (result.matched && result.matchId) {
        dispatch({
          type: 'MATCH_UPSERTED',
          match: {
            matchId: result.matchId,
            otherUserId: candidate.userId,
            displayName: candidate.displayName,
            age: candidate.age,
            photoPath: candidate.photoPath,
            room,
            createdAt: nowMs(),
            unmatchedAt: null,
            lastMessageAt: null,
            lastMessageBody: null,
          },
        });
      }
      setDeck((prev) => (prev ?? []).filter((c) => c.userId !== candidate.userId));
    } catch (err) {
      setActionError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="screen-discovery" bleed>
      {/* The photo runs to the edges and the name sits on it, so the first
          thing on screen is a person rather than a page header. */}
      <PhotoFrame
        url={candidate && candidate.photoPath ? photoUrls[candidate.photoPath] ?? null : null}
        name={candidate?.displayName ?? ''}
        testID={candidate ? `candidate-photo-${candidate.userId}` : 'deck-empty-photo'}
      >
        {candidate ? (
          <>
            <RoomRibbon room={room} hotelName={hotelName} onPhoto testID="candidate-room" />
            <Display>{`${candidate.displayName}, ${candidate.age}`}</Display>
          </>
        ) : null}
      </PhotoFrame>

      <View style={styles.body}>
        {eligibleRooms.length > 1 ? (
          <View style={styles.roomSwitch}>
            {eligibleRooms.map((r) => (
              <View key={r} style={styles.roomSwitchItem}>
                <Button
                  label={ROOM_LABEL[r]}
                  variant={r === room ? 'primary' : 'secondary'}
                  onPress={() => setRoom(r)}
                  testID={`room-${r}`}
                />
              </View>
            ))}
          </View>
        ) : null}

        {deckError ? <Notice message={deckError} tone="error" testID="discovery-error" /> : null}
        {actionError ? (
          <Notice message={actionError} tone="error" testID="discovery-action-error" />
        ) : null}

        {deck === null ? (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="deck-loading" />
        ) : candidate ? (
          <View style={styles.profile} testID={`candidate-${candidate.userId}`}>
            {candidate.bio ? (
              <View style={styles.section}>
                <SectionLabel>{COPY.discovery.aboutLabel}</SectionLabel>
                <Body>{candidate.bio}</Body>
              </View>
            ) : null}

            <Rule />

            {/* The section no other dating app has, and the reason this one
                exists: what the two of you actually have in common right now. */}
            <View style={styles.section}>
              <SectionLabel>{COPY.discovery.overlapLabel}</SectionLabel>
              <Body>
                {room === 'HERE_NOW'
                  ? COPY.discovery.overlapHereNow
                  : COPY.discovery.overlapUpcoming}
              </Body>
            </View>

            <Gap size="sm" />

            {/* Bumble's mechanic, and the right one: the decision waits until
                the end of the profile instead of floating over it. */}
            <View style={styles.actions}>
              <ActionButton
                label={COPY.discovery.passButton}
                glyph="✕"
                tone="pass"
                onPress={() => swipe('PASS')}
                disabled={busy}
                testID="swipe-pass"
              />
              <ActionButton
                label={`Like ${candidate.displayName}`}
                glyph="♥"
                tone="like"
                onPress={() => swipe('LIKE')}
                disabled={busy}
                testID="swipe-like"
              />
            </View>

            {/* D-008: report/block must be reachable before any match exists. */}
            <Button
              label={COPY.discovery.reportBlockButton}
              variant="danger"
              onPress={() =>
                navigation.navigate('ReportBlock', {
                  userId: candidate.userId,
                  displayName: candidate.displayName,
                })
              }
              disabled={busy}
              testID="discovery-report-block"
            />
          </View>
        ) : (
          <EmptyState message={COPY.discovery.emptyDeck} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  roomSwitch: { flexDirection: 'row', gap: spacing.sm },
  roomSwitchItem: { flex: 1 },
  profile: { gap: spacing.md },
  section: { gap: spacing.sm },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.sm,
  },
});
