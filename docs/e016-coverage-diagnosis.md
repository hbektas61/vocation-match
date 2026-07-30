# E-016 — why Paris, Ibiza, Mykonos and Dubai are thin

**Diagnosis only.** Nothing in the provider integration, the schema, the rooms
or the matching was changed, and no second provider was added. The queries ran
through a temporary probe function deployed to staging and **deleted
afterwards** (`404` confirmed); it had its own path and its own counter, so the
product's own cache and metrics are untouched — before and after the run,
`ticketmaster_daily.used = 40` and the provider event counts are the ones the
§17 acceptance run left behind.

The API key never appears here. It was attached server-side and the probe
echoed each request back with `apikey` removed, which is what the tables below
are built from.

Date: 2026-07-31. 120 grid queries plus ~25 follow-ups.

## The two mechanisms

**1. Market coverage — the dataset simply does not contain these markets.**
One query settles it, with no city, no radius and no date filter at all:

| `countryCode` | events in the entire dataset |
| --- | ---: |
| FR | **1** |
| ES | 10 000+ |
| GR | 96 |
| AE | 55 |
| TR | 1 453 |
| GB | 10 000+ |
| DE | 3 116 |
| US | 10 000+ |

France has **one event**, full stop. That is not a query problem and no
parameter fixes it. Spain is huge but the Balearics are not in it: `city=Ibiza`
returns 0 with or without a country code, `geoPoint` around Ibiza returns 0 at
25/50/100 km, and `keyword=Ibiza` returns 22 events that are all **Ibiza-themed
club nights in the UK and Australia**, not events on the island. Greece has 96
events nationally and Mykonos has two. UAE has 55 nationally, 26 of them
around Dubai.

**2. Geo-index gaps — a small number of events are findable by `city` and
`keyword` but not by `geoPoint` at any radius.**

Paris's single event (`Jacob Collier`, Salle Pleyel) is the clean case. It
carries a venue coordinate, `city=Paris&countryCode=FR` finds it, and
`keyword=Jacob Collier` finds it among 28 dates across eight countries — but
`geoPoint` finds it at **no** radius:

| query | total |
| --- | ---: |
| `city=Paris&countryCode=FR` | 1 |
| `geoPoint=48.8566,2.3522&radius=5..100km` | 0 |
| `geoPoint=48.8788,2.3007` (the venue itself) `&radius=5km` | 0 |
| `geoPoint=u09tv` (Paris geohash) `&radius=50km` | 0 |
| `geoPoint=48.8566,2.3522&radius=800km&countryCode=FR` | 0 |
| `geoPoint=48.8566,2.3522&radius=800km` (no country) | 10 000 (BE, GB) |

So the geo index works — it is that event which is missing from it.

`geoPoint` itself is fine and genuinely filters, which had to be ruled out
first: mid-Atlantic at 50 km → 0; İstanbul at 1 km → 0; İstanbul at 100 km →
623; and the radii scale monotonically (25/50/100 km → 425/452/541 at 90 days).
It accepts **both** forms — `geoPoint=sxk97` (İstanbul geohash) returns 524
İstanbul events, the same order as the lat/lng form.

Across the markets that have inventory, the geo index is complete:

| place | `city` | `geoPoint` 50 km | |
| --- | ---: | ---: | --- |
| İstanbul TR | 526 | 524 | ok |
| Athens GR | 56 | 47 | ok |
| Madrid ES | 3 855 | 2 355 | ok |
| Barcelona ES | 5 311 | 5 486 | ok |
| Palma ES | 0 | 1 | ok |
| Dubai AE | 26 | 26 | ok |
| Mykonos GR | 1 | 1 | ok |
| **Paris FR** | **1** | **0** | **geo blind** |

## Market by market

**Paris** — one event in all of France. Not a query fault; the French domestic
inventory (Ticketmaster.fr) is not in this key's Discovery dataset. That single
event is also the one geo-index gap found anywhere, so a "use my location"
search in Paris returns nothing while a city search returns one.

**Ibiza** — zero by every route and every window. Spain has 10 000+ events, so
this is the Balearics specifically. `keyword=Ibiza` finds only UK/AU theme
nights; `keyword=Pacha` finds five, in **Dubai and New York**. The island's club
scene sells through its own channels and is not here.

**Mykonos** — two events on the island, and the two search routes each find a
*different* one: `geoPoint` finds `MYKONOS BC | SEASON TICKETS 2026-27` (outside
any 180-day window), `city` finds `XLSIOR MYKONOS 2026` (inside it, and with
**no venue coordinate**, which is why `geoPoint` cannot see it). Neither route
is broken; there is almost nothing to find.

**Dubai** — not broken and not geo-blind: `city` and `geoPoint` agree at 26.
It is *seasonal*. Nothing at all in the next 30 days; 10 within 90 days; 26
within 180, of which 16 are music. The Gulf season starts later than the
window the tab currently asks for.

## What this means, without changing anything

- The window matters more than the radius in thin markets: Dubai goes 0 → 10 →
  26 across 30/90/180 days, while radius barely moves it (25 km 20, 50 km 26,
  100 km 26 at 180 days). In İstanbul the radius does matter (425 → 541).
- A location-based search is strictly weaker than a city search in exactly the
  markets that are already thin, because that is where the geo-index gaps and
  the coordinate-less venues are. In healthy markets the two agree.
- No parameter combination recovers Paris, Ibiza or the Mykonos club scene.
  Whatever is decided for E-016, it is not a query change.

## The full grid

Every row also carried `sort=date,asc`, `size=20`, `page=0` and the API key,
which is redacted. `p1` is the first page; `music`, `geo` and `name` are counts
within that page.

| area | classificationName | startDateTime | endDateTime | totalElements | p1 | music | geo | name |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `geoPoint=48.8566,2.3522 radius=25km` | `(none)` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=25km` | `Music` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=50km` | `(none)` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=50km` | `Music` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=100km` | `(none)` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=100km` | `Music` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Paris countryCode=FR` | `(none)` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Paris countryCode=FR` | `Music` | `2026-07-30T15:35:21Z` | `2026-08-29T15:35:21Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=25km` | `(none)` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=25km` | `Music` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=50km` | `(none)` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=50km` | `Music` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=100km` | `(none)` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=100km` | `Music` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Paris countryCode=FR` | `(none)` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 1 | 1 | 1 | 1 | 1 |
| `city=Paris countryCode=FR` | `Music` | `2026-07-30T15:35:32Z` | `2026-10-28T15:35:32Z` | 1 | 1 | 1 | 1 | 1 |
| `geoPoint=48.8566,2.3522 radius=25km` | `(none)` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=25km` | `Music` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=50km` | `(none)` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=50km` | `Music` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=100km` | `(none)` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=48.8566,2.3522 radius=100km` | `Music` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Paris countryCode=FR` | `(none)` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 1 | 1 | 1 | 1 | 1 |
| `city=Paris countryCode=FR` | `Music` | `2026-07-30T15:35:42Z` | `2027-01-26T15:35:42Z` | 1 | 1 | 1 | 1 | 1 |
| `geoPoint=38.9067,1.4206 radius=25km` | `(none)` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=25km` | `Music` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=50km` | `(none)` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=50km` | `Music` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=100km` | `(none)` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=100km` | `Music` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Ibiza countryCode=ES` | `(none)` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Ibiza countryCode=ES` | `Music` | `2026-07-30T15:35:54Z` | `2026-08-29T15:35:54Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=25km` | `(none)` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=25km` | `Music` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=50km` | `(none)` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=50km` | `Music` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=100km` | `(none)` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=100km` | `Music` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Ibiza countryCode=ES` | `(none)` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Ibiza countryCode=ES` | `Music` | `2026-07-30T15:36:04Z` | `2026-10-28T15:36:04Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=25km` | `(none)` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=25km` | `Music` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=50km` | `(none)` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=50km` | `Music` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=100km` | `(none)` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=38.9067,1.4206 radius=100km` | `Music` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Ibiza countryCode=ES` | `(none)` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Ibiza countryCode=ES` | `Music` | `2026-07-30T15:36:13Z` | `2027-01-26T15:36:13Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=25km` | `(none)` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=25km` | `Music` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=50km` | `(none)` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=50km` | `Music` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=100km` | `(none)` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=100km` | `Music` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Mykonos countryCode=GR` | `(none)` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 1 | 1 | 1 | 0 | 1 |
| `city=Mykonos countryCode=GR` | `Music` | `2026-07-30T15:36:23Z` | `2026-08-29T15:36:23Z` | 1 | 1 | 1 | 0 | 1 |
| `geoPoint=37.4467,25.3289 radius=25km` | `(none)` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=25km` | `Music` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=50km` | `(none)` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=50km` | `Music` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=100km` | `(none)` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=100km` | `Music` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Mykonos countryCode=GR` | `(none)` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 1 | 1 | 1 | 0 | 1 |
| `city=Mykonos countryCode=GR` | `Music` | `2026-07-30T15:36:33Z` | `2026-10-28T15:36:33Z` | 1 | 1 | 1 | 0 | 1 |
| `geoPoint=37.4467,25.3289 radius=25km` | `(none)` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=25km` | `Music` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=50km` | `(none)` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=50km` | `Music` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=100km` | `(none)` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=37.4467,25.3289 radius=100km` | `Music` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Mykonos countryCode=GR` | `(none)` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 1 | 1 | 1 | 0 | 1 |
| `city=Mykonos countryCode=GR` | `Music` | `2026-07-30T15:36:42Z` | `2027-01-26T15:36:42Z` | 1 | 1 | 1 | 0 | 1 |
| `geoPoint=25.2048,55.2708 radius=25km` | `(none)` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=25.2048,55.2708 radius=25km` | `Music` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=25.2048,55.2708 radius=50km` | `(none)` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=25.2048,55.2708 radius=50km` | `Music` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=25.2048,55.2708 radius=100km` | `(none)` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=25.2048,55.2708 radius=100km` | `Music` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Dubai countryCode=AE` | `(none)` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `city=Dubai countryCode=AE` | `Music` | `2026-07-30T15:36:51Z` | `2026-08-29T15:36:51Z` | 0 | 0 | 0 | 0 | 0 |
| `geoPoint=25.2048,55.2708 radius=25km` | `(none)` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 8 | 8 | 5 | 8 | 8 |
| `geoPoint=25.2048,55.2708 radius=25km` | `Music` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 6 | 6 | 5 | 6 | 6 |
| `geoPoint=25.2048,55.2708 radius=50km` | `(none)` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 10 | 10 | 7 | 10 | 10 |
| `geoPoint=25.2048,55.2708 radius=50km` | `Music` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 8 | 8 | 7 | 8 | 8 |
| `geoPoint=25.2048,55.2708 radius=100km` | `(none)` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 10 | 10 | 7 | 10 | 10 |
| `geoPoint=25.2048,55.2708 radius=100km` | `Music` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 8 | 8 | 7 | 8 | 8 |
| `city=Dubai countryCode=AE` | `(none)` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 10 | 10 | 7 | 10 | 10 |
| `city=Dubai countryCode=AE` | `Music` | `2026-07-30T15:37:00Z` | `2026-10-28T15:37:00Z` | 8 | 8 | 7 | 8 | 8 |
| `geoPoint=25.2048,55.2708 radius=25km` | `(none)` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 20 | 20 | 9 | 20 | 20 |
| `geoPoint=25.2048,55.2708 radius=25km` | `Music` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 10 | 10 | 9 | 10 | 10 |
| `geoPoint=25.2048,55.2708 radius=50km` | `(none)` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 26 | 20 | 12 | 20 | 20 |
| `geoPoint=25.2048,55.2708 radius=50km` | `Music` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 16 | 16 | 14 | 16 | 16 |
| `geoPoint=25.2048,55.2708 radius=100km` | `(none)` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 26 | 20 | 12 | 20 | 20 |
| `geoPoint=25.2048,55.2708 radius=100km` | `Music` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 16 | 16 | 14 | 16 | 16 |
| `city=Dubai countryCode=AE` | `(none)` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 26 | 20 | 12 | 20 | 20 |
| `city=Dubai countryCode=AE` | `Music` | `2026-07-30T15:37:10Z` | `2027-01-26T15:37:10Z` | 16 | 16 | 14 | 16 | 16 |
| `geoPoint=41.0082,28.9784 radius=25km` | `(none)` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 160 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=25km` | `Music` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 128 | 20 | 20 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=50km` | `(none)` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 180 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=50km` | `Music` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 147 | 20 | 20 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=100km` | `(none)` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 200 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=100km` | `Music` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 164 | 20 | 20 | 20 | 20 |
| `city=Istanbul countryCode=TR` | `(none)` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 181 | 20 | 16 | 19 | 20 |
| `city=Istanbul countryCode=TR` | `Music` | `2026-07-30T15:37:20Z` | `2026-08-29T15:37:20Z` | 143 | 20 | 20 | 19 | 20 |
| `geoPoint=41.0082,28.9784 radius=25km` | `(none)` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 425 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=25km` | `Music` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 377 | 20 | 20 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=50km` | `(none)` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 452 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=50km` | `Music` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 402 | 20 | 20 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=100km` | `(none)` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 541 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=100km` | `Music` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 479 | 20 | 20 | 20 | 20 |
| `city=Istanbul countryCode=TR` | `(none)` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 454 | 20 | 16 | 19 | 20 |
| `city=Istanbul countryCode=TR` | `Music` | `2026-07-30T15:37:30Z` | `2026-10-28T15:37:30Z` | 399 | 20 | 20 | 19 | 20 |
| `geoPoint=41.0082,28.9784 radius=25km` | `(none)` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 486 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=25km` | `Music` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 434 | 20 | 20 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=50km` | `(none)` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 521 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=50km` | `Music` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 467 | 20 | 20 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=100km` | `(none)` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 623 | 20 | 16 | 20 | 20 |
| `geoPoint=41.0082,28.9784 radius=100km` | `Music` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 556 | 20 | 20 | 20 | 20 |
| `city=Istanbul countryCode=TR` | `(none)` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 523 | 20 | 16 | 19 | 20 |
| `city=Istanbul countryCode=TR` | `Music` | `2026-07-30T15:37:39Z` | `2027-01-26T15:37:39Z` | 464 | 20 | 20 | 19 | 20 |