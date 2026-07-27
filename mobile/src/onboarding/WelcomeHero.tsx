/**
 * The first thing anyone sees (designer, 2026-07-27): the app's mark — a
 * hotel doorway with a speech bubble and a two-tone heart inside it —
 * floating over a lavender resort skyline that ends in a soft curve.
 * One SVG, all in the pinned palette, so the first screen weighs nothing
 * and matches everywhere.
 */
import React from 'react';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

const DEEP = '#7B4FA8';
const MID = 'rgba(123, 79, 168, 0.45)';
const SOFT = 'rgba(123, 79, 168, 0.20)';
const FAINT = 'rgba(123, 79, 168, 0.11)';

export function WelcomeHero({ width = 375 }: { width?: number }) {
  const height = (width * 300) / 375;
  return (
    <Svg width={width} height={height} viewBox="0 0 375 300" fill="none">
      <Defs>
        <SvgGradient id="wash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EFE4FA" />
          <Stop offset="1" stopColor="#F8F3FD" />
        </SvgGradient>
      </Defs>
      {/* the wash, ending in the reference's soft curve */}
      <Path d="M0 0h375v230c-90 42-285 42-375 0z" fill="url(#wash)" />
      {/* clouds and sparkles */}
      <Path d="M52 64a9 9 0 0 1 15-4 8 8 0 0 1 12 4z" fill="#FFFFFF" opacity={0.8} />
      <Path d="M292 52a9 9 0 0 1 15-4 8 8 0 0 1 12 4z" fill="#FFFFFF" opacity={0.8} />
      <Path d="M40 30l2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2z" fill="#FFFFFF" opacity={0.9} />
      <Path d="M330 96l1.6 3.6 3.6 1.6-3.6 1.6-1.6 3.6-1.6-3.6-3.6-1.6 3.6-1.6z" fill={MID} />
      {/* left hotel silhouette */}
      <Rect x={18} y={128} width={78} height={92} rx={4} fill={SOFT} />
      <Rect x={30} y={116} width={30} height={12} rx={2} fill={MID} />
      {[140, 156, 172].map((y) =>
        [26, 42, 58, 74].map((x) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={9} height={10} rx={2} fill="#FFFFFF" opacity={0.55} />
        )),
      )}
      <Path d="M48 220v-14a8 8 0 0 1 16 0v14" fill={FAINT} />
      {/* right buildings */}
      <Rect x={288} y={150} width={52} height={70} rx={3} fill={SOFT} />
      {[160, 176, 192].map((y) =>
        [295, 308, 321].map((x) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={8} height={9} rx={2} fill="#FFFFFF" opacity={0.5} />
        )),
      )}
      {/* palms */}
      <Path d="M110 222c2-16 1-28-3-38m3 6c-6-8-14-10-20-7m20 4c1-10 7-15 14-15m-14 12c7-6 16-4 20 2" stroke={MID} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
      <Path d="M268 224c-2-14-1-24 2-32m-2 5c5-7 12-9 17-6m-17 3c-1-8-6-13-12-13m12 10c-6-5-14-3-17 2" stroke={MID} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.6} />
      {/* soft mounds */}
      <Path d="M0 214c40-18 90-18 130 0z" fill={FAINT} />
      <Path d="M240 216c40-16 95-16 135 0z" fill={FAINT} />
      {/* ---- the mark's tile ---- */}
      <Rect x={122} y={44} width={130} height={130} rx={30} fill="#FBF8FE" />
      <Rect x={122} y={44} width={130} height={130} rx={30} stroke="#FFFFFF" strokeWidth={3} />
      {/* H sign block */}
      <Rect x={172} y={54} width={30} height={26} rx={6} fill={DEEP} />
      <Path d="M181 61v12M193 61v12M181 67h12" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
      {/* hotel body */}
      <Path d="M144 166V96a8 8 0 0 1 8-8h70a8 8 0 0 1 8 8v70z" fill="#F1E8FA" />
      {/* three arched windows */}
      {[157, 180, 203].map((x) => (
        <Path key={x} d={`M${x} 112v-7a7 7 0 0 1 14 0v7z`} fill={MID} />
      ))}
      {/* doorway */}
      <Path d="M158 166v-30a29 29 0 0 1 58 0v30z" fill={DEEP} />
      {/* speech bubble in the doorway */}
      <Path
        d="M170 128a10 10 0 0 1 10-10h14a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10h-3l-6 9v-9h-5a10 10 0 0 1-10-10z"
        fill="#FFFFFF"
      />
      {/* the two-tone heart */}
      <Path d="M187 130c-1.6-4.6-8.6-4.4-8.6.8 0 4 4.6 7.4 8.6 10.2z" fill={MID} />
      <Path d="M187 130c1.6-4.6 8.6-4.4 8.6.8 0 4-4.6 7.4-8.6 10.2z" fill={DEEP} />
      <Circle cx={222} cy={72} r={2.6} fill={MID} />
    </Svg>
  );
}
