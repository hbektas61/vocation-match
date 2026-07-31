import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Notice, Screen } from '../components/ui';
import { COPY, upperCase, roomPlate, matchSource } from '../copy';
import type { RootScreenProps } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, elevation, font, fontFamily, gradient, MIN_TOUCH, radius, spacing, tokens } from '../theme';

// The confetti is decoration on the one full-colour screen D-058 allows
// (`gradient.match`), hidden from screen readers below — so it borrows the
// one translucent-on-brand token the palette exposes (a cream fleck at low
// alpha) rather than a hue of its own. Two "depths" collapse to the same
// token: this is ornament, not information, and D-058 asks decorative
// complexity to earn its keep.
const SPARKLE = tokens.border.inverse;

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
      fill={SPARKLE}
    />
    {/* petals */}
    <Path d="M56 40l12-6 2 13-12 5z" fill={SPARKLE} />
    <Path d="M270 30l11 4-5 12-10-5z" fill={SPARKLE} />
    <Path d="M300 96l12-3 1 12-11 3z" fill={SPARKLE} />
    <Path d="M30 130l10-7 6 10-10 6z" fill={SPARKLE} />
    <Path d="M304 190l11 5-6 11-10-6z" fill={SPARKLE} />
    <Path d="M44 216l12-2-1 12-11 2z" fill={SPARKLE} />
    <Path d="M150 12l10-5 3 11-10 4z" fill={SPARKLE} />
    {/* hearts */}
    <Path d="M96 66c-2-5-9-5-9 1 0 4 5 7 9 10 4-3 9-6 9-10 0-6-7-6-9-1z" fill={SPARKLE} />
    <Path d="M262 236c-1.6-4-7.4-4-7.4.8 0 3.4 4 5.8 7.4 8 3.4-2.2 7.4-4.6 7.4-8 0-4.8-5.8-4.8-7.4-.8z" fill={SPARKLE} />
    {/* sparkles */}
    <Path d="M42 84l2.4 5.4 5.4 2.4-5.4 2.4-2.4 5.4-2.4-5.4-5.4-2.4 5.4-2.4z" fill={SPARKLE} />
    <Path d="M296 148l2 4.4 4.4 2-4.4 2-2 4.4-2-4.4-4.4-2 4.4-2z" fill={SPARKLE} />
    {/* moon sliver */}
    <Path d="M236 52a10 10 0 0 0 8 16 10 10 0 1 1-8-16z" fill={SPARKLE} />
    {/* dots */}
    <Circle cx={126} cy={28} r={5} fill={SPARKLE} />
    <Circle cx={210} cy={16} r={4} fill={SPARKLE} />
    <Circle cx={20} cy={176} r={4} fill={SPARKLE} />
    <Circle cx={322} cy={70} r={4} fill={SPARKLE} />
    <Circle cx={318} cy={238} r={5} fill={SPARKLE} />
    <Circle cx={74} cy={252} r={4} fill={SPARKLE} />
  </Svg>
);

const HeartBadge = () => (
  <View style={styles.heartBadge}>
    <Svg width={30} height={30} viewBox="0 0 24 24" fill={color.onInverse}>
      <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
    </Svg>
  </View>
);

const PinIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
    // The Figma ring (D-045): the face inside the brand gradient. Reuses
    // `gradient.match` rather than a ring colour of its own — this screen is
    // the one place that gradient is allowed to appear.
    <LinearGradient
      colors={[...gradient.match]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.faceRing}
      testID={testID}
    >
      <View style={styles.faceSeat}>
        {url ? (
          <Image source={{ uri: url }} style={styles.facePhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.faceEmpty}>
            <Text style={styles.faceInitial}>{upperCase(name.slice(0, 1))}</Text>
          </View>
        )}
      </View>
    </LinearGradient>
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
  // The room decides the words; the venue is only ever an extra detail, and
  // the two event rooms have none of their own to show here.
  const isHotelRoom = match?.room === 'UPCOMING' || match?.room === 'HERE_NOW';
  const source = matchSource(match?.room ?? 'UPCOMING');
  const venueLine = isHotelRoom && hotel ? `${hotel.name}, ${hotel.city}` : null;

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
      {/*
       * The one allowlisted full-colour screen (D-058): `gradient.match`
       * fills the page behind everything else, so it is drawn first as an
       * absolute layer inside a `flex: 1` wrapper rather than as a colour on
       * `Screen` itself — `Screen` only ever paints the flat cream ground.
       */}
      <View style={styles.page}>
        <LinearGradient
          colors={[...gradient.match]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

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

          {/* White display type only: `gradient.match` starts at the pressed
              coral, which is 3.68:1 for large text and nothing smaller. */}
          <Text accessibilityRole="header" style={styles.title}>
            {COPY.match.title}
          </Text>
          {/* D-057: one screen, five sources. The middle line is the room's
              own sentence — an event match saying "connected to this hotel"
              was describing something that had not happened. D-058: this and
              the paragraph below it are the "supporting sentence" the
              contract keeps off the coral — navy, on the gradient's paler
              reach. */}
          <Text style={styles.source} testID="match-source">
            {source.title}
          </Text>
          <Text style={styles.body}>
            {`${COPY.match.likedEachOther(match.displayName)}\n${source.body}`}
          </Text>

          {/* The bond pill names the room whether or not a venue is known: an
              event match has no hotel, and the pill vanishing took the one
              fact the moment is about with it. */}
          <View style={styles.bondPill} testID="match-bond">
            <PinIcon />
            {venueLine ? (
              <>
                <Text style={styles.bondHotel} numberOfLines={1}>
                  {venueLine}
                </Text>
                <View style={styles.bondDivider} />
              </>
            ) : null}
            <Text style={styles.bondRoom}>{roomPlate(match.room)}</Text>
          </View>
        </View>

        {/*
         * D-058's CTA pair for the coral gradient: the shared `<Button>` is
         * built for a light ground (a flat coral fill, a bordered-white
         * secondary) and would either vanish into this background or fight
         * it, so the moment gets its own — a white pill with a coral-ink
         * label, and a white-bordered transparent pill beside it. Same
         * labels, handlers, roles and testIDs the shared button gave them.
         */}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.match.sayHelloCta(match.displayName)}
            onPress={() => navigation.replace('Chat', { matchId: match.matchId })}
            style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPressed]}
            testID="match-open-chat"
          >
            <Text style={styles.ctaPrimaryLabel}>{COPY.match.sayHelloCta(match.displayName)}</Text>
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

const FACE = 148;

const styles = StyleSheet.create({
  /** Carries `gradient.match`, the one full-bleed layer this screen paints. */
  page: { flex: 1, position: 'relative' },
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
    padding: 6,
    shadowColor: color.accentDeep,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  faceSeat: {
    flex: 1,
    borderRadius: FACE / 2,
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
  heartBadge: {
    marginTop: -34,
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: color.inverse,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.inverse,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  /** White display type — the one text this gradient is allowed to carry. */
  title: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    color: color.onPhoto,
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
    ...elevation.card,
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
    backgroundColor: color.rule,
  },
  bondRoom: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.caption,
    color: color.accentDeep,
    flexShrink: 0,
  },
  /**
   * The room's own sentence and the paragraph under it are D-058's
   * "supporting sentence" — navy, never white, since neither is large
   * display type and the gradient only guarantees 3:1 for that.
   */
  source: {
    fontFamily: fontFamily.displaySemi,
    fontSize: 17,
    lineHeight: 17 * 1.3,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.ink,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  /**
   * The gradient bleeds; the buttons must not. `Screen bleed` drops the shell's
   * 20pt gutter so the colour can reach the edges, which left both CTAs
   * touching the sides of the phone — so the row carries the gutter itself.
   */
  actions: { gap: spacing.sm, paddingHorizontal: 20, paddingBottom: spacing.sm },
  /** White pill, coral-ink label — the primary CTA legible on the gradient. */
  ctaPrimary: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: color.surface,
    ...elevation.card,
  },
  ctaPrimaryLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    letterSpacing: 0.2,
    color: color.accentDeep,
  },
  /**
   * Transparent, bordered — the secondary CTA on the gradient.
   *
   * It was white on white, and it sits at the *pale* end of `gradient.match`:
   * measured on the running app the label came out at 1.04:1, which is not a
   * low-contrast label, it is an invisible one. Navy reads on that pale stop
   * at better than 11:1, and the pill keeps its shape.
   */
  ctaSecondary: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: color.ink,
  },
  ctaSecondaryLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    letterSpacing: 0.2,
    color: color.ink,
  },
  ctaPressed: { opacity: 0.85 },
});
