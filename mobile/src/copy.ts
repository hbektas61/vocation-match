/**
 * All trust-sensitive product copy lives here so it can be reviewed in one
 * place. Owner decision D-007: statuses are described as self-declared or
 * proximity-based — never as "verified", "reservation confirmed", or
 * "hotel approved".
 */
export const COPY = {
  appName: 'Vocation Match',
  tagline: 'Meet people connected to your hotel.',

  ageGate: {
    title: 'Adults only',
    body: 'Vocation Match is for people 18 or older. By continuing you confirm you are at least 18.',
    confirm: 'I am 18 or older',
  },

  auth: {
    title: 'Sign in',
    body: 'Accounts are local placeholders in this preview build. Real sign-in arrives with the backend milestone.',
    continueButton: 'Continue',
  },

  upcoming: {
    roomTitle: 'Upcoming stays',
    statusBadge: 'Self-declared upcoming stay',
    explainer:
      'Your stay dates are self-declared. Nobody is asked for a reservation, a booking number, or an ID — and neither are you.',
    formTitle: 'When will you be at this hotel?',
  },

  hereNow: {
    roomTitle: 'Here now',
    statusBadge: 'Near the hotel now',
    explainer:
      'Here Now opens after a quick location check while the app is open. It only confirms you were within 500 m of the hotel — your exact location is never shown or stored.',
    checkButton: 'Check my presence',
    tooFar: 'That check placed you more than 500 m from the hotel. Try again when you are closer.',
    permissionDenied:
      'Location permission was declined. Here Now needs a one-time foreground check; nothing runs in the background. You can still use Upcoming.',
    expired: 'Your presence check expired. Run a new check to re-enter Here Now.',
  },

  trust: {
    oneHotel: 'You can be active in one hotel at a time.',
    switchWarning:
      'Switching hotels closes your discovery access in the previous hotel immediately. Existing matches and chats are kept.',
    noExactLocation: 'Exact locations and live distances are never shown to anyone.',
  },

  discovery: {
    emptyDeck: 'Nobody new in this room right now. Check back later.',
    notEligible: 'Open a room first: declare an upcoming stay or run a presence check.',
  },

  match: {
    title: "It's a match!",
    body: 'You liked each other. Say hello while you are both connected to this hotel.',
  },

  safety: {
    blockButton: 'Block',
    reportButton: 'Report',
    blockConfirm: 'Block this person? They will disappear from your discovery, matches, and inbox.',
    reportThanks: 'Thanks. Our team will review this report.',
  },

  settings: {
    title: 'Settings',
    locationNote:
      'Vocation Match never tracks you in the background and never shares exact locations.',
    resetButton: 'Reset preview data',
  },
} as const;
