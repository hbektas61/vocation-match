# Design

The direction, so the next person changing a screen knows what they are working
inside rather than guessing from the code.

## What it is based on

Two borrowings, both structural rather than visual.

**The card and the profile** come from the category, and specifically from
Bumble: a profile is **scrolled through** rather than looked at, and the
decision waits at the end of that scroll instead of floating over the photo.
That is the mechanic worth copying, because it is the one that makes reading
someone feel different from sorting them.

**The way in** follows the shape the category has settled on for onboarding —
one question per screen, a thin progress line, a large left-aligned headline, a
single wide action pinned to the bottom, and a short teaching section at the
end. It is a wizard because each answer is short and the sequence matters, not
because a long form would not fit.

What is deliberately **not** taken from anyone: a logo, an illustration set,
photography, or a sentence of copy. Those are theirs. And nothing is asked for
that the product does not use — no gender or orientation. The phone number is
the sole account credential, kept by the authentication system and never copied
into a profile or discovery response.

## The direction

Warm, plain-spoken, confident.

The product's own copy is already like that: "self-declared", "within 500 m",
"nobody is asked for a reservation". A bright, salesy interface would be arguing
with words that were written carefully not to oversell, and on an app about
meeting strangers that argument costs trust.

**Open-sea blue and warm sand** carry it. The palette is the water and the beach
outside the building the product is about, which is a better reason for a colour
than a mood board. It replaced a red direction: red on a screen where two people
decide about each other reads closer to alarm than to attention, and it made the
one genuinely destructive control — delete account — hard to distinguish from
the brand.

Two of the values handed to this palette failed contrast on the surfaces they
were used on and were corrected within the same family: `muted` (3.95:1 on sand,
under the 4.5 floor for the colour every secondary line uses) and a control edge
colour, since `line` at 1.17:1 cannot mark the boundary of an input.

## The signature

**The room ribbon.** `HERE NOW · LARA SHORE RESORT`, tracked and uppercase, over
the foot of the photo and above even the name.

It is there because it is the more decision-relevant fact and because it is the
only thing on the card no other dating app can show. Everything else — a face, a
name, an age, a bio — is what any of them would put there. If one element should
be remembered, it is the one that says *this person is connected to the building
you are standing in*.

It appears **once** per screen. The Discovery profile used to carry it twice,
once on the photo and again in the overlap section; the second one was removed.

## Tokens

`mobile/src/theme.ts` is the source. Every colour is commented with its measured
contrast against the background it is actually used on, because the first
accessibility audit (R-004) found real failures that nobody had written down.

- **Type.** Two families, two jobs. Nunito (rounded terminals) for names and
  headings, Inter for reading. A tracked uppercase label is the third role and
  is only ever used to name a structure — never for prose.
- **Buttons.** Primary is filled ocean with white on it. Destructive is
  *outlined*, so the one control that deletes an account cannot be mistaken for
  the one that continues. A disabled button is a real state — a soft fill with a
  grey label at 4.61:1 — not a 45% fade, which measured 1.99:1 on the label of a
  control somebody is being asked to read.
- **White never sits on light blue.** `sea` is a surface colour; text on it is
  `ink`.
- **The no-photo state is designed, not handled.** On the first day of a pilot
  almost nobody has uploaded one, so that is the normal case: a shorter frame, a
  large initial in a legible tint. White-on-veil was tried first and read as a
  rendering failure.
- **Tabs carry a mark, not an emoji.** Five emoji next to this type read as clip
  art, and the green heart argued with the brand. The slot has to stay occupied,
  though — emptying it pushes the label out of the bar — and it has to be
  *pinned*: left to flex, the icon slot took the whole item and squeezed the
  label's box to 7px, which with `overflow: hidden` cut every label in half.

## The way in

Eleven steps, in `mobile/src/onboarding/`: welcome, the 18+ promise, phone
number, six-digit SMS code, name, birthdate, bio, interests, one photo, hotel,
and three teaching cards.

Three things about it are decisions rather than layout:

- **The step is derived from server state, not stored.** No session means the
  phone/code entry; a session with no profile means the name step; a profile with no
  hotel means the hotel step. Nothing has to remember where somebody got to,
  nothing can disagree with the server, and a finished onboarding cannot come
  back on the next launch. A step someone has walked to stands until it becomes
  impossible — signed out on a step that needs a session, or the reverse — so
  the optional steps between saving a profile and choosing a hotel are still
  reachable.
- **The action stays visible and disabled** rather than appearing when the
  answer becomes valid. A control that is not there yet is a control somebody
  goes looking for.
- **Location is never asked for here.** The permission prompt belongs at the
  moment somebody actually runs a Here Now check, where the reason for it is on
  the screen. There is no background location anywhere in the product.

The teaching cards carry figures built from the same tokens the real screens
use — the self-declared badge, one proximity ring, two cards meeting — because
the two rooms are the part nobody arrives already understanding. They replaced a
large numeral in the same colour as its background, which read as an image that
had failed to load.

## What the screenshots caught that the tests could not

Worth recording, because it is the argument for looking at the thing:

- the no-photo frame took half a screen before anything readable began;
- the fallback initial was invisible;
- the match screen said "you liked each other" twice;
- the chat composer scrolled away with the messages, so on a real conversation
  the box you type into was somewhere down the page;
- every tab label was cut in half at the bottom of the bar;
- the disabled Continue button's label was effectively unreadable;
- the photo step printed the same privacy paragraph twice and offered two
  identical primary buttons;
- the hotel step named the chosen hotel twice within a hundred pixels;
- the "matching" teaching figure had collapsed into two hairlines, because
  absolutely-positioned children were measured against a parent that had
  shrunk to nothing.

None of those failed a test. All of them were obvious in a screenshot.

## The floor, which the suite does keep

`mobile/src/__tests__/` holds the parts a redesign can silently break: contrast
is documented per token, every control keeps an accessible name and a busy
state, errors and success are announced, the delete warning is read in full, and
`trustCopy.test.ts` fails the build if a sentence starts claiming more than the
system delivers. Those did not change, and a change to the look must not change
them either.

## 2026-07-26 — the five inner screens, designed rather than repaired

The owner's brief: Rooms, Inbox, Chat, Match and Settings feel fixed, not
designed; borrow conventions from other dating apps where they have earned
their keep; and build the identity around the one thing no other dating app
has — "this person is at your hotel".

### The signature: the key card

The product's own world is a hotel, and a hotel's most touched object is the
key card. The signature element is a **key-card panel with a magstripe band**:
a rounded card crossed near the top by a solid horizontal band. Lavender band
= an open door; hairline hollow band = closed. It appears in exactly two
places — the two rooms on the Rooms screen, and the "you're both at" panel on
the match moment — so it stays a signature rather than wallpaper. The ribbon
chip (dot + ROOM · HOTEL) remains its small-format sibling everywhere else.

One risk, named: a magstripe could read as kitsch. It is one flat band with no
skeuomorphic detail — no hologram, no chip, no embossing — which keeps it a
reference rather than a costume.

### Per screen, one job each

- **Rooms** — "which doors are open to me right now." State first: OPEN /
  CLOSED as a worded chip (never colour alone), the room name as a small
  tracked plate, the trust sentence kept but demoted to caption. Key-card
  panels.
- **Inbox** — "who is waiting on me." The convention borrowed from Hinge and
  Bumble because it is genuinely informative: matches with no conversation yet
  as a horizontal strip of faces ("Say hello"), conversations below with
  name, preview, and a short time-ago. Closed matches stay readable, dimmed.
- **Chat** — "talk, with the bond in view." An in-screen header (avatar, name,
  the ribbon chip) so where-you-know-them-from never scrolls away. Mine =
  lavender fill with ink text (fixing a real 3.04:1 contrast bug: dark purple
  bubble with near-black text), theirs = soft veil; asymmetric corners, the
  messenger convention. Composer as a pill with a round send control.
- **Match** — "celebrate the bond." The one screen allowed to be a moment:
  overlapping faces, then the key card carrying BOTH-AT · hotel — the fact no
  other app could print — then the two actions.
- **Settings** — "my account, quietly." A profile header (photo, name, age,
  edit) above the existing sections. No new drama; restraint is the job here.

Palette and type are pinned (D-020, D-021, Nunito/Inter) and unchanged.
