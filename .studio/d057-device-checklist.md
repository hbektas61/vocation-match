# D-057 — owner device checklist

The web visual gate cannot answer any of these. A browser has no OS text
scaling, no safe-area insets, no real touch, and no reduced-motion setting
coming from a system preference. Everything below needs a phone in a hand.

Build: an Expo preview build with `EXPO_PUBLIC_USE_FAKE_API=1`. **Do not** build
with `EXPO_PUBLIC_VISUAL_HARNESS` — the harness is dev-only and
`scripts/check.sh` fails if it reaches a bundle.

Record for each row: device, OS version, pass/fail, and a photo or screen
recording where it failed.

## Layout and chrome

| # | Check | What "pass" means |
| --- | --- | --- |
| 1 | iPhone safe area, notch and Dynamic Island | No title under the clock; the bottom bar sits above the home indicator, not under it; nothing is clipped in landscape rotation-back |
| 2 | Android safe area, gesture bar and cutout | Same, plus the system back gesture does not fight the deck's horizontal drags |
| 3 | 320 px device (iPhone SE 1st gen or equivalent) | All five tab labels readable and unabbreviated; measured 57×44 an item in the browser — confirm nothing wraps or truncates on real hardware |
| 4 | Large text (iOS Larger Accessibility Sizes, Android font size max) | Cards grow, text wraps, nothing is cut with an ellipsis; the bottom bar's labels stay legible; no essential label shrinks below its designed size |
| 5 | Scroll to the end of each long screen | The final CTA is reachable and not hidden behind the floating bar — Tatilim with both feature cards, Settings, Etkinlikler with results, the event detail |

## Interaction

| # | Check | What "pass" means |
| --- | --- | --- |
| 6 | Keyboard open — destination search | The field stays visible, results are scrollable, the primary action is not buried under the keyboard |
| 7 | Keyboard open — venue search | Same |
| 8 | Keyboard open — event area search | Same |
| 9 | All five bottom tabs, thumb reach | Each is tappable one-handed without a mis-hit; targets are 44 px tall as of `bb0d953` — confirm it feels right, not just measures right |
| 10 | Profile ring → Settings, from all five primary screens | One tap, every time; back returns to the tab you left, in the state you left it |
| 11 | Reduced motion (iOS Reduce Motion, Android Remove animations) | The radar does not pulse; card transitions do not slide; no animation is the only thing signalling a state change |

## Journeys, end to end

| # | Journey | What "pass" means |
| --- | --- | --- |
| 12 | Tatilim → declare dates → Keşfet | The deck opens on Tatilden Önce; the context selector names the venue and the date range |
| 13 | Çevremde → check in → Keşfet | The deck opens on Çevremde; a named venue shows its name, a "Buradayım" anchor shows only "çevrede" |
| 14 | Etkinlikler → Etkinliğe Gideceğim → Keşfet | The deck opens on the event; the membership stands |
| 15 | Etkinlikler → **Şu An Etkinlikteyim without declaring** → Keşfet | The live room opens and **no upcoming membership is created** (E-21). Check `Etkinliklerin` afterwards: it must be empty |
| 16 | Match → Chat | The match moment names the room it came from; the chat header carries the same source line; neither claims a venue you were not at |
| 17 | **VoiceOver / TalkBack on any button that works** (save dates, presence check, rescan) | Pressing it announces that something is happening. The web export carries **no `aria-busy`** and `Pressable` drops the prop, so `busy` may be doing nothing and only the label swap (“Kontrol ediliyor…”) is left. This is backlog A-001, and a browser cannot answer it |

## Notes for whoever runs this

- The Here Now simulate card is gated on the preview build flag
  (`EXPO_PUBLIC_USE_FAKE_API`), not on the fixture catalogue — it used to be
  the catalogue, which is bundled, so a real venue carrying a fixture id could
  have shown it. Against a real backend the card does not exist at all, and
  `scripts/check.sh` fails the export if its test IDs appear. If you see it on
  a staging build with real data, stop and report it.
- Events are off in production (`EVENTS_FEATURE_ENABLED`), pending E-012.
  On the preview build they are on, which is why rows 14 and 15 are testable.
- If a check fails, the frame it belongs to is in
  `.studio/design-four-feature-ia.md` with its Figma node id.
