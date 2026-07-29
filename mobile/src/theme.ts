/**
 * Design tokens. One file, so no screen writes a colour of its own.
 *
 * The palette is the owner's "rendevuu" night set (D-043/D-044, 2026-07-29,
 * from the designer's dark screens): a deep navy ground, near-white text,
 * the pinks as fills and accents, and the warm gold→coral→pink gradient for
 * the one primary action. The old habit survives the repaint: every value
 * is measured against the surface it is actually used on and the ratio is
 * in the comment, because the first accessibility audit (R-004) found real
 * failures nobody had written down.
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
  /** The owner's navy, kept as the deep end of the night ground. */
  navy: '#0F1B3D',
  /**
   * The ground's base indigo (D-046): lifted well out of "developer dark"
   * per the owner, and the top stop of the sunset gradient below.
   */
  midnight: '#2A2350',
  /** A card floating on the ground. Light text on it is 10.4:1. */
  panel: '#3A3168',
  /** A pink-washed selected surface on the night ground. */
  pinkSoft: '#321F45',

  white: '#FFFFFF',
  /** The reading colour at night: near-white. 16.6:1 on the midnight ground. */
  ink: '#F5F6FA',
  /** The dark ink for text sitting ON a warm fill (chips, the gradient). */
  inkDark: '#1A1A2E',
  /** Secondary lines. 6.6:1 on the midnight ground. */
  muted: '#A3A9C9',
  /**
   * The edge of an input or a pill — often the only thing saying where a
   * control starts (WCAG 1.4.11: 3:1). The pink clears it at 4.3:1 on the
   * night ground.
   */
  edge: '#EC4899',
  /** Decorative hairlines only: a divider between paragraphs, never an edge. */
  rule: '#2A3052',
  /** 5.1:1 on the night ground; the dark ink on it is 5.9:1. */
  error: '#F87171',
  /** The wash behind an error notice. */
  errorSoft: '#3B1F2B',
  /** The initial standing in for a missing photo. 5.6:1 on the pink-soft fill. */
  placeholder: '#F472B6',
} as const;

/**
 * The one gradient in the app: the primary action, warm gold into pink,
 * exactly as the owner wrote it. Labels on it are ink — the gold end cannot
 * carry white. The pressed variant is the owner's lighter ramp.
 */
/**
 * The glass system from the designer's Figma (D-045): a breath of white over
 * the night ground, a one-pixel light edge, and depth from shadow. Read as
 * frosted glass against the navy without costing a native blur pass.
 */
/**
 * The sunset ground (D-046, from the owner's reference): indigo falling
 * through violet into a warm coral glow at the foot of every screen. The
 * solid `color.background` is the same family's base and the fallback.
 */
export const backgroundGradient = ['#241E49', '#3A2B63', '#8A4A6F', '#D97B52'] as const;
/** The gradient's warm end — the ground the floating tab bar sits on. */
export const warmEnd = '#D97B52';

export const glass = {
  fill: 'rgba(255, 255, 255, 0.06)',
  strong: 'rgba(255, 255, 255, 0.10)',
  edge: 'rgba(255, 255, 255, 0.14)',
} as const;

export const gradient = {
  primary: ['#FBBF24', '#FB7185', '#EC4899'],
  primaryPressed: ['#FCD34D', '#FB7185', '#F472B6'],
} as const;

export const color = {
  /** The brand fill: a selected surface, chips, the focus border. */
  accent: palette.pinkLight,
  /**
   * Where the brand has to be legible or load-bearing on the night ground:
   * the light pink reads at 6.4:1 there, so icons and accent text wear it.
   */
  accentDeep: palette.pinkLight,
  /** A selected or highlighted surface. */
  accentSoft: palette.pinkSoft,

  ink: palette.ink,
  inkMuted: palette.muted,

  /** The app's ground. The designer's night navy (D-044). */
  background: palette.midnight,
  /** Cards and inert fills: a panel a step lighter than the ground. */
  surface: palette.panel,
  /** A fill only. The ground behind a missing photo. */
  veil: palette.pinkSoft,
  /** Control boundaries. See `palette.edge`. */
  border: palette.edge,
  /** Dividers between content, where no control edge is being marked. */
  rule: palette.rule,

  /** Text and glyphs sitting on the brand fill or the gradient. Dark, never white. */
  onAccent: palette.inkDark,
  /** Text over the scrim at the foot of a photo. */
  onPhoto: palette.white,

  danger: palette.error,
  dangerSoft: palette.errorSoft,
  onDanger: palette.inkDark,

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
  HERE_NOW: { fill: color.accent, text: palette.inkDark, solid: true },
  UPCOMING: { fill: palette.panel, text: palette.ink, solid: false },
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
