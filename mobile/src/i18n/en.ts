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
    vacation: 'My trip',
    nearbyTab: 'Nearby',
    discovery: 'Discovery',
    inbox: 'Inbox',
    /**
     * D-057: the bottom bar's fifth label. Shorter than the screen's own title
     * ("Inbox" stays the heading) because five labels have to fit at 320 px
     * without any of them being shrunk.
     */
    messages: 'Messages',
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
        'Pick the place you are at — or the one you are going to — and match with the people there when you are. One place at a time.',
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
      selectedCount: (chosen: number, max: number) => `${chosen} / ${max} selected`,
    },
    photo: {
      headline: 'Add a photo.',
      body:
        'It is stored privately. Only people in a room with you right now, or matched with you, can see it.',
      skip: 'Skip for now',
      done: 'Done',
    },
    hotel: {
      headline: 'Where are you staying?',
      body: 'Or where are you going. You can be at one vacation place at a time, and you can change it whenever you like.',
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
    emptyTitle: "You haven't chosen a vacation place yet",
    emptyBody:
      'Choose where you are going first, then the place inside it. The rooms open by the place you choose.',
    emptyBadge: 'A vacation place is required',
    quickOptions: 'Quick options',
    lastSearch: 'Last search',
    popularTitle: 'Popular destinations',
    activateCta: (name: string) => `Activate ${name}`,
    switchButton: 'Change vacation place',
    noActiveHotel: 'No active vacation place yet.',
    searchLabel: 'Search hotels',
    searchHint: 'You can search to choose a different hotel.',
    selectedActive: 'Selected · Active',
    detailsCta: 'See hotel details',
    detailsTitle: 'Hotel details',
    backToPlan: 'Back to your trip plan',
    addressLabel: 'Address',
    searchPlaceholder: 'Hotel name or city',
    chooseTitle: 'Choose your hotel',
    // ODbL: storing OSM data requires saying where it came from, where people
    // can see it. This caption is a licence term, not decoration.
    attribution: 'Hotel data © OpenStreetMap contributors',
    chooseCta: 'Where are you going?',
    searchPrompt: 'Type a hotel name to search.',
    noResults: 'No hotels match that search.',
    loadError: 'Could not load hotels. Try again.',
    activatedNote: 'This is your active vacation place.',
    switchedNotice: 'Switched hotels. Your previous hotel’s rooms are now closed.',
    activateError: 'Could not activate that hotel. Try again.',
    keepCurrent: 'Keep current hotel',
  },

  /**
   * Choosing where the holiday is (D-054). Two steps, because they are two
   * different questions: a destination, and then somewhere inside it — which
   * may be a hotel, a resort, a beach club or a named beach, so nothing here
   * says "hotel".
   */
  /** The fourth primary feature (D-056). */
  events: {
    tab: 'Events',
    title: 'Events',
    subtitle: 'Match with the people going to the same event.',
    todayHeading: 'Today',
    upcomingHeading: 'Upcoming events',
    areaLabel: 'Event area',
    changeArea: 'Change location',
    useMyLocation: 'Use my current location',
    chooseArea: 'Choose where to look',
    areaPlaceholder: 'İstanbul, London, Las Vegas…',
    /** D-057: short badges for a card; the headings stay longer. */
    badgeToday: 'Today',
    badgeUpcoming: 'Upcoming',
    /** Shown in place of a spinner when results are already on screen (E-06). */
    refreshing: 'Refreshing…',
    chipAll: 'All',
    chipMusic: 'Music & festivals',
    chipSports: 'Sports',
    chipArts: 'Stage & comedy',
    /** Required wherever provider content is drawn. */
    attribution: 'Powered by Ticketmaster',
    /**
     * §3.4 — nine distinct states, because a spinner that means all of them
     * is a screen that looks broken in eight.
     */
    noResults: 'No events found here for these dates.',
    notEverything: 'Not every event may be listed here.',
    providerUnavailable: 'Event search is unavailable right now. Try again later.',
    ceilingReached: 'Event search has reached today’s limit. Try again tomorrow.',
    offline: 'No connection. Try again.',
    disabled: 'Events are not open yet.',
    permissionDenied: 'Location permission is needed to search around you.',
    joinUpcoming: 'I am going',
    joinHereNow: 'I am at the event now',
    joining: 'Saving…',
    checkingLive: 'Checking…',
    roomChoiceTitle: 'How do you want to join this event?',
    /**
     * The live room's own card had the button's words as its heading — "I am
     * at the event now" printed twice, one above the other. This says what the
     * card is for instead, and keeps the promise the room rests on.
     */
    hereNowExplainer:
      'The live room opens with a one-time location check while the app is open. It only confirms you are at the event — never a ticket, and never your exact location.',
    joined: 'You are going. The room is open.',
    joinedRoomCta: 'See who is going',
    liveRoomCta: 'See who is here now',
    withdraw: 'I am not going any more',
    /** E-24: withdrawing closes a room, so it asks first — as switching places does. */
    withdrawConfirm: 'Not going any more?',
    withdrawBody:
      'You leave this event\u2019s room and stop appearing in its deck. Existing matches and chats are kept, and you can join again whenever you like.',
    withdrawYes: 'Yes, withdraw',
    /** E-22: what going actually means, said before it is declared. */
    joinExplainer:
      'This is a declaration, not proof of a ticket \u2014 and no ticket is asked of anyone.',
    cancelled: 'This event has been cancelled.',
    postponed: 'This event has been postponed.',
    dateTbd: 'The date is not confirmed yet.',
    /** §8.2: a date-only event gets UPCOMING and an honest no for the rest. */
    hereNowUnavailableTbd:
      'The live room opens once the event time is confirmed.',
    hereNowLocationUnavailable:
      'This event’s location is not published, so the live room cannot open.',
    hereNowNotStarted: 'The live room opens two hours before the event.',
    hereNowFinished: 'This event is over.',
    hereNowInaccurate: 'Your location is not precise enough. Step outside and try again.',
    hereNowTooFar: 'That check could not find you at the event. Try again when you are there.',
    hereNowOpen: 'You are in. The live room is open.',
    /** §10.2: after the lease ends there is nothing of theirs left to draw. */
    pastEvent: 'Past event',
    /** D-007's rule, in the event room's own words. */
    noTicketClaim: 'A location check is not a ticket, and nobody is asked for one.',
    myEvents: 'Your events',
    emptyTitle: 'No events yet',
    emptyBody: 'Choose where to look, then pick an event to meet the people going.',
  },

  venue: {
    destinationTitle: 'Where are you going?',
    destinationHint: 'Search for a city, island or holiday area',
    destinationLabel: 'Search destinations',
    destinationPlaceholder: 'Alaçatı, Çeşme, Mykonos…',
    destinationNoResults: 'No places match that search.',
    destinationChosen: (name: string) => `Where will you be in ${name}?`,
    changeDestination: 'Change destination',
    venueLabel: 'Search places',
    venuePlaceholder: 'Hotel, resort or beach',
    venueNoResults: 'Nothing by that name in this area.',
    venuePrompt: 'Type the name of the place you will stay at.',
    chipAll: 'All',
    chipStay: 'Stay',
    minQuery: 'Type at least three letters.',
    /** The attribution Google's policies require wherever its data is drawn. */
    attribution: 'Powered by Google',
    unavailable: 'Place search is unavailable right now. Try again later.',
    /**
     * The name is not stored — it is fetched for the screen that draws it — so
     * there is a real state where we have the place and not its name. It says
     * so rather than inventing one.
     */
    nameUnavailable: 'Place details are unavailable right now',
  },

  upcoming: {
    roomTitle: 'Before the trip',
    statusBadge: 'Self-declared upcoming stay',
    explainer: 'Your stay dates are self-declared. No reservation, no documents, no ID — your word is enough.',
    formTitle: 'When will you be at this place?',
    checkInLabel: 'Check-in date',
    checkOutLabel: 'Check-out date',
    dateHint: 'Use the format YYYY-MM-DD, for example 2026-08-01.',
    checkInPlaceholder: '2026-08-01',
    checkOutPlaceholder: '2026-08-08',
    saveButton: 'Save stay dates',
    /** The designer's screen furniture (2026-07-27). */
    privacyNote: 'No booking number or ID details are needed, and nothing is shared with anyone.',
    datesPrivacy: 'Only people whose dates overlap yours learn them; no documents are shown to anyone.',
    updateLater: 'You can update the dates later.',
    pickDate: 'Pick a date',
    invalidFormat: 'Enter both dates as YYYY-MM-DD.',
    checkoutNotAfter: 'Check-out must be after check-in.',
    stayEnded: 'That stay has already ended. Enter a current or future stay.',
    updateButton: 'Update stay dates',
    saving: 'Saving…',
    currentPrefix: 'You have declared',
    withdrawButton: 'Withdraw my stay',
    withdrawing: 'Withdrawing…',
    withdrawExplainer:
      'Withdrawing removes your declared dates and closes Before the Trip at this hotel. Matches and conversations you already have are kept.',
    withdrawError: 'Could not withdraw your stay. Try again.',
    loadError: 'Could not load your declared stay.',
  },

  roomReason: {
    ELIGIBLE_UPCOMING: 'Open — your self-declared stay covers today.',
    ELIGIBLE_HERE_NOW: 'Open — a recent check found you at the hotel.',
    NO_ACTIVE_HOTEL: 'Activate a hotel first.',
    NO_DECLARATION: 'Closed — declare your stay dates to enter.',
    STAY_ENDED: 'Your declared stay has ended. Update your dates to reopen this room.',
    NO_RECENT_CHECK: 'Closed — run a presence check to enter.',
    TOO_FAR: 'That check could not find you near the hotel. Try again when you are there.',
    PREMIUM_ONLY: 'At the Hotel is for Premium members.',
    loadError: 'Could not load your rooms. Try again.',
  },

  hereNow: {
    roomTitle: 'At the hotel',
    statusBadge: 'Near the hotel now',
    explainer:
      'At the Hotel opens after a one-time location check while the app is open. It only confirms you are at the place — your exact location is never shown or stored.',
    checkButton: 'Check place proximity',
    realCheckIntro: 'Use your current location for a one-time foreground check. Nothing runs in the background.',
    realCheckButton: 'Use my current location',
    /**
     * A disabled button with an unchanged label tells nobody that their press
     * registered. This check can also wait on a permission prompt, so the
     * screen has to say what it is doing rather than just going quiet.
     */
    checking: 'Checking…',
    inRange: 'You are in. At the Hotel is open for this place.',
    goToDiscovery: 'Go to discovery',
    stopSharingError:
      'We could not stop sharing your presence. Try again — until this succeeds, At the Hotel may stay open.',
    simulateIntroPrefix: 'Preview build: these buttons simulate a location read for testing, without needing a real device near',
    simulateAtHotel: 'Simulate: I am at the hotel',
    simulateFarAway: 'Simulate: I am far away',
    simulateDeny: 'Simulate: deny location permission',
    tooFar: 'That check could not find you near the place. Try again when you are there.',
    unavailable: 'We could not read your location. Check your device settings and try again.',
    /**
     * D-055a: a fix too vague to settle the question is neither "you are here"
     * nor "you are not". Saying so is the difference between a room that
     * refuses honestly and one that quietly opens on a kilometre of error.
     */
    inaccurate: 'Your location is not precise enough. Step outside and try again.',
    /**
     * R-011: the two location refusals are results, not banners, so each one
     * gets a heading, an explanation and two named ways on.
     *
     * None of these sentences may contain a distance, a direction or a
     * radius. The server answers with a boolean; the screen says exactly that
     * and no more (D-005). "Not at the place" is the whole fact.
     */
    whatHappened: 'What happened?',
    retry: 'Try again',
    tooFarTitle: 'Not at the place yet',
    tooFarWhat:
      'The check runs once, while the app is open, and it only answers whether you are at your vacation place. This time the answer was no, so At the Hotel stays closed. Run it again once you have arrived — nothing about where you were is kept.',
    inaccurateTitle: 'We could not tell',
    inaccurateWhat:
      'Your device answered, but not precisely enough to settle the question — indoors, in a basement or with a weak signal it often cannot. Nothing was recorded, and this is not a "no". Step outside, give it a moment, and check again.',
    /** The room that is open to somebody who is not at the place yet. */
    seeUpcoming: 'See who is going',
    addDates: 'Add your stay dates',
    permissionDenied:
      'Location permission was declined. At the Hotel needs a one-time foreground check; nothing runs in the background. You can still use Before the Trip.',
    expired: 'Your presence check expired. Run a new check to re-enter At the Hotel.',
    premiumOnly:
      'At the Hotel is for Premium members. Premium also removes the like limit in Before the Trip. Buying Premium inside the app is not open yet.',
  },

  trust: {
    oneHotel: 'You can be active in one vacation place at a time.',
    switchWarning:
      'Changing your vacation place closes discovery at the previous one immediately. Existing matches and chats are kept.',
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
      'You are both at this hotel right now. Neither of you can see where the other is.',
    /** The card's top-right chip: the one bond this product can print. */
    sameHotel: 'Same hotel',
    nearby: 'nearby',
    overlapUpcoming:
      'Your stays at this hotel overlap. Nobody was asked for a reservation.',
    reportBlockButton: 'Report or block',
    /**
     * The empty room, per the owner's reference: a headline, one calm
     * sentence, and a scan-again action under the radar drawing. No
     * apology, no "unfortunately" — an empty room is a fact, not a failure.
     */
    emptyTitle: 'No one here yet',
    emptyBody: 'Nobody is waiting in this room right now. The radar is on — when somebody arrives, they appear here.',
    rescan: 'Scan again',
    rescanning: 'Scanning…',
    /** Discovery before any door is open — the orbit screen's words. */
    noHotelTitle: 'Choose a hotel to discover',
    noHotelBody: 'Once you choose a hotel, the rooms and people open to you will show up here.',
    howItWorks: 'How does it work?',
    howItWorksBody:
      'There are two rooms. Before the Trip opens when you declare your stay dates; At the Hotel opens with a one-time location check made at the hotel. The people in a room appear here, in Discovery.',
    /** D-057: the shared context selector over the one deck. */
    contextTitle: 'Which room are you exploring?',
    contextHint: 'Opens the list of your open rooms',
    /** On the control itself — short, and not the screen's own heading. */
    contextNoneOpen: 'No open room',
    contextKeepsMembership: 'Switching rooms does not end your membership.',
    contextOneLive: 'Only one live event check is active at a time. Your vacation venue stays open.',
    contextNeedsCheck: 'A proximity check is needed.',
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
    /**
     * D-057: the match moment names the room it came from. One screen, five
     * sources — an event match that said "connected to this hotel" was simply
     * describing the wrong thing.
     */
    sourceUpcoming: 'Your dates overlap',
    sourceHereNow: 'You are both here right now',
    sourceNearby: 'You are at the same place',
    sourceNearbyRegion: 'You are in the same area',
    sourceEventUpcoming: 'You are going to the same event',
    sourceEventHereNow: 'You are at the same event right now',
    bodyUpcoming: 'No reservation was asked of either of you.',
    bodyHereNow: 'Neither of you can see where the other is.',
    bodyNearby: 'Exact locations and live distances are never shown.',
    bodyEventUpcoming: 'No ticket was asked of either of you.',
    bodyEventHereNow: 'A location check is not a ticket check.',
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
    viewRooms: 'Set up my trip',
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
    messagePlaceholder: 'Write a message…',
    sendButton: 'Send',
    sendingButton: 'Sending…',
    unmatchButton: 'Unmatch',
    /**
     * Unmatching closes the conversation for both people and cannot be undone
     * from here. Blocking asks first, leaving an event room asks first, and
     * switching a vacation place asks first — this was the one that fired on
     * the first press, from a menu item sitting next to "Report or block".
     */
    unmatchConfirm: 'Unmatch with this person?',
    unmatchBody:
      'The conversation closes for both of you and you stop appearing in each other’s decks. The history stays readable, and nothing either of you wrote is deleted.',
    unmatchYes: 'Yes, unmatch',
    reportBlockButton: 'Report or block',
    loadError: 'Could not load this conversation. Try again.',
    sendError: 'Could not send that message. Try again.',
    notAvailable: 'This conversation is no longer available.',
    senderYou: 'You',
    senderMatch: 'Your match',
  },

  settings: {
    title: 'Settings',
    /**
     * D-057: the accessible name of the corner ring. It opens the profile as
     * well as Settings, and after the tab was removed this is the only route
     * to either — so it must not announce itself as just one of them.
     */
    ringLabel: 'Your profile and settings',
    youLabel: 'You',
    locationTitle: 'Location and privacy',
    locationNote:
      'Vacation Match never tracks you in the background and never shares exact locations.',
    accountTitle: 'Account',
    signOutButton: 'Sign out',
    blockedTitle: 'Blocked people',
    blockedEmpty: 'You have not blocked anyone.',
    /** D-053 §6: what Google's part actually is, in plain words. */
    providersTitle: 'Data providers',
    providersOpen:
      'Venue lists come from open datasets: OpenStreetMap (ODbL) and Overture Maps. We keep and show those records in our own catalogue.',
    providersGoogle:
      'When a place is missing from the open catalogue you can use “Search more places with Google”. Only then, and only the text you typed plus your current location, goes to Google Places — nothing is ever called in the background.',
    providersGoogleStorage:
      'We do not store the name Google returns. We keep only Google’s place identifier (Place ID); the name is resolved at the moment it must be shown and stays in that session’s memory alone. We never ask for and never store Google’s coordinates — proximity is worked out from our own data.',
    /** D-054: Google is no longer only the check-in escape hatch. */
    providersVenue:
      'Choosing where you are staying also goes through Google Places: a destination first, then a place inside it. Of whatever you choose we keep only Google’s place identifier — never Google’s name, address, photograph or coordinates. The name on your card is fetched again each time a screen needs to show it.',
    providersRetention:
      'Your check-in lapses by itself after 3 hours. Your location reading is kept rounded to a coarse area; the raw reading is never written down and never shown to anyone.',
    providersTerms:
      'Using the advanced search also brings Google Maps/Google Places terms and Google’s privacy policy into play.',
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
    upcomingPlate: 'Before the trip',
    hereNowPlate: 'At the hotel',
    nearbyPlate: 'Nearby',
    /**
     * The designer's card texts (2026-07-27) are the reviewed explainers
     * split in two: the claim in bold, the trust sentence under it.
     */
    noHotelTitle: 'Choose a hotel first',
    noHotelBody: "You haven't chosen a hotel yet. Once you do, the rooms will be listed here.",
    viewHotels: 'View hotels',
    upcomingLead: 'Your stay dates are self-declared.',
    upcomingBody: 'Nobody is asked for a reservation, a booking number, or an ID — and neither are you.',
    hereNowLead: 'At the Hotel opens with a one-time location check made while the app is open.',
    hereNowBody: 'It only confirms you are at the hotel — your exact location is never shown or stored.',
    privacyTitle: 'Your privacy matters here',
    privacyBody: 'Your exact location is never shown or stored. You can delete your account and data at any time.',
  },

  /**
   * D-039 — "Çevremde": free venue check-ins. Copy promises only what the
   * feature does: a venue name, a three-hour clock, mutual visibility. No
   * word about exact locations or distances, because there are none.
   */
  /** D-040 — the My trip tab: hotel choice and its two features, one place. */
  vacation: {
    planTitle: 'Plan your trip',
    subtitle: 'Choose the place your trip starts at.',
    upcomingFeatureBody: 'Meet the people who will be at the same place on the same dates — before the trip.',
    hereNowFeatureBody: 'At the place? One foreground location check, and you meet who is there right now.',
    chooseFirst: 'Choose a place first',
    premiumTag: 'Premium',
    freeTag: 'Free',
    discoverCta: 'Discover people',
    changeHotel: 'Change vacation place',
  },

  checkin: {
    roomTitle: 'Nearby',
    openCta: 'Check in',
    manageButton: 'Manage check-in',
    cardLead: 'Check in where you are, see who is out nearby.',
    cardBody:
      'A check-in names a place — never your exact location — and lasts 3 hours.',
    statusOpen: 'Open — your check-in is fresh.',
    statusClosed: 'Closed — check in at a place to enter.',
    explainer:
      'One location reading lists the places around you — tap one and you are checked in. Only the place and a clock are kept, never the reading.',
    findVenues: 'Find places around me',
    aroundYou: 'Around you',
    noVenues: 'No listed places here yet. Search the place you are at by name below.',
    searchFallback: 'Your place not listed? Search it by name.',
    /** D-048: the anchor that always exists — where you are standing. */
    hereLabel: 'Where you are',
    hereCta: "I'm here — see who is around",
    /** D-052: the picker's third step, opened by hand and never on arrival. */
    googleMore: 'Search more places with Google',
    /**
     * N-07. Deliberately about the *check-in*, not about searching: the right
     * is spent only when a Google-labelled check-in completes. Searching,
     * finding nothing, cancelling or a provider failure all cost nothing.
     */
    entitlementLeft: (left: number, limit: number) =>
      `${left} of ${limit} Google-backed check-ins left this month`,
    entitlementNone: 'You have used this month\u2019s Google-backed check-ins. The list and \u201CI am here\u201D still work.',
    googleUnavailable: "The extra search is unavailable right now. Pick from the list, or say you are here.",
    /** Google answered, and knows no such place — not the same as unavailable. */
    googleNoResults: 'Google knows no place by that name near here. Try another spelling, or say you are here.',
    /** Required whenever Google's answer is on screen. */
    googleAttribution: 'Powered by Google',
    /** ODbL: the catalogue list is OpenStreetMap/Overture data, and says so. */
    catalogAttribution: 'Place data © OpenStreetMap contributors',
    searchPlaceholder: 'Search a place or neighbourhood',
    listSubtitle: 'Discover the places near you and meet the people who are there.',
    idleSubtitle: 'Meet the holidaymakers near you — an instant bond at the same place.',
    introTitle: 'Same place, no searching.',
    introBody:
      'Pick one place, check in, and see the holidaymakers around you. You are active only at that place, and only for 3 hours.',
    howTitle: 'How does it work?',
    howLocation: 'Starts with a single location reading',
    howFree: 'Free for everyone',
    howDuration: 'A check-in lasts 3 hours',
    howPrivacy: 'Privacy comes first',
    expiredTitle: 'Your check-in has ended',
    expiredBody:
      'The check-in ran out. Pick a place and check in again to keep seeing who is around.',
    privacyCardBody:
      'Only the name of the place you chose is shown — never your exact location. And you are visible only while you also have a check-in.',
    activeSubtitle: 'While your check-in is active, you are visible to the people at your chosen place.',
    activeChip: 'Check-in active',
    safeTitle: 'Safe and free',
    safeCheck: 'Exact locations and live distances are never shown to anyone.',
    kindHotel: 'Hotel',
    kindCafe: 'Cafe',
    kindRestaurant: 'Restaurant',
    kindBar: 'Bar',
    kindBeach: 'Beach',
    kindArea: 'Neighbourhood',
    kindVenue: 'Place',
    previewIntro: 'Preview build: simulate a reading without a device.',
    simulateShore: 'Simulate: I am at the Lara shore',
    tooFar: 'That reading could not find you at this place. Pick the place you are actually at.',
    seeNearby: 'Discover who is nearby',
    stayHere: 'Stay here',
    changeCheckin: 'Change check-in',
    success: 'Checked in — good for 3 hours.',
    factFree: 'Free for everyone; no hotel needed.',
    factDuration: 'A check-in lasts 3 hours and can be ended any time.',
    checkOut: 'End check-in',
    checkedOut: 'Your check-in has ended.',
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
    premiumRequired:
      'That needs Premium. Free members get 3 likes and 5 passes in Before the Trip.',
    destinationRequired: 'Choose where you are going first.',
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
  /** Beside a section heading: how many the provider returned. */
  eventCount: (count: number) => `${count} events`,
  /**
   * Shown only when the server sent a number, which it does only at five or
   * more people (D-032). There is no wording for "a few" on purpose: below
   * the threshold the room says nothing at all.
   */
  roomHeadcount: (count: number) => `${count} people`,
  /** The active check-in line: the venue, and when it lapses. */
  timeLeft: (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes}m left`,
  untilTime: (time: string) => `until ${time}`,
  checkinUntil: (venueName: string, time: string) => `${venueName} — until ${time}`,
  /** The live Upcoming line (10:128): the declared window, and what it opens. */
  upcomingWindow: (range: string) => `Your dates: ${range}. People whose dates overlap are in the deck.`,
};

export type Copy = typeof en;
export type CopyFor = typeof enFor;
