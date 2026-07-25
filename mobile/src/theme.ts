/**
 * Design tokens. One file, so no screen writes a colour of its own.
 *
 * The direction is open-sea blue and warm sand. It suits the subject better
 * than anything abstract would: the product is about a hotel you are standing
 * in or travelling to, and the palette is the water and the beach outside it.
 *
 * Everything below is checked against the background it is actually used on,
 * and the ratio is in the comment — the first accessibility audit (R-004) found
 * real failures that nobody had written down, and two of the values handed to
 * this palette failed the same way (see `muted` and `line`).
 */

/**
 * The canonical palette. Screens use the semantic names further down rather
 * than these, so a hue can move without touching a screen.
 */
export const onboardingColors = {
  /** 5.51:1 on sand, 6.14:1 for white on it. Primary action and strong accent. */
  ocean: '#176B7A',
  /** A wide surface colour, never a text colour. White on it fails; ink is 6.81:1. */
  sea: '#70C7D8',
  /** Selected surfaces. Ocean text on it is 5.33:1. */
  seaSoft: '#DDF3F7',
  seaMist: '#F1FAFB',
  /** Sand is decoration only — 1.37:1 on sandSoft. Never text, never a boundary. */
  sand: '#E6CF9D',
  sandSoft: '#FAF2DF',
  /** 11.82:1 on sand. Body and headline. */
  ink: '#17343C',
  /**
   * Given as #6B7B80, which is 3.95:1 on sandSoft — under the 4.5:1 body-text
   * floor, and this is the colour every secondary line in the app uses.
   * Darkened within the same family to 4.76:1.
   */
  muted: '#5E6E73',
  /** Decorative hairlines only: 1.17:1. A divider between paragraphs, not a control edge. */
  line: '#D8E3E5',
  /**
   * The edge of an input or a secondary button — the only thing telling someone
   * where a control starts, so WCAG 1.4.11 wants 3:1 and `line` gives 1.17.
   * 3.23:1 on sand, 3.13:1 on seaSoft.
   */
  edge: '#788A8F',
  white: '#FFFFFF',
  /** 4.64:1 on sand. */
  error: '#B94747',
} as const;

export const color = {
  /** Primary action, links, the focused state. */
  ocean: onboardingColors.ocean,
  oceanDeep: '#115360',
  sea: onboardingColors.sea,
  seaSoft: onboardingColors.seaSoft,
  sand: onboardingColors.sand,
  sandSoft: onboardingColors.sandSoft,

  ink: onboardingColors.ink,
  inkMuted: onboardingColors.muted,

  /** Warm off-white. The app's ground. */
  background: onboardingColors.sandSoft,
  /** Cards and inert fills. */
  surface: onboardingColors.white,
  /** A fill only. The ground behind a missing photo. */
  veil: onboardingColors.seaSoft,
  /** Control boundaries. See `onboardingColors.edge`. */
  border: onboardingColors.edge,
  /** Dividers between content, where no control edge is being marked. */
  rule: onboardingColors.line,

  onOcean: onboardingColors.white,
  /** Text over the scrim at the foot of a photo. */
  onPhoto: onboardingColors.white,

  danger: onboardingColors.error,
  onDanger: onboardingColors.white,

  badgeUpcoming: onboardingColors.sandSoft,
  badgeHereNow: onboardingColors.seaSoft,
  badgeTextUpcoming: onboardingColors.ink,
  badgeTextHereNow: onboardingColors.ocean,

  textPrimary: onboardingColors.ink,
  textSecondary: onboardingColors.muted,
  accent: onboardingColors.ocean,
  onAccent: onboardingColors.white,
} as const;

/**
 * The two rooms are the one thing this product has that no other dating app
 * does, so they get colour rather than a grey pill. Here Now is live and takes
 * the sea; Upcoming is a calm fact about the future and takes the sand.
 */
export const roomTone = {
  HERE_NOW: { fill: color.seaSoft, text: color.ocean },
  UPCOMING: { fill: color.sand, text: color.ink },
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
