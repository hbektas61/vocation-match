/**
 * The empty inbox, from the designer's screen (2026-07-27): two speech
 * bubbles leaning toward each other — one white, one deep lavender — with a
 * heart between them, on the same pale disc the other empty states stand
 * on. The reference's glossy 3D render translated into the app's flat SVG
 * language.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const DEEP = '#7B4FA8';
const MID = 'rgba(123, 79, 168, 0.45)';
const SOFT = 'rgba(123, 79, 168, 0.18)';
const FAINT = 'rgba(123, 79, 168, 0.10)';

export function InboxIllustration({ size = 260 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 260 260" fill="none">
      {/* the disc */}
      <Circle cx={130} cy={130} r={120} fill={FAINT} />
      {/* scattered dots and tiny hearts */}
      <Circle cx={38} cy={96} r={4} fill={SOFT} />
      <Circle cx={224} cy={78} r={3} fill={SOFT} />
      <Circle cx={206} cy={196} r={4} fill={SOFT} />
      <Circle cx={54} cy={196} r={3} fill={SOFT} />
      <Path d="M30 140c-4-5 2-11 6-6 4-5 10 1 6 6l-6 6z" fill={SOFT} />
      <Path d="M218 150c-3-4 2-9 5-5 3-4 8 1 5 5l-5 5z" fill={SOFT} />
      {/* sparkle */}
      <Path d="M196 52l2.4 5.4 5.4 2.4-5.4 2.4-2.4 5.4-2.4-5.4-5.4-2.4 5.4-2.4z" fill={MID} />
      {/* white bubble, top-left, tail down-left */}
      <Path
        d="M56 70a14 14 0 0 1 14-14h84a14 14 0 0 1 14 14v34a14 14 0 0 1-14 14H92l-16 18v-18h-6a14 14 0 0 1-14-14z"
        fill="#FFFFFF"
        stroke={SOFT}
        strokeWidth={2}
      />
      <Circle cx={82} cy={87} r={11} fill={SOFT} />
      <Rect x={100} y={78} width={54} height={6} rx={3} fill={SOFT} />
      <Rect x={100} y={92} width={40} height={6} rx={3} fill={FAINT} />
      {/* deep bubble, bottom-right, tail down-right */}
      <Path
        d="M110 122a14 14 0 0 1 14-14h74a14 14 0 0 1 14 14v34a14 14 0 0 1-14 14h-6v18l-16-18h-52a14 14 0 0 1-14-14z"
        fill={DEEP}
      />
      <Rect x={124} y={122} width={50} height={6} rx={3} fill="rgba(255,255,255,0.65)" />
      <Rect x={124} y={136} width={36} height={6} rx={3} fill="rgba(255,255,255,0.4)" />
      <Circle cx={190} cy={132} r={11} fill="rgba(255,255,255,0.55)" />
      {/* burst lines by the deep bubble */}
      <Path d="M216 96l8-10M224 104l10-6M208 92l4-12" stroke={MID} strokeWidth={2.5} strokeLinecap="round" />
      {/* the heart */}
      <Path
        d="M104 158c0-13-19-13-19 0 0 11 12 19 19 24 7-5 19-13 19-24 0-13-19-13-19 0z"
        fill={MID}
      />
      <Path
        d="M104 158c0-13-19-13-19 0 0 11 12 19 19 24 7-5 19-13 19-24 0-13-19-13-19 0z"
        fill="rgba(123, 79, 168, 0.35)"
      />
      <Path d="M93 156c1-4 5-6 8-5" stroke="rgba(255,255,255,0.7)" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      {/* burst lines by the heart */}
      <Path d="M76 168l-10 2M78 178l-9 5" stroke={SOFT} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
