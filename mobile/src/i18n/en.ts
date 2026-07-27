/**
 * Every sentence the app can say, in English. The Turkish sibling lives in
 * `tr.ts` and must keep exactly this shape — the compiler holds the two
 * together, which is what stops a new sentence shipping in one language only.
 *
 * All trust-sensitive product copy lives here so it can be reviewed in one
 * place. Owner decision D-007: statuses are described as self-declared or
 * proximity-based — never as "verified", "reservation confirmed", or
 * "hotel approved".
 */
export const en = {
  tabs: {
    hotel: 'Hotel',
    rooms: 'Rooms',
    discovery: 'Discovery',
    inbox: 'Inbox',
    settings: 'Settings',
  },

  identity: {
    /**
     * Labels for the stored identity values. The values themselves are
     * canonical and never translated — they are what the database holds and
     * what another user's card carries; these maps are only how each language
     * reads them out.
     */
    genders: {
      WOMAN: 'Woman',
      MAN: 'Man',
    } as Record<string, string>,
    orientations: {} as Record<string, string>,
    showMe: {
      WOMEN: 'Women',
      MEN: 'Men',
      EVERYONE: 'Everyone',
    } as Record<string, string>,
  },

  language: {
    label: 'Language',
    en: 'English',
    tr: 'Türkçe',
  },

  appName: 'Vacation Match',
  tagline: 'Meet people connected to your hotel.',

  onboarding: {
    skip: 'Skip',
    continueButton: 'Continue',
    progressLabel: (step: number, total: number) => `Step ${step} of ${total}`,

    welcome: {
      headline: 'Meet the people already at your hotel.',
      body:
        'Pick the hotel you are at — or the one you are going to — and match with the people there when you are. One hotel at a time.',
      continueWithPhone: 'Continue with phone',
      trustTitle: 'Safe and private',
      trustBody: 'Your identity stays private. No reservation, document, or ID is asked for.',
      howItWorks: 'How does it work?',
    },

    promise: {
      headline: 'Adults only, and a short promise.',
      body: 'Vacation Match is for people 18 or older. By continuing you confirm you are at least 18.',
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
    gender: {
      headline: 'I am a',
      body: 'However you describe yourself. You choose separately whether it appears on your card.',
      more: 'More',
      moreHeadline: 'How do you describe yourself?',
      showOnProfile: 'Show my gender on my profile',
    },
    orientation: {
      headline: 'My sexual orientation is',
      limit: (max: number) => `Select up to ${max}`,
      showOnProfile: 'Show my orientation on my profile',
      // Said plainly, because the opposite assumption is the common one.
      notAFilter: 'This is never used to decide who you are shown.',
    },
    showMe: {
      headline: 'Show me',
      body: 'This shapes your own feed. It is never shown on your profile.',
    },
    interests: {
      headline: 'Passions',
      body: 'Let everyone know what you are passionate about, by adding it to your profile.',
      counter: (chosen: number, max: number) => `Continue ${chosen}/${max}`,
      limit: (max: number) => `Pick up to ${max}. Tap again to remove one.`,
      atLimit: (max: number) => `That is ${max} — remove one to choose another.`,
    },
    photo: {
      headline: 'Add a photo.',
      body:
        'It is stored privately. Only people in a room with you right now, or matched with you, can see it.',
      skip: 'Skip for now',
      done: 'Done',
    },
    hotel: {
      headline: 'Which hotel are you at?',
      body: 'Or which one are you going to. You can be in one hotel at a time, and you can change it whenever you like.',
      confirm: 'Continue',
    },

  },

  ageGate: {
    title: 'Adults only',
    body: 'Vacation Match is for people 18 or older. By continuing you confirm you are at least 18.',
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
    // The country code is drawn beside the box and is not editable, so the
    // placeholder shows only the part somebody actually types.
    phonePlaceholder: '555 111 22 33',
    countryPrefix: '+90',
    /** Read out as the field's accessible name, since "+90" is not spoken by the box. */
    phoneAccessibleLabel: 'Phone number, Turkey, country code plus 90',
    incomplete: 'That number is not finished yet — a Turkish mobile number has 10 digits.',
    notMobile: 'That does not look like a mobile number. Turkish mobile numbers start with 5.',
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
    birthdateHint: 'Day, month, year — for example 01/03/1994.',
    birthdatePlaceholder: 'DD/MM/YYYY',
    invalidBirthdate: 'That is not a date on the calendar. Check the day and the month.',
    incompleteBirthdate: 'That date is not finished yet.',
    futureBirthdate: 'That date has not happened yet.',
    underAge: 'Vacation Match is 18+ only.',
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

    /** The grid. */
    gridTitle: 'Add photos',
    gridHint: (max: number) =>
      `Up to ${max}. Hold a photo and drag it to change the order — the first is what people see first.`,
    /** Spoken to a screen reader instead of the drag, which it cannot perform. */
    dragHint: 'Use the available actions to change this photo\u2019s position.',
    slotLabel: (slot: number) => `Photo ${slot}`,
    emptySlotLabel: (slot: number) => `Add photo ${slot}`,
    primaryBadge: 'First',
    moveEarlier: (slot: number) => `Move photo ${slot} earlier`,
    moveLater: (slot: number) => `Move photo ${slot} later`,
    removeAt: (slot: number) => `Remove photo ${slot}`,
    reorderError: 'Could not change the order. Try again.',
    full: (max: number) => `That is ${max} photos — remove one to add another.`,
  },

  hotel: {
    title: 'Your hotel',
    activeLabel: 'Active hotel.',
    activePlate: 'Active hotel',
    emptyTitle: "You haven't chosen a hotel yet",
    emptyBody: 'Search for the hotel you are at or going to. The rooms open by the hotel you choose.',
    emptyBadge: 'Hotel selection required',
    quickOptions: 'Quick options',
    lastSearch: 'Last search',
    popularTitle: 'Popular destinations',
    activateCta: (name: string) => `Activate ${name}`,
    switchButton: 'Switch hotel',
    noActiveHotel: 'No active hotel yet.',
    searchLabel: 'Search hotels',
    searchHint: 'You can search to choose a different hotel.',
    selectedActive: 'Selected • Active',
    detailsCta: 'See hotel details',
    detailsTitle: 'Hotel details',
    addressLabel: 'Address',
    searchPlaceholder: 'Hotel name or city',
    chooseTitle: 'Choose your hotel',
    // ODbL: storing OSM data requires saying where it came from, where people
    // can see it. This caption is a licence term, not decoration.
    attribution: 'Hotel data © OpenStreetMap contributors',
    chooseCta: 'Choose a hotel',
    searchPrompt: 'Type a hotel name to search.',
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
    /** The designer's screen furniture (2026-07-27). */
    privacyNote: 'No booking number or ID details are needed, and nothing is shared with anyone.',
    updateLater: 'You can update the dates later.',
    invalidFormat: 'Enter both dates as YYYY-MM-DD.',
    checkoutNotAfter: 'Check-out must be after check-in.',
    stayEnded: 'That stay has already ended. Enter a current or future stay.',
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
    /** The card's top-right chip: the one bond this product can print. */
    sameHotel: 'Same hotel',
    overlapUpcoming:
      'Your stays at this hotel overlap. Nobody was asked for a reservation.',
    reportBlockButton: 'Report or block',
    /**
     * The empty room, per the owner's reference: a headline, one calm
     * sentence, and a scan-again action under the radar drawing. No
     * apology, no "unfortunately" — an empty room is a fact, not a failure.
     */
    emptyTitle: 'No one here yet',
    emptyBody: 'Nobody is waiting in this room right now. Check back in a little while.',
    rescan: 'Scan again',
    /** Discovery before any door is open — the orbit screen's words. */
    noHotelTitle: 'Choose a hotel to discover',
    noHotelBody: 'Once you choose a hotel, the rooms and people open to you will show up here.',
    howItWorks: 'How does it work?',
    howItWorksBody:
      'There are two rooms. Upcoming opens when you declare your stay dates; Here Now opens with a one-time check that you are within 500 m of the hotel. The people in a room appear here, in Discovery.',
    noRoomTitle: "You haven't entered a room yet",
    noRoomBody:
      'Join a room or run a proximity check before you start discovering. The rooms open to you will show up here.',
    goToRooms: 'Go to rooms',
    checkProximity: 'Check my proximity',
    loadError: 'Could not load candidates. Try again.',
  },

  match: {
    bothAtPlate: 'You are both at',
    likedEachOther: (name: string) => `You and ${name} liked each other.`,
    sayHelloCta: (name: string) => `Say hello to ${name}`,
    selfFallback: 'You',
    title: "It's a match!",
    body: 'Say hello while you are both connected to this hotel.',
    notAvailable: 'This match is no longer available.',
    keepBrowsing: 'Keep browsing',
  },

  safety: {
    title: 'Safety',
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
    newMatches: 'New matches',
    sayHello: 'Say hello',
    openChatHint: 'Open chat',
    subtitle: 'Your matches and your conversations.',
    searchPlaceholder: 'Search conversations',
    searchLabel: 'Search conversations',
    chats: 'Chats',
    yesterday: 'Yesterday',
    emptyTitle: 'No matches yet',
    emptyBody: 'When you like each other, conversations will start here.',
    startDiscovering: 'Start discovering',
    viewRooms: 'View rooms',
    /**
     * "Show up here", not "you will be notified": there is no match push
     * (D-031 has exactly two kinds), so the sentence promises the inbox,
     * not the lock screen.
     */
    matchesAppearHere: 'New matches show up right here.',
    loadError: 'Could not load your matches. Try again.',
    closedLabel: 'Conversation closed',
    sayHelloPreview: 'Say hello!',
  },

  chat: {
    today: 'Today',
    moreActions: 'Conversation actions',
    title: 'Chat',
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
      'Vacation Match never tracks you in the background and never shares exact locations.',
    accountTitle: 'Account',
    signOutButton: 'Sign out',
    blockedTitle: 'Blocked people',
    blockedEmpty: 'You have not blocked anyone.',
    blockedLoadError: 'Could not load your blocked list. Try again.',
    unblockButton: 'Unblock',
  },

  deleteAccount: {
    title: 'Delete your account',
    intro: 'This removes your account from Vacation Match. It cannot be undone.',
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
    subtitle: 'Choose a way to join a room',
    openChip: 'Open',
    closedChip: 'Closed',
    upcomingPlate: 'Upcoming',
    hereNowPlate: 'Here now',
    /**
     * The designer's card texts (2026-07-27) are the reviewed explainers
     * split in two: the claim in bold, the trust sentence under it.
     */
    noHotelTitle: 'Choose a hotel first',
    noHotelBody: "You haven't chosen a hotel yet. Once you do, the rooms will be listed here.",
    viewHotels: 'View hotels',
    upcomingLead: 'Your stay dates are self-declared.',
    upcomingBody: 'Nobody is asked for a reservation, a booking number, or an ID — and neither are you.',
    hereNowLead: 'Here Now opens with a quick location check made while the app is open.',
    hereNowBody: 'It only confirms you are within 500 m of the hotel — your exact location is never shown or stored.',
    privacyTitle: 'Your privacy matters here',
    privacyBody: 'Your exact location is never shown or stored. You can delete your account and data at any time.',
  },

  errors: {
    unauthenticated: 'Sign in again to continue.',
    otpInvalid: 'That code is incorrect or expired. Request a new one and try again.',
    forbidden: "You don't have access to do that.",
    underAge: 'Vacation Match is 18+ only.',
    invalidInput: 'Please check the details you entered.',
    notFound: 'We could not find that.',
    conflict: 'That account could not be opened.',
    rateLimited: 'You are doing that too often. Wait a moment and try again.',
    network: 'No connection. Try again.',
    suspended: 'Your account is suspended. You can still block, report, and read your conversations.',
    unknown: 'Something went wrong. Try again.',
  },
};

/** Sentences that need a value dropped in. */
export const enFor = {
  roomsTitle: (hotelName: string | null) =>
    hotelName ? `Rooms at ${hotelName}` : 'Rooms at your hotel',
  discoveryTitle: (hotelName: string) => `Discovery at ${hotelName}`,
  switchPrompt: (hotelName: string) => `Switch to ${hotelName}?`,
  daysAgo: (days: number) => `${days}d`,
  /**
   * Shown only when the server sent a number, which it does only at five or
   * more people (D-032). There is no wording for "a few" on purpose: below
   * the threshold the room says nothing at all.
   */
  roomHeadcount: (count: number) => `${count} people`,
};

export type Copy = typeof en;
export type CopyFor = typeof enFor;
