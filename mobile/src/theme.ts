/**
 * Design tokens. One file, so no screen writes a colour of its own.
 *
 * The palette is the owner's "rendevuu" trial (D-043, 2026-07-29): a navy
 * for everything that must be read, a warm gold→coral→pink gradient for the
 * one primary action, and a light pink as the brand fill. The old habit
 * survives the repaint: every value is measured against the surface it is
 * actually used on and the ratio is in the comment, because the first
 * accessibility audit (R-004) found real failures nobody had written down.
 */

/**
 * The canonical palette. Screens use the semantic names below rather than
 * these, so a hue can move without touching a screen.
 */
export const palette = {
  /**
   * The brand fill, exactly as the owner specified it (lightPink). Ink on it
   * measures 6.0:1, so a chip or a filled pill can carry dark text; it never
   * carries white text and never marks a boundary alone.
   */
  pinkLight: '#F472B6',
  /**
   * The strong brand hue (pink). 3.9:1 on white: enough for a control edge
   * (WCAG 1.4.11 wants 3:1), not enough for body text — text jobs go to the
   * navy below.
   */
  pink: '#EC4899',
  /** The warm ends of the primary gradient, per the owner's spec. */
  gold: '#FBBF24',
  goldLight: '#FCD34D',
  coral: '#FB7185',
  /**
   * The navy that does the reading jobs the pinks cannot: 16.9:1 on white as
   * text, icon strokes, and the companion that keeps a pink state legible.
   */
  navy: '#0F1B3D',
  /** A selected surface. Ink on it is 14.7:1. */
  pinkSoft: '#FCE7F3',

  white: '#FFFFFF',
  /** Near-black (the owner's ink), the headline and body colour. 16.3:1 on white. */
  ink: '#1A1A2E',
  /** Secondary lines. 4.74:1 on white — the owner's neutral grey. */
  muted: '#737373',
  /**
   * The edge of an input or a pill — often the only thing saying where a
   * control starts (WCAG 1.4.11: 3:1). The pink clears it at 3.9:1.
   */
  edge: '#EC4899',
  /** Decorative hairlines only: a divider between paragraphs, never an edge. */
  rule: '#E5E5E5',
  /** 5.18:1 on white, and white on it is the same. Red stays red. */
  error: '#B94747',
  /** The wash behind an error notice. */
  errorSoft: '#FDF3F3',
  /** The initial standing in for a missing photo. 3.7:1 on the pink-soft fill. */
  placeholder: '#B25A88',
} as const;

/**
 * The one gradient in the app: the primary action, warm gold into pink,
 * exactly as the owner wrote it. Labels on it are ink — the gold end cannot
 * carry white. The pressed variant is the owner's lighter ramp.
 */
export const gradient = {
  primary: ['#FBBF24', '#FB7185', '#EC4899'],
  primaryPressed: ['#FCD34D', '#FB7185', '#F472B6'],
} as const;

export const color = {
  /** The brand fill: a selected surface, chips, the focus border. */
  accent: palette.pinkLight,
  /** Where the brand has to be legible or load-bearing: text, icons, the focus ring. */
  accentDeep: palette.navy,
  /** A selected or highlighted surface. */
  accentSoft: palette.pinkSoft,

  ink: palette.ink,
  inkMuted: palette.muted,

  /** The app's ground. White, per the owner. */
  background: palette.white,
  /**
   * Cards and inert fills. The same white as the ground, which is why a card
   * is told apart by its border and its spacing rather than by its fill.
   */
  surface: palette.white,
  /** A fill only. The ground behind a missing photo. */
  veil: palette.pinkSoft,
  /** Control boundaries. See `palette.edge`. */
  border: palette.edge,
  /** Dividers between content, where no control edge is being marked. */
  rule: palette.rule,

  /** Text and glyphs sitting on the brand fill. Dark, never white. */
  onAccent: palette.ink,
  /** Text over the scrim at the foot of a photo. */
  onPhoto: palette.white,

  danger: palette.error,
  dangerSoft: palette.errorSoft,
  onDanger: palette.white,

  textPrimary: palette.ink,
  textSecondary: palette.muted,
} as const;

/**
 * The two rooms are the one thing this product has that no other dating app
 * does. They are told apart by their words first — every place that uses these
 * prints "Here now" or "Upcoming" — and by a filled versus hollow mark second.
 * The fill is the third signal, not the only one, which is what lets Here Now
 * take the brand colour without the pair collapsing for anyone who cannot
 * separate the two hues.
 */
export const roomTone = {
  HERE_NOW: { fill: color.accent, text: color.ink, solid: true },
  UPCOMING: { fill: palette.white, text: color.ink, solid: false },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

/**
 * Two families, two jobs. Nunito's rounded terminals carry the warmth in names
 * and headlines; Inter does the reading, because it is the better face at 13px
 * in a bio nobody asked to squint at.
 */
export const fontFamily = {
  display: 'Nunito_800ExtraBold',
  displaySemi: 'Nunito_700Bold',
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
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** Minimum touch target per platform accessibility guidance. */
export const MIN_TOUCH = 44;
/** The pass/like pair at the foot of a profile. Deliberately larger. */
export const ACTION_TOUCH = 64;
