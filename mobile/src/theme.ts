/** Design tokens. WCAG AA contrast against the paired backgrounds. */
export const color = {
  background: '#FFFFFF',
  surface: '#F4F5F7',
  border: '#D7DAE0',
  textPrimary: '#1A1D23',
  textSecondary: '#4A5160',
  accent: '#0F6B54',
  onAccent: '#FFFFFF',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  badgeUpcoming: '#E7F1EE',
  badgeHereNow: '#E8EEF9',
  badgeTextUpcoming: '#0F6B54',
  badgeTextHereNow: '#1D4C9F',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const font = {
  title: 28,
  heading: 20,
  body: 16,
  caption: 13,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
} as const;

/** Minimum touch target per platform accessibility guidance. */
export const MIN_TOUCH = 44;
