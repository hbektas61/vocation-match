/**
 * The match moment, exactly as M-01 draws it (132:92): the outline heart and
 * the word at the top, the two faces in thick white collars with the coral
 * heart pinned between them, one sentence, and the two pills — a white
 * primary with the coral-ink label, and a white-bordered transparent
 * secondary. The owner asked for the drawing verbatim (2026-08-03), which is
 * why the secondary's label is white here despite sitting on the gradient's
 * pale reach; this is the one allowlisted full-colour moment (D-058).
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button, Notice, Screen } from '../components/ui';
import { COPY, upperCase, matchSource } from '../copy';
import type { RootScreenProps } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, fontFamily, gradient, MIN_TOUCH, radius, spacing } from '../theme';

/** 132:96 — the outline heart over the title. */
const HeartOutline = () => (
  <Svg
    width={40}
    height={40}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color.onPhoto}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M12 21c-4.5-3.2-9-6.6-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4.4-4.5 7.8-9 11z" />
  </Svg>
);

/** 132:93 — the way out, a bare white cross. */
const CloseIcon = () => (
  <Svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color.onPhoto}
    strokeWidth={2.2}
    strokeLinecap="round"
  >
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/** One of the pair: 170 across, in the drawing's 6pt white collar. */
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
    <View style={styles.face} testID={testID}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.facePhoto}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
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
  const photoPaths = useMemo(() => [match?.photoPath ?? null, state.profile?.photoPath ?? null], [
    match?.photoPath,
    state.profile?.photoPath,
  ]);
  const photoUrls = usePhotoUrls(photoPaths);
  // D-057: the moment still says which room it came from — the drawing keeps
  // one sentence, so the room's own line stands quietly under it.
  const source = matchSource(match?.room ?? 'UPCOMING');

  if (!match) {
    return (
      <Screen safeTop testID="screen-match">
        <Notice message={COPY.match.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    /*
      `bleed` because this is the one screen D-058 lets go full colour, and a
      padded Screen was leaving 24pt of cream above the gradient and 153pt
      below it — measured on the running app. A full-bleed moment with a cream
      strip under it is not a full-bleed moment.
    */
    <Screen safeTop bleed scroll={false} testID="screen-match">
      <View style={styles.page}>
        <LinearGradient
          colors={[...gradient.match]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* 132:93: leaving the moment is the same act as keeping browsing. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.match.keepBrowsing}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.close, pressed && styles.ctaPressed]}
          testID="match-close"
        >
          <CloseIcon />
        </Pressable>

        {/* 132:95: the outline heart, then the word. */}
        <View style={styles.head}>
          <HeartOutline />
          <Text accessibilityRole="header" style={styles.title}>
            {COPY.match.title}
          </Text>
        </View>

        {/* 132:98: the pair in white collars, the coral heart pinned between. */}
        <View
          style={styles.faces}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <FaceCircle
            url={state.profile?.photoPath ? photoUrls[state.profile.photoPath] ?? null : null}
            name={state.profile?.displayName ?? COPY.match.selfFallback}
          />
          <FaceCircle
            url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
            name={match.displayName}
            testID="match-photo"
          />
          <View style={styles.heartBadge}>
            <Svg width={26} height={26} viewBox="0 0 24 24" fill={color.onPhoto}>
              <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
            </Svg>
          </View>
        </View>

        {/* 132:104: one sentence — and the room's own line under it (D-057). */}
        <View style={styles.words}>
          <Text style={styles.body}>{COPY.match.likedEachOther(match.displayName)}</Text>
          <Text style={styles.source} testID="match-source">
            {source.title}
          </Text>
        </View>

        <View style={styles.spacer} />

        {/* 132:105: the two pills. */}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.match.sayHelloCta(match.displayName)}
            onPress={() => navigation.replace('Chat', { matchId: match.matchId })}
            style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPressed]}
            testID="match-open-chat"
          >
            <Text style={styles.ctaPrimaryLabel}>{COPY.match.sendMessageCta}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.match.keepBrowsing}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.ctaSecondary, pressed && styles.ctaPressed]}
            testID="match-keep-browsing"
          >
            <Text style={styles.ctaSecondaryLabel}>{COPY.match.keepBrowsing}</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const FACE = 170;

const styles = StyleSheet.create({
  /** Carries `gradient.match`, the one full-bleed layer this screen paints. */
  page: { flex: 1, position: 'relative', paddingHorizontal: 20 },
  close: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    marginTop: spacing.sm,
    marginLeft: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 132:95: centred, the drawing's 18pt between heart and word. */
  head: { alignItems: 'center', gap: 18, marginTop: 44 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 48,
    color: color.onPhoto,
    textAlign: 'center',
  },
  /** 132:98: nearly touching — the 2pt seam the drawing leaves. */
  faces: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    marginTop: 56,
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: 6,
    borderColor: color.surface,
    overflow: 'hidden',
    backgroundColor: color.veil,
  },
  facePhoto: { width: '100%', height: '100%' },
  faceEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  faceInitial: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    color: color.accentDeep,
  },
  /** 132:101: the coral heart in its 5pt white collar, pinned at the seam. */
  heartBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: (FACE - 64) / 2,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 5,
    borderColor: color.surface,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { alignItems: 'center', gap: 6, marginTop: 44, paddingHorizontal: 20 },
  body: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 16,
    lineHeight: 22,
    color: color.onPhoto,
    textAlign: 'center',
  },
  /** The room's sentence, one size down from the body it follows. */
  source: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: color.onPhoto,
    textAlign: 'center',
  },
  spacer: { flex: 1 },
  actions: { gap: 12, paddingBottom: 40 },
  /** White pill, coral-ink label — the primary legible anywhere on it. */
  ctaPrimary: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    backgroundColor: color.surface,
  },
  ctaPrimaryLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.accentDeep,
  },
  ctaSecondary: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: color.surface,
  },
  ctaSecondaryLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    color: color.onPhoto,
  },
  ctaPressed: { opacity: 0.85 },
});
