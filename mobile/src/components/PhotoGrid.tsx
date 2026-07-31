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
import * as Haptics from 'expo-haptics';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { color, font, fontFamily, overlay, radius, spacing } from '../theme';

const COLUMNS = 3;
const ROWS = 3;
// Wider than the usual small step on purpose: a dashed empty slot carries its
// own visual air, but two full-bleed photographs with a thin seam read as one
// picture cut in half. The owner asked for the photos to breathe the way the
// skeletons appear to.
const GAP = spacing.sm + 4;
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

  /** The screen-reader path: one step at a time, no gesture involved. */
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

  /**
   * The live arrangement while a drag is in flight: which tile is held, and
   * which slot it is currently over. The others move *now*, not on release —
   * crossing the midpoint of a neighbour is the moment it steps aside, which
   * is the grammar every platform grid has taught people's hands.
   *
   * `sig` pins the arrangement to the order it was computed against. The
   * commit path re-renders with new indices before this state is cleared, and
   * without the pin that one frame would apply old offsets to new positions.
   */
  const [drag, setDrag] = useState<{ from: number; to: number; sig: string } | null>(null);
  const sig = photos.map((photo) => photo.path).join('|');
  const arrangement = drag && drag.sig === sig ? drag : null;

  /** Where tile `i` should stand right now, given the hole the drag opened. */
  const offsetFor = (i: number): { x: number; y: number } => {
    if (!arrangement || tileWidth === 0 || i === arrangement.from) return { x: 0, y: 0 };
    const { from, to } = arrangement;
    let j = i;
    if (from < to && i > from && i <= to) j = i - 1;
    else if (to < from && i >= to && i < from) j = i + 1;
    if (j === i) return { x: 0, y: 0 };
    return {
      x: ((j % COLUMNS) - (i % COLUMNS)) * (tileWidth + GAP),
      y: (Math.floor(j / COLUMNS) - Math.floor(i / COLUMNS)) * (tileHeight + GAP),
    };
  };

  const beginDrag = useCallback(
    (from: number) => {
      setDrag({ from, to: from, sig });
    },
    [sig],
  );

  const hoverDrag = useCallback((to: number) => {
    setDrag((current) => (current && current.to !== to ? { ...current, to } : current));
  }, []);

  const endDrag = useCallback(
    (from: number, to: number) => {
      if (to === from) {
        setDrag(null);
        return;
      }
      // The arrangement is deliberately NOT cleared here: the tiles are
      // already standing in the new order, and clearing early would spring
      // them home only to jump forward when the server's answer lands. It is
      // cleared once the order actually changes (sig moves), or on failure.
      void run(
        from + 1,
        () => {
          const paths = photos.map((photo) => photo.path);
          const [moved] = paths.splice(from, 1);
          paths.splice(to, 0, moved);
          return getApi().reorderProfilePhotos(paths);
        },
        COPY.photo.reorderError,
      ).finally(() => setDrag(null));
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
              offset={offsetFor(slot - 1)}
              onMove={move}
              onBegin={beginDrag}
              onHover={hoverDrag}
              onEnd={endDrag}
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
  offset,
  onMove,
  onBegin,
  onHover,
  onEnd,
  children,
  testID,
}: {
  index: number;
  count: number;
  tileWidth: number;
  tileHeight: number;
  disabled: boolean;
  /** Where the parent wants this tile standing right now, in pixels. */
  offset: { x: number; y: number };
  onMove: (from: number, to: number) => void;
  onBegin: (from: number) => void;
  onHover: (to: number) => void;
  onEnd: (from: number, to: number) => void;
  children: React.ReactNode;
  testID?: string;
}) {
  const shift = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [dragging, setDragging] = useState(false);
  // The responder is created once and closes over the first render; these refs
  // carry the current truth into its callbacks.
  const held = useRef(false);
  const granted = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ index, count, tileWidth, tileHeight, disabled, onMove, onBegin, onHover, onEnd });
  live.current = { index, count, tileWidth, tileHeight, disabled, onMove, onBegin, onHover, onEnd };
  /** The slot the drag is currently over, recomputed as the finger moves. */
  const hoverAt = useRef(index);

  /**
   * The parent's arrangement, obeyed with a spring. This is the "step aside"
   * motion: the moment the dragged photo crosses a neighbour's midpoint, the
   * neighbour's offset changes and it slides — while the finger is still down.
   */
  const reflow = useRef(new Animated.ValueXY()).current;
  const reflowTo = useRef({ x: 0, y: 0 });
  /**
   * A commit renders this photo at its new index; the pixels it now earns from
   * layout are the pixels the animations were holding. Zeroing on the same
   * frame keeps the picture still through the handover.
   *
   * Both of these used to run in the render body, which is how they ended up
   * calling `setValue` on values an `Animated.View` is already subscribed to —
   * React saw a sibling being updated mid-render and said so:
   *
   *   Cannot update a component (`Animated(View)`) while rendering a
   *   different component (`DraggableTile`).
   *
   * A layout effect is the same frame, not the next one: it runs inside the
   * commit, before anything is drawn, so the handover is still invisible. No
   * dependency array, because the render body it replaces ran on every render
   * and the two refs below are the real conditions — the guards decide, not the
   * scheduler.
   *
   * The order is load-bearing and unchanged: the spring is armed first and the
   * zeroing overwrites it, so a commit always wins over an in-flight reflow.
   */
  const settledIndex = useRef(index);
  useLayoutEffect(() => {
    if (reflowTo.current.x !== offset.x || reflowTo.current.y !== offset.y) {
      reflowTo.current = offset;
      Animated.spring(reflow, {
        toValue: offset,
        useNativeDriver: true,
        speed: 24,
        bounciness: 5,
      }).start();
    }
    if (settledIndex.current !== index) {
      settledIndex.current = index;
      shift.setValue({ x: 0, y: 0 });
      reflow.setValue({ x: 0, y: 0 });
      // Re-armed, not merely cleared: if the parent still wants this tile
      // somewhere other than zero, the next commit has to spring again.
      reflowTo.current = { x: 0, y: 0 };
    }
  });

  /**
   * The grab has to be *felt*, not deduced. Three signals at the moment the
   * hold matures, because each covers a different sense: the tile grows a
   * little (the eye), the shadow deepens (depth), and the device taps back
   * (the hand) — the same trio the platform's own reorderable grids use, so
   * the gesture reads as "I have it" without anyone being taught.
   */
  const lift = () => {
    held.current = true;
    setDragging(true);
    hoverAt.current = live.current.index;
    live.current.onBegin(live.current.index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    Animated.spring(scale, {
      toValue: 1.07,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  /** The slot under the finger: half a tile crossed is the slot changing. */
  const targetOf = (dx: number, dy: number): number => {
    const { index: from, count: n, tileWidth: w, tileHeight: h } = live.current;
    const column = Math.round((from % COLUMNS) + dx / (w + GAP));
    const row = Math.round(Math.floor(from / COLUMNS) + dy / (h + GAP));
    const raw =
      Math.min(Math.max(row, 0), ROWS - 1) * COLUMNS +
      Math.min(Math.max(column, 0), COLUMNS - 1);
    return Math.min(raw, n - 1);
  };

  const settleHome = () => {
    held.current = false;
    granted.current = false;
    setDragging(false);
    Animated.parallel([
      Animated.spring(shift, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
        speed: 30,
        bounciness: 4,
      }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }),
    ]).start();
  };

  const responder = useRef(
    PanResponder.create({
      // Touch-down arms a timer; the drag only exists once the hold matures.
      // Until then any movement belongs to the surrounding ScrollView — a
      // swipe that happens to begin on a photo is still a scroll.
      onStartShouldSetPanResponder: () => {
        if (live.current.disabled || live.current.tileWidth === 0) return false;
        holdTimer.current = setTimeout(lift, HOLD_MS);
        return false;
      },
      onMoveShouldSetPanResponder: () => held.current,
      onPanResponderGrant: () => {
        granted.current = true;
      },
      // Once the tile is lifted, nothing may steal the gesture back.
      onPanResponderTerminationRequest: () => !held.current,
      onPanResponderMove: (_event, gesture) => {
        shift.setValue({ x: gesture.dx, y: gesture.dy });
        const target = targetOf(gesture.dx, gesture.dy);
        if (target !== hoverAt.current) {
          hoverAt.current = target;
          // The neighbours step aside now, and the hand gets the same tick the
          // platform's grids give on a crossing.
          live.current.onHover(target);
          Haptics.selectionAsync().catch(() => undefined);
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        const { index: from, tileWidth: w, tileHeight: h, onEnd: end } = live.current;
        const to = targetOf(gesture.dx, gesture.dy);
        held.current = false;
        granted.current = false;
        setDragging(false);
        if (to !== from) {
          // Settle onto the slot the eye already believes this photo owns;
          // layout takes over invisibly once the server's answer lands.
          Animated.parallel([
            Animated.spring(shift, {
              toValue: {
                x: ((to % COLUMNS) - (from % COLUMNS)) * (w + GAP),
                y: (Math.floor(to / COLUMNS) - Math.floor(from / COLUMNS)) * (h + GAP),
              },
              useNativeDriver: true,
              speed: 30,
              bounciness: 4,
            }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }),
          ]).start();
        } else {
          settleHome();
        }
        end(from, to);
      },
      onPanResponderTerminate: () => {
        settleHome();
        live.current.onEnd(live.current.index, live.current.index);
      },
    }),
  ).current;

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    // A hold that matured but never moved never granted the responder, so its
    // release arrives only here — without this, a long press with no drag left
    // the tile floating lifted forever.
    if (!granted.current && held.current) settleHome();
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
        {
          transform: [
            { translateX: Animated.add(shift.x, reflow.x) },
            { translateY: Animated.add(shift.y, reflow.y) },
            { scale },
          ],
        },
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
    width: '30%',
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
    // Navy on the coral fill — the fill cannot carry white here either.
    color: color.onAccent,
  },
  /** Floats on the photo, so it takes the same deep-navy plate a ribbon does. */
  removeChip: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: overlay.plate,
  },
  removeGlyph: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    lineHeight: font.body + 2,
    color: color.onPhoto,
  },
});
