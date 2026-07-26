/**
 * Nine slots, three across, and every one of them real.
 *
 * The reference this is adapted from labels its grid "hold, drag and drop to
 * reorder". This does not say that, because it does not do that: there is no
 * drag gesture here, and printing the instruction for one would be a caption
 * describing a different app. Reordering happens through two explicit controls
 * per photo, which has the side effect of being the only version of reordering
 * that works with a screen reader at all — a drag target is not something
 * VoiceOver can hand you.
 *
 * Every slot is backed by a row in `profile_photos`. The first is the primary
 * and is what a discovery card shows, which is why it is marked rather than
 * left for somebody to infer from position.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Caption, Notice } from './ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, MAX_PHOTOS, type ProfilePhoto } from '../data';
import { pickProfilePhoto } from '../data/imagePicker';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { color, font, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

const ROWS = 3;
const COLUMNS = 3;

export function PhotoGrid({
  photos,
  onChanged,
  testID = 'photo-grid',
}: {
  photos: ProfilePhoto[];
  onChanged: (photos: ProfilePhoto[]) => void;
  testID?: string;
}) {
  const [busy, setBusy] = useState<number | 'add' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = usePhotoUrls(photos.map((photo) => photo.path));

  const run = useCallback(
    async (key: number | 'add', work: () => Promise<ProfilePhoto[]>, failure: string) => {
      if (busy !== null) return;
      setBusy(key);
      setError(null);
      try {
        onChanged(await work());
      } catch (err) {
        setError(err instanceof ApiError ? apiErrorMessage(err.code) : failure);
      } finally {
        setBusy(null);
      }
    },
    [busy, onChanged],
  );

  const add = () =>
    run(
      'add',
      async () => {
        const picked = await pickProfilePhoto();
        if (picked.status === 'permission-denied') {
          throw new ApiError('FORBIDDEN', COPY.photo.permissionDenied);
        }
        // Cancelling is not a failure, so it leaves the grid exactly as it was.
        if (picked.status === 'cancelled') return photos;
        return getApi().addProfilePhoto(picked.upload);
      },
      COPY.photo.uploadError,
    );

  /** Swaps a photo with its neighbour and sends the whole order, as the RPC wants. */
  const move = (from: number, to: number) =>
    run(
      from,
      () => {
        const paths = photos.map((photo) => photo.path);
        [paths[from - 1], paths[to - 1]] = [paths[to - 1], paths[from - 1]];
        return getApi().reorderProfilePhotos(paths);
      },
      COPY.photo.reorderError,
    );

  const slots = Array.from({ length: ROWS * COLUMNS }, (_, index) => index + 1);
  const full = photos.length >= MAX_PHOTOS;

  return (
    <View style={styles.host} testID={testID}>
      <Caption>{COPY.photo.gridHint(MAX_PHOTOS)}</Caption>
      {error ? <Notice message={error} tone="error" testID={`${testID}-error`} /> : null}
      <View style={styles.grid}>
        {slots.map((slot) => {
          const photo = photos[slot - 1] ?? null;
          if (!photo) {
            // The first empty slot is the one that adds; the rest are just the
            // shape of the grid, and offering nine identical add buttons would
            // suggest a photo can be put in slot seven while six is empty.
            const isNext = slot === photos.length + 1;
            return (
              <Pressable
                key={slot}
                accessibilityRole="button"
                accessibilityLabel={COPY.photo.emptySlotLabel(slot)}
                accessibilityState={{ disabled: !isNext || busy !== null }}
                disabled={!isNext || busy !== null}
                onPress={add}
                style={[styles.slot, styles.slotEmpty, !isNext && styles.slotInert]}
                testID={`${testID}-add-${slot}`}
              >
                {busy === 'add' && isNext ? (
                  <ActivityIndicator accessibilityLabel={COPY.photo.uploading} />
                ) : isNext ? (
                  <Text style={styles.plus}>+</Text>
                ) : null}
              </Pressable>
            );
          }

          const url = urls[photo.path];
          return (
            <View key={slot} style={styles.slot} testID={`${testID}-slot-${slot}`}>
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={styles.image}
                  accessibilityLabel={COPY.photo.slotLabel(slot)}
                />
              ) : (
                <View style={styles.imagePending}>
                  <ActivityIndicator accessibilityLabel={COPY.common.loading} />
                </View>
              )}

              {slot === 1 ? (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>{COPY.photo.primaryBadge}</Text>
                </View>
              ) : null}

              <View style={styles.controls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={COPY.photo.moveEarlier(slot)}
                  accessibilityState={{ disabled: slot === 1 || busy !== null }}
                  disabled={slot === 1 || busy !== null}
                  onPress={() => move(slot, slot - 1)}
                  hitSlop={6}
                  style={styles.control}
                  testID={`${testID}-earlier-${slot}`}
                >
                  <Text style={[styles.controlGlyph, slot === 1 && styles.controlOff]}>‹</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={COPY.photo.removeAt(slot)}
                  accessibilityState={{ disabled: busy !== null }}
                  disabled={busy !== null}
                  onPress={() =>
                    run(slot, () => getApi().removeProfilePhotoAt(slot), COPY.photo.removeError)
                  }
                  hitSlop={6}
                  style={styles.control}
                  testID={`${testID}-remove-${slot}`}
                >
                  <Text style={styles.controlGlyph}>×</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={COPY.photo.moveLater(slot)}
                  accessibilityState={{ disabled: slot >= photos.length || busy !== null }}
                  disabled={slot >= photos.length || busy !== null}
                  onPress={() => move(slot, slot + 1)}
                  hitSlop={6}
                  style={styles.control}
                  testID={`${testID}-later-${slot}`}
                >
                  <Text
                    style={[styles.controlGlyph, slot >= photos.length && styles.controlOff]}
                  >
                    ›
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
      {full ? (
        <View testID={`${testID}-full`}>
          <Body>{COPY.photo.full(MAX_PHOTOS)}</Body>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    // Three across with two gaps between them. `aspectRatio` rather than a
    // fixed height, so the grid keeps its shape on a small screen.
    width: `${(100 - 8) / COLUMNS}%`,
    aspectRatio: 0.78,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: color.veil,
  },
  slotEmpty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** A slot that is only there to hold the grid's shape. */
  slotInert: { opacity: 0.45 },
  plus: { fontSize: 28, lineHeight: 32, color: color.accentDeep },
  image: { width: '100%', height: '100%' },
  imagePending: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  primaryBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  primaryBadgeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 0.6,
    color: color.ink,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(20, 22, 26, 0.62)',
  },
  control: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlGlyph: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.heading,
    color: color.onPhoto,
  },
  controlOff: { opacity: 0.35 },
});
