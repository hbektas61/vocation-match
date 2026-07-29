/**
 * Hotel search: the catalogue first, the world second.
 *
 * The `hotels` table has always been a *cache* — its own comment says rows
 * come from a provider feed — but until now the only provider was a seed file
 * with five hotels in it, so every search was really a search of those five.
 * This function is the provider feed. When the catalogue answers thinly, it
 * asks OpenStreetMap's Nominatim for venues by that name — anywhere in the
 * world (D-047) — writes what it finds through `upsert_hotel_from_provider`
 * (the single write boundary the schema was built around), and searches
 * again. The search is destination-first: the place someone is going lives
 * in their query, so no location or country bias is applied here.
 *
 * The catalogue therefore grows lazily: only hotels somebody actually searched
 * for are ever stored, which is bounded by the real world rather than by the
 * number of searches — repeats hit the cache and never leave the database.
 *
 * Why OSM and not a commercial places API: the licence. ODbL allows storing
 * the data (with attribution, which the hotel screen carries); Google's terms
 * forbid caching place data beyond an ID, which is incompatible with a product
 * whose entire design is "activate a hotel that lives in our table".
 *
 * Nominatim's usage policy asks for a real User-Agent and at most one request
 * a second. The client's debounce, the two-character minimum, and the
 * cache-first flow keep a pilot comfortably under that; if this ever grows
 * past a pilot, this function is where a queue would go.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "VocationMatch/0.1 (pilot; hamibektas61@gmail.com)";
/** Below this many catalogue hits, the world is worth asking. */
const THIN = 5;
/**
 * Nominatim types that are an anchor place for this product's purposes.
 *
 * Widened past lodging on 2026-07-28 (D-037): the summer crowd the owner is
 * building for gathers at beach clubs as much as at hotels, and OSM tags
 * those as `bar`, `nightclub` or `beach_resort` — Before Sunset in Alaçatı
 * is an `amenity=bar` — and a named public beach (Ilıca Plajı) is
 * `natural=beach`. The filter's real job is unchanged: keep specific,
 * named venues and drop the geography a bare name drags in (parks, roads,
 * whole towns). A named beach people plan a day around is a venue; an
 * unnamed stretch of coast never reaches this filter, because the name
 * match happens first.
 */
const HOTEL_TYPES = new Set([
  "hotel",
  "motel",
  "guest_house",
  "hostel",
  "resort",
  "beach_resort",
  "beach",
  "bar",
  "pub",
  "nightclub",
  "cafe",
  "restaurant",
  // D-049: places built for a crowd. Every big Istanbul concert venue was in
  // OSM and every one was refused here, which is why "konsere gittim, mekân
  // yok" was our answer rather than the map's.
  "theatre",
  "arts_centre",
  "events_venue",
  "conference_centre",
  "cinema",
  "stadium",
  "sports_centre",
  "arena",
  "theme_park",
  "attraction",
  "water_park",
  "zoo",
  "aquarium",
  "museum",
]);

/** The category chip's truth (D-041), from Nominatim's own type. */
function kindOfType(type: string): string | null {
  if (type === "cafe") return "cafe";
  if (type === "restaurant") return "restaurant";
  if (/^(bar|pub|nightclub|biergarten)$/.test(type)) return "bar";
  if (/^(theatre|arts_centre|events_venue|conference_centre|cinema|stadium|sports_centre|arena|theme_park|attraction|water_park|zoo|aquarium|museum)$/.test(type)) {
    return "venue";
  }
  if (/^(hotel|motel|guest_house|resort)$/.test(type)) return "hotel";
  if (/^(beach|beach_resort)$/.test(type)) return "beach";
  return null;
}

interface NominatimHit {
  extratags?: Record<string, string>;
  osm_type: string;
  osm_id: number;
  type: string;
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

/** The role claim, read without a network round trip. */
function roleOf(authorization: string): string | null {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function cityOf(address: Record<string, string> | undefined): string {
  if (!address) return "—";

  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.district ??
    address.province ??
    address.state ??
    address.country ??
    "—"
  );
}

async function askNominatimOnce(query: string): Promise<NominatimHit[]> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", query);
  // D-047 (owner, 2026-07-29): the search is global. The earlier tr,cy lock
  // was the pilot's scope, not the product's — someone in Germany plans a
  // Türkiye trip from home, and the destination lives in the *query*, never
  // in where the phone happens to be. Deliberately no viewbox and no
  // location bias here: text relevance and Nominatim's own importance rank
  // the world, and the result card's city/country line does the
  // disambiguation. Proximity stays what Çevremde is for.
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return [];
  const hits = (await response.json()) as NominatimHit[];
  // A country is required downstream (the catalogue's own constraint asks
  // for one); with addressdetails=1 it is virtually always present, and a
  // hit without one is not a venue anyone can plan a trip around.
  return hits.filter(
    (hit) =>
      HOTEL_TYPES.has(hit.type) &&
      (hit.name ?? "").length > 0 &&
      (hit.address?.country ?? "").length >= 2,
  );
}

/**
 * Ask with "hotel" appended first. A big resort in OSM is several objects —
 * grounds tagged as a park, buildings, the hotel node — and for a bare brand
 * name ("voyage") Nominatim ranks the park polygons on top, which the type
 * filter then rightly discards, leaving nothing. Biasing the query toward
 * the hotel objects surfaces them; the bare query stays as the fallback for
 * names where the extra word confuses more than it helps.
 */
async function askNominatim(query: string): Promise<NominatimHit[]> {
  const biased = await askNominatimOnce(`${query} hotel`);
  if (biased.length > 0) return biased;
  const bare = await askNominatimOnce(query);
  if (bare.length > 0) return bare;
  // A venue's colloquial name often carries one word OSM's record does not
  // ("before sunset beach" where OSM says "Before Sunset Bar"). Drop the
  // last word and ask once more before giving up — one extra request, only
  // on the empty-handed path, and only while what remains is still a name
  // rather than a fragment.
  const words = query.trim().split(/\s+/);
  if (words.length >= 2) {
    const kept = words.slice(0, -1).join(" ");
    if (kept.replace(/\s+/g, "").length >= 5) {
      return askNominatimOnce(kept);
    }
  }
  return [];
}

/** Wikidata P18 → a Commons photo URL and the credit line its licence asks for. */
async function commonsPhoto(
  wikidataId: string,
): Promise<{ url: string; attribution: string } | null> {
  try {
    const claimsRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(wikidataId)}&property=P18&format=json`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(3_000) },
    );
    if (!claimsRes.ok) return null;
    const claims = await claimsRes.json();
    const file = claims?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (typeof file !== "string" || file.length === 0) return null;

    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replaceAll(" ", "_"))}?width=1200`;

    // The licence's half of the bargain: name the author. Best-effort — if
    // the metadata call fails, the generic credit still names the source.
    let attribution = "Wikimedia Commons";
    try {
      const infoRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${file}`)}&prop=imageinfo&iiprop=extmetadata&format=json`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(3_000) },
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        const pages = info?.query?.pages ?? {};
        const first = Object.values(pages)[0] as
          | { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }
          | undefined;
        const meta = first?.imageinfo?.[0]?.extmetadata;
        const artist = String(meta?.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim();
        const licence = String(meta?.LicenseShortName?.value ?? "").trim();
        const parts = [artist, licence, "Wikimedia Commons"].filter((part) => part.length > 0);
        attribution = parts.join(" · ").slice(0, 200);
      }
    } catch {
      // The generic credit stands.
    }
    return { url, attribution };
  } catch {
    return null;
  }
}

/**
 * Google Places, when the owner's key is present: find the place for a hotel
 * and keep only its ID — the one thing Google's terms let us store. The
 * photo itself is served fresh by the hotel-photo function at request time.
 * Returns the attribution to show beside it, or null when Google does not
 * know the place or has no photo.
 */
async function googlePlace(
  name: string,
  city: string,
): Promise<{ placeId: string; attribution: string } | null> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return null;
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.photos",
      },
      body: JSON.stringify({
        textQuery: `${name} ${city}`,
        includedType: "lodging",
        regionCode: "TR",
        maxResultCount: 1,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const place = data?.places?.[0];
    const photo = place?.photos?.[0];
    if (!place?.id || !photo) return null;
    const author = String(photo.authorAttributions?.[0]?.displayName ?? "").trim();
    const attribution = author ? `${author} · Google` : "Google";
    return { placeId: place.id, attribution: attribution.slice(0, 200) };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // The same audience the database grants `search_hotels` to. The anon key is
  // a valid JWT and passes the platform's signature check, so the role has to
  // be looked at here — a signed-out client gets the same refusal the RPC
  // would give it.
  const role = roleOf(req.headers.get("Authorization") ?? "");
  if (role !== "authenticated" && role !== "service_role") {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  let query = "";
  try {
    const body = await req.json();
    query = String(body?.query ?? "").trim();
  } catch {
    // An empty body is an empty search, not an error.
  }
  if (query.length < 2) {
    return Response.json({ hotels: [] });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const first = await admin.rpc("search_hotels", { p_query: query });
  if (first.error) {
    return Response.json({ error: "Could not search hotels." }, { status: 500 });
  }
  let hotels = first.data ?? [];

  if (hotels.length < THIN && query.length >= 3) {
    let found: NominatimHit[] = [];
    try {
      found = await askNominatim(query);
    } catch {
      // The world being unreachable must not take the catalogue down with it:
      // the thin answer is still an answer.
    }

    // The owner's rule for the hotel card is "the photo is a must"; the
    // honest reading is "a photo only when it is really this hotel". Many
    // OSM hotels carry a wikidata tag whose P18 is a curated photograph on
    // Commons — resolved here, in parallel, best-effort, with the credit
    // line the licence requires. No claim, no photo, no invention.
    const photos = await Promise.all(
      found.map((hit) =>
        hit.extratags?.wikidata ? commonsPhoto(hit.extratags.wikidata) : Promise.resolve(null),
      ),
    );

    for (let i = 0; i < found.length; i += 1) {
      const hit = found[i];
      // The single write boundary. Everything the schema enforces — dedupe on
      // (provider, id), coordinate bounds, is_active — happens in there.
      await admin.rpc("upsert_hotel_from_provider", {
        p_provider: "osm",
        p_provider_hotel_id: `${hit.osm_type}/${hit.osm_id}`,
        p_name: hit.name,
        p_city: cityOf(hit.address),
        p_country: hit.address?.country ?? "Unknown",
        p_latitude: Number(hit.lat),
        p_longitude: Number(hit.lon),
        p_address: hit.address?.road ?? null,
        p_photo_url: photos[i]?.url ?? null,
        p_photo_attribution: photos[i]?.attribution ?? null,
        p_venue_kind: kindOfType(hit.type),
      });
    }

    if (found.length > 0) {
      const second = await admin.rpc("search_hotels", { p_query: query });
      if (!second.error) hotels = second.data ?? hotels;
    }
  }

  // Google fills what Commons could not — for the rows this answer is about,
  // whether they were cached long ago or written a moment ago. The ID is
  // stored; the photo never is: photo_url points at our own hotel-photo
  // function, which asks Google fresh each time.
  if (Deno.env.get("GOOGLE_PLACES_API_KEY")) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const candidates = (hotels as {
      id: string;
      name: string;
      city: string;
      photo_url: string | null;
    }[]).filter((h) => !h.photo_url).slice(0, 5);

    await Promise.all(
      candidates.map(async (hotel) => {
        const { data: row } = await admin
          .from("hotels")
          .select("google_place_id")
          .eq("id", hotel.id)
          .maybeSingle();
        if (!row || row.google_place_id) return; // looked before; no photo then, none now.
        const place = await googlePlace(hotel.name, hotel.city);
        if (!place) return;
        const photoUrl = `${supabaseUrl}/functions/v1/hotel-photo?hotel=${hotel.id}`;
        await admin
          .from("hotels")
          .update({
            google_place_id: place.placeId,
            photo_url: photoUrl,
            photo_attribution: place.attribution,
          })
          .eq("id", hotel.id);
        const patched = (hotels as { id: string; photo_url: string | null; photo_attribution?: string | null }[])
          .find((h) => h.id === hotel.id);
        if (patched) {
          patched.photo_url = photoUrl;
          patched.photo_attribution = place.attribution;
        }
      }),
    );
  }

  return Response.json({ hotels });
});
