import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Notice, Screen } from '../components/ui';
import { COPY, upperCase, roomPlate } from '../copy';
import type { RootScreenProps } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

const DEEP = '#0F1B3D';
const MID = 'rgba(236, 72, 153, 0.45)';
const SOFT = 'rgba(236, 72, 153, 0.22)';

/**
 * The celebration around the faces (designer, 2026-07-27): a faint heart
 * behind the pair, confetti petals and sparkles scattered wide. Static —
 * the moment is loud enough — and hidden from screen readers.
 */
const Confetti = () => (
  <Svg width={340} height={300} viewBox="0 0 340 300" style={StyleSheet.absoluteFillObject}>
    {/* the big soft heart behind the pair */}
    <Path
      d="M170 96c-8-24-46-24-46 3 0 22 26 38 46 53 20-15 46-31 46-53 0-27-38-27-46-3z"
      fill="rgba(236, 72, 153, 0.07)"
    />
    {/* petals */}
    <Path d="M56 40l12-6 2 13-12 5z" fill={SOFT} />
    <Path d="M270 30l11 4-5 12-10-5z" fill={MID} />
    <Path d="M300 96l12-3 1 12-11 3z" fill={SOFT} />
    <Path d="M30 130l10-7 6 10-10 6z" fill={SOFT} />
    <Path d="M304 190l11 5-6 11-10-6z" fill={SOFT} />
    <Path d="M44 216l12-2-1 12-11 2z" fill={MID} />
    <Path d="M150 12l10-5 3 11-10 4z" fill={SOFT} />
    {/* hearts */}
    <Path d="M96 66c-2-5-9-5-9 1 0 4 5 7 9 10 4-3 9-6 9-10 0-6-7-6-9-1z" fill={MID} />
    <Path d="M262 236c-1.6-4-7.4-4-7.4.8 0 3.4 4 5.8 7.4 8 3.4-2.2 7.4-4.6 7.4-8 0-4.8-5.8-4.8-7.4-.8z" fill={SOFT} />
    {/* sparkles */}
    <Path d="M42 84l2.4 5.4 5.4 2.4-5.4 2.4-2.4 5.4-2.4-5.4-5.4-2.4 5.4-2.4z" fill={MID} />
    <Path d="M296 148l2 4.4 4.4 2-4.4 2-2 4.4-2-4.4-4.4-2 4.4-2z" fill={SOFT} />
    {/* moon sliver */}
    <Path d="M236 52a10 10 0 0 0 8 16 10 10 0 1 1-8-16z" fill={SOFT} />
    {/* dots */}
    <Circle cx={126} cy={28} r={5} fill={SOFT} />
    <Circle cx={210} cy={16} r={4} fill={MID} />
    <Circle cx={20} cy={176} r={4} fill={SOFT} />
    <Circle cx={322} cy={70} r={4} fill={SOFT} />
    <Circle cx={318} cy={238} r={5} fill={SOFT} />
    <Circle cx={74} cy={252} r={4} fill={MID} />
  </Svg>
);

const HeartBadge = () => (
  <View style={styles.heartBadge}>
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
    </Svg>
  </View>
);

const PinIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={DEEP} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

/** One of the pair: a big circle with the reference's thick white collar. */
function FaceCircle({
  url,
  name,
  testID,
}: {
  url: string | null;
  name: string;
  testID?: string;
}) {
  return (
    <View style={styles.faceRing} testID={testID}>
      {url ? (
        <Image source={{ uri: url }} style={styles.facePhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.faceEmpty}>
          <Text style={styles.faceInitial}>{upperCase(name.slice(0, 1))}</Text>
        </View>
      )}
    </View>
  );
}

export function MatchScreen({ navigation, route }: RootScreenProps<'Match'>) {
  const { state } = useAppStore();
  const match = state.matches.find((m) => m.matchId === route.params.matchId) ?? null;
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  const photoPaths = useMemo(() => [match?.photoPath ?? null, state.profile?.photoPath ?? null], [
    match?.photoPath,
    state.profile?.photoPath,
  ]);
  const photoUrls = usePhotoUrls(photoPaths);

  if (!match) {
    return (
      <Screen safeTop testID="screen-match">
        <Notice message={COPY.match.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen safeTop testID="screen-match">
      {/* The one screen allowed to be a moment rather than a form: the two
          faces under confetti, the word, and the shared bond as a pill. */}
      <View style={styles.stage}>
        <View
          style={styles.celebration}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Confetti />
          <View style={styles.faces}>
            <FaceCircle
              url={state.profile?.photoPath ? photoUrls[state.profile.photoPath] ?? null : null}
              name={state.profile?.displayName ?? COPY.match.selfFallback}
            />
            <View style={styles.facesOverlap}>
              <FaceCircle
                url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
                name={match.displayName}
                testID="match-photo"
              />
            </View>
          </View>
          <HeartBadge />
        </View>

        <Text accessibilityRole="header" style={styles.title}>
          {COPY.match.title}
        </Text>
        <Text style={styles.body}>
          {`${COPY.match.likedEachOther(match.displayName)}\n${COPY.match.body}`}
        </Text>

        {hotel ? (
          <View style={styles.bondPill}>
            <PinIcon />
            <Text style={styles.bondHotel} numberOfLines={1}>
              {`${hotel.name}, ${hotel.city}`}
            </Text>
            <View style={styles.bondDivider} />
            <Text style={styles.bondRoom}>
              {roomPlate(match.room)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          label={COPY.match.sayHelloCta(match.displayName)}
          onPress={() => navigation.replace('Chat', { matchId: match.matchId })}
          testID="match-open-chat"
        />
        <Button
          label={COPY.match.keepBrowsing}
          variant="secondary"
          onPress={() => navigation.goBack()}
          testID="match-keep-browsing"
        />
      </View>
    </Screen>
  );
}

const FACE = 148;

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  celebration: {
    width: 340,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faces: { flexDirection: 'row', alignItems: 'center' },
  facesOverlap: { marginLeft: -28 },
  faceRing: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: color.veil,
    shadowColor: color.accentDeep,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  facePhoto: { width: '100%', height: '100%' },
  faceEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  faceInitial: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    color: color.accentDeep,
  },
  heartBadge: {
    marginTop: -34,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DEEP,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DEEP,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    color: color.ink,
    textAlign: 'center',
  },
  bondPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.sm,
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bondHotel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
    color: color.ink,
    flexShrink: 1,
  },
  bondDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(20, 22, 26, 0.15)',
  },
  bondRoom: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.accentDeep,
    flexShrink: 0,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  actions: { gap: spacing.sm, paddingBottom: spacing.sm },
});
