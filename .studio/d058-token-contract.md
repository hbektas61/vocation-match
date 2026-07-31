# D-058 — Light Social Theme: token contract

The single source is `mobile/src/theme.ts`. This file is the conversion guide
for every screen and component that still speaks the D-043/D-046 night theme.

## The one rule

No screen writes a colour. Import from `../theme` and use a token. The only
hex allowed outside `theme.ts` is inside the two allowlisted exceptions named
at the bottom, and `src/__tests__/lightTheme.test.ts` fails the build otherwise.

## What was removed, and what replaces it

| Gone | Use instead |
|---|---|
| `backgroundGradient`, `warmEnd` (the sunset ground) | nothing — `Screen` is a flat `color.background`; a nav bar sits on `color.surface` |
| `glass.fill` | `color.surface` (a card) or `color.veil` (an inert well) |
| `glass.strong` | `color.surface` |
| `glass.edge` | `color.rule` (a card edge) or `color.border` (a control edge) |
| `gradient.primary` / `gradient.primaryPressed` on a button | flat `color.accent`, pressed `#E94F54` via the shared `Button` |
| `gradient.primary` as a decorative fill | `color.accentSoft` / `color.accentWash`, or `color.accent` for a solid mark |
| a hardcoded `#EC4899` / `#F472B6` / `#FB7185` / `#FBBF24` | `color.accent` (fill/mark) or `color.accentDeep` (text/small glyph) |
| a hardcoded `#34D399` | `color.successMark` (dot) / `color.success` (text) |
| a hardcoded `rgba(25, 16, 22, …)` plate | `overlay.plate` |

## The palette

| Token | Value | Job |
|---|---|---|
| `color.background` | `#FFF9F5` | every screen's ground |
| `color.surface` | `#FFFFFF` | cards, sheets, bottom bar, inputs |
| `color.veil` | `#FBF2EC` | an inert well: a thumbnail ground, a track, a disabled fill |
| `color.inverse` | `#101A3A` | the one deep surface: context ribbon, live-room plate |
| `color.onInverse` | `#FFF9F5` | text on it (16.4:1) |
| `color.ink` | `#101A3A` | every heading and every piece of primary text |
| `color.inkMuted` | `#5F6478` | supporting prose (5.9:1 on white) |
| `color.inkFaint` | `#7C8194` | placeholders, disabled labels, decoration **only** — 3.87:1, never for prose |
| `color.rule` | `#E8EBEF` | card edges and dividers |
| `color.border` | `#8A91A1` | the edge of anything operable (3.16:1, WCAG 1.4.11) |
| `color.focus` | `#B3272C` | focus ring, always with extra weight |
| `color.accent` | `#FF5E62` | the brand as a **fill or a large mark** |
| `color.accentDeep` | `#B3272C` | the brand as **text or a small glyph** (6.5:1) |
| `color.accentSoft` | `#FFE3E0` | selected chip, live badge, brand wash |
| `color.accentWash` | `#FFF1EF` | a whole brand-tinted panel, focused input fill |
| `color.onAccent` | `#101A3A` | text on a coral fill — **navy, never white** (5.7:1) |
| `color.onPhoto` | `#FFFFFF` | text over `overlay.photo` / `PhotoScrim` |
| `color.success` / `successSoft` / `successMark` | `#15803D` / `#E7F8EE` / `#22C55E` | dark green reads, pale green fills, bright green marks |
| `color.premium` / `premiumSoft` / `premiumMark` | `#7A5B12` / `#FBF3DF` / `#D4AF37` | same split for premium |
| `color.danger` / `dangerSoft` / `onDanger` | `#9B1C1C` / `#FDECEA` / `#FFFFFF` | destructive, deliberately not the brand red |
| `color.infoSoft` | `#F1F4F9` | a standing information panel |
| `overlay.photo` / `photoDeep` / `plate` / `backdrop` / `pressed` | rgba navy | scrims and plates |

Also exported: `elevation.card` / `raised` / `nav` / `none` (spread into a
style; carries `shadow*` **and** Android `elevation`), `radius.xs…xl/pill`
(`radius.lg` = 20 is the card radius), `gradient.match`, `gradient.photoScrim`.

## Component rules

- **Card**: `color.surface`, 1px `color.rule`, `radius.lg`, `...elevation.card`.
  Prefer the shared `<Card>`; `tone="flat"` for a card nested in a card,
  `tone="brand"` for a brand-tinted one.
- **Primary CTA**: the shared `<Button>` — flat coral, navy label. Never a
  gradient, never white-on-coral.
- **Secondary CTA**: white, 1.5px `color.border`, navy label.
- **Input / search**: white, 1.5px `color.border`, `radius.sm` (pill for
  search). Focus = `color.focus` at 2.5px + `color.accentWash` fill. Invalid =
  `color.danger` border + `color.dangerSoft` fill.
- **Chip**: shared `<Chip>` — unselected white + `color.rule`; selected
  `color.accentSoft` + `color.accent` edge + `color.accentDeep` semibold label.
- **Premium badge**: shared `<PremiumBadge>`. **Success badge**:
  `<SuccessBadge>`. Both are pale fill + dark text + a glyph.
- **Context ribbon**: shared `<ContextRibbon>` — deep navy plate, cream label,
  coral glyph. This is how the venue/event name stays visible.
- **Text on a photo**: a `<PhotoScrim>` (or `overlay.photo`) is mandatory
  underneath. Never rely on the photograph being dark.
- **Bottom nav**: `color.surface` with a `color.rule` hairline on top and
  `...elevation.nav`.
- **Empty / error / info**: the shared `<EmptyState>` / `<Notice>`; a real
  surface with a mark and a sentence, not a centred grey line in dead space.
- Colour never carries a state alone: pair it with a word, a glyph, a weight
  change, and the matching `accessibilityState`.
- Touch targets stay ≥ `MIN_TOUCH` (44).

## The allowlisted full-colour exceptions

1. `MatchScreen` — `gradient.match` (coral → soft pink), the one full-bleed
   brand moment. White display type only over the first stop; the supporting
   sentence sits on the pale end in navy.
2. Photo scrims — `gradient.photoScrim` / `overlay.*`, wherever text sits on an
   image.

Nothing else may be full-bleed colour, and the old purple→orange sunset does
not come back.
