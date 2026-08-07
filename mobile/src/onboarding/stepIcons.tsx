/**
 * The step icons from the designer's dark onboarding (D-044, 2026-07-29):
 * a glyph per gender answer, the three show-me marks, and one small line
 * icon per interest. Drawn here once so the steps stay layout-only.
 *
 * Every icon is decorative — the label beside it carries the meaning, and
 * selection is still fill + border + accessibility state, never the icon.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from '../theme';

const stroke = (tone: string, size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: tone,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** ♀ */
const VenusIcon = ({ tone, size = 20 }: { tone: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={8} r={5} />
    <Path d="M12 13v8m-3.5-3.5h7" />
  </Svg>
);

/** ♂ */
const MarsIcon = ({ tone, size = 20 }: { tone: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={10} cy={14} r={5.5} />
    <Path d="M14 10l6-6m0 0h-5m5 0v5" />
  </Svg>
);

/** ⚧-like mark for non-binary and the trans answers. */
const TransIcon = ({ tone, size = 20 }: { tone: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={14.5} r={4.5} />
    <Path d="M12 10V3m0 0-2.5 2.5M12 3l2.5 2.5M9 6.5h6" />
  </Svg>
);

/** ≈ — the fluid mark the mock puts beside "Cinsiyet akışkan". */
const FluidIcon = ({ tone, size = 20 }: { tone: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Path d="M4 9c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0M4 15c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0" />
  </Svg>
);

/** ⊘ — agender. */
const NoneIcon = ({ tone, size = 20 }: { tone: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={12} r={8} />
    <Path d="M6.5 17.5l11-11" />
  </Svg>
);

/** The mock's little crowd for "Herkes". */
export const CrowdIcon = ({ tone, size = 28 }: { tone: string; size?: number }) => (
  <Svg {...stroke(tone, size)}>
    <Circle cx={12} cy={7.5} r={3} />
    <Path d="M6.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
    <Circle cx={4.8} cy={9.5} r={2.2} />
    <Path d="M1.8 18.5c0-2.3 1.4-3.8 3.4-4.2M19.2 9.5a2.2 2.2 0 1 0 0-.01M22.2 18.5c0-2.3-1.4-3.8-3.4-4.2" />
  </Svg>
);

/**
 * Gender answer → glyph. D-058's palette dropped the mock's per-answer hues —
 * there is no blue or purple token left to spend, only the brand and its
 * neutrals — so every glyph now draws in the same brand ink. The label beside
 * it still carries the answer; the mark was always flavour, never information.
 */
export function genderIcon(value: string, size = 20): React.ReactNode {
  switch (value) {
    case 'WOMAN':
      return <VenusIcon tone={color.accentDeep} size={size} />;
    case 'MAN':
      return <MarsIcon tone={color.accentDeep} size={size} />;
    case 'Non-binary':
      return <TransIcon tone={color.accentDeep} size={size} />;
    case 'Genderfluid':
      return <FluidIcon tone={color.accentDeep} size={size} />;
    case 'Agender':
      return <NoneIcon tone={color.accentDeep} size={size} />;
    case 'Transgender woman':
      return <TransIcon tone={color.accentDeep} size={size} />;
    case 'Transgender man':
      return <TransIcon tone={color.accentDeep} size={size} />;
    default:
      return null;
  }
}

/** Show-me card → the mock's three marks, in the one brand ink D-058 leaves. */
export function showMeIcon(value: string, size = 30): React.ReactNode {
  switch (value) {
    case 'WOMEN':
      return <VenusIcon tone={color.accentDeep} size={size} />;
    case 'MEN':
      return <MarsIcon tone={color.accentDeep} size={size} />;
    default:
      return <CrowdIcon tone={color.accentDeep} size={size} />;
  }
}

/* ------------------------------------------------------------- interests */

const I = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <Svg {...stroke('currentColor', size)}>{children}</Svg>
);

/**
 * One small line icon per interest, matched to the mock's set. `tone` is
 * applied by the chip so idle and selected can differ.
 */
export function interestIcon(choice: string, tone: string, size = 16): React.ReactNode {
  const p = stroke(tone, size);
  switch (choice) {
    case 'Swimming':
      return (
        <Svg {...p}>
          <Path d="M3 17c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
          <Circle cx={16.5} cy={7.5} r={2} />
          <Path d="M4 13l5-4 4 3" />
        </Svg>
      );
    case 'Running':
      return (
        <Svg {...p}>
          <Circle cx={15.5} cy={5} r={2} />
          <Path d="M6 20l3.5-5.5L8 10l4-2.5L15 11l4 1M10 14.5l-1 5.5" />
        </Svg>
      );
    case 'Diving':
      return (
        <Svg {...p}>
          <Circle cx={8} cy={6} r={2} />
          <Path d="M4 20c5 0 7-3 9-6l5-2.5M13 14l4 4" />
        </Svg>
      );
    case 'Food':
      return (
        <Svg {...p}>
          <Path d="M4 11l16-7-7 16-2-7z" />
        </Svg>
      );
    case 'Coffee':
      return (
        <Svg {...p}>
          <Path d="M4 10h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
          <Path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 7c0-1 .8-1.2.8-2.2" />
        </Svg>
      );
    case 'Live music':
      return (
        <Svg {...p}>
          <Path d="M9 18V6l10-2v12" />
          <Circle cx={7} cy={18} r={2.4} />
          <Circle cx={17} cy={16} r={2.4} />
        </Svg>
      );
    case 'Reading':
      return (
        <Svg {...p}>
          <Path d="M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2z" />
          <Path d="M12 6v14" />
        </Svg>
      );
    case 'Photography':
      return (
        <Svg {...p}>
          <Rect x={3} y={7} width={18} height={13} rx={2.5} />
          <Path d="M8.5 7l1.5-2.5h4L15.5 7" />
          <Circle cx={12} cy={13.5} r={3.5} />
        </Svg>
      );
    case 'Hiking':
      return (
        <Svg {...p}>
          <Path d="M13 4l1 4 2 1v11M14 9l-4 3-2 8M10 12l4 3" />
          <Path d="M16 20h3" />
        </Svg>
      );
    case 'Museums':
      return (
        <Svg {...p}>
          <Path d="M3 9l9-5 9 5M4 9h16M6 9v8m4-8v8m4-8v8m4-8v8M3 20h18" />
        </Svg>
      );
    case 'Board games':
      return (
        <Svg {...p}>
          <Path d="M12 3l7 4v7l-7 4-7-4V7z" />
          <Path d="M12 3v7.5m0 0L5 7m7 3.5 7-3.5" />
        </Svg>
      );
    case 'Nightlife':
      return (
        <Svg {...p}>
          <Path d="M20 13.5A8 8 0 1 1 10.5 4 6.5 6.5 0 0 0 20 13.5z" />
        </Svg>
      );
    case 'Tennis':
      return (
        <Svg {...p}>
          <Circle cx={12} cy={12} r={8.5} />
          <Path d="M5 6.5c4 2 4 9 0 11M19 6.5c-4 2-4 9 0 11" />
        </Svg>
      );
    case 'Yoga':
      return (
        <Svg {...p}>
          <Circle cx={12} cy={5} r={2} />
          <Path d="M12 8v5m0 0-5 3m5-3 5 3M6 20h12" />
        </Svg>
      );
    default:
      return <I size={size}><Circle cx={12} cy={12} r={4} stroke={tone} /></I>;
  }
}

/**
 * The four marks beside the four promises (D-065, 180:6101).
 *
 * The contract draws each rule on a tinted rounded tile with a glyph in it.
 * The glyphs are the file's own iconify set, which is a dependency this app
 * does not have and does not want for four marks — so they are drawn here in
 * the same stroked line as every other icon in this file. Decorative, as all
 * of them are: the sentence beside each one carries the rule.
 */
export function pledgeIcon(index: number, tone: string, size = 24): React.ReactNode {
  switch (index) {
    // Be yourself.
    case 0:
      return (
        <Svg {...stroke(tone, size)}>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
        </Svg>
      );
    // Meet in public first, and tell someone where you are going.
    case 1:
      return (
        <Svg {...stroke(tone, size)}>
          <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
          <Circle cx={12} cy={10} r={2.6} />
        </Svg>
      );
    // Be decent.
    case 2:
      return (
        <Svg {...stroke(tone, size)}>
          <Path d="M20 12.5c0 3.6-3.6 6.5-8 6.5a9.7 9.7 0 0 1-2.6-.35L5 21l1-3.4A6.9 6.9 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" />
          <Path d="M12 15c-2-1.4-3-2.4-3-3.6A1.6 1.6 0 0 1 12 10.5a1.6 1.6 0 0 1 3 .9c0 1.2-1 2.2-3 3.6Z" />
        </Svg>
      );
    // Report anything that feels wrong.
    default:
      return (
        <Svg {...stroke(tone, size)}>
          <Circle cx={12} cy={12} r={8.5} />
          <Path d="M12 7.5v5m0 3.5h.01" />
        </Svg>
      );
  }
}

/** The check badge every selected answer wears in the mock. */
export const CheckBadge = ({ size = 22 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={color.border} />
    <Path
      d="m7.5 12.5 3 3 6-6.5"
      stroke={color.surface}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);
