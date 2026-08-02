# D-060 — Country → City → Hotel

## Figma source of truth

- File: `Vacation Match — Flows`
- File key: `wIc8HyZwV1rD2IY3csJa49`
- Page: `D-060 — Country City Hotel Wizard`
- Page node: `108:1668`
- URL: https://www.figma.com/design/wIc8HyZwV1rD2IY3csJa49/Vacation-Match-%E2%80%94-Flows?node-id=108-1668

The page reuses the D-058 light-theme variables and existing button, chip,
search-field, notice, empty-state and list-row components. It adds no parallel
visual system.

## Screen inventory

### Turkish primary flow

- `109:1694` — Country, idle
- `109:1707` — Country search and results
- `109:1718` — City or holiday area, idle
- `109:1731` — City or holiday area, results
- `109:1742` — Hotel, idle
- `109:1757` — Hotel, results
- `109:1771` — First-selection confirmation
- `109:1787` — Active vacation venue

### Recovery and responsive

- `113:1765` — Destination empty/provider unavailable
- `113:1777` — Hotel empty and broader-search fallback
- `113:1789` — Expired destination session
- `113:1802` — Replacing an active hotel
- `113:1814` — 320 px country
- `113:1831` — 375 px hotel results

### English

- `114:1816` — Country
- `114:1833` — City or holiday area
- `114:1850` — Hotel
- `114:1869` — First-selection confirmation

## Interaction contract

1. Country is local data. It never displays Google attribution or spends a
   provider request.
2. Destination search is restricted to the selected country.
3. Hotel search is restricted to the selected destination's server-owned
   viewport.
4. `Hotels` is selected first. `All vacation places` is the explicit fallback
   for beach clubs and named beaches.
5. Changing country clears destination, venue query, predictions and sessions.
   Changing destination preserves country and clears venue state.
6. A first selection is reviewed before activation. Replacing an active venue
   uses only the existing destructive switch confirmation.
7. Provider content remains transient. No Google name, address, photo,
   coordinate, rating or viewport is persisted.

## Verification

The page contains 18 screens and 33 prototype reactions. The final audit found
no placeholder layers, font substitutions or overflow. Country screens contain
no Google attribution; result and confirmation screens that draw Google content
do.
