# D-057 — Four-Feature IA (design handoff)

**Status:** Approved by the owner on 2026-07-30 and recorded as **D-057**.
Implementation is under way — see §13 for what has shipped and what has not.
The design below is the approved reference and does not change as code lands.

**Figma file:** <https://www.figma.com/design/wIc8HyZwV1rD2IY3csJa49/Vacation-Match-%E2%80%94-Flows>
**Page:** `D-057 — Four-Feature IA` — node `25:71`

Link form for any node below: append `?node-id=<id with ':' replaced by '-'>` to the
file URL. Example: `…/Vacation-Match--Flows?node-id=33-71`.

The four primary features are unchanged: **Otele Gidecekler / Tatilden Önce**,
**Oteldeyim**, **Çevremde**, **Etkinlikler** (Etkinliğe Gidecekler + Şu An
Etkinlikte). This page changes where they live, not what they are.

---

## 1. Final bottom navigation

```text
Tatilim · Çevremde · Etkinlikler · Keşfet · Mesajlar
```

Settings is **removed from the bottom bar** and lives behind the top-right profile
ring on all five primary screens.

**Why five and not six.** At 390 px a six-item bar gives each item 53 px; "Etkinlikler"
and "Çevremde" do not fit at a legible size, and at 320 px it falls to 50 px. The
comparison is drawn, not asserted — see `NAV-01` (`44:617`), which shows the six-item
bar and the measurement that killed it beside the five-item replacement.

**The one alternative considered and rejected:** merging Tatilim and Çevremde into a
single "Yerler" tab. Rejected because they are different product promises — one active
vacation venue versus daily life — and merging would have reduced four features to
three in the user's mental model. Recorded on `NAV-01`.

**Active state without colour.** Filled icon pill **+** Semi Bold label; the pink fill
is the third signal, never the only one. Item height 44 px.

**Labels fit in both languages** (`R-03`, `48:969`): longest TR label "Etkinlikler"
(11 chars) and EN "Messages" (8) both fit at 10 pt Inter Medium in a 66 px item
(60 px at 320 px width). No truncation, no ellipsis, no shrinking below 10 pt.

## 2. Settings access after losing its tab

Entry is the **profile ring**: 46×46 (≥44), accessible label "Profilin ve ayarlar",
same position on Tatilim, Çevremde, Etkinlikler, Keşfet and Mesajlar (`S-01`, `47:911`).
Tapping opens the profile menu (`NAV-08`, `44:949`) → Ayarlar (`S-02`, `47:938`).
*As built, the ring opens `S-02` directly and `NAV-08` is not drawn — see §13.*

Nothing safety-related is buried: **Engellenenler**, **Bildir veya engelle** and
**Hesabını sil** are all first-level rows on `S-02`. Settings is *not* duplicated as
both a tab and an avatar destination.

## 3. Discovery context-switching model

One deck, five contexts: `Tatilden Önce`, `Oteldeyim`, `Çevremde`,
`Etkinliğe Gidecekler`, `Şu An Etkinlikte`.

The control is a compact glass selector that always names the room **and** its time
state, plus a bottom sheet for switching.

| State | Frame | Behaviour |
| --- | --- | --- |
| closed | `NAV-02` `44:674` | names the current room and its time state |
| open (sheet) | `NAV-03` `44:721` | radio-style single selection, every eligible room listed |
| selected | `NAV-04` `44:767` | live event context, remaining minutes on the card |
| disabled | `NAV-05` `44:814` | no eligible room; opens nothing, offers the three ways in |
| expiring | `NAV-06` `44:859` | edge weight + minutes, never colour alone |
| empty | `NAV-07` `44:906` | radar stays up during rescan; screen is not torn down |

Rules the design holds to:

- Switching context **never** withdraws a membership. Stated in the sheet itself.
- A room needing a fresh proximity check is shown **disabled with its reason**, not hidden.
- Only one live event verification exists at a time; the vacation venue stays open.
  Both sentences are printed in the sheet footer.
- Hotel / Nearby / event contexts are told apart by the ribbon word and the filled vs
  hollow dot — not by three different design systems.
- Exact distance, GPS, room number, ticket ownership and private dates never appear.

## 4. Screen / state inventory

108 frames. Section ids: flow map `27:71`, components `27:72`, navigation `27:73`,
Tatilim `27:74`, Çevremde `27:75`, Etkinlikler `27:76`, Keşfet/Eşleşme/Mesajlar `27:77`,
Ayarlar `27:78`, responsive `27:79`.

### Navigation & context selector (8)

| Screen | Node |
| --- | --- |
| NAV-01 Alt bar — 6 sekme vs 5 sekme | `44:617` |
| NAV-02 Keşfet — bağlam seçici kapalı | `44:674` |
| NAV-03 Keşfet — bağlam sayfası açık | `44:721` |
| NAV-04 Keşfet — etkinlik bağlamı seçili | `44:767` |
| NAV-05 Keşfet — uygun oda yok | `44:814` |
| NAV-06 Keşfet — bağlam süresi doluyor | `44:859` |
| NAV-07 Keşfet — oda boş / yeniden tara | `44:906` |
| NAV-08 Profil halkası — menü | `44:949` |

### Tatilim (22) — brief §7

| Screen | Node |
| --- | --- |
| T-01 Tatilim — tatil mekânı yok | `33:71` |
| T-02 Destinasyon — boşta | `33:127` |
| T-03 Destinasyon — yazarken/sonuçlar | `33:146` |
| T-04 Destinasyon — sonuç yok / hata / tavan | `33:177` |
| T-05 Mekân — Tümü | `33:200` |
| T-06 Mekân — Konaklama | `33:223` |
| T-07 Mekân — yazarken/sonuçlar | `33:242` |
| T-08 Mekân — sağlayıcı kapalı | `33:272` |
| T-09 Seçilen mekân — onay | `35:92` |
| T-10 Tatilim — mekân aktif | `35:113` |
| T-11 Mekân değiştir — onay | `35:166` |
| T-12 Tatilden Önce — tarih yok | `35:178` |
| T-13 Tatilden Önce — tarih beyanı | `35:198` |
| T-14 Tatilden Önce — açık | `35:222` |
| T-15 Tatilden Önce — ücretsiz hak bitti | `35:245` |
| T-16 Oteldeyim — izinden önce | `36:113` |
| T-17 Oteldeyim — Premium gerekli | `36:135` |
| T-18 Oteldeyim — kontrol ediliyor | `36:154` |
| T-19 Oteldeyim — konum hassas değil | `36:171` |
| T-20 Oteldeyim — çok uzakta | `36:192` |
| T-21 Oteldeyim — açık | `36:213` |
| T-22 Oteldeyim — süre doldu | `36:235` |

### Çevremde (14) — brief §8

| Screen | Node |
| --- | --- |
| N-01 Çevremde — tanıtım | `37:113` |
| N-02 Çevremde — konum açıklaması | `37:156` |
| N-03 Çevremde — mekân listesi | `37:175` |
| N-04 Çevremde — katalog araması | `37:241` |
| N-05 Çevremde — gelişmiş arama girişi | `37:271` |
| N-06 Çevremde — Google sonuçları | `37:294` |
| N-07 Çevremde — kalan hak | `37:321` |
| N-08 Çevremde — hak bitti | `38:155` |
| N-09 Çevremde — sağlayıcı kapalı | `38:174` |
| N-10 Çevremde — Buradayım | `38:191` |
| N-11 Çevremde — adlı mekânda aktif | `38:207` |
| N-12 Çevremde — genel alanda aktif | `38:254` |
| N-13 Çevremde — süresi doldu | `38:300` |
| N-14 Çevremde — keşfe geç | `38:344` |

### Etkinlikler (36) — brief §9

| Screen | Node |
| --- | --- |
| E-01 Etkinlikler — ilk giriş | `39:239` |
| E-02 Bölge seç — elle | `39:282` |
| E-03 Bölge seç — konum açıklaması | `39:318` |
| E-04 Konum izni reddedildi | `39:334` |
| E-05 Seçili bölge — başlık | `39:375` |
| E-06 Yükleme — sonuçları silmez | `39:445` |
| E-07 Bugün | `39:511` |
| E-08 Yaklaşan | `39:578` |
| E-09 Bugün + Yaklaşan birlikte | `40:365` |
| E-10 Kategori çipi seçili | `40:435` |
| E-11 Etkinliklerin — çoklu üyelik | `40:502` |
| E-12 Etkinlik bulunamadı | `40:572` |
| E-13 İnce pazar — dürüst uyarı | `40:631` |
| E-14 Çevrimdışı | `40:694` |
| E-15 Sağlayıcı kullanılamıyor | `40:750` |
| E-16 Günlük sınır doldu | `40:800` |
| E-17 Etkinlikler kapalı | `41:533` |
| E-18 İptal / ertelendi / tarih belirsiz | `41:575` |
| E-19 Mekân adı yok | `41:641` |
| E-20 Görselli ve görselsiz kart | `41:695` |
| E-21 Etkinlik detayı — katılmadın | `41:749` |
| E-22 Etkinliğe Gideceğim — açıklama | `41:771` |
| E-23 Gidiyorsun — oda açık | `41:784` |
| E-24 Katılımı geri çek — onay | `41:808` |
| E-25 Şu An Etkinlikteyim — izinden önce | `42:617` |
| E-26 Konum kontrol ediliyor | `42:638` |
| E-27 LOCATION_INACCURATE | `42:654` |
| E-28 TOO_FAR | `42:676` |
| E-29 EVENT_NOT_STARTED | `42:698` |
| E-30 EVENT_FINISHED | `42:718` |
| E-31 EVENT_CANCELLED | `42:738` |
| E-32 EVENT_TIME_UNCONFIRMED | `42:758` |
| E-33 EVENT_LOCATION_UNAVAILABLE | `43:617` |
| E-34 IN_RANGE — canlı oda açık | `43:637` |
| E-35 Canlı doğrulama süresi doldu | `43:665` |
| E-36 Geçmiş etkinlik | `43:687` |

### Keşfet · Eşleşme · Mesajlar (15) — brief §10

| Screen | Node |
| --- | --- |
| D-01 Keşfet — Tatilden Önce | `45:743` |
| D-02 Keşfet — Oteldeyim | `45:793` |
| D-03 Keşfet — Çevremde (adlı mekân) | `45:843` |
| D-04 Keşfet — Çevremde (çevrede) | `45:893` |
| D-05 Keşfet — Etkinliğe Gidecekler | `45:943` |
| D-06 Keşfet — Şu An Etkinlikte | `45:993` |
| M-01 Eşleşme — Etkinliğe Gidecekler | `45:1043` |
| M-02 Eşleşme — Şu An Etkinlikte | `45:1059` |
| M-03 Eşleşme — Tatilden Önce | `46:869` |
| M-04 Eşleşme — Çevremde | `46:885` |
| I-01 Gelen kutusu — dolu | `46:901` |
| I-02 Gelen kutusu — boş | `46:985` |
| C-01 Sohbet — tatil mekânı | `46:1025` |
| C-02 Sohbet — canlı etkinlik | `46:1047` |
| C-03 Sohbet — oda kapandı | `46:1069` |

### Profil halkası & Ayarlar (7) — brief §11

| Screen | Node |
| --- | --- |
| S-01 Profil halkası — beş ekrandan giriş | `47:911` |
| S-02 Ayarlar | `47:938` |
| S-03 Profilini düzenle | `47:1000` |
| S-04 Dil | `47:1024` |
| S-05 Veri sağlayıcıları | `47:1037` |
| S-06 Bildir veya engelle | `47:1060` |
| S-07 Hesabını sil | `47:1105` |

### Responsive & erişilebilirlik (6) — brief §14

| Screen | Node |
| --- | --- |
| R-01 Küçük telefon — 320 px | `48:911` |
| R-02 Büyük yazı | `48:946` |
| R-03 Sekme etiketleri — TR / EN | `48:969` |
| R-04 Klavye açık — arama | `48:1025` |
| R-05 Güvenli alan — üst ve alt | `48:1112` |
| R-06 Erişilebilirlik kontrolleri | `48:1149` |

## 5. Components and variants (19)

All in section `01 · Bileşenler` (`27:72`). Every one carries a `description` in Figma
explaining what it must and must not do.

| Component | Node | Variants |
| --- | --- | --- |
| Bottom bar / 5 items | `27:190` | 5 (Active=Tatilim…Mesajlar) |
| Profile ring / avatar button | `30:77` | 2 (default, alert) |
| Screen header | `30:84` | — |
| Button | `30:98` | 4 (primary, secondary, destructive, disabled) |
| Category chips | `30:109` | — |
| Provider attribution | `30:120` | 3 (google, osm, ticketmaster) |
| Room / context ribbon | `30:146` | 6 (incl. `region` = honest "çevrede") |
| Chat source line | `30:160` | 3 (venue, nearby, event) |
| Keşfet context selector (closed) | `31:106` | 5 (closed, selected, expiring, disabled, empty) |
| Context selector sheet | `31:140` | — |
| Vacation feature card | `31:178` | 4 (open, closed, premium, blocked) |
| Event card | `31:237` | 6 (image, noimage, cancelled, tbd, noname, past) |
| Event status badge | `32:99` | 7 |
| Room open / closed | `32:109` | 2 |
| Loading skeleton | `32:127` | — |
| Empty state / radar | `32:137` | — |
| Notice | `32:155` | 4 (info, error, ceiling, offline) |
| Location permission state | `32:165` | — |
| Location verification outcome | `32:221` | 9 (IN_RANGE … EXPIRED) |

**Token discipline.** No new colours or radii were invented for Events. The page reuses
the existing published paint styles (`ground/*`, `glass/*`, `ink/*`, `brand/*`) and the
`mobile/src/theme.ts` values they mirror: sunset ground `#241E49 → #3A2B63 → #8A4A6F →
#D97B52`, glass `rgba(255,255,255,.06/.10/.14)`, primary gradient `#FBBF24 → #FB7185 →
#EC4899` with dark ink on it, radii 10/16/20/22/999, Nunito ExtraBold for display and
Inter for reading.

## 6. Existing nodes reused

Nothing on `Ekranlar` was moved, renamed or overwritten. The following approved frames
were read and their grammar carried forward — 390×844, 24/20 padding, Nunito ExtraBold 34
title + 46 px ring, r22 venue card with a 132–140 px media block, r20 feature card with
label row / 13 pt body / 46 px gradient CTA, 350×60 r22 floating bar:

`10:71` Tatilim (no venue) · `10:111` Tatilim (active) · `1:2` Çevremde intro ·
`11:71` Çevremde venue list · `11:145` active check-in · `13:112` date declaration ·
`13:153` chat · `12:166` populated inbox · `12:137` empty inbox · `16:71` Discovery
empty/radar · Foundations page `2:2` and its 15 paint styles.

Revised descendants and their sources:

| New | Revises |
| --- | --- |
| `T-01`, `T-10` | `10:71`, `10:111` — catalogue picker replaced by destination-first Google flow |
| `T-13` | `13:112` — unchanged behaviour, new chrome |
| `N-01`, `N-03`, `N-11` | `1:2`, `11:71`, `11:145` — audited, only missing states added |
| `NAV-07` | `16:71` — radar preserved, rescan made non-destructive |
| `I-01`, `I-02` | `12:166`, `12:137` — source attribution line added |
| `C-01`–`C-03` | `13:153` — source line added under the header |

## 7. Copy changes

Existing strings were reused verbatim from `mobile/src/i18n/tr.ts` wherever they exist.
These are the **new or changed** strings the implementation will need:

| Where | Old | New | Why |
| --- | --- | --- | --- |
| Tatilim empty | `hotel.emptyTitle` "Henüz bir otel seçmedin" | "Henüz bir tatil mekânı seçmedin" | D-054: a venue may be a resort, beach club or named beach, not only a hotel |
| Tatilim empty body | `hotel.emptyBody` | "Önce nereye gideceğini, sonra oradaki mekânı seç. Odalar seçtiğin mekâna göre açılır." | destination-first is now two steps |
| Switch venue | `hotel.switchButton` "Oteli değiştir" | "Tatil mekânını değiştir" | same reason |
| Switch warning | `trust.switchWarning` (otel) | same sentence, "mekân" | same reason |
| Oteldeyim check | `hereNow.checkButton` "Otel yakınlığını kontrol et" | "Mekân yakınlığını kontrol et" | same reason |
| Events thin market | `events.notEverything` "Her etkinlik burada listelenmez." | "Her etkinlik burada listelenmeyebilir." | E-016: softer and truer — coverage varies by market rather than being uniformly partial |
| Çevremde generic | — | "Bu, aynı mekânda olduğunuz anlamına gelmez." | makes the existing `çevrede` fallback explicit on the card |
| Context selector | — | "Hangi odayı keşfediyorsun?" / "Odalar arasında geçmek üyeliğini bitirmez." | new control |
| Context selector | — | "Aynı anda tek canlı etkinlik doğrulaması olur. Tatil mekânın açık kalır." | new control |
| Profile ring | — | a11y label "Profilin ve ayarlar" | new entry point |

The trust vocabulary is unchanged: no "doğrulandı", no "rezervasyon", no metre figures,
no ticket claims. `events.noTicketClaim` appears on every event verification surface.

## 8. Deliberate departures from current code

1. **Bottom bar drops from six to five.** `mobile/src/navigation/FloatingTabBar.tsx` and
   `RootNavigator.tsx` currently render six tabs including Ayarlar.
2. **Settings becomes a profile-ring route**, not a tab. Every existing route to
   `SettingsScreen` must keep working before the tab is removed.
3. **`Gelen kutusu` is renamed `Mesajlar`** in the tab bar (`tabs.inbox`). The screen
   title stays "Gelen kutusu"; only the tab label shortens, to fit five items.
4. **A shared context selector is introduced.** Today `DiscoveryScreen` derives its room
   implicitly. The selector makes the room explicit and switchable without changing any
   backend contract — it reads the same `my_event_capabilities` / room eligibility data
   the screens already read.
5. **Events gains no new visual system.** `EventsScreen`/`EventDetailScreen` are
   restyled onto the existing glass + sunset ground.
6. **Non-destructive refresh** on Etkinlikler: a reload must not clear existing results
   (`E-06`). Skeletons are for first paint only.
7. **Event card has a first-class no-image layout** (`E-20`), because the provider image
   is a lease that expires.

Backend behaviour, room rules, storage policy and security invariants are unchanged by
this design. No frame requires a schema, RPC or provider change.

## 9. Accessibility notes

- Contrast: body `#F5F6FA` 16.6:1, secondary `#A3A9C9` 6.6:1, control edge `#EC4899`
  4.3:1 on the night ground. Labels on the gradient are dark ink, never white.
- No status is carried by colour alone: rooms use word + dot + fill; tabs use filled
  pill + Semi Bold; event status uses word + glyph + colour.
- Touch targets: profile ring 46×46, tab item 66×44 (60×44 at 320 px), like/pass 64×64,
  list rows ≥44.
- Screen-reader order: title → profile ring → context selector → content → bottom bar.
  Opening the context sheet moves focus into the sheet and makes the page behind inert.
  A deck card is announced as one element: name, age, room, overlap.
- Reduced motion: static radar ring instead of a pulse, instant card transition instead
  of a slide, solid fill instead of a shimmer.
- Overflow is never solved by shrinking essential labels; text wraps and cards grow
  (`R-02`).

## 10. Prototypes

Six flow starting points on the page, 167 wired connections.

| Journey | Start | Node |
| --- | --- | --- |
| A · Tatil planla | T-01 | `33:71` |
| B · Tatil mekânında doğrula | T-10 | `35:113` |
| C · Günlük Çevremde | N-01 | `37:113` |
| D · Etkinlik planla | E-01 | `39:239` |
| E · Canlı etkinlik | E-23 | `41:784` |
| F · Bağlam değiştir | NAV-02 | `44:674` |

Branch coverage: B reaches `T-19` (inaccurate) and `T-20` (too far); C reaches the
Google advanced fallback (`N-05`–`N-09`) and generic `Buradayım` (`N-10`, `N-12`);
E reaches `E-27` inaccurate, `E-28` too far, `E-29` not started and `E-33` location
unavailable. F proves memberships survive switching — every sheet row navigates to a
different room's deck and none of them withdraws anything.

Two prototype-only affordances, because a "checking" screen has one button but three
outcomes: on `T-18` and `E-26`, clicking the **busy card** goes to the inaccurate
branch and clicking the **room ribbon** goes to the too-far branch. These are wiring for
review, not proposed UI.

`NAV-07`'s "Tekrar tara" has no reaction on purpose: a rescan does not leave the screen.

## 11. Implementation sequence after approval

1. Record the approved design as **D-057** in `.studio/decisions.md`.
2. Navigation first: five-item `FloatingTabBar`, profile-ring header component, and a
   route to Settings from all five primary screens. **Do not remove the Ayarlar tab
   until every replacement route is proven by a test.**
3. Shared context selector + sheet, reading existing eligibility data only.
4. Tatilim revisions (`T-01`…`T-22`).
5. Etkinlikler visual flow (`E-01`…`E-36`).
6. Shared Discovery / Match / Inbox / Chat attribution (`D-*`, `M-*`, `I-*`, `C-*`).
7. Settings screens behind the ring (`S-01`…`S-07`).
8. Remove the Ayarlar tab.
9. Deterministic tests for every navigation and state branch; `tr.ts`/`en.ts` stay
   key-for-key.
10. Render Figma frames and the running app at 390×844 and 320×844, compare, correct.
11. `scripts/check.sh`, then update `.studio/decisions.md`, `design.md`,
    `architecture.md`, `backlog.md` and handoff evidence.

## 12. Deferred product decisions — not decided here

- **E-012** Ticketmaster commercial approval. Production `EVENTS_FEATURE_ENABLED` stays
  off; `E-17` is what production shows today.
- **E-013** event free/premium mapping. No event pricing or paywall appears in any frame.
  The entitlement insertion point is annotated on `E-21` and `E-23` only.
- **E-016b** pilot-market decision. `E-13` shows the honest thin-market state; no
  second provider is implied anywhere.
- Premium purchase remains unavailable in-app (`T-15`, `T-17` say so plainly).

---

## 13. Implementation status (Phase 2)

Owner approved D-057 on 2026-07-30 and directed implementation. Recorded as
**D-057** in `.studio/decisions.md`. Three verified increments are on
`origin/main`; each passed `scripts/check.sh --mobile` (typecheck, lint at zero
warnings, the full jest suite, and the Expo web bundle). No SQL, migration,
function or provider behaviour changed in any of them, so the database half of
the gate was not run — there was nothing in it to exercise.

### Done

| Increment | Commit | What landed |
| --- | --- | --- |
| Navigation + context selector | `9d0f580` | Five-item bar; `Settings` moved from `TabParamList` to `RootStackParamList`; `ProfileRing` and `ScreenHeader` extracted; rings added to Etkinlikler and Keşfet, which had none; `ContextSelector` + sheet replacing the inferred room and the conditional pill row; the deck's fallback order now includes both event rooms. 12 new tests. |
| Source attribution | `945d204` | `matchSource(room)` — five distinct match sentences; the bond pill no longer disappears without a hotel; the chat header stops appending the active hotel's name to event and check-in matches; every inbox row carries its room. 5 new tests. |
| Venue vocabulary | `3273c8b` | "hotel" → "vacation place" across the empty state, switch warning, proximity button, one-at-a-time promise; `notEverything` softened to match what E-016 measured. Both languages. |

Test count went 595 → 612.

### Also done

| Increment | Commit | What landed |
| --- | --- | --- |
| Etkinlikler surfaces | `69e1e66` | Non-destructive refresh (`E-06`) — a filter change keeps the list up, an area change still clears it; imageless card as a first-class layout plus a fallback for a lease that lapses mid-list (`E-20`); the memberships list reads the leased name instead of printing a provider id, falling back to "Geçmiş etkinlik" (`E-11`); missing venue name gets the app's own sentence (`E-19`); standing glass area header (`E-05`); section counts; status as word + glyph + dim, never hidden (`E-18`). 4 new tests. |
| Tatilim empty state | this commit | `T-01` shows **both** features shut with their reasons. Only Tatilden Önce was drawn, so somebody who had not yet chosen a place could not learn Oteldeyim existed. 1 new test. |

Test count 595 → 617.

### Two things not delivered as drawn, and why

**`N-07` / `N-08` — the remaining advanced-search allowance.** The frames show
"Bu ay 3 gelişmiş arama hakkın kaldı" and a distinct exhausted state. The
client API exposes no remaining-entitlement value; D-053's 3/10 monthly count is
enforced server-side and never returned. Showing it needs one narrow addition to
the check-in contract. Not invented client-side — a number we guessed would be
worse than no number. **Open for the owner:** add it, or drop the count from the
design and keep only the existing "hak bitti" refusal, which does work.

**`NAV-08` — the profile menu.** The ring opens Settings directly rather than a
menu whose rows are the same rows Settings already shows. Drawing it as
designed would put the same list on two consecutive screens, which is the
duplication §2 of this document set out to remove. Recorded as a deliberate
departure rather than made silently. **Open for the owner:** say the word and
the menu goes in.

### Frame-by-frame accounting

| Group | Frames | State in the app |
| --- | --- | --- |
| NAV-01…07 | 7 | done |
| NAV-08 | 1 | deliberately collapsed into the ring (above) |
| T-01…T-22 | 22 | every state present, including `T-11` switch confirmation and `T-19` `LOCATION_INACCURATE`; `T-01` corrected in `61eaadf` |
| N-01…N-14 | 14 | every state present except `N-07`'s remaining count (above); `N-08`'s refusal itself works |
| E-01…E-20 | 20 | done — `69e1e66` |
| E-21…E-36 | 16 | all eight verification outcomes were already handled; `E-22` and `E-24` added in `2667c97` |
| D-01…D-06, M-01…M-04, I-01…I-02, C-01…C-03 | 15 | done — `9d0f580`, `945d204` |
| S-01…S-07 | 7 | screens exist and are reachable from the ring |
| R-01…R-06 | 6 | honoured in the components; not yet measured on a device |

So **106 of 108** frames have their behaviour in the app. The two that do not are
`NAV-08` and `N-07`, both above, both owner decisions rather than oversights.

### The visual pass — method, coverage and evidence

Two harnesses, because the app cannot be walked into every state.

**1. Driving the real app.** Expo web with `EXPO_PUBLIC_USE_FAKE_API=1` at
390×844 and 320×844, a fresh in-memory account driven from the welcome screen
by `.playwright-mcp/onboard.js`.

**2. `src/devtools/VisualHarness.tsx`** for the states driving cannot reach —
the Here Now outcomes (the simulate controls only exist for a venue the
*fixture* catalogue knows, and a Google venue is not one) and anything needing
a mutual match. It seeds an in-memory backend and renders the real screen,
chosen by `?scene=`. It adds no route and is gated on
`EXPO_PUBLIC_VISUAL_HARNESS`, which Expo inlines at build time.

That last claim is checked rather than asserted:
`scripts/verify-harness-absent.js` greps the exported bundle for the harness's
marker and — because a check that cannot fail proves nothing — first plants the
marker in a temp directory and fails if the scan misses it. It runs in
`scripts/check.sh`.

| Frame | Node | Runtime capture |
| --- | --- | --- |
| T-01 | `33:71` | `app-T-01.png`, `app-T-01-after.png` |
| T-02 | `33:127` | `app-T-02.png`, `app-T-02-after.png` |
| T-03 | `33:146` | `app-T-03.png` |
| T-05 | `33:200` | `app-T-05.png`, `app-T-05-after.png` |
| T-07 | `33:242` | `app-T-07.png` |
| T-10 | `35:113` | `app-T-09.png`, `app-T-10-after.png` |
| T-12/13 | `35:178` / `35:198` | `app-T-12.png` |
| T-16 | `36:113` | `app-T-16.png` |
| T-19 | `36:171` | `app-T-19.png` |
| T-20 | `36:192` | `app-T-20.png` |
| T-21 | `36:213` | `app-T-21.png` |
| N-01 | `37:113` | `app-N-01.png`, `app-N-01-after.png` |
| N-03 | `37:175` | `app-N-03.png` |
| E-01 | `39:239` | `app-E-01.png` |
| E-09 | `40:365` | `app-E-09.png` |
| E-21 | `41:749` | `app-E-21.png`, `app-E-21-fixed.png` |
| D-01 | `45:743` | `app-D-01.png` |
| D-02 | `45:793` | `app-D-02.png`, `app-D-02-320.png` |
| M-03 | `46:869` | `app-M-03.png` |
| I-01 | `46:901` | `app-I-01.png`, `app-I-01-320.png` |
| I-02 | `46:985` | `app-I-02.png` |
| C-01 | `46:1025` | `app-C-01.png` |
| S-02 | `47:938` | seen during the T-01 pass |
| bottom bar | `27:190` | `app-bar-390.png`, `app-bar-320.png` |

**24 frames compared against a running render. 84 remain.**

What the pass found — none of it visible from the code or the tests:

| Defect | Where |
| --- | --- |
| "Ayarlar" printed twice; `safeTop` taking the inset under a header that had it | `S-02` |
| "Oteldeyim" printed twice, same cause | `T-16` |
| "Powered by Google" rendered as the venue's address behind a location pin — and gone once dates existed | `T-10` |
| **Thirteen** `otel` strings in sentences only a screen shows, including both proximity verdicts | throughout |
| The same hint above and below the destination field, while "at least three characters" was said nowhere | `T-02` |
| The venue placeholder cut mid-word at 390 px | `T-05` |
| Çevremde's corner held a decorative pin, so the tab had no route to Settings at all | `N-01` |
| No OpenStreetMap/Overture credit anywhere, while Google's was on two surfaces (ODbL) | `N-03` |
| The event detail screen carried a name and no date or venue | `E-21` |
| The profile ring was an empty circle | all five |
| **Bottom-bar items measured 40 px tall against a 44 px floor** — the bar's padding sits outside the pressable and never counted | `27:190` |

Three where **the frame was wrong, not the app**, and were deliberately not
"fixed": the bottom-bar icons (my frames used emoji placeholders; the app's
drawn SVGs are correct), the Çevremde intro (the app has D-041's licensed
photograph and how-it-works rows, which the frame abstracted away), and the
declare screen's date hint appearing twice on web only — iOS and Android use
the native picker and show no hint at all.

Measured rather than eyeballed:

- **320 px**: all five labels render in full — 57×44 an item, no truncation, no
  overflow anywhere on the deck or the inbox.
- **390 px**: 71×44 an item.
- The simulate card is gated on the *fixture* catalogue, so it cannot appear
  against a real backend — absent for the Google venue, present for the pilot
  hotel, which is the intended split.

### Group 1 — global navigation (risk order, pass 2)

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| Bottom bar, 5 items | `27:190` | `app-bar-390.png`, `app-bar-320.png` | matches | items measured 71×**40** and 57×**40** against a 44 floor | `minHeight: MIN_TOUCH` on the item | 71×44 / 57×44 re-measured; test reads the style |
| Profile ring | `30:77` | in every capture | matches | was an empty circle | initials, real photo when there is one | present on all five primary screens |
| Settings transition | `47:938` | seen in the T-01 pass | matches | title printed twice; `safeTop` double inset | screen drops its own title | single title under the stack header |
| NAV-02 selector closed | `44:674` | `app-NAV-02.png` | matches | none | — | label "Tatilden Önce · Lara Shore Resort · 10 Ağu – 18 Ağu" |
| NAV-03 selector open | `44:721` | `app-NAV-03.png` | matches | none | — | three rooms listed, each with its own time state |
| NAV-04 several contexts | `44:767` | `app-NAV-04.png` | partial | the frame shows an *event* context; this account has none, so the deck opened on Çevremde per the D-040 fallback order | none — the ordering is the documented rule | event context deferred to group 4 |
| NAV-05 no eligible room | `44:814` | `app-NAV-05.png` | matches | none | — | selector `aria-disabled=true`, "Açık odan yok", opens nothing |
| NAV-06 context lapsed | `44:859` | `app-NAV-06.png` | partial | captured the **expired → fell back** case; the frame draws the *expiring* warning, which needs a room inside its last ten minutes | none | the selector dropped the lapsed room and fell back to Tatilden Önce, which is the designed behaviour |
| NAV-07 empty / rescan | `44:906` | `app-NAV-07.png` | matches | none | — | radar, "Henüz kimse yok", "Tekrar tara"; selector reads "Çevremde · 3 sa 0 dk kaldı" with no venue name, which is the honest generic check-in |

Two harness faults were found and fixed while doing this, and neither was a
product defect: a four-hour clock offset aged the fake's *session* as well as
the room (45 minutes reaches the expiry and nothing else), and swiping a
populated room away never emptied it — the fake's feed does not exclude passed
candidates, so the empty room is now reached honestly through D-048's anchor,
where the fixture has nobody else.

### Group 2–3 — states reached this pass

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| T-17 Oteldeyim premium | `36:135` | `app-T-17.png` | matches | none | — | the entitlement gate answers before the reading, so a free member is told about Premium rather than about their GPS |
| T-22 proximity lapsed | `36:235` | `app-T-22.png` | partial | the screen offers a fresh check rather than drawing a distinct "expired" panel | none — a lapsed answer *is* the absence of one | 45 minutes on, no answer stands and the check is offered again |
| N-11 named check-in active | `38:207` | `app-N-11.png` | matches | none | — | "Lara Shore Resort · Check-in aktif · 05:22'e kadar" |
| N-12 generic check-in active | `38:254` | `app-N-12.png` | matches | none | — | "Bulunduğun yer · Check-in aktif" — D-048's anchor, with no venue name claimed |
| N-08 allowance exhausted | `38:155` | `app-N-08.png` | **not reached** | the harness lands on the intro; the exhausted state lives several steps into the Google flow | scene needs to drive to the advanced search first | outstanding |

### Group 4 — Etkinlikler, the provider and refusal states

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| E-04 permission denied | `39:334` | `app-E-04.png` | matches | none | — | "Çevrende aramak için konum izni gerekli." with the manual city path still offered |
| E-12 nothing found | `40:572` | `app-E-12.png` | matches | the notice was printed twice, once per bucket | one shared refusal, no heading over it | 1 notice: "Bu bölgede ve bu tarihlerde etkinlik bulunamadı." |
| E-15 provider unavailable | `40:750` | `app-E-15.png` | matches | same duplication | same fix | 1 notice: "…şu anda kullanılamıyor. Sonra tekrar dene." |
| E-16 daily ceiling | `40:800` | `app-E-16.png` | matches | same duplication | same fix | 1 notice: "…bugünkü sınıra ulaştı. Yarın tekrar dene." |
| E-17 feature disabled | `41:533` | `app-E-17.png` | matches | none | — | "Etkinlikler henüz açık değil." and no provider call |

The three refusals were checked against each other, which is the point of
§3.4: **"kullanılamıyor / Sonra tekrar dene"**, **"bugünkü sınıra ulaştı /
Yarın tekrar dene"** and **"bulunamadı"** are three different sentences with
three different remedies. Reading the code would not have shown that each was
being said twice.

### Group 4 — the live-room refusals, and E-21 proved by looking

Each reached through the **independent** "Şu An Etkinlikteyim" CTA, from an
account that had declared nothing.

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| E-27 LOCATION_INACCURATE | `42:654` | `app-E-27.png` | matches | none | — | "Konum yeterince hassas değil. Açık alanda tekrar dene." · no membership |
| E-28 TOO_FAR | `42:676` | `app-E-28.png` | matches | none | — | "Bu kontrol seni etkinlikte bulamadı. Oradayken tekrar dene." · no membership |
| E-31 EVENT_CANCELLED | `42:738` | `app-E-31.png` | matches | none | — | "Bu etkinlik iptal edildi." · no membership |
| E-32 EVENT_TIME_UNCONFIRMED | `42:758` | `app-E-32.png` | matches | none | — | "Canlı oda, etkinlik saati kesinleşince açılır." · no membership |
| E-33 EVENT_LOCATION_UNAVAILABLE | `43:617` | `app-E-33.png` | matches | none | — | "Bu etkinliğin konumu yayınlanmamış…" · no membership |

**E-21's guarantee, seen rather than asserted:** all five screens offered both
CTAs from the first render, the live one was pressed without any declaration,
and `event-withdraw` — which only exists for a membership — was absent in every
one of the five.

A harness constraint worth recording: the event fixtures are anchored on
`FAKE_EVENTS_NOW` (2026-08-12), so an event scene has to stand the *backend* at
that instant or nothing is ever inside its live window. `nowMs()` is production
code and was deliberately left on the real clock rather than given a seam for
screenshots. The consequence is exact: in an event scene an **outcome** is
trustworthy and a **countdown** is not — which is why `E-34`'s remaining-time
line is not claimed here.

### Group 4 — the Etkinlikler list

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| E-02 area chooser | `39:282` | `app-E-02.png` | matches | none | — | "Nereye bakalım?" with the typed path and the location path both offered |
| E-05 area header | `39:375` | `app-E-09.png` | matches | none | — | standing glass header, "ETKİNLİK BÖLGESİ / İstanbul / Konumu değiştir" |
| E-09 both sections | `40:365` | `app-E-09.png` | matches | none | — | "BUGÜN · 5 etkinlik" and "YAKLAŞAN ETKİNLİKLER · 9 etkinlik", cards carrying badge, place, date and the provider credit |
| E-10 category chip | `40:435` | `app-E-10.png` | matches | none | — | the chip narrows without clearing |
| E-11 several memberships | `40:502` | `app-E-11.png` | matches | none | — | three declarations standing at once, each named from its lease, each with "Gidenleri gör" |
| E-13 thin market | `40:631` | `app-E-13.png` | matches | none | — | "Her etkinlik burada listelenmeyebilir." present *beside* results, not only when empty |
| E-20 no provider image | `41:695` | `app-E-09.png` | matches | none | — | the fixtures' image host does not resolve, so every card fell back to the imageless layout under a **real** failure rather than a simulated one |

One frame is **not reachable against the fake and is recorded as such**:
`E-19` (missing venue name) needs `venueName: null`, and the fake's event type
declares it non-null — the nearest fixture supplies the literal string "TBA",
which is a name, not an absence. The `nameUnavailable` fallback is therefore
only exercisable against a real provider, and is covered by a unit test rather
than by eye.

### Group 5 — shared discovery

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| D-03 Çevremde, named venue | `45:843` | `app-D-03.png` | matches | none | — | context "Çevremde · Lara Shore Resort · 3 sa 0 dk kaldı" |
| D-04 Çevremde, no name | `45:893` | `app-D-04.png` | matches | none | — | the control names no venue, and the card reads "Lara Shore Resort · **çevrede**" — the honest regional treatment |
| D-05 Etkinliğe Gidecekler | `45:943` | `app-D-05.png` | **failed, then fixed** | the selector said "Açık odan yok" for an account with an event membership | the two event rooms are synthesised on the screen, as Çevremde always was | "ETKİNLİĞE GİDECEĞİM · Volkswagen Arena Live" |
| D-06 Şu An Etkinlikte | `45:993` | `app-D-06.png` | **not reachable** | see below | — | outstanding |
| M-04 match from Çevremde | `46:885` | `app-M-04.png` | matches | none | — | "Aynı mekândasınız" + "Tam konumlar ve anlık mesafeler kimseye gösterilmez." + the Çevremde ribbon |
| C-03 chat, room closed | `46:1069` | `app-C-03.png` | matches | none | — | "Bu konuşma kapandı. Geçmişi yine okuyabilirsin." with the history still readable |

**The D-05 failure was real and mine.** `getRooms()` answers for the vacation
venue only. Çevremde has been synthesised on this screen from the check-in
since D-039 — and when D-057 added the two event rooms to the ordering and to
`CONTEXT_ORDER`, nothing ever put them into the list. So the selector that
promises five contexts could offer at most three, and somebody with an event
membership was told "açık odan yok" about a room they were in. No test caught
it because no test asserted an event context in the selector; one does now.

### Open for the owner — a consequence of E-21, found by looking

`D-06` cannot be reached, and the reason is structural rather than cosmetic.
E-21 made the live event room independent of the declaration, which is right.
But `my_events()` selects `from public.event_memberships` — so a person who is
live at an event **without having declared** has no row there, and the client
has no way to learn, after a restart, which event they are live at. The deck
therefore cannot open on `EVENT_HERE_NOW` for exactly the people E-21 was
written for.

In-session the app does know: `record_event_presence_from_selection` returns
the `event_id`. Across a cold start it does not. Closing this needs either
`my_events()` to include a live presence that has no membership, or a small
"what am I live at" read — **a backend contract change, which this pass is not
allowed to make.** Recorded rather than worked around.

### Group 2 — Tatilim, the venue chain end to end

Driven through the ordinary app (no harness): onboarding → destination →
venue → dates → presence check, at 390×844.

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| T-04 destination — no result | `33:177` | `app-T-04.png` | matches | none | — | "Bu aramayla eşleşen yer yok." and the field keeps what was typed |
| T-06 venue — Konaklama filter | `33:223` | `app-T-06.png` | matches | none | — | the chip narrows to lodging, one result, "Powered by Google" beneath the list rather than beside a pin |
| T-13 dates — form | `35:200` | `app-T-13b.png` | matches | none | — | pre-filled with today and +7, each field carrying its own YYYY-AA-GG hint |
| T-14 Tatilden Önce — open | `35:222` | `app-T-14.png` | matches | none | — | "Açık · Tarihlerin: 10 Ağu – 15 Ağu. Tarihi çakışan kişiler destede." and the card gains the dates |
| T-18 Oteldeyim — checking | `36:154` | `app-T-18.png` | **differed** | the button went disabled and said nothing | label + `busy` | reads "Kontrol ediliyor…" mid-flight |

**Two defects, one of them the owner's own constraint.**

1. **T-18 said nothing while it worked.** `HereNowScreen` passed
   `disabled={checking}`, so the control greyed out with its label unchanged.
   Every other screen in the app already does `label={busy ? …ing : …}` plus
   `busy=`; this one was the exception. It matters more here than elsewhere,
   because this check can sit waiting on an OS permission prompt — in the
   browser run it never resolved at all, leaving a dead grey button and no
   explanation. Now `COPY.hereNow.checking` / `busy`, verified in a real
   render: `{"label":"Kontrol ediliyor…"}`.

2. **The simulate buttons could reach a real build.** The brief says plainly:
   *"Production/staging kullanıcılarına simulate veya visual harness yolu
   açma."* `CheckinScreen` gates its preview chips on `isFakeApiEnabled()`.
   `HereNowScreen` gated its three on `getHotelById(activeHotelId)` — the
   *fixture catalogue*, which is bundled. So a member on the real backend
   whose active venue happened to carry a fixture id would have been handed
   "Simulate: I am at the hotel" — a button that fakes the one reading the
   presence check exists to make unfakeable. Now gated on the same build flag,
   with two regression tests (present in the preview build, absent without it,
   and the real check surviving either way).

   **The first attempt at proving this was wrong, and the gate caught it.**
   `scripts/verify-harness-absent.js` was extended to demand the simulate test
   IDs be absent from the export — and it failed against a build whose gate
   was shut. The reason is worth keeping: the harness flag is a literal
   `process.env.EXPO_PUBLIC_VISUAL_HARNESS === '1'` in `App.tsx`, which Expo
   inlines, so the branch really is dead and really is removed. But
   `isFakeApiEnabled()` reads `env.EXPO_PUBLIC_USE_FAKE_API` off a parameter —
   a *runtime* read. Nothing is inlined, the branch survives minification, and
   its test IDs are in every export including a correct one. Absence was never
   true, so it was the wrong thing to assert.

   What a correct export *does* prove is that no preview flag is baked into
   it: a clean build leaves `process.env` holding nothing but `NODE_ENV`,
   while a build exported with the flag set writes it in. That is what the
   scanner checks now, and its self-test plants both a harness marker and a
   truthy flag and fails if either is missed. The behaviour itself — the
   controls not being offered — is held by the two regression tests, which is
   the right place for a runtime gate to be held.

**Not a defect, though it looked like one.** The date fields refuse
`20260810` and want `2026-08-10`. That is what the hint asks for, and they
arrive pre-filled with a valid pair, so pressing save without typing anything
works. The first automated attempts failed because the typing appended to the
existing value, not because the screen is wrong.

### Group 3 — Çevremde, the Google chain

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| N-02 intro / permission | `37:156` | `app-N-02.png` | matches | none | — | the explanation precedes the reading, and declining leaves the list and the anchor working |
| N-03/N-04 list and catalogue search | `37:175` / `37:241` | `app-N-04.png` | matches | none | — | list, search field, OSM credit, `checkin-here` always present |
| N-05 advanced-search entry | `37:271` | `app-N-05.png` | matches | none | — | "Google ile daha fazla mekân ara" appears only after a name is typed *and* the catalogue came up empty |
| N-07 allowance remaining | `37:321` | `app-N-11-google.png` | matches | none | — | "Bu ay 10 Google destekli check-in hakkının 10 tanesi kaldı" — from the server, named for the thing it counts |
| N-09 provider unavailable | `38:174` | `app-N-09-google.png` | matches | none | — | "Şu an ek arama yapılamıyor. Listeden seçebilir ya da buradayım diyebilirsin." |
| N-08 allowance exhausted | `38:155` | `app-N-08-google.png` | **frame and behaviour differ** | see below | none — the behaviour is the correct one | — |

| N-10 Çevremde — Buradayım | `38:191` | `app-N-12-x.png` | matches | none | — | the anchor card says "Bulunduğun yer" and never a venue name, beside a named check-in that does |
| N-14 Çevremde — keşfe geç | `38:344` | `app-N-14.png` | matches | none | — | "Çevremdekileri keşfet" lands on the deck reading "Çevremde. Lara Shore Resort · 3 sa 0 dk kaldı" — a name and a clock, no distance |
| N-13 Çevremde — expired | `38:300` | — | **not reached** | both Çevremde fixtures hold a *live* check-in; nothing ages one out inside a scene | needs a scene whose check-in is already past its three hours | outstanding |

**N-08 is where the frame is wrong, and D-053 is right.** The frame draws the
exhausted allowance as a *pre-search block*. The product does not block the
search: D-053 spends the right only on a **completed** Google-labelled
check-in, precisely so that a search finding nothing costs the user nothing.
Somebody with no allowance left can still search and is refused at check-in.

What the screen does owe them is fair warning, and that is what the N-07 line
now gives — it reads "0 kaldı" before the button is pressed rather than after.
The frame should be corrected to match the product, not the other way round.
Reaching the exhausted state in the browser would mean completing three
Google-labelled check-ins in the seed; it is **not claimed as seen**.

### Group 4 — Etkinlikler, walked from a real account

| Frame | Node | Capture | Comparison | Difference found | Fix | Re-verified |
| --- | --- | --- | --- | --- | --- | --- |
| E-01 area picker | `40:71` | `app-E-01b.png` | matches | none | — | free-text area, "buradayım" shortcut, and an empty state before any area is chosen |
| E-03 area chosen — list | `40:150` | `app-E-05b.png` | matches | none | — | region label + "Konumu değiştir", four category chips, two buckets |
| E-06 today — empty | `41:118` | `app-E-05b.png` | matches | none | — | "Bu bölgede ve bu tarihlerde etkinlik bulunamadı." under its own heading, while the upcoming bucket still lists nine |
| E-07 upcoming — list | `41:140` | `app-E-05b.png` | matches | none | — | each card: name, `venue · city · date · time`, "Powered by Ticketmaster" |
| E-08 venue TBA | `41:166` | `app-E-05b.png` | matches | none | — | "Venue To Be Announced · TBA · İstanbul" — the row says TBA rather than inventing a place |
| E-22 detail — both CTAs | `42:96` | `app-E-22b.png` | matches | none | — | name **and** `venue · city · date · time`, "Bu bir beyandır, bilet kanıtı değildir", two CTAs, "Konum kontrolü bilet değildir" |
| E-21 live check — in flight | `42:140` | `app-E-21-live.png` | **differed** | pressing either CTA disabled both and changed neither label | per-action pending state | the pressed one reads "Kontrol ediliyor…"; the other keeps its own name |

**The E-21 screen went silent under the hand.** `EventDetailScreen` held one
boolean `busy`, so a press disabled both CTAs and relabelled neither. On the
web run the location read never returned, which left the two most consequential
buttons in the feature dead and wordless — and this is exactly the screen the
brief asked to make legible, since being at an event and planning to go are
separate claims a person is choosing between.

It now tracks *which* action is in flight (`'join' | 'live' | 'verify'`), so
the pressed button says what it is doing and the other keeps its own name
rather than appearing to be the thing that was pressed. Verified in a real
render: `{"live":{"label":"Kontrol ediliyor…"},"join":{"label":"Etkinliğe Gideceğim"}}`.

This is the same defect found in T-18 an hour earlier, in a second screen. Both
came from the same habit — `disabled={busy}` with a fixed label — and neither
was visible to a test, only to a finger.

### Still not done

- **84 frames** not yet compared against a render.
- **Large text, keyboard-open search, iOS/Android safe areas, reduced motion,
  and real-device scroll and tab reachability.** The web harness cannot speak
  to OS text scaling or safe-area insets; these need a device.
- **`N-08`, `E-22`, `E-24`** and the rest of the Etkinlikler states.
