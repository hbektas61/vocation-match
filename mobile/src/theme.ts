/**
 * Design tokens.
 *
 * The direction: warm, plain-spoken, confident. The product's own voice is
 * already like that — "self-declared", "within 500 m", "nobody is asked for a
 * reservation" — and a bright, salesy interface would be arguing with copy that
 * was written carefully not to oversell.
 *
 * Red carries it, deep and warm rather than fire-engine: a signal red on a
 * screen where two strangers decide about each other reads as alarm, and this
 * one reads as attention. Every value is checked against the background it is
 * actually used on, and the numbers are in the comments because the first
 * accessibility pass (R-004) found real failures that nobody had written down.
 */
export const color = {
  /** 5.53:1 on paper; white on it is 5.68:1. The brand, and every primary action. */
  ember: '#C81E37',
  /** Pressed states and brand hairlines. */
  emberDeep: '#A3172C',
  /** 4.98:1 for ember text on it. Badges and brand-owned surfaces. */
  emberSoft: '#FDECEE',

  /** 18.13:1. Near-black with a red undertone rather than the usual blue. */
  ink: '#191016',
  /** 6.15:1. Secondary text, still comfortably readable. */
  inkMuted: '#6A5C63',

  /** Warm white. A clinical #FFFFFF makes the red look pasted on. */
  background: '#FFFBFA',
  /** Cards and inert fills. */
  surface: '#F6F0F0',
  /** A fill only — 1.21:1, never a boundary. The ground behind a missing photo. */
  veil: '#EDE4E5',
  /**
   * 3.05:1 on the background. WCAG 1.4.11 wants 3:1 for a boundary that is the
   * only thing telling you where a control starts, which is exactly what an
   * input outline and a secondary button are.
   */
  border: '#9C8E92',

  onEmber: '#FFFFFF',
  /** Text over the scrim at the foot of a photo. */
  onPhoto: '#FFFFFF',

  danger: '#A3172C',
  onDanger: '#FFFFFF',

  /** Kept for the two room badges; see `roomTone`. */
  badgeUpcoming: '#F6F0F0',
  badgeHereNow: '#FDECEE',
  badgeTextUpcoming: '#191016',
  badgeTextHereNow: '#C81E37',

  textPrimary: '#191016',
  textSecondary: '#6A5C63',
  accent: '#C81E37',
  onAccent: '#FFFFFF',
} as const;

/**
 * The two rooms are the one thing this product has that no other dating app
 * does, so they get colour rather than a grey pill. Here Now is live and takes
 * the brand; Upcoming is a calm fact about the future and stays in ink.
 */
export const roomTone = {
  HERE_NOW: { fill: color.emberSoft, text: color.ember },
  UPCOMING: { fill: color.surface, text: color.ink },
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
 * and headings; Inter does the reading, because it is the better face at 13px
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
  /** A name on a card: the first thing read, and sized like it. */
  display: 34,
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
