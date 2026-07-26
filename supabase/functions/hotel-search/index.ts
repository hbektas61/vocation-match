/**
 * Hotel search: the catalogue first, the world second.
 *
 * The `hotels` table has always been a *cache* — its own comment says rows
 * come from a provider feed — but until now the only provider was a seed file
 * with five hotels in it, so every search was really a search of those five.
 * This function is the provider feed. When the catalogue answers thinly, it
 * asks OpenStreetMap's Nominatim for hotels by that name in Turkey, writes
 * what it finds through `upsert_hotel_from_provider` (the single write
 * boundary the schema was built around), and searches again.
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
/** Nominatim types that are a hotel for this product's purposes. */
const HOTEL_TYPES = new Set(["hotel", "motel", "guest_house", "resort"]);

interface NominatimHit {
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
  if (!address) return "Türkiye";
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.district ??
    address.province ??
    address.state ??
    "Türkiye"
  );
}

async function askNominatim(query: string): Promise<NominatimHit[]> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "tr");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return [];
  const hits = (await response.json()) as NominatimHit[];
  return hits.filter((hit) => HOTEL_TYPES.has(hit.type) && (hit.name ?? "").length > 0);
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

    for (const hit of found) {
      // The single write boundary. Everything the schema enforces — dedupe on
      // (provider, id), coordinate bounds, is_active — happens in there.
      await admin.rpc("upsert_hotel_from_provider", {
        p_provider: "osm",
        p_provider_hotel_id: `${hit.osm_type}/${hit.osm_id}`,
        p_name: hit.name,
        p_city: cityOf(hit.address),
        p_country: hit.address?.country ?? "Türkiye",
        p_latitude: Number(hit.lat),
        p_longitude: Number(hit.lon),
        p_address: hit.address?.road ?? null,
      });
    }

    if (found.length > 0) {
      const second = await admin.rpc("search_hotels", { p_query: query });
      if (!second.error) hotels = second.data ?? hotels;
    }
  }

  return Response.json({ hotels });
});
