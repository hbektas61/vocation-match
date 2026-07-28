/**
 * Venues around a point: the catalogue first, the world second (D-039).
 *
 * The check-in screen sends one foreground reading; this answers with the
 * named venues within check-in range, nearest first. When the catalogue is
 * thin there, Overpass (OSM's around-a-point query engine) fills it — the
 * same licence and the same single write boundary as `hotel-search`, so a
 * venue discovered by standing at it is exactly as real in the table as one
 * discovered by typing its name. There is no "hotel" bias here at all: a
 * person checking in is at a bar, a beach, a café — the tag list says so.
 *
 * The reading is used and discarded; nothing about the caller is stored.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "VocationMatch/0.1 (pilot; hamibektas61@gmail.com)";
/** Below this many catalogue hits around the point, the world is asked. */
const THIN = 3;
/** Matches app.presence_radius_meters: everything offered is check-in-able. */
const RADIUS_METERS = 500;

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

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Named places people gather at — the same families the search admits. */
function isVenue(tags: Record<string, string>): boolean {
  return (
    /^(bar|cafe|pub|restaurant|nightclub)$/.test(tags.amenity ?? "") ||
    /^(hotel|guest_house|motel|resort)$/.test(tags.tourism ?? "") ||
    tags.leisure === "beach_resort" ||
    tags.natural === "beach"
  );
}

async function askOverpass(latitude: number, longitude: number): Promise<OverpassElement[]> {
  const around = `(around:${RADIUS_METERS},${latitude},${longitude})`;
  const query = `
[out:json][timeout:5];
(
  nwr[name][amenity~"^(bar|cafe|pub|restaurant|nightclub)$"]${around};
  nwr[name][tourism~"^(hotel|guest_house|motel|resort)$"]${around};
  nwr[name][leisure=beach_resort]${around};
  nwr[name][natural=beach]${around};
);
out center 30;`;
  const response = await fetch(OVERPASS, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) return [];
  const parsed = (await response.json()) as { elements?: OverpassElement[] };
  return (parsed.elements ?? []).filter(
    (element) =>
      (element.tags?.name ?? "").length > 0 &&
      element.tags !== undefined &&
      isVenue(element.tags) &&
      (element.lat !== undefined || element.center !== undefined),
  );
}

Deno.serve(async (req) => {
  const role = roleOf(req.headers.get("Authorization") ?? "");
  if (role !== "authenticated" && role !== "service_role") {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  let latitude = Number.NaN;
  let longitude = Number.NaN;
  try {
    const body = await req.json();
    latitude = Number(body?.latitude);
    longitude = Number(body?.longitude);
  } catch {
    // Falls through to the validation below.
  }
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return Response.json({ error: "That location reading is not usable." }, { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const first = await admin.rpc("nearby_venues", {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (first.error) {
    return Response.json({ error: "Could not look around." }, { status: 500 });
  }
  let venues = first.data ?? [];

  if (venues.length < THIN) {
    let found: OverpassElement[] = [];
    try {
      found = await askOverpass(latitude, longitude);
    } catch {
      // The world being unreachable must not take the catalogue down with
      // it: the thin answer is still an answer.
    }

    for (const element of found) {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat === undefined || lon === undefined) continue;
      // The single write boundary, and the same provider-key space as
      // hotel-search: a venue found both ways is one row.
      await admin.rpc("upsert_hotel_from_provider", {
        p_provider: "osm",
        p_provider_hotel_id: `${element.type}/${element.id}`,
        p_name: element.tags!.name,
        p_city: element.tags!["addr:city"] ?? element.tags!["addr:town"] ?? "Türkiye",
        p_country: "Türkiye",
        p_latitude: lat,
        p_longitude: lon,
        p_address: element.tags!["addr:street"] ?? null,
        p_photo_url: null,
        p_photo_attribution: null,
      });
    }

    if (found.length > 0) {
      const second = await admin.rpc("nearby_venues", {
        p_latitude: latitude,
        p_longitude: longitude,
      });
      if (!second.error) venues = second.data ?? venues;
    }
  }

  return Response.json({ venues });
});
