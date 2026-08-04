/**
 * Design tokens. One file, so no screen writes a colour of its own.
 *
 * D-058 turned the product from the "rendevuu" night set (D-043/D-044) into a
 * light social theme: a warm cream ground, navy type, coral as the single
 * accent, and photographs carrying the colour. The old habit survives the
 * repaint — every value is measured against the surface it is actually used
 * on and the ratio is in the comment — and `__tests__/theme.test.ts` computes
 * those ratios rather than trusting them.
 *
 * The semantic groups below (`tokens.background.primary`, `tokens.brand.soft`,
 * …) carry the same names as the Figma variables on the `D-058 — Light Social
 * Theme` page, so a colour can be discussed once and found in both places.
 * `color` underneath is the flat alias every screen already imports.
 */

import { Platform } from 'react-native';

/**
 * The canonical palette. Screens use the semantic names below rather than
 * these, so a hue can move without touching a screen.
 */
export const palette = {
  /** The ground: warm cream, not white, so white cards lift off it. */
  cream: '#FAFAF7',
  /** Cards, sheets, the bottom bar. */
  white: '#FFFFFF',
  /** The wash under an input on cream, and the sunken step inside a card. */
  creamSunken: '#FBF2EC',

  /**
   * The reading colour and the brand's deep end. 16.4:1 on white — this is
   * what does every text job the coral cannot.
   */
  navy: '#101A3A',
  /**
   * Supporting prose. 5.9:1 on white, 5.7:1 on the cream ground.
   *
   * D-058's brief named `#7C8194` here. That value measures 3.87:1 on white,
   * under the 4.5:1 AA asks of body text, so the brief's hue is kept one step
   * darker for anything anybody has to read and the original is kept below as
   * `text.tertiary` for the jobs where WCAG does not ask for 4.5 — disabled
   * controls, placeholders, decorative marks.
   */
  slate: '#5F6478',
  /** The brief's `text.secondary` hex. Decorative, disabled, placeholder only. */
  slateLight: '#7C8194',

  /** A divider, or the quiet edge of a card. Never the edge of a control. */
  line: '#E8EBEF',
  /**
   * The edge of an input, a chip, a switch — the thing that says where a
   * control starts. 3.18:1 on white, which is what WCAG 1.4.11 asks for.
   */
  lineStrong: '#8A91A1',

  /** The brand. A fill, a glyph, a large mark — never small text on white. */
  coral: '#FF5E62',
  coralPressed: '#E94F54',
  /**
   * The brand as *text*. #FF5E62 is 2.99:1 on white, so a coral word, a coral
   * icon beside a word, or a coral count is drawn in this darker sibling:
   * 6.5:1 on white and 5.3:1 on the soft fill.
   */
  coralInk: '#B3272C',
  /** A selected chip, a live-room badge, the wash behind a brand moment. */
  coralSoft: '#FFE3E0',
  /** One step paler again: a whole panel that should read as brand-adjacent. */
  coralWash: '#FFE8EB',

  /** Premium. The metal itself is a fill or a glyph; the text is the dark one. */
  gold: '#D4AF37',
  goldInk: '#7A5B12',
  goldSoft: '#FBF3DF',

  /** Success. Same split: the bright green marks, the dark green reads. */
  green: '#22C55E',
  greenInk: '#15803D',
  greenSoft: '#E7F8EE',

  /**
   * Danger. Deliberately darker and browner than the brand coral so a
   * destructive action is not the same red as a like.
   */
  red: '#9B1C1C',
  redSoft: '#FDECEA',

  /** A neutral notice: standing information, no alarm. */
  infoSoft: '#F1F4F9',
} as const;

/**
 * The semantic layer. These names are the Figma variable names.
 */
export const tokens = {
  background: {
    /** Every screen's ground. */
    primary: palette.cream,
    /** A screen that is deliberately a white sheet (a modal, the chat). */
    elevated: palette.white,
    /** A recessed strip inside a light surface. */
    sunken: palette.creamSunken,
    /** The one deep surface: a context ribbon, a live-room banner. */
    inverse: palette.navy,
  },
  surface: {
    primary: palette.white,
    /** An inert fill inside a card — a thumbnail well, a progress track. */
    muted: palette.creamSunken,
    /** A brand-tinted panel. */
    brand: palette.coralWash,
    inverse: palette.navy,
  },
  text: {
    primary: palette.navy,
    secondary: palette.slate,
    /** Decorative, disabled and placeholder text only. See `palette.slate`. */
    tertiary: palette.slateLight,
    /** On a coral fill. Navy, 5.7:1 — the coral cannot carry white at 4.5. */
    onBrand: '#FFFFFF', // owner decision (2026-08-05): white on coral, the
    // reference apps' voice. Measured ~2.9:1 — under AA for body text, which
    // is why button labels on coral stay 15pt semibold and nothing smaller.
    /** On the navy ribbon and the deep surfaces. 15.7:1. */
    onInverse: palette.cream,
    /** Over a photograph, on top of `overlay.photo`. */
    onPhoto: palette.white,
    /** A coral word on a light surface. */
    brand: palette.coralInk,
  },
  border: {
    /** A card edge, a divider. Not a control. */
    subtle: palette.line,
    /** A control edge — input, chip, secondary button. 3.18:1 on white. */
    control: palette.lineStrong,
    /** Focus. Drawn thicker as well, so weight carries it too. */
    focus: palette.coralInk,
    inverse: 'rgba(255, 249, 245, 0.24)',
  },
  brand: {
    primary: palette.coral,
    primaryPressed: palette.coralPressed,
    soft: palette.coralSoft,
    wash: palette.coralWash,
    ink: palette.coralInk,
    navy: palette.navy,
  },
  premium: { gold: palette.gold, ink: palette.goldInk, soft: palette.goldSoft },
  success: { base: palette.green, ink: palette.greenInk, soft: palette.greenSoft },
  danger: { base: palette.red, ink: palette.red, soft: palette.redSoft },
  info: { soft: palette.infoSoft },
  overlay: {
    /** The fixed readability scrim under text on a photograph. */
    photo: 'rgba(16, 26, 58, 0.55)',
    /** The deeper end of a photo's foot, where the name and the ribbon sit. */
    photoDeep: 'rgba(16, 26, 58, 0.82)',
    /** A ribbon or plate over a photograph. */
    plate: 'rgba(16, 26, 58, 0.88)',
    /** K-01's floating controls: near-white glass over a photograph. */
    glass: 'rgba(255, 255, 255, 0.85)',
    /** Behind a modal or a sheet. */
    backdrop: 'rgba(16, 26, 58, 0.45)',
    /** A pressed state on a light surface, and a disabled fill. */
    pressed: 'rgba(16, 26, 58, 0.06)',
  },
} as const;

/**
 * The controlled full-colour moments (D-058). Everything else on a main screen
 * is light; these are the exceptions, and there are only two.
 *
 * `match` starts at the pressed coral rather than the brand coral on purpose:
 * white display type needs 3:1 and #FF5E62 gives 2.99, while #E94F54 gives
 * 3.7. The supporting sentence lower down sits on the pale end in navy.
 */
export const gradient = {
  /** M-01 (132:92): coral to pale peach, two stops, as drawn. */
  match: ['#E94F52', '#FFC7BC'],
  /** A photograph's foot, so a name and a ribbon stay readable on any image. */
  photoScrim: ['rgba(16, 26, 58, 0)', 'rgba(16, 26, 58, 0.82)'],
} as const;

export const color = {
  /** The brand fill: a like button, a selected surface, a live mark. */
  accent: tokens.brand.primary,
  /** The same fill, held down. */
  accentPressed: tokens.brand.primaryPressed,
  /** Where the brand has to be legible as text or a small glyph. 6.5:1. */
  accentDeep: tokens.brand.ink,
  /** A selected or highlighted surface. */
  accentSoft: tokens.brand.soft,
  /** One step paler: a whole brand-tinted panel. */
  accentWash: tokens.brand.wash,

  ink: tokens.text.primary,
  inkMuted: tokens.text.secondary,
  /** Decorative, disabled and placeholder text. */
  inkFaint: tokens.text.tertiary,

  /** The app's ground. */
  background: tokens.background.primary,
  /** Cards and sheets. */
  surface: tokens.surface.primary,
  /** An inert fill: a thumbnail well, a track, the ground behind a photo. */
  veil: tokens.surface.muted,
  /** The deep surface: the context ribbon, a live-room banner. */
  inverse: tokens.surface.inverse,
  onInverse: tokens.text.onInverse,

  /** Control boundaries. See `palette.lineStrong`. */
  border: tokens.border.control,
  /** Dividers and card edges, where no control edge is being marked. */
  rule: tokens.border.subtle,
  focus: tokens.border.focus,

  /** Text and glyphs sitting on the brand fill. Navy, never white. */
  onAccent: tokens.text.onBrand,
  /** Text over the scrim at the foot of a photo. */
  onPhoto: tokens.text.onPhoto,

  danger: tokens.danger.ink,
  dangerSoft: tokens.danger.soft,
  onDanger: palette.white,

  success: tokens.success.ink,
  successSoft: tokens.success.soft,
  successMark: tokens.success.base,

  premium: tokens.premium.ink,
  premiumSoft: tokens.premium.soft,
  premiumMark: tokens.premium.gold,

  infoSoft: tokens.info.soft,

  textPrimary: tokens.text.primary,
  textSecondary: tokens.text.secondary,
} as const;

/** Scrims, plates and backdrops. Named so no screen invents its own alpha. */
export const overlay = tokens.overlay;

/**
 * The two rooms are the one thing this product has that no other dating app
 * does. They are told apart by their words first — every place that uses these
 * prints "Here now" or "Upcoming" — and by a filled versus hollow mark second.
 * The fill is the third signal, not the only one, which is what lets Here Now
 * take the brand colour without the pair collapsing for anyone who cannot
 * separate the two hues.
 */
export const roomTone = {
  HERE_NOW: { fill: tokens.brand.soft, text: tokens.brand.ink, solid: true },
  UPCOMING: { fill: tokens.surface.primary, text: tokens.text.primary, solid: false },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

/**
 * Two families, two jobs. Inter does all of the reading, the forms, the chips
 * and the navigation — unchanged from D-057, because it is the better face at
 * 13px in a bio nobody asked to squint at.
 *
 * `display` is D-058's one controlled indulgence: the platform serif, on
 * screen titles, names and the match moment only. It is the system face on
 * both platforms rather than a new download, so there is no font to fail to
 * arrive and no new dependency (D-058 forbids both).
 */
export const fontFamily = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) as string,
  displaySemi: 'Inter_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const font = {
  /** An onboarding question, or a name on a card. The first thing read. */
  display: 32,
  title: 26,
  heading: 20,
  body: 16,
  caption: 13,
  /** Tracked and uppercase. Structure, never prose. */
  label: 12,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  /** The card radius D-058 asks for: 18–22. */
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Lift, not glass. A light card is told apart from a light ground by a quiet
 * edge and a soft shadow; Android needs `elevation` for any of it to appear.
 */
export const elevation = {
  card: {
    shadowColor: palette.navy,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: palette.navy,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  /** The bottom bar, lifting off the content that scrolls under it. */
  nav: {
    shadowColor: palette.navy,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  none: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
} as const;

/** Minimum touch target per platform accessibility guidance. */
export const MIN_TOUCH = 44;
/** The pass/like pair at the foot of a profile. Deliberately larger. */
export const ACTION_TOUCH = 64;
