/**
 * The one door Google is allowed through (D-052, corrected by D-053).
 *
 * Two operations, and deliberately no others:
 *
 *   search  — Autocomplete (New). A *typed* name, restricted to 1,500 m around
 *             the caller, inside a session that bills as one session. Neither
 *             Nearby Search nor Text Search is used: by the time this is
 *             reached the user has typed a name, and Autocomplete is both the
 *             right tool and the cheaper SKU. The response carries an opaque
 *             selection token per prediction rather than a bare Place ID.
 *   resolve — a Place ID back into a name for a screen about to draw it. This
 *             is how a Google label is displayed without our storing Google's
 *             name anywhere.
 *
 * Three rules this file exists to keep:
 *
 *   1. The key never leaves the backend, so it can be restricted to it.
 *   2. Nothing is spent without being claimed first, and the two Google
 *      operations have *separate* monthly ceilings — one is cheap and frequent,
 *      the other is not, and a single counter hid that.
 *   3. A Place ID the client invented must never become a label. The backend
 *      records what Autocomplete actually returned, bound to the user who
 *      searched, and hands back a single-use token; `checkin_here` accepts the
 *      token and nothing else.
 *
 * With no key configured it answers 503 `unconfigured`, which the app reads as
 * "do not offer the advanced find" — the same shape as a spent allowance, so
 * the screen degrades to the catalogue, its own search, and the cell anchor.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Autocomplete (New). Deliberately not `places:searchText` and not
 * `places:searchNearby`; a static contract test fails if either reappears.
 */
const PLACES_AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS = "https://places.googleapis.com/v1/places";

/**
 * Pilot ceilings (D-053 §3): configuration rather than product limits, and
 * separate per operation, because Autocomplete requests are many and cheap
 * while label resolutions are fewer and dearer.
 */
const AUTOCOMPLETE_ALLOWANCE = Number(
  Deno.env.get("GOOGLE_AUTOCOMPLETE_MONTHLY_ALLOWANCE") ?? "9000",
);
const DETAILS_ALLOWANCE = Number(
  Deno.env.get("GOOGLE_DETAILS_MONTHLY_ALLOWANCE") ?? "4500",
);
/** Restriction, not bias: a result outside the area is not an answer here. */
const RESTRICT_METERS = Number(Deno.env.get("GOOGLE_SEARCH_RADIUS_METERS") ?? "1500");
/** Below this there is nothing to search for (D-053 §3). */
const MIN_QUERY = 3;

/** A claim in the caller's token, read without a network round trip. */
function claimOf(authorization: string, field: string): string | null {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload[field] === "string" ? payload[field] : null;
  } catch {
    return null;
  }
}

interface PlacePrediction {
  placeId?: string;
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
}

Deno.serve(async (req) => {
  const authorization = req.headers.get("Authorization") ?? "";
  const role = claimOf(authorization, "role");
  if (role !== "authenticated" && role !== "service_role") {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const key = Deno.env.get("GOOGLE_PLACES_KEY");
  if (!key) {
    return Response.json({ error: "unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Unusable request." }, { status: 400 });
  }
  const operation = String(body.op ?? "");

  const userId = claimOf(authorization, "sub");
  if (!userId) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  /**
   * Claimed before the upstream request, never counted after it. A counter we
   * cannot reach means the paid call does not happen: failing closed is the
   * entire point of having a ceiling.
   */
  const claim = async (
    service: string,
    allowance: number,
  ): Promise<{ allowed: boolean; remaining: number }> => {
    const { data, error } = await admin.rpc("claim_metered_call", {
      p_service: service,
      p_allowance: allowance,
    });
    if (error) return { allowed: false, remaining: 0 };
    const row = (data ?? [])[0] as { allowed?: boolean; remaining?: number } | undefined;
    return { allowed: row?.allowed === true, remaining: row?.remaining ?? 0 };
  };

  /**
   * D-053 §9: one row per attempt or refusal. No query text, no coordinate, no
   * display name — an operation, an outcome, and who it was for. Never awaited
   * for correctness: a failed measurement must not fail a request.
   */
  const measure = (
    op: string,
    outcome: string,
    sessionId?: string | null,
  ): Promise<unknown> =>
    admin
      .rpc("record_provider_event", {
        p_operation: op,
        p_outcome: outcome,
        p_user: userId,
        p_session: sessionId ?? null,
      })
      .then(() => undefined, () => undefined);

  const closeSession = (sessionId: string, outcome: string): Promise<unknown> =>
    admin
      .rpc("close_search_session", {
        p_user: userId,
        p_session: sessionId,
        p_outcome: outcome,
      })
      .then(() => undefined, () => undefined);

  if (operation === "search") {
    const query = String(body.query ?? "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const sessionIn = typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : null;

    if (query.replace(/\s+/g, "").length < MIN_QUERY) {
      return Response.json({ error: "query_too_short", minimum: MIN_QUERY }, { status: 400 });
    }
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    // The session is the unit the rolling limits count — ten an hour, thirty a
    // day — and it also carries the per-session upstream cap and the Google
    // session token. All of it is decided server-side.
    const { data: sessionRows, error: sessionError } = await admin.rpc("open_search_session", {
      p_user: userId,
      p_session: sessionIn,
      p_query: query,
    });
    if (sessionError) {
      return Response.json({ error: "Could not start a search." }, { status: 503 });
    }
    const session = (sessionRows ?? [])[0] as
      | {
        allowed?: boolean;
        session_id?: string;
        google_token?: string;
        duplicate?: boolean;
        reason?: string;
      }
      | undefined;
    if (!session?.allowed || !session.session_id || !session.google_token) {
      await measure("google_autocomplete", "refused_session", session?.session_id);
      return Response.json({ error: session?.reason ?? "search_unavailable" }, { status: 429 });
    }

    // D-053 §3: the same normalized input in the same session. Nothing is
    // asked upstream and nothing is metered — the caller keeps the predictions
    // it already has, which is why none of them had to be stored.
    if (session.duplicate) {
      await measure("google_autocomplete", "deduplicated", session.session_id);
      return Response.json({
        duplicate: true,
        places: [],
        sessionId: session.session_id,
        attribution: "Powered by Google",
      });
    }

    const allowance = await claim("google_autocomplete", AUTOCOMPLETE_ALLOWANCE);
    if (!allowance.allowed) {
      await measure("google_autocomplete", "refused_ceiling", session.session_id);
      return Response.json({ error: "allowance_spent", remaining: 0 }, { status: 429 });
    }

    const response = await fetch(PLACES_AUTOCOMPLETE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // The narrowest mask the picker can work from: an id, the name, and the
        // secondary line that tells two branches of a chain apart. No
        // coordinate is requested — the anchor is the caller's own cell.
        "X-Goog-FieldMask": [
          "suggestions.placePrediction.placeId",
          "suggestions.placePrediction.structuredFormat.mainText.text",
          "suggestions.placePrediction.structuredFormat.secondaryText.text",
        ].join(","),
      },
      body: JSON.stringify({
        input: query,
        // One token for the whole session, so Google bills a session rather
        // than a request per keystroke.
        sessionToken: session.google_token,
        // Restriction rather than bias: a place outside the area is not an
        // answer to "what am I sitting in".
        locationRestriction: {
          circle: { center: { latitude, longitude }, radius: RESTRICT_METERS },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      await measure("google_autocomplete", "error", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "Could not search just now." }, { status: 503 });
    }

    const parsed = (await response.json()) as {
      suggestions?: { placePrediction?: PlacePrediction }[];
    };
    const predictions = (parsed.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is PlacePrediction =>
        Boolean(prediction?.placeId && prediction.structuredFormat?.mainText?.text)
      );

    // Provenance. The backend records what Google actually returned and hands
    // back one single-use token per prediction, so the client never learns a
    // bare Place ID and cannot invent one.
    const { data: selections, error: selectionError } = await admin.rpc(
      "record_place_selections",
      {
        p_user: userId,
        p_session: session.session_id,
        p_place_ids: predictions.map((prediction) => prediction.placeId!),
      },
    );
    if (selectionError) {
      await measure("google_autocomplete", "error", session.session_id);
      return Response.json({ error: "Could not hold that search." }, { status: 503 });
    }
    const tokenByPlace = new Map<string, string>();
    for (const row of (selections ?? []) as { token: string; google_place_id: string }[]) {
      tokenByPlace.set(row.google_place_id, row.token);
    }

    const places = predictions
      .map((prediction) => ({
        selectionToken: tokenByPlace.get(prediction.placeId!) ?? null,
        name: prediction.structuredFormat!.mainText!.text!,
        detail: prediction.structuredFormat?.secondaryText?.text ?? null,
      }))
      .filter((place) => place.selectionToken !== null);

    // An empty answer is its own measurement, and closes the session: there is
    // nothing here to select, so leaving it open would only inflate "abandoned".
    if (places.length === 0) {
      await measure("google_autocomplete", "empty", session.session_id);
      await closeSession(session.session_id, "empty");
    } else {
      await measure("google_autocomplete", "ok", session.session_id);
    }

    return Response.json({
      places,
      duplicate: false,
      sessionId: session.session_id,
      remaining: allowance.remaining,
      attribution: "Powered by Google",
    });
  }

  if (operation === "resolve") {
    const placeId = String(body.placeId ?? "").trim();
    if (placeId.length < 4 || placeId.length > 200) {
      return Response.json({ error: "That place reference is not usable." }, { status: 400 });
    }

    const allowance = await claim("google_place_details", DETAILS_ALLOWANCE);
    if (!allowance.allowed) {
      await measure("google_place_details", "refused_ceiling");
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
      await measure("google_place_details", "error");
      return Response.json({ error: "Could not read that place." }, { status: 503 });
    }
    await measure("google_place_details", "ok");
    const place = (await response.json()) as { displayName?: { text?: string } };
    return Response.json({
      placeId,
      name: place.displayName?.text ?? null,
      attribution: "Powered by Google",
    });
  }

  return Response.json({ error: "Unknown operation." }, { status: 400 });
});
