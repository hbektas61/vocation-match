/**
 * Nine slots, three across, reordered by holding and dragging.
 *
 * The first version reordered with visible arrow buttons under a dark band on
 * every photo. The owner used it and asked for the photos back: hold, drag,
 * drop — and no chrome sitting on the pictures. So the band and the arrows are
 * gone (D-027, amended), and the gesture is the real thing rather than a
 * caption: hold a tile briefly and it lifts and follows the finger; release
 * over another slot and the photo moves there.
 *
 * The hold-before-drag is not decoration. The grid lives inside a scrolling
 * screen, and a drag that started on first movement would steal every upward
 * swipe that happened to begin on a photo. Holding for a moment is what says
 * "this photo, not the page".
 *
 * What the arrows also were, invisibly, was the screen-reader path — a drag
 * target is not something VoiceOver can hand you. That path stays, as
 * accessibility actions on each tile ("move earlier", "move later"), which
 * assistive tech presents and sighted users never see.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Body, Caption, Notice } from './ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, MAX_PHOTOS, type ProfilePhoto } from '../data';
import { pickProfilePhoto } from '../data/imagePicker';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { color, font, fontFamily, radius, spacing } from '../theme';

const COLUMNS = 3;
const ROWS = 3;
const GAP = spacing.sm;
/** Matches the reference's portrait tiles. */
const TILE_RATIO = 0.78;
/** How long a finger rests on a photo before it lifts. */
const HOLD_MS = 180;

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
  const [gridWidth, setGridWidth] = useState(0);
  // State alone cannot guard a double tap: two presses inside one tick both
  // read the old `busy` before React re-renders. The ref is synchronous.
  const running = useRef(false);
  const urls = usePhotoUrls(photos.map((photo) => photo.path));

  const tileWidth = gridWidth > 0 ? (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const tileHeight = tileWidth / TILE_RATIO;

  const run = useCallback(
    async (key: number | 'add', work: () => Promise<ProfilePhoto[]>, failure: string) => {
      if (running.current) return;
      running.current = true;
      setBusy(key);
      setError(null);
      try {
        onChanged(await work());
      } catch (err) {
        setError(err instanceof ApiError ? apiErrorMessage(err.code) : failure);
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [onChanged],
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

  /** Moves a photo from one slot to another and sends the whole new order. */
  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      const to = Math.max(0, Math.min(photos.length - 1, toIndex));
      if (to === fromIndex) return;
      void run(
        fromIndex + 1,
        () => {
          const paths = photos.map((photo) => photo.path);
          const [moved] = paths.splice(fromIndex, 1);
          paths.splice(to, 0, moved);
          return getApi().reorderProfilePhotos(paths);
        },
        COPY.photo.reorderError,
      );
    },
    [photos, run],
  );

  const slots = Array.from({ length: ROWS * COLUMNS }, (_, index) => index + 1);
  const full = photos.length >= MAX_PHOTOS;

  return (
    <View style={styles.host} testID={testID}>
      <Caption>{COPY.photo.gridHint(MAX_PHOTOS)}</Caption>
      {error ? <Notice message={error} tone="error" testID={`${testID}-error`} /> : null}
      <View
        style={styles.grid}
        onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      >
        {slots.map((slot) => {
          const photo = photos[slot - 1] ?? null;
          if (!photo) {
            // The first empty slot is the one that adds; the rest are just the
            // shape of the grid — contiguous ordering means a photo cannot be
            // put in slot seven while six is empty.
            const isNext = slot === photos.length + 1;
            return (
              <Pressable
                key={slot}
                accessibilityRole="button"
                accessibilityLabel={COPY.photo.emptySlotLabel(slot)}
                accessibilityState={{ disabled: !isNext || busy !== null }}
                disabled={!isNext || busy !== null}
                onPress={add}
                style={[
                  styles.slot,
                  styles.slotEmpty,
                  !isNext && styles.slotInert,
                  tileWidth > 0 && { width: tileWidth, height: tileHeight },
                ]}
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

          return (
            <DraggableTile
              key={photo.path}
              index={slot - 1}
              count={photos.length}
              tileWidth={tileWidth}
              tileHeight={tileHeight}
              disabled={busy !== null}
              onMove={move}
              testID={`${testID}-slot-${slot}`}
            >
              {urls[photo.path] ? (
                <Image
                  source={{ uri: urls[photo.path] }}
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

              {/* The one control left on a photo, and it is small on purpose. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.photo.removeAt(slot)}
                accessibilityState={{ disabled: busy !== null }}
                disabled={busy !== null}
                onPress={() =>
                  run(slot, () => getApi().removeProfilePhotoAt(slot), COPY.photo.removeError)
                }
                hitSlop={8}
                style={styles.removeChip}
                testID={`${testID}-remove-${slot}`}
              >
                <Text style={styles.removeGlyph}>×</Text>
              </Pressable>
            </DraggableTile>
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

/**
 * One photo that can be held and dragged to a new slot.
 *
 * The geometry is index arithmetic rather than measurement: tiles lie
 * left-to-right, three per row, so where a drag ends is a function of where it
 * began plus the displacement. On release the tile snaps home and the *data*
 * moves — the server's answer re-renders the grid, so the picture and the
 * order can never disagree.
 */
function DraggableTile({
  index,
  count,
  tileWidth,
  tileHeight,
  disabled,
  onMove,
  children,
  testID,
}: {
  index: number;
  count: number;
  tileWidth: number;
  tileHeight: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  children: React.ReactNode;
  testID?: string;
}) {
  const shift = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  // The responder is created once and closes over the first render; these refs
  // carry the current truth into its callbacks.
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ index, count, tileWidth, tileHeight, disabled, onMove });
  live.current = { index, count, tileWidth, tileHeight, disabled, onMove };

  const settleHome = () => {
    held.current = false;
    setDragging(false);
    Animated.spring(shift, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const responder = useRef(
    PanResponder.create({
      // Touch-down arms a timer; the drag only exists once the hold matures.
      // Until then any movement belongs to the surrounding ScrollView — a
      // swipe that happens to begin on a photo is still a scroll.
      onStartShouldSetPanResponder: () => {
        if (live.current.disabled || live.current.tileWidth === 0) return false;
        holdTimer.current = setTimeout(() => {
          held.current = true;
          setDragging(true);
        }, HOLD_MS);
        return false;
      },
      onMoveShouldSetPanResponder: () => held.current,
      // Once the tile is lifted, nothing may steal the gesture back.
      onPanResponderTerminationRequest: () => !held.current,
      onPanResponderMove: (_event, gesture) => {
        shift.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_event, gesture) => {
        const { index: from, count: n, tileWidth: w, tileHeight: h, onMove: apply } = live.current;
        const column = Math.round((from % COLUMNS) + gesture.dx / (w + GAP));
        const row = Math.round(Math.floor(from / COLUMNS) + gesture.dy / (h + GAP));
        const to =
          Math.min(Math.max(row, 0), ROWS - 1) * COLUMNS +
          Math.min(Math.max(column, 0), COLUMNS - 1);
        settleHome();
        if (to !== from && to < n) apply(from, to);
      },
      onPanResponderTerminate: settleHome,
    }),
  ).current;

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!held.current) setDragging(false);
  };

  return (
    <Animated.View
      {...responder.panHandlers}
      onTouchEnd={clearHold}
      onTouchCancel={clearHold}
      accessible
      accessibilityLabel={COPY.photo.slotLabel(index + 1)}
      accessibilityHint={COPY.photo.dragHint}
      // The drag has no assistive equivalent, so the moves are offered as
      // actions a screen reader can invoke directly.
      accessibilityActions={[
        ...(index > 0 ? [{ name: 'moveEarlier', label: COPY.photo.moveEarlier(index + 1) }] : []),
        ...(index < count - 1
          ? [{ name: 'moveLater', label: COPY.photo.moveLater(index + 1) }]
          : []),
      ]}
      onAccessibilityAction={(event) => {
        const { index: from, onMove: apply } = live.current;
        if (event.nativeEvent.actionName === 'moveEarlier') apply(from, from - 1);
        if (event.nativeEvent.actionName === 'moveLater') apply(from, from + 1);
      }}
      style={[
        styles.slot,
        tileWidth > 0 && { width: tileWidth, height: tileHeight },
        dragging && styles.slotLifted,
        { transform: [{ translateX: shift.x }, { translateY: shift.y }] },
      ]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  slot: {
    // Before the first layout pass the percentage keeps the grid's shape; the
    // measured width takes over immediately after.
    width: `${(100 - 8) / COLUMNS}%`,
    aspectRatio: TILE_RATIO,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: color.veil,
  },
  /** Held and following the finger: above its siblings, slightly raised. */
  slotLifted: {
    zIndex: 10,
    elevation: 8,
    shadowColor: color.ink,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
  removeChip: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 22, 26, 0.55)',
  },
  removeGlyph: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    lineHeight: font.body + 2,
    color: color.onPhoto,
  },
});
