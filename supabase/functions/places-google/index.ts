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
 *   search  — a *typed* name, biased to the caller's location, for the
 *             advanced find (D-053). Nearby is deliberately gone: by the time
 *             Google is reached the user has already typed the name, so
 *             "what is around me" belongs to our catalogue and this belongs to
 *             a text search — which is also the cheaper SKU. Field-masked to
 *             id and displayName only; we never ask for Google's coordinate,
 *             because the anchor is the caller's own cell.
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

const PLACES_TEXT = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAILS = "https://places.googleapis.com/v1/places";

/** Owner decision (D-052): under the free tier, not at it. */
const MONTHLY_ALLOWANCE = Number(Deno.env.get("GOOGLE_PLACES_MONTHLY_ALLOWANCE") ?? "4500");
/** How far the bias reaches. The same street Çevremde already means. */
const BIAS_METERS = 500;
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
}

/** The caller's own id, out of their token — no round trip. */
function subjectOf(authorization: string): string | null {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
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

  if (operation === "search") {
    const query = String(body.query ?? "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (query.length < 2) {
      return Response.json({ error: "Type a little more." }, { status: 400 });
    }
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    // D-053: attempts are limited per user, because the entitlement counts
    // finds and would otherwise let somebody search fifty times for free at
    // our expense. The caller's id comes from their own token.
    const userId = subjectOf(req.headers.get("Authorization") ?? "");
    if (!userId) {
      return Response.json({ error: "Sign in to continue." }, { status: 401 });
    }
    const { data: allowedSearch } = await admin.rpc("claim_google_search", { p_user: userId });
    if (allowedSearch !== true) {
      return Response.json({ error: "too_many_searches" }, { status: 429 });
    }

    const allowance = await claim("google_places_text");
    if (!allowance.allowed) {
      return Response.json({ error: "allowance_spent", remaining: 0 }, { status: 429 });
    }

    const response = await fetch(PLACES_TEXT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // The narrowest possible ask: an id and a name. No coordinate, no
        // photo, no rating — all of which cost more and none of which we use.
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: MAX_RESULTS,
        // Bias, not restriction: the right branch of a chain should surface
        // first without hiding a place just over the line.
        locationBias: {
          circle: { center: { latitude, longitude }, radius: BIAS_METERS },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return Response.json({ error: "Could not search just now." }, { status: 503 });
    }
    const parsed = (await response.json()) as { places?: GooglePlace[] };
    const places = (parsed.places ?? [])
      .filter((place) => place.id && place.displayName?.text)
      .map((place) => ({ placeId: place.id!, name: place.displayName!.text! }));

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
