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
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
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
  return kindOf(tags) !== null;
}

/** The category chip's truth (D-041), from the provider's own tags. */
function kindOf(tags: Record<string, string>): string | null {
  if (/^(cafe)$/.test(tags.amenity ?? "")) return "cafe";
  if (/^(restaurant)$/.test(tags.amenity ?? "")) return "restaurant";
  if (/^(bar|pub|nightclub)$/.test(tags.amenity ?? "")) return "bar";
  if (/^(hotel|guest_house|motel|resort)$/.test(tags.tourism ?? "")) return "hotel";
  if (tags.leisure === "beach_resort" || tags.natural === "beach") return "beach";
  return null;
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

interface ReverseArea {
  osmType: string;
  osmId: number;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
  radiusMeters: number;
}

/** Great-circle metres — enough precision to size an area's ring. */
function haversineMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Where there is no venue, the neighbourhood is the venue (D-039): a
 * reverse lookup names the area the point sits in — suburb, neighbourhood,
 * village — and returns *its* public centroid, never the caller's point.
 */
async function reverseArea(latitude: number, longitude: number): Promise<ReverseArea | null> {
  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "14");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const hit = (await response.json()) as {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    lat?: string;
    lon?: string;
    address?: Record<string, string>;
    boundingbox?: [string, string, string, string];
  };
  const name =
    hit.name ||
    hit.address?.suburb ||
    hit.address?.neighbourhood ||
    hit.address?.village ||
    hit.address?.town ||
    "";
  if (!name || !hit.osm_type || !hit.osm_id || !hit.lat || !hit.lon) return null;
  const centerLatitude = Number(hit.lat);
  const centerLongitude = Number(hit.lon);
  // The ring has to cover the whole area, and a rural mahalle can put its
  // centroid kilometres from a resident: size it from the bounding box
  // (centroid to the far corner), clamped to the schema's 100–5000 m rule.
  let radiusMeters = 2000;
  if (hit.boundingbox) {
    const [latMin, latMax, lonMin, lonMax] = hit.boundingbox.map(Number);
    const corner = Math.max(
      haversineMeters(centerLatitude, centerLongitude, latMin, lonMin),
      haversineMeters(centerLatitude, centerLongitude, latMax, lonMax),
    );
    radiusMeters = Math.min(5000, Math.max(2000, Math.ceil(corner)));
  }
  return {
    osmType: hit.osm_type,
    osmId: hit.osm_id,
    name,
    latitude: centerLatitude,
    longitude: centerLongitude,
    city:
      hit.address?.town ??
      hit.address?.city ??
      hit.address?.province ??
      "Türkiye",
    radiusMeters,
  };
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

  /** Overpass finds → catalogue rows, upserted concurrently. */
  const storeFound = async (found: OverpassElement[]) => {
    await Promise.all(
      found.map((element) => {
        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        if (lat === undefined || lon === undefined) return Promise.resolve();
        // The single write boundary, and the same provider-key space as
        // hotel-search: a venue found both ways is one row.
        return admin.rpc("upsert_hotel_from_provider", {
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
          p_venue_kind: kindOf(element.tags!),
        });
      }),
    );
  };

  const first = await admin.rpc("nearby_venues", {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (first.error) {
    return Response.json({ error: "Could not look around." }, { status: 500 });
  }
  let venues = first.data ?? [];

  // Anything cached answers *now*. A thin-but-nonempty area is enriched in
  // the background, so the next look around here is both instant and rich —
  // the person standing there is never made to wait on Overpass twice.
  if (venues.length > 0) {
    if (venues.length < THIN) {
      const warm = askOverpass(latitude, longitude).then(storeFound).catch(() => {});
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(warm);
      else await warm;
    }
    return Response.json({ venues });
  }

  // Empty catalogue: the two outside sources are independent questions, so
  // they are asked at the same time — venues around the point, and the name
  // of the area the point sits in.
  const [overpassResult, areaResult] = await Promise.allSettled([
    askOverpass(latitude, longitude),
    reverseArea(latitude, longitude),
  ]);
  const found = overpassResult.status === "fulfilled" ? overpassResult.value : [];
  const area = areaResult.status === "fulfilled" ? areaResult.value : null;

  if (found.length > 0) {
    await storeFound(found);
  } else if (area) {
    // Where there is no venue, the neighbourhood is the venue: its own
    // public centroid and a ring sized from its bounding box. The caller's
    // reading is never written.
    const upserted = await admin.rpc("upsert_hotel_from_provider", {
      p_provider: "osm",
      p_provider_hotel_id: `${area.osmType}/${area.osmId}`,
      p_name: area.name,
      p_city: area.city,
      p_country: "Türkiye",
      p_latitude: area.latitude,
      p_longitude: area.longitude,
      p_address: null,
      p_photo_url: null,
      p_photo_attribution: null,
      p_venue_kind: "area",
    });
    if (!upserted.error && upserted.data) {
      await admin
        .from("hotels")
        .update({ checkin_radius_meters: area.radiusMeters })
        .eq("id", upserted.data);
    }
  }

  if (found.length > 0 || area) {
    const second = await admin.rpc("nearby_venues", {
      p_latitude: latitude,
      p_longitude: longitude,
    });
    if (!second.error) venues = second.data ?? venues;
  }

  return Response.json({ venues });
});
