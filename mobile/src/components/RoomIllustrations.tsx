/**
 * The two room drawings from the designer's Rooms screen (2026-07-27):
 * a ring-bound calendar with a check for Upcoming (you say when), and a
 * dropped pin between a palm and the town for Here Now (you are near).
 * Flat SVG in the pinned palette — the reference's 3D renders translated
 * into the app's own flat language.
 */
import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

const DEEP = '#7B4FA8';
const MID = 'rgba(123, 79, 168, 0.45)';
const SOFT = 'rgba(123, 79, 168, 0.18)';
const FAINT = 'rgba(123, 79, 168, 0.10)';

/** A ring-bound calendar with a check badge: the stay you declare. */
export function CalendarIllustration({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* body */}
      <Rect x={14} y={22} width={62} height={56} rx={8} fill="#FFFFFF" stroke={MID} strokeWidth={2.5} />
      {/* header band */}
      <Path d="M14 30a8 8 0 0 1 8-8h46a8 8 0 0 1 8 8v8H14z" fill={DEEP} />
      {/* binder rings */}
      <Path d="M30 14v12M45 14v12M60 14v12" stroke={MID} strokeWidth={3.5} strokeLinecap="round" />
      <Circle cx={30} cy={14} r={3.5} stroke={MID} strokeWidth={2.5} fill="#FFFFFF" />
      <Circle cx={45} cy={14} r={3.5} stroke={MID} strokeWidth={2.5} fill="#FFFFFF" />
      <Circle cx={60} cy={14} r={3.5} stroke={MID} strokeWidth={2.5} fill="#FFFFFF" />
      {/* date grid */}
      {[46, 56, 66].map((y) =>
        [24, 37, 50, 63].map((x) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={8} height={7} rx={1.5} fill={SOFT} />
        )),
      )}
      {/* check badge */}
      <Circle cx={72} cy={70} r={15} fill={MID} />
      <Circle cx={72} cy={70} r={15} fill="rgba(123, 79, 168, 0.25)" />
      <Path d="M65 70.5l4.5 4.5 9-9" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A pin dropped between the palm and the town: near, and only near. */
export function PinScene({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* faint town */}
      <Rect x={62} y={44} width={12} height={28} rx={2} fill={FAINT} />
      <Rect x={76} y={52} width={10} height={20} rx={2} fill={FAINT} />
      <Rect x={65} y={49} width={4} height={4} rx={1} fill={SOFT} />
      <Rect x={65} y={57} width={4} height={4} rx={1} fill={SOFT} />
      {/* cloud */}
      <Path d="M64 30a6 6 0 0 1 10-3 5 5 0 0 1 8 3z" fill={FAINT} />
      {/* palm */}
      <Path d="M18 72c2-12 2-22 0-30" stroke={MID} strokeWidth={3} strokeLinecap="round" />
      <Path d="M18 42c-5-4-11-4-14 0m14 0c0-6 4-10 9-11m-9 11c5-4 12-3 15 1" stroke={MID} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      {/* ripple under the pin */}
      <Ellipse cx={46} cy={76} rx={20} ry={6} fill={FAINT} />
      <Ellipse cx={46} cy={76} rx={11} ry={3.4} fill={SOFT} />
      {/* the pin */}
      <Path
        d="M46 24c-9.4 0-17 7.4-17 16.6C29 53 46 70 46 70s17-17 17-29.4C63 31.4 55.4 24 46 24z"
        fill={DEEP}
      />
      <Circle cx={46} cy={41} r={6.5} fill="#FFFFFF" />
    </Svg>
  );
}
