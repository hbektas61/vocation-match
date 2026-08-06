# D-059 — The measurement ladder: token contract

The single source is `mobile/src/theme.ts`. This file is the conversion guide
for every screen still measuring by eye.

## Why

D-058 locked the palette and left the measurements to judgement. Judgement
drifted. Counted on 2026-08-06, across `mobile/src`:

| | Declared in `theme.ts` | Rendered by the screens |
|---|---|---|
| font size | 6 | **22** — 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 44, 52, 128 |
| padding / gap | 5 | **22** — 2…56, including 3, 5, 7, 9, 11, 13, 15, 18, 22 |
| corner radius | 6 | **28** |
| letter-spacing | 0 | **13** |
| line-height | 0 (ratios) | **23 hand-typed pixel values** |

The drift starts inside the design system: `ui.tsx` itself contained
`fontSize: 19`, `font.caption + 1` and `font.label - 1`. The visible symptoms
the owner kept reporting one at a time — a screen title 34pt on Tatilim and
26pt on Etkinlikler, a card name 17 here and 19 there, two cards doing the same
job sitting 2pt apart — are all this one cause.

## The one rule

A screen does not write a measurement. It imports `font`, `spacing`, `radius`,
`leading` or `tracking` and uses a rung. `src/__tests__/scaleLadder.test.ts`
fails the build otherwise, for every file on its `CONVERTED` list.

Width and height are **not** covered: a 48pt avatar is that size because of what
it holds. A circle's radius stays `size / 2` — that is geometry, not a choice.

## The ladders

### Type — six reading steps, three declared exceptions

| Token | pt | Job |
|---|---|---|
| `font.display` | 32 | a tab's screen title, an onboarding question |
| `font.title` | 26 | a sheet's title, a detail header |
| `font.heading` | 20 | a section heading, a person's name, a card's own title |
| `font.body` | 16 | everything anybody reads: prose, a bio, an input's value, a notice |
| `font.caption` | 13 | the supporting line under something |
| `font.label` | 12 | tracked uppercase structure — a section label, a badge |
| `font.control` | 15 | the label on something you press. Semibold, so it sits optically level with 16 regular |
| `font.moment` | 44 | the match word. One place in the app |

Each reading step is at least 1.18× the one below, asserted in the test. `label`
sits under `caption` on purpose: nobody *reads* a section label, they find it.
Nothing is below 12 — the 9, 10 and 11pt text that had crept in went **up**.

An avatar or deck-card initial is sized to its container and is outside all of
this; it is a drawing, not type.

### Conversion

| Was | Use |
|---|---|
| 9, 10, 11 | `font.label` (12) |
| 12 | `font.label` |
| 14 | `font.caption` (13) for a supporting line, `font.control` (15) on a control |
| 15 | `font.control` — and only on something operable |
| 17, 18, 19 | `font.heading` (20) |
| 22, 24 | `font.title` (26) |
| 28, 30, 34 | `font.display` (32) |
| 44 | `font.moment`, and only for the match word |
| 52, 128 | a container-sized initial: leave it, it is a drawing |

### Spacing — nine rungs

`tight 2` · `xs 4` · `cozy 6` · `sm 8` · `snug 12` · `md 16` · `wide 20` ·
`lg 24` · `xl 40`

Every rung is even, so an odd gap can never fail to centre against an even one —
which is where most of the stray 3s, 5s and 7s came from.

| Was | Use |
|---|---|
| 3 | `spacing.tight` (2) or `spacing.xs` (4) |
| 5, 6, 7 | `spacing.cozy` (6) |
| 9, 10, 11 | `spacing.sm` (8) or `spacing.snug` (12) |
| 13, 14, 15 | `spacing.snug` (12) or `spacing.md` (16) |
| 18, 20, 22 | `spacing.wide` (20) |
| 32 | `spacing.lg` (24) or `spacing.xl` (40) |
| 44, 56 | `spacing.xl` (40) |
| `spacing.md - 2`, `spacing.sm + 1`, … | the nearest rung. Arithmetic on a rung is a rung nobody declared |

### Radius — seven rungs

`xs 8` · `sm 12` · `md 16` · `lg 20` · `xl 24` · `xxl 32` · `pill 999`

`radius.xl` moved 28 → 24 in this pass. 14 → `sm`; 18 and 22 → `lg`; 23 → `xl`;
26 → `xxl` or `xl`; 36, 37, 46 → `pill`, or `size / 2` if it is a circle.

### Leading — ratios, not pixels

`leading.tight 1.2` (display and title) · `leading.snug 1.3` (a heading, a
two-line name) · `leading.normal 1.45` (prose).

Written as `fontSize * leading.x`, never as a typed pixel value. A typed
line-height stops tracking its own font size the moment either changes.

One exception, already documented in `ui.tsx`: a **single-line `TextInput`**
carries no `lineHeight` at all, because iOS draws a set one asymmetrically and
the text slides off centre.

### Tracking — four values

`display -0.2` (26pt and up, which sets loose) · `none 0` ·
`control 0.2` (a button label) · `label 1.2` (uppercase structure).

## Rollout

`scaleLadder.test.ts` holds two lists and asserts their union is exactly the set
of files that draw anything — so a new screen cannot appear in neither.

- `CONVERTED` — checked on every run. Adding a name is the **last** step of
  converting a file, and it is what stops the file drifting back.
- `PENDING` — queued. Not exempt, just not done.

Order of the pass: `ui.tsx` (done — everything inherits from it), then Keşfet,
Etkinlikler, Çevremde (the three largest and most drifted), then Tatilim and
venue details, Mesajlar and the chat, the match moment, Ayarlar and profile,
and onboarding last.

## Unchanged

D-059 is a measurement system. It did not vote on the palette (D-058), the
information architecture (D-057), copy, room eligibility, provider behaviour,
privacy thresholds, or the schema.
