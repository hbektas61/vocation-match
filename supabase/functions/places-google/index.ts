/**
 * The one door Google is allowed through (D-052).
 *
 * Feature three only, and only when somebody has pressed check-in. The key
 * lives here and never in the app, so it can be restricted to this backend;
 * the month's allowance is claimed before any paid request leaves, so a
 * ceiling exists rather than an alarm that tells you afterwards.
 *
 * Two operations, and deliberately no others:
 *
 *   nearby  — the ten nearest places to a reading, for the picker's second
 *             list. Field-masked to id, displayName and location; nothing
 *             else is requested, because photos and reviews are both a
 *             different price and data we have no use for.
 *   resolve — a Place ID back into a name, for a screen that is about to draw
 *             it. This is how a Google label is displayed without our ever
 *             storing Google's name (see the migration).
 *
 * What this function must never do: write a place into our catalogue, or
 * return a coordinate that then gets stored. The response carries names for
 * display; the anchor is always the caller's own cell.
 *
 * With no key configured it answers 503 `unconfigured`, which the app reads as
 * "do not offer the Google option at all" — so the screen degrades to the
 * catalogue, the written search and the cell, exactly as it does when the
 * allowance is spent.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const PLACES_NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_DETAILS = "https://places.googleapis.com/v1/places";

/** Owner decision (D-052): under the free tier, not at it. */
const MONTHLY_ALLOWANCE = Number(Deno.env.get("GOOGLE_PLACES_MONTHLY_ALLOWANCE") ?? "4500");
/** How far the picker looks. The same street Çevremde already means. */
const RADIUS_METERS = 500;
const MAX_RESULTS = 10;

/** The role claim, read without a network round trip. */
function roleOf(authorization: string): string | null {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
}

/** Great-circle metres, so the list can be ordered by distance ourselves. */
function metresBetween(
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

Deno.serve(async (req) => {
  const role = roleOf(req.headers.get("Authorization") ?? "");
  if (role !== "authenticated" && role !== "service_role") {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const key = Deno.env.get("GOOGLE_PLACES_KEY");
  if (!key) {
    // Not an error the owner has to fix at 3am: the app simply does not offer
    // the extra search until a key exists.
    return Response.json({ error: "unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Unusable request." }, { status: 400 });
  }
  const operation = String(body.op ?? "");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  /** Claimed before the request, never after: this is the ceiling. */
  const claim = async (service: string): Promise<{ allowed: boolean; remaining: number }> => {
    const { data, error } = await admin.rpc("claim_metered_call", {
      p_service: service,
      p_allowance: MONTHLY_ALLOWANCE,
    });
    if (error) {
      // A counter we cannot reach is a ceiling we cannot enforce, so the
      // paid call does not happen. Failing closed is the whole point.
      return { allowed: false, remaining: 0 };
    }
    const row = (data ?? [])[0] as { allowed?: boolean; remaining?: number } | undefined;
    return { allowed: row?.allowed === true, remaining: row?.remaining ?? 0 };
  };

  if (operation === "nearby") {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    const allowance = await claim("google_places_nearby");
    if (!allowance.allowed) {
      return Response.json({ error: "allowance_spent", remaining: 0 }, { status: 429 });
    }

    const response = await fetch(PLACES_NEARBY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // The field mask is the price: id, name and point, nothing else.
        "X-Goog-FieldMask": "places.id,places.displayName,places.location",
      },
      body: JSON.stringify({
        maxResultCount: MAX_RESULTS,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: { center: { latitude, longitude }, radius: RADIUS_METERS },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return Response.json({ error: "Could not look around just now." }, { status: 503 });
    }
    const parsed = (await response.json()) as { places?: GooglePlace[] };
    const places = (parsed.places ?? [])
      .filter((place) => place.id && place.displayName?.text)
      .map((place) => ({
        placeId: place.id!,
        name: place.displayName!.text!,
        // Returned for ordering and for the check-in reading only. The app
        // does not store it and neither do we (D-052).
        metres: place.location?.latitude !== undefined && place.location?.longitude !== undefined
          ? Math.round(metresBetween(latitude, longitude, place.location.latitude, place.location.longitude))
          : null,
      }))
      .sort((a, b) => (a.metres ?? 1e9) - (b.metres ?? 1e9));

    return Response.json({ places, remaining: allowance.remaining, attribution: "Powered by Google" });
  }

  if (operation === "resolve") {
    const placeId = String(body.placeId ?? "").trim();
    if (placeId.length < 4 || placeId.length > 200) {
      return Response.json({ error: "That place reference is not usable." }, { status: 400 });
    }

    const allowance = await claim("google_places_details");
    if (!allowance.allowed) {
      return Response.json({ error: "allowance_spent" }, { status: 429 });
    }

    const response = await fetch(`${PLACES_DETAILS}/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        // The cheapest possible ask: the name, and nothing around it.
        "X-Goog-FieldMask": "id,displayName",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return Response.json({ error: "Could not read that place." }, { status: 503 });
    }
    const place = (await response.json()) as GooglePlace;
    const name = place.displayName?.text ?? null;
    return Response.json({ placeId, name, attribution: "Powered by Google" });
  }

  return Response.json({ error: "Unknown operation." }, { status: 400 });
});
