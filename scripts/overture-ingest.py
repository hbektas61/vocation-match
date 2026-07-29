#!/usr/bin/env python3
"""
Overture Maps → the catalogue (D-049).

Why this is a script and not an edge function: Overture publishes its places
theme as GeoParquet on S3, not as a lookup service. It is queried with DuckDB
over HTTP range requests, which is the right shape for pre-filling a region
and the wrong shape for a per-request path. So this runs deliberately — for a
pilot city, before a launch, or before marketing at an event — and the app
afterwards reads its own catalogue, fast and with no third party in the
request.

Why Overture at all: OSM's coverage of small commercial venues is thin
exactly where this product needs it (the owner's own neighbourhood café was
missing), and the sources that have that coverage forbid the one thing the
schema is built on. Google Maps Platform terms allow caching a place id and
little else, require display on a Google map, and forbid building a derived
database — while `hotels` *is* a derived database that months of matches are
joined to. Overture's CDLA-Permissive licence allows storing and
redistributing, so it fits without a legal contortion.

Everything enters through `upsert_hotel_from_provider`, the one write
boundary, under `provider = 'overture'`. A venue found here and the same
venue found by OSM stay two rows only if their provider keys differ; that is
accepted on purpose — deduplication across providers is its own decision and
is not smuggled in here.

Usage:
    OVERTURE_RELEASE=2026-07-22.0 \\
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    python3 scripts/overture-ingest.py --bbox 28.9,40.95,29.15,41.10 --dry-run

The service role key is read from the environment and never stored here.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-07-22.0")
PLACES = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"

# Overture's category taxonomy → the app's chip vocabulary (D-041/D-049).
#
# Exact names, not substrings. The first draft matched substrings and promptly
# filed a hairdresser as a bar (`barber` contains "bar") and an events agency
# as a concert hall (`event_planning` contains "event"). A chip that guesses is
# worse than a row that never appears, so every name here was read off the
# real taxonomy in the pilot bbox rather than imagined. Anything unlisted is
# not a place a crowd gathers at for this product's purposes and is skipped.
CAFE = {
    "cafe", "coffee_shop", "bakery", "tea_room", "patisserie",
    "dessert_shop", "ice_cream_shop", "creperie", "bubble_tea",
}
RESTAURANT = {
    "restaurant", "food_court", "steakhouse", "pizzeria", "buffet",
    "diner", "bistro", "meyhane",
}
BAR = {
    "bar", "pub", "brewery", "brewpub", "night_club", "nightclub",
    "cocktail_bar", "wine_bar", "beer_bar", "sports_bar", "hookah_bar",
    "beer_garden", "biergarten", "karaoke", "nightlife",
}
HOTEL = {
    "hotel", "motel", "hostel", "resort", "bed_and_breakfast",
    "guest_house", "boutique_hotel",
}
BEACH = {"beach", "beach_bar", "public_beach"}
VENUE = {
    "stadium_arena", "stadium", "arena", "concert_venue", "music_venue",
    "performing_arts_venue", "performing_arts", "theater", "theatre",
    "amphitheater", "opera_house", "concert_hall", "festival",
    "art_gallery", "museum", "amusement_park", "water_park", "theme_park",
    "zoo", "aquarium", "park", "casino", "cultural_center",
    "convention_center", "exhibition_center", "arts_and_entertainment",
    "landmark_and_historical_building", "botanical_garden",
}

KIND_BY_CATEGORY: dict[str, str] = {
    **{name: "cafe" for name in CAFE},
    **{name: "restaurant" for name in RESTAURANT},
    **{name: "bar" for name in BAR},
    **{name: "hotel" for name in HOTEL},
    **{name: "beach" for name in BEACH},
    **{name: "venue" for name in VENUE},
}


def kind_of(category: str | None, alternates: list[str] | None) -> str | None:
    """
    The place's kind, from its own categories — primary first, then any
    alternates, so a venue Overture filed under a parent category is not lost.

    `*_restaurant` is the one pattern rule: the taxonomy carries a long tail of
    cuisines (`turkish_restaurant`, `fast_food_restaurant`) that are all the
    same kind of place, and listing them would be a losing game.
    """
    candidates = [category, *(alternates or [])]
    for candidate in candidates:
        if not candidate:
            continue
        name = candidate.strip().lower()
        if name in KIND_BY_CATEGORY:
            return KIND_BY_CATEGORY[name]
        if name.endswith("_restaurant"):
            return "restaurant"
    return None


def connect():
    try:
        import duckdb
    except ModuleNotFoundError:
        sys.exit("duckdb is required: pip install duckdb")
    con = duckdb.connect()
    con.execute("install httpfs; load httpfs; set s3_region='us-west-2';")
    return con


def tiles_of(
    bbox: tuple[float, float, float, float], grid: int
) -> list[tuple[float, float, float, float]]:
    west, south, east, north = bbox
    dx = (east - west) / grid
    dy = (north - south) / grid
    return [
        (west + x * dx, south + y * dy, west + (x + 1) * dx, south + (y + 1) * dy)
        for x in range(grid)
        for y in range(grid)
    ]


def fetch(con, bbox: tuple[float, float, float, float], limit: int) -> list[dict]:
    west, south, east, north = bbox
    rows = con.execute(
        f"""
        select id,
               names.primary                as name,
               categories.primary           as category,
               categories.alternate         as alternates,
               addresses[1].locality        as city,
               addresses[1].country         as country,
               addresses[1].freeform        as address,
               bbox.ymin                    as latitude,
               bbox.xmin                    as longitude,
               confidence
          from read_parquet('{PLACES}', hive_partitioning=1)
         where bbox.xmin between ? and ?
           and bbox.ymin between ? and ?
           and names.primary is not null
         limit ?
        """,
        [west, east, south, north, limit],
    ).fetchall()
    columns = [
        "id", "name", "category", "alternates", "city",
        "country", "address", "latitude", "longitude", "confidence",
    ]
    return [dict(zip(columns, row)) for row in rows]


def upsert(place: dict, kind: str, url: str, key: str) -> None:
    payload = json.dumps({
        "p_provider": "overture",
        "p_provider_hotel_id": place["id"],
        "p_name": place["name"][:120],
        # The catalogue asks for both, and a place with neither is not one
        # somebody could plan around.
        "p_city": (place.get("city") or "—")[:80],
        "p_country": (place.get("country") or "—")[:80],
        "p_latitude": float(place["latitude"]),
        "p_longitude": float(place["longitude"]),
        "p_address": (place.get("address") or None),
        "p_venue_kind": kind,
    }).encode()
    request = urllib.request.Request(
        f"{url}/rest/v1/rpc/upsert_hotel_from_provider",
        data=payload,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-fill the catalogue from Overture places.")
    parser.add_argument("--bbox", required=True, help="west,south,east,north in degrees")
    parser.add_argument("--limit", type=int, default=5000, help="rows to read per tile")
    parser.add_argument(
        "--grid",
        type=int,
        default=1,
        help="split the bbox into grid×grid tiles, so coverage is even across it",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.5,
        help="Overture's own confidence floor; below it a row is a guess.",
    )
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    parser.add_argument(
        "--cache",
        help=(
            "JSON file to read the region from, or write it to. Reading Overture "
            "for a city takes minutes; a failed write should not pay for it twice."
        ),
    )
    args = parser.parse_args()

    west, south, east, north = (float(part) for part in args.bbox.split(","))

    if args.cache and os.path.exists(args.cache):
        with open(args.cache) as handle:
            places = json.load(handle)
        print(f"cache: {len(places)} places from {args.cache}")
        finish(places, args)
        return

    con = connect()
    places = []
    seen_ids = set()
    for index, tile in enumerate(tiles_of((west, south, east, north), args.grid), start=1):
        found = fetch(con, tile, args.limit)
        fresh = [place for place in found if place["id"] not in seen_ids]
        seen_ids.update(place["id"] for place in fresh)
        places.extend(fresh)
        print(f"  tile {index}/{args.grid ** 2}: {len(found)} read, {len(fresh)} new", flush=True)

    if args.cache:
        with open(args.cache, "w") as handle:
            json.dump(places, handle)
        print(f"cache: wrote {len(places)} places to {args.cache}")

    finish(places, args)


def finish(places: list[dict], args) -> None:

    kept: list[tuple[dict, str]] = []
    skipped_kind = 0
    skipped_confidence = 0
    for place in places:
        if (place.get("confidence") or 0) < args.min_confidence:
            skipped_confidence += 1
            continue
        kind = kind_of(place.get("category"), place.get("alternates"))
        if kind is None:
            skipped_kind += 1
            continue
        kept.append((place, kind))

    counts: dict[str, int] = {}
    for _, kind in kept:
        counts[kind] = counts.get(kind, 0) + 1

    print(f"Overture {RELEASE}: read {len(places)}, keeping {len(kept)}")
    print(f"  skipped — not a gathering place: {skipped_kind}, low confidence: {skipped_confidence}")
    print(f"  by kind: {counts}")
    for place, kind in kept[:10]:
        print(f"    · {place['name'][:44]:44} {kind:10} {place.get('city') or '—'}")

    if args.dry_run:
        print("dry run: nothing written")
        return

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write")

    # One RPC per place, eight at a time: the write boundary is a function
    # call, not a bulk endpoint, and a region's worth of places sequentially
    # would take longer than the person running it will wait.
    written = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(upsert, place, kind, url, key): place for place, kind in kept}
        for future in as_completed(futures):
            place = futures[future]
            try:
                future.result()
                written += 1
            except (urllib.error.HTTPError, urllib.error.URLError) as error:
                failed += 1
                if failed <= 5:
                    print(f"  ! {place['name'][:40]}: {error}", file=sys.stderr)
    print(f"written: {written}/{len(kept)}" + (f", failed: {failed}" if failed else ""))


if __name__ == "__main__":
    main()
