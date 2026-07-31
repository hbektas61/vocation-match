/**
 * The empty inbox's drawing.
 *
 * D-058 removed the old hero rather than repainting it: it was a night-theme
 * raster (deep violet bubbles) that read as a hole punched in the cream
 * ground, and no light version of it existed. This is the light version —
 * drawn in code, in the theme's own tokens, so it cannot drift from the
 * palette the way a bitmap does.
 *
 * Two bubbles waiting on a sand horizon: the near one still empty, the far
 * one already coral. That is the whole promise of the screen — a conversation
 * has two sides and neither has spoken yet — and it is said without inventing
 * faces, names or messages that do not exist.
 *
 * Decorative by construction. It carries no information the sentence beneath
 * it does not already carry, so it is hidden from assistive technology at the
 * call site rather than given a label a screen reader would have to read out
 * before reaching the actual text.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from '../theme';

const DEEP = color.ink;
const MID = color.accent;
const SOFT = color.accentSoft;
const FAINT = color.accentWash;
const SAND = color.veil;
const WHITE = color.surface;

/**
 * Two speech bubbles over a low horizon.
 *
 * `width` drives everything; the aspect is fixed at 220×132 so the caller
 * can shrink it on a short screen without the drawing distorting.
 */
export function EmptyInbox({ width = 220 }: { width?: number }) {
  const height = (width * 132) / 220;
  return (
    <Svg width={width} height={height} viewBox="0 0 220 132" fill="none">
      {/* The sand the two of them are standing on — an inert ground, the
          same one a thumbnail well uses, so nothing here competes with the
          card underneath. */}
      <Path d="M22 112h176" stroke={SAND} strokeWidth={4} strokeLinecap="round" />
      <Path d="M46 112c0-16 20-26 42-26s42 10 42 26z" fill={FAINT} />
      <Path d="M132 112c0-11 14-18 30-18s30 7 30 18z" fill={FAINT} />

      {/* The near bubble: still empty, still white, with the three dots that
          mean somebody is about to speak. */}
      <Path
        d="M30 26h96a12 12 0 0 1 12 12v34a12 12 0 0 1-12 12H62l-16 14V84H30a12 12 0 0 1-12-12V38a12 12 0 0 1 12-12z"
        fill={WHITE}
        stroke={MID}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {[52, 78, 104].map((cx) => (
        <Circle key={cx} cx={cx} cy={55} r={5} fill={SOFT} />
      ))}

      {/* The far bubble: already coral, already answered. Smaller and set
          back, so the eye reads the empty one first. */}
      <Path
        d="M158 14h34a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10h-20l-13 11V58h-1a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10z"
        fill={MID}
      />
      <Rect x={166} y={28} width={26} height={4} rx={2} fill={WHITE} />
      <Rect x={166} y={38} width={17} height={4} rx={2} fill={WHITE} />

      {/* A navy spark between them: the moment the two bubbles meet. Line
          work only — the navy never becomes a mass on this ground. */}
      <Path
        d="M146 96l2.4 5.4 5.6 2.2-5.6 2.2-2.4 5.4-2.4-5.4-5.6-2.2 5.6-2.2z"
        fill={DEEP}
      />
      <Path d="M38 18l1.6 3.6 3.6 1.4-3.6 1.4L38 28l-1.6-3.6L32.8 23l3.6-1.4z" fill={SOFT} />
    </Svg>
  );
}
