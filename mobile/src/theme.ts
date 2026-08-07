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

/**
 * The canonical palette. Screens use the semantic names below rather than
 * these, so a hue can move without touching a screen.
 */
export const palette = {
  /**
   * The ground, and everything on it (owner, 2026-08-05): coral and white are
   * the brand, so the page is white and a card is told apart by its edge and
   * its lift rather than by being a different white. The warm cream this
   * replaces is kept below as `paper`, which is still the right value for the
   * one place a *warm* off-white is wanted — text on the navy ribbon.
   */
  white: '#FFFFFF',
  /** Warm off-white. Reads on navy without the glare of pure white. */
  paper: '#FAFAF7',
  /** A sunken step inside a card, and the well under a thumbnail. */
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
  /**
   * A selected chip, a live-room badge, the wash behind a brand moment — and
   * the disc behind every drawn glyph. Warmed towards the coral on
   * 2026-08-06 (owner: "the pinks, I do not like them"), which also brings
   * the tints into the logo's own peach family.
   */
  coralSoft: '#FFE0D4',
  /** One step paler again: a whole panel that should read as brand-adjacent. */
  coralWash: '#FFEDE4',

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
    primary: palette.white,
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
    onInverse: palette.paper,
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
 * 3.7. D-065 (176:3929) turns the far end over: it used to fade to pale peach,
 * which left the drawing's white secondary label sitting on a near-white
 * ground — a contrast fault the old M-01 comment had to apologise for. The
 * file ends the wash on the deep ink instead, so everything in the bottom
 * third is white on navy and the apology is not needed.
 */
export const gradient = {
  /** 176:3929: coral to deep ink, two stops, as drawn. */
  match: ['#E94F52', palette.navy],
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

/**
 * The spacing ladder (D-059).
 *
 * D-058 locked the palette and left the measurements loose, and the screens
 * drifted the way loose things do: twenty-two distinct padding values across
 * the app, most of them eyeballed one screen at a time. Two cards that do the
 * same job ended up 2pt apart, which nobody can name and everybody can feel.
 *
 * Nine rungs, every one a multiple of two and every one earning its place —
 * measured against what the screens actually needed rather than invented. A
 * gap that is not on this ladder is a gap somebody guessed.
 */
export const spacing = {
  /** A seam: two things that touch but must not merge. */
  tight: 2,
  xs: 4,
  /** Inside a row — a glyph and the word beside it. */
  cozy: 6,
  sm: 8,
  /** Between two stacked lines in a card: a title and its supporting line. */
  snug: 12,
  md: 16,
  /** A card's inner padding where 16 reads cramped. */
  wide: 20,
  lg: 24,
  xl: 40,
} as const;

/**
 * Two families, two jobs. Inter does all of the reading, the forms, the chips
 * and the navigation — unchanged since D-057, because it is the better face at
 * 13px in a bio nobody asked to squint at.
 *
 * The display face is a geometric sans (D-060). It replaces the platform serif
 * D-058 chose, which on iOS resolves to Georgia — a 1996 screen serif drawn for
 * body text on a CRT, and the reason the owner read the product as "old, like
 * Wikipedia" (2026-08-06). D-058's argument for it was that a system face
 * cannot fail to arrive; that argument was already spent, because the reading
 * family is downloaded too. What it bought instead was the voice of an
 * encyclopedia on a product about meeting people on holiday.
 *
 * Emphasis now comes from weight and from a size that is genuinely larger,
 * rather than from a change of species. Nothing sets `fontWeight` on top of
 * these: every weight here is a real cut, and asking the system to embolden a
 * real cut is what produces the smeared type iOS calls synthetic bold.
 */
export const fontFamily = {
  /** A screen title, a name, the match word. */
  display: 'PlusJakartaSans_700Bold',
  /** The heaviest voice: the one-word moment, and nothing routine. */
  displayHeavy: 'PlusJakartaSans_800ExtraBold',
  /** A section heading, a card's own title — display, one weight down. */
  displaySemi: 'PlusJakartaSans_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

/**
 * The type ladder (D-059). Six reading steps and two declared exceptions.
 *
 * The app was rendering twenty-two distinct sizes, which is not a scale — it
 * is twenty-two separate decisions taken on twenty-two different evenings.
 * The screen title was 34 on Tatilim and 26 on Etkinlikler; a card's name was
 * 17, 18 or 19 depending on which card. None of that is legible as a system.
 *
 * Each step is at least 1.18× the one below, so two adjacent sizes always read
 * as *different* rather than as a mistake. Nothing here is smaller than 12:
 * the 9, 10 and 11pt text that had crept in went up, not down.
 */
export const font = {
  /** A tab's screen title, an onboarding question. The first thing read. */
  display: 32,
  /** A sheet's title, a detail header. */
  title: 26,
  /** A section heading, a person's name, a card's own title. */
  heading: 20,
  /** Everything anybody reads: prose, a bio, an input's value, a notice. */
  body: 16,
  /** The supporting line under something. */
  caption: 13,
  /**
   * Tracked and uppercase. Structure, never prose — which is why it is allowed
   * to sit under the smallest reading size: nobody reads a section label, they
   * find it. `scaleLadder.test.ts` names this exception rather than letting it
   * be one more number.
   */
  label: 12,

  /**
   * The label on a thing you press — a button, a chip, a tab.
   *
   * Deliberately one step off the ladder: set semibold, 15 sits optically
   * level with 16 regular beside it, which is why every reference app in this
   * category does the same. It is the only size allowed outside the six above,
   * and only on something operable.
   */
  control: 15,
  /**
   * The match word, and nothing else. The product's one loud moment is allowed
   * to be loud; declaring it here is what stops a second one appearing.
   */
  moment: 44,
} as const;

/**
 * Leading, as ratios rather than as twenty-three hand-typed pixel values.
 * Display type is set tight because it is looked at; prose is set open because
 * it is read.
 */
export const leading = {
  /** Display and title: 32/26/20 set close, the way large type wants. */
  tight: 1.2,
  /** A heading, or a two-line name that should still feel like one object. */
  snug: 1.3,
  /** Prose. */
  normal: 1.45,
} as const;

/**
 * Tracking. Thirteen values were in use; these are the four that had a reason.
 * Large type closes up, small uppercase opens out — the rest is noise.
 */
export const tracking = {
  /**
   * Display type, which sets loose by default and reads dated when left that
   * way. A geometric sans pulled in half a point is where the modern voice
   * actually comes from — more of the emphasis than the weight does.
   */
  display: -0.5,
  none: 0,
  /** A control's label: barely open, so a button reads as a button. */
  control: 0.2,
  /** Uppercase structure — a section label, a badge. */
  label: 1.2,
} as const;

/**
 * The corner ladder (D-059). Twenty-eight distinct radii were in the source;
 * a 14 beside an 18 beside a 20 is three attempts at the same corner.
 *
 * A circle is still computed from its own size (`size / 2`) rather than picked
 * from here — that is geometry, not a choice.
 */
export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  /** The card radius D-058 asks for: 18–22. */
  lg: 20,
  /** A large tile, a photo well, a sheet's top corners. */
  xl: 24,
  /** A hero surface: the deck card, a full-bleed photograph. */
  xxl: 32,
  pill: 999,
} as const;

/**
 * Lift, not glass. A light card is told apart from a light ground by a quiet
 * edge and a soft shadow; Android needs `elevation` for any of it to appear.
 */
export const elevation = {
  /**
   * A card floats (D-060). It used to be fenced: a 1px border plus a tight 6%
   * shadow, which is how a document panel is drawn and not how an object is.
   * The border is gone everywhere and this took over its whole job, so it is
   * wider and softer — a shadow you do not notice until the card is missing.
   */
  card: {
    shadowColor: palette.navy,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
