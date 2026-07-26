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

  onboarding: {
    skip: 'Skip',
    continueButton: 'Continue',
    progressLabel: (step: number, total: number) => `Step ${step} of ${total}`,

    welcome: {
      headline: 'Meet the people already at your hotel.',
      body:
        'One hotel at a time. You say when you are staying — nobody asks for a reservation, a document, or an ID.',
      continueWithPhone: 'Continue with phone',
    },

    promise: {
      headline: 'Adults only, and a short promise.',
      body: 'Vocation Match is for people 18 or older. By continuing you confirm you are at least 18.',
      points: [
        'Be yourself. The name and photo should be you.',
        'Meet in public first, and tell someone where you are going.',
        'Be decent. A conversation you would not want quoted is one to rethink.',
        'Report anything that feels wrong. It reaches a person, and blocking is one tap.',
      ],
      accept: 'I agree',
    },

    phone: {
      headline: 'What is your phone number?',
      body:
        'Include the country code. We only use it to sign you in and never show it on your profile.',
    },
    otp: {
      headline: 'Enter the six-digit code.',
      body: 'We sent it by SMS. The same code flow creates a new account or opens your existing one.',
    },
    name: {
      headline: 'What should we call you?',
      body: 'This is the name on your card. Other people never see anything else.',
    },
    birthdate: {
      headline: 'When were you born?',
      body: 'Only your age is shown. The date itself is never shared with anyone.',
    },
    bio: {
      headline: 'Say something about yourself.',
      body: 'A sentence is plenty. You can change it later.',
    },
    interests: {
      headline: 'What are you into?',
      body: 'A few things worth reading on your card.',
      limit: (max: number) => `Pick up to ${max}. Tap again to remove one.`,
      atLimit: (max: number) => `That is ${max} — remove one to choose another.`,
    },
    photo: {
      headline: 'Add a photo.',
      body:
        'It is stored privately. Only people in a room with you right now, or matched with you, can see it.',
      skip: 'Skip for now',
    },
    hotel: {
      headline: 'Which hotel are you at?',
      body: 'Or which one are you going to. You can be in one hotel at a time, and you can change it whenever you like.',
      confirm: 'Continue',
    },

    teaching: {
      upcoming: {
        title: 'Upcoming',
        body:
          'Say when you will be at the hotel and the Upcoming room opens. It is your word — nobody is asked for a reservation, a booking number, or an ID.',
      },
      hereNow: {
        title: 'Here now',
        /** On the figure, not read aloud — the sentence below it says the same. */
        figureLabel: 'Within 500 m',
        body:
          'One check, while the app is open, of whether you are within 500 m of the hotel. The answer is yes or no. Your position is never stored and never shown to anyone.',
      },
      matching: {
        title: 'Likes and matches',
        body:
          'When two people like each other a conversation opens. Blocking and reporting are there from the first card, before any match exists.',
      },
      next: 'Next',
      start: 'Start looking',
    },
  },

  ageGate: {
    title: 'Adults only',
    body: 'Vocation Match is for people 18 or older. By continuing you confirm you are at least 18.',
    confirm: 'I am 18 or older',
  },

  bootstrap: {
    loading: 'Loading your account…',
    accountLoadError:
      'You are signed in, but your profile could not be loaded. Check your connection and try again.',
  },

  common: {
    loading: 'Loading…',
    retry: 'Try again',
    back: 'Back',
    cancel: 'Cancel',
  },

  phoneAuth: {
    phoneLabel: 'Phone number',
    phonePlaceholder: '+90 555 111 22 33',
    sendCode: 'Send code',
    sending: 'Sending…',
    codeLabel: 'Six-digit SMS code',
    codePlaceholder: '123456',
    verify: 'Confirm code',
    verifying: 'Confirming…',
    resend: 'Send a new code',
    resendIn: (seconds: number) => `Send a new code in ${seconds}s`,
    resent: 'A new code was sent.',
    destination: (maskedPhone: string) => `Code sent to ${maskedPhone}`,
    requestUncertain:
      'The request response did not arrive. If an SMS reaches you, enter its code here. Otherwise wait and send a new one.',
    previewCode: (code: string) => `Preview build code: ${code}`,
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
    birthdateNote:
      'Your date of birth is only used to check you are 18 or older and to show your age. Nobody else ever sees the date itself.',
    photoLater: 'You can add a photo from Settings once this is saved.',
    saveButton: 'Save profile',
    saving: 'Saving…',
  },

  editProfile: {
    title: 'Edit your profile',
    intro: 'Change what other people see. Your photo is managed separately, in Settings.',
    openButton: 'Edit profile',
    saveButton: 'Save changes',
    saving: 'Saving…',
    loadError: 'Could not load your profile. Try again.',
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
    updateButton: 'Update stay dates',
    saving: 'Saving…',
    currentPrefix: 'You have declared',
    withdrawButton: 'Withdraw my stay',
    withdrawing: 'Withdrawing…',
    withdrawExplainer:
      'Withdrawing removes your declared dates and closes the Upcoming room at this hotel. Matches and conversations you already have are kept.',
    withdrawError: 'Could not withdraw your stay. Try again.',
    loadError: 'Could not load your declared stay.',
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
    aboutLabel: 'About',
    // The section heading for the thing that makes this app not a general
    // dating app: the two of you are connected to the same hotel.
    overlapLabel: 'Where you overlap',
    overlapHereNow:
      'You are both within 500 m of this hotel right now. Neither of you can see where the other is.',
    overlapUpcoming:
      'You have both said you will be staying at this hotel. Nobody was asked for a reservation.',
    reportBlockButton: 'Report or block',
    emptyDeck: 'Nobody new in this room right now. Check back later.',
    notEligible: 'Open a room first: declare an upcoming stay or run a presence check.',
    loadError: 'Could not load candidates. Try again.',
  },

  match: {
    title: "It's a match!",
    body: 'Say hello while you are both connected to this hotel.',
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
    youLabel: 'You',
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

  deleteAccount: {
    title: 'Delete your account',
    intro: 'This removes your account from Vocation Match. It cannot be undone.',
    startButton: 'Delete my account',
    // Said before the irreversible tap, not after. Both halves are here on
    // purpose: what disappears, and the one thing that does not.
    whatGoes:
      'Deleted: your profile and photo, your hotel and stay, your likes, your matches, and your conversations. Your conversations disappear from the other person’s inbox too.',
    whatStays:
      'Kept: if anyone reported you, or you reported anyone, that report stays in our safety records with your name removed. Deleting your account is not a way to erase it.',
    noUndo: 'There is no undo, and no way to get the account back.',
    confirmButton: 'Permanently delete my account',
    deleting: 'Deleting…',
    cancelButton: 'Keep my account',
    // Two messages, because the client genuinely knows two different things.
    // When the server answered with a refusal, nothing was deleted and saying
    // so is accurate. When the request never got an answer, the deletion may
    // have committed and the response been lost — claiming "nothing was
    // deleted" there would be a confident statement of something we do not
    // know.
    refused: 'Could not delete your account. Nothing was deleted and you are still signed in. Try again.',
    unconfirmed:
      'We could not confirm whether your account was deleted. You are still signed in. Try again — if it was already deleted, we will tell you.',
  },

  rooms: {
    plainTitle: 'Rooms',
  },

  errors: {
    unauthenticated: 'Sign in again to continue.',
    otpInvalid: 'That code is incorrect or expired. Request a new one and try again.',
    forbidden: "You don't have access to do that.",
    underAge: 'Vocation Match is 18+ only.',
    invalidInput: 'Please check the details you entered.',
    notFound: 'We could not find that.',
    conflict: 'That account could not be opened.',
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
    case 'OTP_INVALID':
      return COPY.errors.otpInvalid;
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
