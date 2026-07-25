# Design

The direction, so the next person changing a screen knows what they are working
inside rather than guessing from the code.

## What it is based on

The structure comes from the category, and specifically from Bumble: a profile
is **scrolled through** rather than looked at, and the decision waits at the end
of that scroll instead of floating over the photo. That is the mechanic worth
copying, because it is the one that makes reading someone feel different from
sorting them.

What is deliberately **not** taken: Bumble's yellow, its logo, its
illustrations, its wording. Those are theirs. The conventions — a full-bleed
photo card, the name overlaid at the foot of it, sectioned profile blocks, a
large round pass/like pair — are the category's shared language and the thing
people already know how to use.

## The direction

Warm, plain-spoken, confident.

The product's own copy is already like that: "self-declared", "within 500 m",
"nobody is asked for a reservation". A bright, salesy interface would be arguing
with words that were written carefully not to oversell, and on an app about
meeting strangers that argument costs trust.

Red carries it — deep and warm rather than fire-engine. A signal red on a screen
where two people decide about each other reads as alarm; this one reads as
attention.

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
- **Buttons.** Primary is filled red. Destructive is *outlined* red, because
  once the brand itself is red, two solid red buttons on one screen — one of
  which deletes an account — are the same shout for very different things.
- **The no-photo state is designed, not handled.** On the first day of a pilot
  almost nobody has uploaded one, so that is the normal case: a shorter frame, a
  large initial in a legible tint. White-on-veil was tried first and read as a
  rendering failure.
- **Tabs carry a mark, not an emoji.** Five emoji next to this type read as clip
  art, and the green heart argued with the brand. The slot has to stay occupied,
  though — emptying it pushes the label out of the bar, which is how that was
  found.

## What the screenshots caught that the tests could not

Worth recording, because it is the argument for looking at the thing:

- the no-photo frame took half a screen before anything readable began;
- the fallback initial was invisible;
- the match screen said "you liked each other" twice;
- the chat composer scrolled away with the messages, so on a real conversation
  the box you type into was somewhere down the page.

None of those failed a test. All four were obvious in a screenshot.

## The floor, which the suite does keep

`mobile/src/__tests__/` holds the parts a redesign can silently break: contrast
is documented per token, every control keeps an accessible name and a busy
state, errors and success are announced, the delete warning is read in full, and
`trustCopy.test.ts` fails the build if a sentence starts claiming more than the
system delivers. Those did not change, and a change to the look must not change
them either.
