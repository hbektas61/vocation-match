import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Notice, RoomRibbon, Screen, Title } from '../components/ui';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type CandidateCard, type RoomKey, type RoomStatus } from '../data';
import type { RootStackParamList } from '../navigation/types';
import { color, fontFamily, palette, radius, spacing } from '../theme';
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
      <Screen safeTop testID="screen-discovery">
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
      <Screen safeTop testID="screen-discovery">
        <Title>Discovery</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="discovery-loading" />
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen safeTop testID="screen-discovery">
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
    <Screen safeTop testID="screen-discovery" bleed scroll={false}>
      {/* The room switch stays above the card: which door you are browsing is
          a real choice, and the reference has no equivalent for it. */}
      {eligibleRooms.length > 1 ? (
        <View style={styles.roomSwitch}>
          {eligibleRooms.map((r) => (
            <View key={r} style={styles.roomSwitchItem}>
              <Button
                label={ROOM_LABEL[r]}
                variant={r === room ? 'primary' : 'secondary'}
                compact
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
        /* The whole person is one screen (owner decision): a full-bleed photo
           card with the name on it, the one fact this app can print — the
           room · hotel bond — as its only tag, and the three actions floating
           at its foot. No sections to scroll; the decision is made here. */
        <View style={styles.card} testID={`candidate-${candidate.userId}`}>
          {candidate.photoPath && photoUrls[candidate.photoPath] ? (
            <Image
              source={{ uri: photoUrls[candidate.photoPath] }}
              style={styles.cardPhoto}
              resizeMode="cover"
              accessibilityLabel={`Photo of ${candidate.displayName}`}
              testID={`candidate-photo-${candidate.userId}`}
            />
          ) : (
            <View style={styles.cardNoPhoto} testID={`candidate-photo-${candidate.userId}`}>
              <Text style={styles.cardInitial}>{candidate.displayName.slice(0, 1)}</Text>
            </View>
          )}

          {/* Name at the top over its own scrim, the way the reference sets
              it — light weight, because the photo is the loud one here. */}
          <View style={styles.cardTop} pointerEvents="none">
            <Text style={styles.cardName}>
              {`${candidate.displayName}, ${candidate.age}`}
            </Text>
            <RoomRibbon room={room} hotelName={hotelName} onPhoto testID="candidate-room" />
          </View>

          {/* The three actions, floating on the photo's foot: pass, the one
              purple pill for like, and safety — which the reference gives to
              chat, but chat does not exist before a match and report/block
              must be reachable from the deck (D-008). */}
          <View style={styles.cardActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.discovery.passButton}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => swipe('PASS')}
              style={styles.actionCircle}
              testID="swipe-pass"
            >
              <Text style={styles.actionGlyph}>✕</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${COPY.discovery.likeButton} ${candidate.displayName}`}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => swipe('LIKE')}
              style={styles.actionPill}
              testID="swipe-like"
            >
              <Text style={styles.actionPillGlyph}>♥</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.discovery.reportBlockButton}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() =>
                navigation.navigate('ReportBlock', {
                  userId: candidate.userId,
                  displayName: candidate.displayName,
                })
              }
              style={styles.actionCircle}
              testID="discovery-report-block"
            >
              <Text style={styles.actionGlyph}>⚑</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.cardNoPhoto}>
            <Text style={styles.cardInitial}>?</Text>
          </View>
          <View style={styles.cardTop} pointerEvents="none">
            <Text style={styles.cardName}>{COPY.discovery.emptyDeck}</Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  roomSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  roomSwitchItem: { flex: 1 },
  /** The card is the screen: everything else stands on the photograph. */
  card: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.veil,
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardPhoto: { ...StyleSheet.absoluteFillObject },
  cardNoPhoto: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInitial: {
    fontFamily: fontFamily.display,
    fontSize: 128,
    lineHeight: 140,
    color: palette.placeholder,
  },
  cardTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    backgroundColor: 'rgba(20, 22, 26, 0.30)',
  },
  /**
   * Light, not display-bold: the reference sets the name quietly and lets the
   * photograph carry the screen.
   */
  cardName: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 30,
    lineHeight: 36,
    color: color.onPhoto,
  },
  cardActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  actionCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    shadowColor: color.ink,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionGlyph: {
    fontSize: 24,
    lineHeight: 28,
    color: color.accentDeep,
  },
  /** The one loud thing on the screen, exactly as the reference has it. */
  actionPill: {
    width: 120,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accentDeep,
    shadowColor: color.ink,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionPillGlyph: {
    fontSize: 28,
    lineHeight: 32,
    color: '#FFFFFF',
  },
});
