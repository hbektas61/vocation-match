/**
 * The match moment, as D-065 draws it (176:3929).
 *
 * The shape M-01 set is intact — the word, the pair of faces in thick white
 * collars with the coral heart pinned between them, and two pills at the foot
 * — and the file rearranges it into three groups spaced apart rather than a
 * single column: the word and its sentence at the top, the faces in the
 * middle, the two actions at the bottom. This is the one allowlisted
 * full-colour moment (D-058), and the wash now ends on the deep ink, which is
 * what finally lets the secondary's white label be white honestly.
 *
 * Two things the file draws are deliberately not here, and both for the same
 * reason — there is nothing true to put in them:
 *
 * - **The photograph behind the wash.** The drawing beds the gradient on a
 *   beach-club crowd shot. No endpoint hands this screen a venue photograph,
 *   and D-054 forbids keeping Google's, so the wash stands on its own.
 * - **The venue inside the sentence.** The file reads "Şu an ikiniz de
 *   Spiaggia Grande'desiniz" — a Turkish locative suffix inflected for the
 *   venue's own final vowel, which is not something a template can spell. The
 *   venue keeps its context chip under the sentence instead, which is the
 *   thing the drawing was actually saying: a name, never a distance.
 */
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Notice, Screen } from '../components/ui';
import { COPY, upperCase, matchSource } from '../copy';
import type { RootScreenProps } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useActiveVenueName } from '../state/useActiveVenueName';
import { useAppStore } from '../state/AppStore';
import {
  ACTION_TOUCH,
  color,
  font,
  fontFamily,
  gradient,
  leading,
  MIN_TOUCH,
  radius,
  spacing,
  tracking,
} from '../theme';

/** The venue chip's mark, at the small scale the chip is set in. */
const PinMark = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"
      stroke={color.onPhoto}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <Circle cx={12} cy={10} r={2.4} fill={color.onPhoto} />
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

/** One of the pair: 128 across, in the drawing's 4pt white collar. */
function FaceCircle({
  url,
  name,
  overlap = false,
  testID,
}: {
  url: string | null;
  name: string;
  /** The second of the pair slides back under the first, as 176:3943 does. */
  overlap?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.face, overlap && styles.faceOverlap]} testID={testID}>
      {url ? (
        <ExpoImage
          source={{ uri: url }}
          style={styles.facePhoto}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={180}
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
  /*
    176:3929 names the venue in the moment. Only the two vacation rooms are
    scoped to the active venue, though — an event match or a Çevremde match
    wearing the currently active hotel's name would be naming a place neither
    of you was in together, which is the same trap `ChatScreen` sidesteps. The
    name is the app's one shared answer, resolved once per session: the cached
    card cannot supply it for a Google venue (D-054), and reading it anyway put
    the `(google)` marker on the moment two people matched.
  */
  const { name: activeVenueName } = useActiveVenueName();
  const venueName =
    match && (match.room === 'UPCOMING' || match.room === 'HERE_NOW') ? activeVenueName : null;

  // The moment lands in the hand as well as on the screen (owner, 2026-08-04).
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

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

        {/* 176:3935: the word, its sentence, and the venue it happened in. */}
        <View style={styles.head}>
          <Text accessibilityRole="header" style={styles.title}>
            {COPY.match.title}
          </Text>
          <Text style={styles.body}>{COPY.match.likedEachOther(match.displayName)}</Text>
          <Text style={styles.source} testID="match-source">
            {source.title}
          </Text>
          {venueName ? (
            /* The venue as context, never as proximity: a name and nothing
               that could be read as a distance between the two of you. */
            <View
              style={styles.venueChip}
              accessible
              accessibilityLabel={COPY.match.venueContext(venueName)}
              testID="match-venue"
            >
              <PinMark />
              <Text style={styles.venueChipText} numberOfLines={1}>
                {venueName}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.spacer} />

        {/* 176:3940: the pair in white collars, the second sliding under the
            first, the coral heart pinned at the seam. */}
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
            overlap
            testID="match-photo"
          />
          <View style={styles.heartBadge}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill={color.onPhoto}>
              <Path d="M12 8c0-4.5-7.2-4.5-7.2 0 0 4 4.7 6.8 7.2 8.7 2.5-1.9 7.2-4.7 7.2-8.7 0-4.5-7.2-4.5-7.2 0z" />
            </Svg>
          </View>
        </View>

        <View style={styles.spacer} />

        {/* 176:3950: the two pills, both the full width of the page. */}
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

/** 176:3941 — the pair's diameter. */
const FACE = 128;
/** 176:3943: the second slides a quarter of a face back under the first. */
const FACE_OVERLAP = FACE / 4;
/** 176:3946 — the heart's disc, pinned at the seam. */
const HEART_BADGE = 40;

/** The initial that stands in for a missing face, sized to the ring. */
const FACELESS_INITIAL = 44;

const styles = StyleSheet.create({
  /** Carries `gradient.match`, the one full-bleed layer this screen paints. */
  page: { flex: 1, position: 'relative', paddingHorizontal: spacing.wide },
  close: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    marginTop: spacing.sm,
    marginLeft: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 176:3935: the word and everything that explains it, as one centred block. */
  head: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  title: {
    // The heaviest cut in the app, in the one place that has earned it.
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.moment,
    lineHeight: font.moment * leading.tight,
    letterSpacing: tracking.display,
    color: color.onPhoto,
    textAlign: 'center',
  },
  /** 176:3940: the pair overlapping, centred on the page. */
  faces: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: 4,
    borderColor: color.surface,
    overflow: 'hidden',
    backgroundColor: color.veil,
  },
  faceOverlap: { marginLeft: -FACE_OVERLAP },
  facePhoto: { width: '100%', height: '100%' },
  faceEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /** A drawing rather than type: the initial is sized to the face it fills. */
  faceInitial: {
    fontFamily: fontFamily.display,
    fontSize: FACELESS_INITIAL,
    color: color.accentDeep,
  },
  /** 176:3946: the coral heart in its 4pt white collar, pinned at the seam. */
  heartBadge: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 0,
    width: HEART_BADGE,
    height: HEART_BADGE,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.surface,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 176:3929 prints the venue inside the sentence, inflected. This carries the
   * same fact as a chip so no template has to guess a Turkish suffix — and a
   * chip is also the shape that cannot accidentally grow a distance.
   */
  venueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.cozy,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.snug,
    paddingVertical: spacing.cozy,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.surface,
    maxWidth: '100%',
  },
  venueChipText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.onPhoto,
    flexShrink: 1,
  },
  body: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.onPhoto,
    textAlign: 'center',
  },
  /** The room's sentence, one size down from the body it follows. */
  source: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.onPhoto,
    textAlign: 'center',
  },
  spacer: { flex: 1 },
  actions: { gap: spacing.md, paddingBottom: spacing.xl },
  /** 176:3951 — the white pill with the coral-ink label, at the action height. */
  ctaPrimary: {
    minHeight: ACTION_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: color.surface,
  },
  ctaPrimaryLabel: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.body,
    color: color.accentDeep,
  },
  /** 176:3954 — the glass pill: a white edge over the wash, nothing filled. */
  ctaSecondary: {
    minHeight: ACTION_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: color.surface,
  },
  ctaSecondaryLabel: {
    fontFamily: fontFamily.display,
    fontSize: font.body,
    color: color.onPhoto,
  },
  ctaPressed: { opacity: 0.85 },
});
