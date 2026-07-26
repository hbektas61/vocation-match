# Device readiness — N-010

What has to be true before this app goes on a real phone in front of a real
person, and what is deliberately not being done yet.

**Device-test update, 2026-07-25.** The mobile project is now aligned to Expo
SDK 54, the SDK supported by the current iOS Expo Go client. A paid Apple
Developer or Expo plan is not needed for this path. On a Mac and iPhone sharing
Wi-Fi, run `cd mobile && npx expo start --clear --lan` and scan the QR code in
Expo Go. The project configuration resolves as `sdkVersion: 54.0.0`; Expo
Doctor passes 18/18 and the automated suite passes 239/239. These facts unblock
the checklist below but do not complete any device item by themselves.

## What runs today, and how it is proved

| Layer | Command | What it proves |
| --- | --- | --- |
| Database | `bash supabase/scripts/db-test.sh` | Migrations apply in order into a clean container; 10 pgTAP suites assert the rules; a concurrency script races 8 live connections at hotel switching and at simultaneous likes. |
| Client/server contract | `node scripts/verify-api-contract.js` | Every RPC name, argument name, table and column the client uses exists in the database. |
| Mobile | `cd mobile && npx tsc --noEmit && npx eslint . && npx jest` | Types, lint, domain rules, store behaviour, API contract against the in-memory implementation, and the critical-flow component tests. |
| Bundle | `cd mobile && npx expo export --platform web` | The app bundles, and the bundle boots: the onboarding path was walked in a real browser with no console errors. Still not a device proof. |
| Everything | `scripts/check.sh` | All of the above, with an honest per-step summary. |

## Walked in a real browser

The exported web bundle was served and driven end to end: welcome → the 18+
promise → phone → preview SMS code → name → birthdate → the three optional
steps → hotel → the teaching cards, landing in the app with
**zero console errors**. Every one of the eleven steps was screenshotted at
375×667, which is where the layout fails first. That is more
than "it compiles" — the navigation, the store, the typed API boundary, and the
in-memory implementation all actually run.

One thing that showed up only there: the tab bar's accessible name reads
"🏨 🏨 Hotel". The icon props that hide it (`accessibilityElementsHidden`,
`importantForAccessibility`) are iOS/Android-only, so on web the emoji leaks
into the name twice. Not a defect on the platforms this ships to, but worth
knowing before anyone treats the web build as a product.

## What a bundle check cannot tell you

The web export proves the code compiles and bundles. It does not exercise the
keychain, the location permission dialog, app backgrounding, a real network
failure, or a screen reader. Those need a device, and they are the list below.

## Device matrix

Minimum before a pilot:

| Platform | Target | Why this one |
| --- | --- | --- |
| iOS | Current major on a small-screen phone (SE class) | Smallest safe area; the deck and chat layouts break here first. |
| iOS | Current major on a large phone | Default experience. |
| Android | Current major, mid-range device | Where jank and cold-start cost show up. |
| Android | One vendor with aggressive background limits | Session restore and permission behaviour differ. |

## Scenarios that must be walked on a device

Location and permission — the part with the most ways to go wrong:

- [ ] First Here Now check: permission prompt appears, wording matches what the
      app promises (foreground only, keeps yes/no).
- [ ] Permission denied: the app says the check could not run, clears any
      existing presence answer, and never claims the user is far away.
- [ ] Permission granted but no fix available (airplane mode, indoor cold
      start): reported as "could not check", which is not the same as "no".
- [ ] Permission revoked in Settings while the app is backgrounded, then
      resumed.
- [ ] Location services off at the OS level.
- [ ] Here Now answer expires after 30 minutes with the screen left open —
      the room must close at the boundary (backlog R-003).

Session and lifecycle:

- [ ] Request and receive a real SMS on both iOS and Android against staging;
      enter the six-digit code and land on profile setup.
- [ ] Complete the CAPTCHA challenge on both platforms; confirm initial send
      and resend each carry a fresh token. Do not enable the SMS provider before
      this passes.
- [ ] Wrong and expired SMS codes stay on the code screen with the generic
      incorrect/expired message; a number is never told whether an account
      exists.
- [ ] Resend stays unavailable for 60 seconds, sends once afterwards, and
      behaves sensibly after backgrounding and resuming.
- [ ] iOS one-time-code AutoFill and Android SMS OTP autofill offer the code
      without exposing it in logs or another field.
- [ ] Put the app in the iOS and Android app switchers from phone entry, OTP,
      profile and chat. Confirm the root privacy shield replaces every preview
      before any phone number, photo or message is captured.
- [ ] Cold start with a stored session lands in the tabs, not onboarding.
- [ ] Token refresh after the access token expires.
- [ ] Sign out clears the keychain entry; the next cold start is signed out.
- [ ] Backgrounding during a chat, then resuming — the conversation reconnects.
- [ ] Airplane mode mid-action: every screen shows a real error, no spinner
      that never ends, no unhandled rejection.

Product rules, on a device rather than in SQL:

- [ ] Switching hotels closes the previous hotel's rooms immediately.
- [ ] A stay declared for a hotel the user then leaves does not open a room.
- [ ] Report and block are reachable before a match (from the deck) and from a
      conversation.
- [ ] A blocked person disappears and cannot reappear.
- [ ] Unblocking from Settings works and does not restore the old match.
- [ ] No screen ever shows a distance, a coordinate, or the word "verified".

The lavender palette and the phone field (D-020, D-021, D-022):

- [ ] The focused input border on a real screen, in daylight. The ratio maths
      says colour alone is not enough and the ring is what carries it; whether
      the ring reads as a ring rather than a smudge is a device question.
- [ ] `+90` with the real `phone-pad`: cursor and backspace behaviour at the
      boundary between the fixed prefix and the first typed digit.
- [ ] Paste from a contact card and from a message, on both platforms.
- [ ] SMS autofill still lands in the code field with the prefix in place.
- [ ] A single-line field's text sits centred on Android, which is the platform
      the `textAlignVertical`/`includeFontPadding` pair exists for.
- [ ] White cards on the white ground still read as cards at 375pt.

The profile questions and the hotel gate:

- [ ] VoiceOver and TalkBack over gender, orientation and show-me, including
      the two publish toggles — their default is off and that has to be
      audible, not just visible.
- [ ] The "More" list opening in place does not lose the screen-reader cursor.
- [ ] A real photo picked from a real gallery, uploaded, shown, replaced and
      removed. This is the one the automated suite cannot speak to at all.
- [ ] Hotel search with a real keyboard: two-character threshold, debounce,
      and a genuinely slow network for the stale-answer case.

Accessibility (backlog R-004):

- [ ] VoiceOver and TalkBack walk the whole onboarding → match → chat path.
- [ ] Every control has a label; errors are announced, not just coloured.
- [ ] Dynamic type at the largest setting does not clip the deck or chat.
- [ ] Contrast passes on the primary buttons and the trust copy.
- [ ] Touch targets stay at or above 44pt.
- [ ] Each onboarding step is *heard* when it replaces the one before it, and
      the cursor lands somewhere sensible afterwards. The announcement is
      tested; whether it is audible and where focus goes are not testable off a
      device.

Android back, in onboarding (O-007):

- [ ] The hardware back button walks back a step at a time, from the hotel to
      the photo to the interests, with what was typed still in place.
- [ ] Back on the welcome step, the name step and the teaching cards leaves the
      app, matching those screens having no back arrow.
- [ ] The same with the predictive back gesture once
      `predictiveBackGestureEnabled` is ever turned on — it is off today, and
      turning it on changes what a swipe does.

## Not being done, and why

- **No production deployment.** No hosted Supabase project is provisioned by
  this work, and no migration has been applied anywhere but a throwaway local
  container.
- **No store submission.** No build has been uploaded to TestFlight or Play,
  and no store listing exists.
- **No credentials anywhere.** `.env` is ignored; only `.env.example` is
  tracked, and it is empty. The app runs on the in-memory implementation when
  no URL and key are present.

These are owner decisions to make, not engineering steps that were skipped.
The handoff for them is recorded in `.studio/handoffs.md`.

## Known gaps at this point

- No rate limiting on `swipe`, `report_user`, or `record_presence_check`.
  Acceptable for an invited pilot, not for open signup.
- GPS spoofing is possible — a client can send any coordinate. What it buys is
  bounded: one boolean, for one hotel, expiring in 30 minutes.
- Withholding `hotels.location` from client roles is defence in depth, not a
  secret. A caller who repeats `record_presence_check` with different
  coordinates can binary-search their own active hotel's position to within
  500 m. That is a public venue they chose themselves, so nothing about
  another person leaks — but it is worth knowing that the column grant is not
  a hard boundary. The boundary that matters is that no endpoint ever returns
  a distance or a position for a *user*.
- `discovery_feed` evaluates eligibility per candidate row. Fine at pilot
  density; revisit before a large hotel.
- No account-deletion flow yet. Required before store submission; the schema
  already cascades correctly (`supabase/tests/001_profiles.sql` proves it).

## Added by pilot hardening H1 — profile photos

These need real hardware and cannot be closed by any check that runs here.

- **EXIF really is gone.** Take a photo on a phone with location services on,
  set it as a profile photo, then pull the stored object out of the bucket and
  read its metadata. Expect no GPS tags, no timestamp, no device model. What is
  already proven locally: the picker is called with `exif: false`, and the file
  that gets uploaded is the re-encoded one and never the path the picker
  returned (`mobile/src/data/__tests__/imagePicker.test.ts`). What is not
  proven: that the native JPEG encoder emits a metadata-free file. This is the
  D-005 guarantee, so it should be checked before any pilot with real people,
  not before the next code milestone.
- **A signed URL round trip against a real storage service.** Every policy here
  is exercised against the same grant shape production has, but no signed URL
  has ever been minted or fetched. Confirm: an owner sees their own photo; a
  person in the same open room sees it; someone at another hotel gets nothing;
  a logged-out request gets nothing.
- **The permission dialog.** Deny photo-library access on both platforms and
  confirm the app says so and stays usable — the rest of the product does not
  need a photo.
- **A photo that fails to load.** With a lapsed signed URL, the card should fall
  back to the initial rather than showing a broken image.
- **Upload on a poor connection.** Interrupt an upload mid-flight; the previous
  photo must still be showing and the error must say so.

## Added by pilot hardening H2–H4

Everything here needs hardware, a hosted project, or a real mailbox. None of it
can be closed by anything in this repository, and none of it is claimed.

**Update, 2026-07-25.** A staging project now exists
(`vocation-match-staging`), so the items below marked *needs a hosted project*
are no longer blocked — they are simply not done. That is a different sentence
and worth keeping straight: the reason they are outstanding is now time rather
than a missing dependency. The device items are unchanged; this machine still
has Command Line Tools without Xcode and no Android SDK.

**Account deletion (H2)**

- Delete an account on a device and confirm the keychain entry is really gone:
  force-quit, cold start, and check the app comes back at the welcome step
  rather than holding a token for a user that no longer exists. The removal is tested
  against an injected storage adapter, not against SecureStore.
- Delete an account while the other person has the conversation open. The match
  and its messages cascade away; confirm their app does not show a ghost row or
  crash on a match that vanished underneath it.

**Phone OTP (D-019)**

- Integrate and verify CAPTCHA first; only then configure a funded SMS provider
  in staging, receive a real code, and complete the flow end to end. No provider
  credential belongs in the app or repository.
- Confirm the hosted project's own settings, which do not travel with the
  migrations: phone sign-up/confirmation on, email sign-up off, per-number and
  project-wide SMS limits bounded, CAPTCHA on. `docs/hosted-setup.md` lists
  them.
- Confirm only the masked last four digits appear on the OTP screen and the full
  number is absent from profile, discovery, app-switcher snapshots, logs and
  analytics; only the authentication provider should retain it.

**Photos (H1)**

- The EXIF check, which is the D-005 guarantee: take a photo with location
  services on, upload it, pull the stored object out of the bucket, and read its
  metadata. Expect nothing.
- A signed URL round trip against a real storage service — owner, room-mate,
  stranger, logged out.

**Lifecycle and offline (H4–H405, H406)**

- Background the app for longer than the token's lifetime, return, and confirm
  it signs itself out rather than showing tabs whose every request fails.
- Turn airplane mode on mid-upload, mid-swipe, mid-deletion. Every one should
  produce an error within about ten seconds and leave the control usable.
  The deadline is in the client; whether it behaves on a real radio is not
  something a laptop can show.
- Revoke location permission in Settings while the app is backgrounded, return,
  and confirm Here Now closes.

**Accessibility (H4–H404)**

- VoiceOver and TalkBack over the photo card, the delete-account confirmation,
  and the SMS-code screen. The announcements are made; whether they are
  audible, and where the cursor lands after a screen replaces itself, is
  device behaviour.
- Largest Dynamic Type sizes on the new Settings cards and the SMS-code
  screen.
- Switch Control and an external keyboard: focus order and visible focus.
