import type { ApiErrorCode, ReportReason, RoomKey, RoomStatus } from './data';

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

  bootstrap: {
    loading: 'Loading your account…',
  },

  common: {
    loading: 'Loading…',
    retry: 'Try again',
    back: 'Back',
    cancel: 'Cancel',
  },

  auth: {
    signInTitle: 'Sign in',
    signInBody: 'Welcome back. Sign in with your email and password.',
    signUpTitle: 'Create your account',
    signUpBody: 'Use an email and password to get started.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    signInButton: 'Sign in',
    signInSubmitting: 'Signing in…',
    signUpButton: 'Create account',
    signUpSubmitting: 'Creating account…',
    switchToSignUp: "Don't have an account? Create one",
    switchToSignIn: 'Already have an account? Sign in',
  },

  profileSetup: {
    title: 'Your profile',
    intro: 'Only your display name, age, and bio are shown to others.',
    nameLabel: 'Display name',
    namePlaceholder: 'How should we show you?',
    nameError: 'Your name needs at least 2 characters.',
    birthdateLabel: 'Date of birth',
    birthdateHint: 'Use the format YYYY-MM-DD, for example 1994-03-01.',
    birthdatePlaceholder: 'YYYY-MM-DD',
    invalidBirthdate: 'Enter your date of birth as YYYY-MM-DD.',
    underAge: 'Vocation Match is 18+ only.',
    bioLabel: 'Bio',
    bioPlaceholder: 'A sentence about you',
    photoLater: 'You can add a photo from Settings once this is saved.',
    saveButton: 'Save profile',
    saving: 'Saving…',
  },

  photo: {
    title: 'Your photo',
    explainer:
      'Your photo is stored privately. Only people in a room with you right now, or matched with you, can see it — there is no public link to it, and nobody can find it by guessing.',
    noPhoto: 'No photo yet. A photo is optional.',
    addButton: 'Add a photo',
    replaceButton: 'Change photo',
    removeButton: 'Remove photo',
    uploading: 'Uploading…',
    removing: 'Removing…',
    permissionDenied:
      'Photo access was declined. You can add a photo later from Settings; nothing else in the app needs it.',
    uploadError: 'Could not upload that photo. Your current photo is unchanged. Try again.',
    removeError: 'Could not remove that photo. Try again.',
  },

  hotel: {
    title: 'Your hotel',
    activeLabel: 'Active hotel.',
    noActiveHotel: 'No active hotel yet.',
    searchLabel: 'Search hotels',
    searchPlaceholder: 'Hotel name or city',
    noResults: 'No hotels match that search.',
    loadError: 'Could not load hotels. Try again.',
    activatedNote: 'This is your active hotel.',
    switchedNotice: 'Switched hotels. Your previous hotel’s rooms are now closed.',
    activateError: 'Could not activate that hotel. Try again.',
    keepCurrent: 'Keep current hotel',
  },

  upcoming: {
    roomTitle: 'Upcoming stays',
    statusBadge: 'Self-declared upcoming stay',
    explainer:
      'Your stay dates are self-declared. Nobody is asked for a reservation, a booking number, or an ID — and neither are you.',
    formTitle: 'When will you be at this hotel?',
    checkInLabel: 'Check-in date',
    checkOutLabel: 'Check-out date',
    dateHint: 'Use the format YYYY-MM-DD, for example 2026-08-01.',
    checkInPlaceholder: '2026-08-01',
    checkOutPlaceholder: '2026-08-08',
    saveButton: 'Save stay dates',
    saving: 'Saving…',
  },

  roomReason: {
    ELIGIBLE_UPCOMING: 'Open — your self-declared stay covers today.',
    ELIGIBLE_HERE_NOW: 'Open — a recent check placed you within 500 m.',
    NO_ACTIVE_HOTEL: 'Activate a hotel first.',
    NO_DECLARATION: 'Closed — declare your stay dates to enter.',
    STAY_ENDED: 'Your declared stay has ended. Update your dates to reopen this room.',
    NO_RECENT_CHECK: 'Closed — run a presence check to enter.',
    TOO_FAR: 'That check placed you more than 500 m from the hotel. Try again when you are closer.',
    loadError: 'Could not load your rooms. Try again.',
  },

  hereNow: {
    roomTitle: 'Here now',
    statusBadge: 'Near the hotel now',
    explainer:
      'Here Now opens after a quick location check while the app is open. It only confirms you were within 500 m of the hotel — your exact location is never shown or stored.',
    checkButton: 'Check my presence',
    realCheckIntro: 'Use your current location for a one-time foreground check. Nothing runs in the background.',
    realCheckButton: 'Use my current location',
    inRange: 'You are in. Here Now is open for this hotel.',
    goToDiscovery: 'Go to discovery',
    stopSharingError:
      'We could not stop sharing your presence. Try again — until this succeeds, Here Now may stay open.',
    simulateIntroPrefix: 'Preview build: these buttons simulate a location read for testing, without needing a real device near',
    simulateAtHotel: 'Simulate: I am at the hotel',
    simulateFarAway: 'Simulate: I am far away',
    simulateDeny: 'Simulate: deny location permission',
    tooFar: 'That check placed you more than 500 m from the hotel. Try again when you are closer.',
    unavailable: 'We could not read your location. Check your device settings and try again.',
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
    likeButton: 'Like',
    passButton: 'Pass',
    reportBlockButton: 'Report or block',
    emptyDeck: 'Nobody new in this room right now. Check back later.',
    notEligible: 'Open a room first: declare an upcoming stay or run a presence check.',
    loadError: 'Could not load candidates. Try again.',
  },

  match: {
    title: "It's a match!",
    body: 'You liked each other. Say hello while you are both connected to this hotel.',
    notAvailable: 'This match is no longer available.',
    keepBrowsing: 'Keep browsing',
  },

  safety: {
    blockButton: 'Block',
    reportButton: 'Report',
    blockConfirm: 'Block this person? They will disappear from your discovery, matches, and inbox.',
    reportIntro:
      'Reports are reviewed by our team and also block this person, so they disappear from your discovery, matches, and inbox.',
    reportReasonLabel: 'What happened?',
    reportDetailsLabel: 'More details (optional)',
    reportDetailsPlaceholder: 'Add anything that helps us review this',
    reportThanks: 'Thanks. Our team will review this report.',
    reportError: 'Could not send that report. Try again.',
    blockError: 'Could not block that person. Try again.',
    reasons: {
      HARASSMENT: 'Harassment or abuse',
      SPAM: 'Spam or scam',
      FAKE_PROFILE: 'Fake profile',
      UNDERAGE: 'Appears underage',
      SAFETY: 'Safety concern',
      OTHER: 'Something else',
    },
  },

  inbox: {
    title: 'Inbox',
    empty: 'No matches yet. Mutual likes appear here.',
    loadError: 'Could not load your matches. Try again.',
    closedLabel: 'Conversation closed',
    sayHelloPreview: 'Say hello!',
  },

  chat: {
    sayHelloTo: 'Say hello to',
    closedNotice: 'This conversation is closed. You can still read the history.',
    messageLabel: 'Message',
    messagePlaceholder: 'Type a message',
    sendButton: 'Send',
    sendingButton: 'Sending…',
    unmatchButton: 'Unmatch',
    reportBlockButton: 'Report or block',
    loadError: 'Could not load this conversation. Try again.',
    sendError: 'Could not send that message. Try again.',
    notAvailable: 'This conversation is no longer available.',
    senderYou: 'You',
    senderMatch: 'Your match',
  },

  settings: {
    title: 'Settings',
    locationTitle: 'Location and privacy',
    locationNote:
      'Vocation Match never tracks you in the background and never shares exact locations.',
    accountTitle: 'Account',
    signOutButton: 'Sign out',
    blockedTitle: 'Blocked people',
    blockedEmpty: 'You have not blocked anyone.',
    blockedLoadError: 'Could not load your blocked list. Try again.',
    unblockButton: 'Unblock',
  },

  rooms: {
    plainTitle: 'Rooms',
  },

  errors: {
    unauthenticated: 'Email or password is incorrect.',
    forbidden: "You don't have access to do that.",
    underAge: 'Vocation Match is 18+ only.',
    invalidInput: 'Please check the details you entered.',
    notFound: 'We could not find that.',
    conflict: 'That email is already registered.',
    rateLimited: 'You are doing that too often. Wait a moment and try again.',
    network: 'No connection. Try again.',
    suspended: 'Your account is suspended. You can still block, report, and read your conversations.',
    unknown: 'Something went wrong. Try again.',
  },
} as const;

/**
 * Copy that needs a value dropped into it. Kept here with the rest rather than
 * inline in a screen, for the same reason: every sentence the app says about a
 * hotel should be readable in one place.
 */
export const COPY_FOR = {
  roomsTitle: (hotelName: string) => `Rooms at ${hotelName}`,
  discoveryTitle: (hotelName: string) => `Discovery at ${hotelName}`,
  switchPrompt: (hotelName: string) => `Switch to ${hotelName}?`,
} as const;

/** Maps a typed `ApiError.code` onto reviewed, trust-copy-safe user text. */
export function apiErrorMessage(code: ApiErrorCode): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return COPY.errors.unauthenticated;
    case 'SUSPENDED':
      return COPY.errors.suspended;
    case 'FORBIDDEN':
      return COPY.errors.forbidden;
    case 'UNDER_AGE':
      return COPY.errors.underAge;
    case 'INVALID_INPUT':
      return COPY.errors.invalidInput;
    case 'NOT_FOUND':
      return COPY.errors.notFound;
    case 'CONFLICT':
      return COPY.errors.conflict;
    case 'RATE_LIMITED':
      return COPY.errors.rateLimited;
    case 'NETWORK':
      return COPY.errors.network;
    case 'UNKNOWN':
    default:
      return COPY.errors.unknown;
  }
}

/**
 * The server decides room eligibility; this only translates its `reason`
 * into the reviewed explanation for the matching room (D-002, owner
 * decision D-007 — never claims a reservation or hotel approval).
 */
export function roomStatusExplanation(room: RoomKey, status: RoomStatus): string {
  if (status.reason === 'ELIGIBLE') {
    return room === 'UPCOMING' ? COPY.roomReason.ELIGIBLE_UPCOMING : COPY.roomReason.ELIGIBLE_HERE_NOW;
  }
  return COPY.roomReason[status.reason];
}

/** Fixed, reviewed labels for the report-reason picker. */
export function reportReasonLabel(reason: ReportReason): string {
  return COPY.safety.reasons[reason];
}
