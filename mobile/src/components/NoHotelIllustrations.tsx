/**
 * The two no-hotel drawings from the designer's screens (2026-07-27):
 * for Rooms, a room door standing ready beside the hotel that holds it;
 * for Discovery, a compass over the landscape the search will cover.
 * Flat SVG on the soft cloud-blob ground both references share.
 *
 * D-058 recoloured the set from the night theme's plum-tinted pink to the
 * light system: navy line work, the brand coral for the mid layer, and the
 * two pale coral steps for what used to be alpha-blended tints — there is no
 * literal transparency here, only the palette's own soft/wash pair, so the
 * shapes read the same on the white card either theme draws them on.
 */
import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { color } from '../theme';

const DEEP = color.ink;
const MID = color.accent;
const SOFT = color.accentSoft;
const FAINT = color.accentWash;
const WHITE = color.surface;

/** A numbered door, the hotel behind it, a plant keeping it company. */
export function DoorScene({ width = 240 }: { width?: number }) {
  const height = (width * 150) / 240;
  return (
    <Svg width={width} height={height} viewBox="0 0 240 150" fill="none">
      {/* cloud blob ground */}
      <Path
        d="M28 118c-12-26 8-50 34-46 2-26 34-40 56-26 10-20 44-18 52 4 22-4 40 16 32 38 10 12 4 30-12 30z"
        fill={FAINT}
      />
      <Path d="M36 46a7 7 0 0 1 12-3 6 6 0 0 1 9 3z" fill={SOFT} />
      <Path d="M186 34a6 6 0 0 1 10-2 5 5 0 0 1 8 2z" fill={SOFT} />
      <Path d="M206 60l1.6 3.6 3.6 1.6-3.6 1.6-1.6 3.6-1.6-3.6-3.6-1.6 3.6-1.6z" fill={MID} />
      {/* hotel wing */}
      <Rect x={52} y={52} width={52} height={70} rx={4} fill={WHITE} stroke={SOFT} strokeWidth={2.5} />
      <Rect x={66} y={42} width={14} height={12} rx={2} fill={DEEP} />
      <Path d="M71 45v6M75 45v6M71 48h4" stroke={WHITE} strokeWidth={1.4} strokeLinecap="round" />
      {[60, 74, 88].map((y) =>
        [59, 71, 83, 95].map((x) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={7} height={8} rx={1.5} fill={SOFT} />
        )),
      )}
      <Path d="M72 122v-10a6 6 0 0 1 12 0v10" fill={SOFT} />
      {/* the door */}
      <Path
        d="M112 122V70a28 28 0 0 1 56 0v52z"
        fill={MID}
      />
      <Path
        d="M118 122V71a22 22 0 0 1 44 0v51z"
        fill={DEEP}
      />
      <Rect x={130} y={62} width={20} height={12} rx={2} fill={WHITE} opacity={0.9} />
      <Path d="M133.5 68.5h13" stroke={DEEP} strokeWidth={0} />
      <Circle cx={158} cy={96} r={2.6} fill={WHITE} opacity={0.9} />
      <Rect x={155} y={92} width={6} height={2.4} rx={1.2} fill={WHITE} opacity={0.9} />
      {/* plant */}
      <Path d="M196 122v-14m0 4c-4-6-10-7-14-4m14 1c3-7 9-9 13-7m-13 2c0-8-4-13-9-14" stroke={MID} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d="M188 122h16l-2 12h-12z" fill={SOFT} stroke={MID} strokeWidth={2} strokeLinejoin="round" />
      {/* ground line */}
      <Path d="M40 122h164" stroke={SOFT} strokeWidth={2.5} strokeLinecap="round" />
      {/* door number text drawn as strokes is unreadable at this size, so the
          plate stays blank — a plate, not a lie about which room it is. */}
    </Svg>
  );
}

/** A compass over the ground it will search: hotel, hills, a pin, a path. */
export function CompassScene({ width = 240 }: { width?: number }) {
  const height = (width * 150) / 240;
  return (
    <Svg width={width} height={height} viewBox="0 0 240 150" fill="none">
      {/* clouds */}
      <Path d="M56 30a7 7 0 0 1 12-3 6 6 0 0 1 9 3z" fill={SOFT} />
      <Path d="M168 22a7 7 0 0 1 12-3 6 6 0 0 1 9 3z" fill={SOFT} />
      {/* ground */}
      <Ellipse cx={120} cy={126} rx={104} ry={16} fill={FAINT} />
      {/* mountains */}
      <Path d="M156 118l26-38 22 38z" fill={SOFT} />
      <Path d="M176 118l16-22 14 22z" fill={FAINT} />
      {/* small hotel */}
      <Rect x={30} y={70} width={40} height={48} rx={3} fill={WHITE} stroke={SOFT} strokeWidth={2.5} />
      <Rect x={41} y={62} width={12} height={10} rx={2} fill={DEEP} />
      <Path d="M45 64.5v5M49 64.5v5M45 67h4" stroke={WHITE} strokeWidth={1.2} strokeLinecap="round" />
      {[78, 90].map((y) =>
        [36, 46, 56].map((x) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={6} height={7} rx={1.5} fill={SOFT} />
        )),
      )}
      <Path d="M45 118v-8a5 5 0 0 1 10 0v8" fill={SOFT} />
      <Path d="M24 118v-6m0 0c0-5 3-8 6-8m-6 8c0-5-3-8-6-8" stroke={MID} strokeWidth={2} strokeLinecap="round" fill="none" />
      {/* dashed path to the pin */}
      <Path
        d="M56 126c22 8 48 8 70 0"
        stroke={MID}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="5 6"
        fill="none"
      />
      {/* the compass */}
      <Circle cx={126} cy={78} r={44} fill={WHITE} stroke={SOFT} strokeWidth={8} />
      <Circle cx={126} cy={78} r={44} stroke={MID} strokeWidth={3} fill="none" />
      <Circle cx={126} cy={78} r={35} stroke={FAINT} strokeWidth={2} fill="none" />
      {/* rose ticks */}
      <Path d="M126 40v8M126 108v8M88 78h8M156 78h8" stroke={SOFT} strokeWidth={2.5} strokeLinecap="round" />
      {/* needle */}
      <Path d="M126 78L104 56l32 12z" fill={DEEP} />
      <Path d="M126 78l22 22-32-12z" fill={SOFT} />
      <Circle cx={126} cy={78} r={5} fill={DEEP} stroke={WHITE} strokeWidth={2} />
      {/* the pin on the far ground */}
      <Path
        d="M186 100c-6 0-11 4.8-11 10.7 0 8 11 19.3 11 19.3s11-11.3 11-19.3c0-5.9-5-10.7-11-10.7z"
        fill={MID}
      />
      <Circle cx={186} cy={111} r={4} fill={WHITE} />
    </Svg>
  );
}
