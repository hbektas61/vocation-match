/**
 * The hotel screen's two drawings, from the designer's reference
 * (2026-07-27): a little hotel standing in a pale disc for the
 * nothing-chosen card, and a magnifying glass over a quiet landscape for
 * the type-to-search state. Both are flat SVG in the pinned palette —
 * no photos, no emoji — so they render identically everywhere and weigh
 * nothing.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const DEEP = '#0F1B3D';
const MID = 'rgba(236, 72, 153, 0.45)';
const SOFT = 'rgba(236, 72, 153, 0.18)';

/** A small hotel with an H sign, two trees, and a cloud. */
export function HotelBuilding({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* cloud */}
      <Path
        d="M10 18a4 4 0 0 1 7-2 3 3 0 0 1 5 2z"
        fill={SOFT}
      />
      {/* building */}
      <Rect x={22} y={14} width={20} height={38} rx={2} fill="#FFFFFF" stroke={MID} strokeWidth={2} />
      {/* roof sign */}
      <Rect x={27} y={7} width={10} height={8} rx={2} fill={DEEP} />
      <Path d="M30.6 9v4M33.4 9v4M30.6 11h2.8" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" />
      {/* wings */}
      <Rect x={14} y={26} width={8} height={26} rx={2} fill="#FFFFFF" stroke={SOFT} strokeWidth={2} />
      <Rect x={42} y={26} width={8} height={26} rx={2} fill="#FFFFFF" stroke={SOFT} strokeWidth={2} />
      {/* windows */}
      {[20, 28, 36].map((y) => (
        <React.Fragment key={y}>
          <Rect x={26} y={y} width={4.5} height={5} rx={1} fill={MID} />
          <Rect x={33.5} y={y} width={4.5} height={5} rx={1} fill={MID} />
        </React.Fragment>
      ))}
      {/* door */}
      <Path d="M29 52v-6a3 3 0 0 1 6 0v6" fill={SOFT} stroke={MID} strokeWidth={1.5} />
      {/* trees */}
      <Path d="M11 52v-4m42 4v-4" stroke={MID} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={11} cy={45} r={4} fill={SOFT} />
      <Circle cx={53} cy={45} r={4} fill={SOFT} />
      {/* ground */}
      <Path d="M8 52h48" stroke={SOFT} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** A magnifying glass finding a tiny hotel above rolling hills. */
export function SearchScene({ width = 220 }: { width?: number }) {
  const height = (width * 120) / 220;
  return (
    <Svg width={width} height={height} viewBox="0 0 220 120" fill="none">
      {/* hills */}
      <Path d="M0 104c30-18 62-18 92 0z" fill="rgba(236, 72, 153, 0.08)" />
      <Path d="M118 104c32-20 70-20 102 0z" fill="rgba(236, 72, 153, 0.08)" />
      {/* small trees */}
      <Path d="M36 100v-6m148 6v-6" stroke={SOFT} strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={36} cy={90} r={5} fill={SOFT} />
      <Circle cx={184} cy={90} r={5} fill={SOFT} />
      {/* clouds */}
      <Path d="M28 42a5 5 0 0 1 9-2 4 4 0 0 1 6 2z" fill={SOFT} />
      <Path d="M170 34a5 5 0 0 1 9-2 4 4 0 0 1 6 2z" fill={SOFT} />
      {/* sparkles */}
      <Path d="M158 16l1.6 3.6L163 21l-3.4 1.4L158 26l-1.6-3.6L153 21l3.4-1.4zM60 22l1 2.4 2.4 1-2.4 1L60 28l-1-2.6-2.4-1 2.4-1z" fill={MID} />
      {/* the tiny hotel under the lens */}
      <Rect x={96} y={38} width={26} height={40} rx={2} fill="rgba(236, 72, 153, 0.16)" />
      {[44, 54, 64].map((y) => (
        <React.Fragment key={y}>
          <Rect x={101} y={y} width={5} height={6} rx={1} fill="rgba(236, 72, 153, 0.35)" />
          <Rect x={111} y={y} width={5} height={6} rx={1} fill="rgba(236, 72, 153, 0.35)" />
        </React.Fragment>
      ))}
      {/* magnifier */}
      <Circle cx={109} cy={56} r={30} stroke={MID} strokeWidth={4} fill="rgba(255,255,255,0.35)" />
      <Path d="M131 78l16 16" stroke={MID} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  );
}
