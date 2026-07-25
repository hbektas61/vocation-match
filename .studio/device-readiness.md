# Device readiness — N-010

What has to be true before this app goes on a real phone in front of a real
person, and what is deliberately not being done yet.

## What runs today, and how it is proved

| Layer | Command | What it proves |
| --- | --- | --- |
| Database | `bash supabase/scripts/db-test.sh` | Migrations apply in order into a clean container; 10 pgTAP suites assert the rules; a concurrency script races 8 live connections at hotel switching and at simultaneous likes. |
| Client/server contract | `node scripts/verify-api-contract.js` | Every RPC name, argument name, table and column the client uses exists in the database. |
| Mobile | `cd mobile && npx tsc --noEmit && npx eslint . && npx jest` | Types, lint, domain rules, store behaviour, API contract against the in-memory implementation, and the critical-flow component tests. |
| Bundle | `cd mobile && npx expo export --platform web` | The app bundles, and the bundle boots: the onboarding path was walked in a real browser with no console errors. Still not a device proof. |
| Everything | `scripts/check.sh` | All of the above, with an honest per-step summary. |

## Walked in a real browser

The exported web bundle was served and driven end to end: age gate → create
account → profile with a birthdate → hotel activation, landing on the active
hotel with the trust copy in place and **zero console errors**. That is more
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

Accessibility (backlog R-004):

- [ ] VoiceOver and TalkBack walk the whole onboarding → match → chat path.
- [ ] Every control has a label; errors are announced, not just coloured.
- [ ] Dynamic type at the largest setting does not clip the deck or chat.
- [ ] Contrast passes on the primary buttons and the trust copy.
- [ ] Touch targets stay at or above 44pt.

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
