/**
 * Design tokens. One file, so no screen writes a colour of its own.
 *
 * The ground is white and the one brand colour is a light lavender the owner
 * chose. That choice decides most of what follows: at 1.55:1 against white the
 * lavender cannot carry a boundary, a piece of text, or a state on its own, so
 * everywhere it appears it appears *with* something — a darker sibling, a
 * word, a mark. It is a fill and an accent, never the only signal.
 *
 * Every value is measured against the surface it is actually used on and the
 * ratio is in the comment. That habit came from the first accessibility audit
 * (R-004), which found real failures nobody had written down, and it has since
 * caught two supplied values that would have shipped broken.
 */

/**
 * The canonical palette. Screens use the semantic names below rather than
 * these, so a hue can move without touching a screen.
 */
export const palette = {
  /**
   * The brand, exactly as the owner specified it. 1.55:1 on white — which is
   * why it is never a control edge by itself and never carries text on white.
   * Text sits *on* it (ink is 11.68:1) rather than being drawn *in* it.
   */
  lavender: '#E1C4FF',
  /**
   * The same hue taken down until it can do the jobs the brand colour cannot:
   * 5.96:1 on white, so it passes as body text, as a control edge, and as the
   * companion ring that makes the lavender focus state perceivable.
   */
  lavenderDeep: '#7B4FA8',
  /** A selected surface. Ink on it is 15.45:1. */
  lavenderSoft: '#F3E9FF',

  white: '#FFFFFF',
  /** Near-black, the headline and body colour. 18.11:1 on white. */
  ink: '#14161A',
  /** Secondary lines. 6.05:1 on white — a neutral grey, deliberately not tinted. */
  muted: '#5F6368',
  /**
   * The edge of an input, a card or a secondary button — often the only thing
   * saying where a control starts, which WCAG 1.4.11 puts at 3:1. 4.21:1.
   */
  // Was #767C85 — a slate the owner read as black against the lavender.
  // Cards carry no border at all now (decorative edges are exempt from
  // WCAG 1.4.11 and shadows do their job); this edge remains only on
  // operable controls — inputs, pills — where 3:1 on white is the floor.
  // #9678BE is the lightest lavender that clears it (3.67:1).
  edge: '#9678BE',
  /** Decorative hairlines only: 1.31:1. A divider between paragraphs, never an edge. */
  rule: '#E4E6EA',
  /** 5.18:1 on white, and white on it is the same. Red stays red. */
  error: '#B94747',
  /** The wash behind an error notice. */
  errorSoft: '#FDF3F3',
  /** The initial standing in for a missing photo. 3.32:1 on the lavender-soft fill. */
  placeholder: '#9077A9',
} as const;

export const color = {
  /** The brand fill: the primary button, a selected surface, the focus border. */
  accent: palette.lavender,
  /** Where the brand has to be legible or load-bearing: text, edges, the focus ring. */
  accentDeep: palette.lavenderDeep,
  /** A selected or highlighted surface. */
  accentSoft: palette.lavenderSoft,

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
  veil: palette.lavenderSoft,
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
