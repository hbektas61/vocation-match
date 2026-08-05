/**
 * The one door Google is allowed through (D-052, corrected by D-053, widened
 * by D-054).
 *
 * Seven operations, and deliberately no others:
 *
 *   search  — Autocomplete (New). A *typed* name, restricted to 1,500 m around
 *             the caller, inside a session that bills as one session. Neither
 *             Text Search is not used: by the time this is reached the user
 *             has typed a name, and Autocomplete is the right tool. The
 *             response carries an opaque
 *             selection token per prediction rather than a bare Place ID.
 *             This is D-053's check-in find and is unchanged.
 *   resolve — a Place ID back into a name for a screen about to draw it. This
 *             is how a Google label is displayed without our storing Google's
 *             name anywhere.
 *   nearby_search — Nearby Search (New), only after the user explicitly asks
 *             what is around the foreground reading. It is restricted to the
 *             check-in radius, ranked by distance and returned as short-lived
 *             selection tokens. Display content and coordinates are discarded
 *             with the response.
 *
 * D-054 adds the destination-first vacation venue flow:
 *
 *   destination_search — Autocomplete (New), restricted to the country the
 *             person selected, geocoding results only, so "Alaçatı" and
 *             "Dubai Marina" both answer and no business ever does.
 *   destination_choose — spends the destination's selection token, resolves the
 *             one thing the next step needs (a viewport), and holds it on a
 *             *venue* session. The box lives on the session and dies with it;
 *             it is not a destination catalogue.
 *   venue_search — Autocomplete (New) restricted to that box. The default mode
 *             sends no type mask at all, because a lodging-only mask is exactly
 *             what hides a beach club — Google files Before Sunset under `bar`.
 *   verify_presence — the Here Now check for a venue whose coordinate is not
 *             ours to keep: resolved here, measured in PostGIS against the same
 *             500 m rule, and forgotten.
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

/** Typed lookups use Autocomplete; the explicit around-me action uses Nearby. */
const PLACES_AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
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
const NEARBY_ALLOWANCE = Number(
  Deno.env.get("GOOGLE_NEARBY_MONTHLY_ALLOWANCE") ?? "4500",
);
/** Restriction, not bias: a result outside the area is not an answer here. */
const RESTRICT_METERS = Number(Deno.env.get("GOOGLE_SEARCH_RADIUS_METERS") ?? "1500");
/** The visible list never offers a place the 500 m check could not accept. */
const NEARBY_RADIUS_METERS = Number(Deno.env.get("GOOGLE_NEARBY_RADIUS_METERS") ?? "500");
/** Below this there is nothing to search for (D-053 §3, D-054 §6). */
const MIN_QUERY = 3;

/**
 * The narrowest mask a picker can work from: an id, the name, and the
 * secondary line that tells two branches of a chain apart. No coordinate is
 * ever asked of Autocomplete — the venue's position is resolved once, at the
 * moment a location check needs it, and never stored (D-054 §2).
 */
const PREDICTION_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.structuredFormat.mainText.text",
  "suggestions.placePrediction.structuredFormat.secondaryText.text",
  "suggestions.placePrediction.distanceMeters",
].join(",");

/**
 * Gathering places, not every shop, office and transit stop around a mall.
 * `includedTypes` matches any of a place's returned types; generic families
 * such as `restaurant` therefore keep their specialised children findable.
 */
// No lodging types here on purpose (owner, 2026-08-03): hotels are the trip
// tab's whole subject, and a nearby list half-full of them said nothing the
// active venue had not already said. Excluding them upstream also means the
// call never pays for rows the screen would drop.
const NEARBY_TYPES = [
  "cafe",
  "coffee_shop",
  "restaurant",
  "food_court",
  "bar",
  "pub",
  "night_club",
  "beach",
  "park",
  "tourist_attraction",
  "shopping_mall",
  "movie_theater",
  "performing_arts_theater",
  "concert_hall",
  "event_venue",
  "museum",
  "art_gallery",
  "casino",
  "stadium",
];

/**
 * Google's own collection for "geocoding results, not businesses". This is
 * what makes a destination a *place* rather than a hotel: an establishment
 * cannot come back at all, while localities, sublocalities, neighbourhoods,
 * administrative areas and natural features all can. Deliberately not the
 * narrower `(cities)` collection, which would refuse Alaçatı and Dubai Marina
 * — the two cases the brief names (D-054 §3).
 */
const DESTINATION_TYPES = ["geocode"];

/**
 * Types too small to be a holiday destination. Rejected after resolution
 * rather than in the request, because `geocode` cannot exclude them and a
 * street address as a "destination" would silently shrink the venue search to
 * one building.
 */
const TOO_SMALL_FOR_A_DESTINATION = new Set([
  "street_address",
  "street_number",
  "route",
  "premise",
  "subpremise",
  "plus_code",
  "postal_code_suffix",
]);

/**
 * The optional chips (D-054 §3).
 *
 * `all` is the default and sends **no** mask, because the brief is explicit
 * that a type-restricted default breaks beach discovery.
 *
 * There are two chips rather than three. A `Beach & Club` refinement was
 * built and then removed, on evidence: with the five types the brief itself
 * lists (`beach`, `bar`, `night_club`, `restaurant`, `tourist_attraction`) a
 * live staging search for "Before Sunset" in Alaçatı — the brief's own
 * Scenario B — returned **nothing**, while the unrestricted default returned
 * it first. Google's primary type for a beach club is not reliably any of
 * them, and `includedPrimaryTypes` caps a request at five, so no mask can be
 * made to hold. A chip named after the thing it hides is worse than no chip
 * (the D-041 rule), so it is gone. `Konaklama` stays because lodging is the
 * one category Google's types genuinely are reliable about.
 */
const VENUE_TYPES: Record<string, string[] | null> = {
  all: null,
  stay: ["lodging", "hotel", "resort_hotel", "hostel", "bed_and_breakfast"],
};

/** Our own vocabulary, chosen by the chip the user searched under — never read
 * off Google's types, which we neither request nor store (D-054 §2). */
const KIND_OF_MODE: Record<string, string | null> = {
  all: null,
  stay: "hotel",
};

/** A destination with no viewport still needs a defensible box: ~5.5 km. */
const DERIVED_HALF_SPAN = 0.05;

/**
 * D-055a: the worst horizontal accuracy a presence check will accept, mirrored
 * from `app.location_accuracy_ceiling()`. The database is the authority; this
 * copy exists only so a reading that is going to be refused does not first buy
 * a Place Details call.
 */
const ACCURACY_CEILING_METERS = 100;

/**
 * How far past the destination's own outline a venue may still be its venue.
 *
 * Google's viewport for a *sublocality* is the built-up outline of the town,
 * and the places people actually go on holiday sit just outside it: measured
 * on staging, "Biblos Resort Alaçatı" and the Alaçatı beach clubs all fall
 * outside Alaçatı's own box, so a strict `locationRestriction` answered the
 * brief's own Scenario A with nothing. The brief anticipates this and permits
 * "a defensible derived search area", so the box is padded — by half its own
 * span, with a floor of about 5.5 km and a ceiling of about 28 km per side.
 *
 * The floor is what makes a small town usable; the ceiling is what keeps a
 * large one from swallowing its neighbours. Both are far smaller than the
 * distance to a same-named place in another country, which is the case §8.8
 * exists to refuse.
 */
const PAD_FRACTION = 0.5;
const MIN_PAD_DEGREES = 0.05;
const MAX_PAD_DEGREES = 0.25;

function padded(box: {
  lowLat: number;
  lowLng: number;
  highLat: number;
  highLng: number;
}): typeof box {
  const clamp = (value: number) =>
    Math.min(Math.max(value, MIN_PAD_DEGREES), MAX_PAD_DEGREES);
  const latPad = clamp((box.highLat - box.lowLat) * PAD_FRACTION);
  // A degree of longitude is shorter away from the equator, so the same
  // distance is more degrees. Without this an Alaçatı-sized box would be
  // padded ~20% less east-to-west than north-to-south.
  const shrink = Math.max(Math.cos(((box.lowLat + box.highLat) / 2) * Math.PI / 180), 0.2);
  const lngPad = clamp((box.highLng - box.lowLng) * PAD_FRACTION) / shrink;
  return {
    lowLat: Math.max(box.lowLat - latPad, -90),
    lowLng: Math.max(box.lowLng - lngPad, -180),
    highLat: Math.min(box.highLat + latPad, 90),
    highLng: Math.min(box.highLng + lngPad, 180),
  };
}

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
  distanceMeters?: number;
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
}

interface GoogleNearbyPlace {
  id?: string;
  displayName?: { text?: string };
  shortFormattedAddress?: string;
  primaryType?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
}

function nearbyKind(types: string[] = [], primaryType?: string): string {
  const all = new Set(primaryType ? [primaryType, ...types] : types);
  if (all.has("cafe") || all.has("coffee_shop")) return "cafe";
  if (all.has("restaurant") || all.has("food_court") ||
      [...all].some((type) => type.endsWith("_restaurant"))) return "restaurant";
  if (
    all.has("bar") || all.has("pub") || all.has("night_club") ||
    all.has("cocktail_bar") || all.has("wine_bar")
  ) return "bar";
  if (
    all.has("lodging") || all.has("hotel") || all.has("resort_hotel") ||
    all.has("hostel") || all.has("motel") || all.has("bed_and_breakfast") ||
    all.has("guest_house")
  ) return "hotel";
  if (all.has("beach")) return "beach";
  return "venue";
}

function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(haversine));
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
      p_kind: "checkin",
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
        "X-Goog-FieldMask": PREDICTION_MASK,
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
        // Gives each prediction a distance from the same reading. Google may
        // otherwise return a textually stronger but farther branch first.
        origin: { latitude, longitude },
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
    const seenHere = new Set<string>();
    const predictions = (parsed.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is PlacePrediction =>
        Boolean(prediction?.placeId && prediction.structuredFormat?.mainText?.text)
      )
      // One row per Place ID. The tokens below are minted from this list, so a
      // duplicate would be two ways to select one place — and one of them
      // would be left unspent.
      .filter((prediction) => {
        if (seenHere.has(prediction.placeId!)) return false;
        seenHere.add(prediction.placeId!);
        return true;
      })
      .sort((left, right) =>
        (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
        (right.distanceMeters ?? Number.POSITIVE_INFINITY)
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
        p_source: "search",
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
        kind: null,
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

  /**
   * The first-class around-me list. This is the only untitled Google lookup:
   * the person explicitly pressed the locate action, and the request is a
   * strict circle around that one foreground reading. The server rechecks the
   * distance and returns neither Google's coordinate nor its type vocabulary.
   */
  if (operation === "nearby_search") {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    const { data: sessionRows, error: sessionError } = await admin.rpc("open_search_session", {
      p_user: userId,
      p_session: null,
      p_query: null,
      p_kind: "checkin",
    });
    const session = (sessionRows ?? [])[0] as
      | {
        allowed?: boolean;
        session_id?: string;
        reason?: string;
      }
      | undefined;
    if (sessionError) {
      return Response.json({ error: "Could not start a search." }, { status: 503 });
    }
    if (!session?.allowed || !session.session_id) {
      await measure("google_nearby", "refused_session", session?.session_id);
      return Response.json({ error: session?.reason ?? "search_unavailable" }, { status: 429 });
    }

    const allowance = await claim("google_nearby", NEARBY_ALLOWANCE);
    if (!allowance.allowed) {
      await measure("google_nearby", "refused_ceiling", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "allowance_spent", remaining: 0 }, { status: 429 });
    }

    let response: Response;
    try {
      response = await fetch(PLACES_NEARBY, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.shortFormattedAddress",
            "places.primaryType",
            "places.types",
            "places.location",
          ].join(","),
        },
        body: JSON.stringify({
          includedTypes: NEARBY_TYPES,
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: { latitude, longitude },
              radius: NEARBY_RADIUS_METERS,
            },
          },
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      await measure("google_nearby", "error", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "Could not search just now." }, { status: 503 });
    }
    if (!response.ok) {
      await measure("google_nearby", "error", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "Could not search just now." }, { status: 503 });
    }

    const parsed = (await response.json()) as { places?: GoogleNearbyPlace[] };
    const seen = new Set<string>();
    const found = (parsed.places ?? [])
      .map((place) => {
        const placeLatitude = place.location?.latitude;
        const placeLongitude = place.location?.longitude;
        if (
          !place.id || !place.displayName?.text ||
          typeof placeLatitude !== "number" || typeof placeLongitude !== "number"
        ) return null;
        const distance = metresBetween(
          { latitude, longitude },
          { latitude: placeLatitude, longitude: placeLongitude },
        );
        // Do not trust an upstream ranking bug to widen our product promise.
        if (distance > NEARBY_RADIUS_METERS) return null;
        return { place, distance };
      })
      .filter((entry): entry is { place: GoogleNearbyPlace; distance: number } =>
        entry !== null
      )
      .sort((left, right) => left.distance - right.distance)
      .filter(({ place }) => {
        if (seen.has(place.id!)) return false;
        seen.add(place.id!);
        return true;
      });

    const { data: selections, error: selectionError } = await admin.rpc(
      "record_place_selections",
      {
        p_user: userId,
        p_session: session.session_id,
        p_place_ids: found.map(({ place }) => place.id!),
        // Ordinary check-in machinery, not a metered find (2026-08-05).
        p_source: "nearby",
      },
    );
    if (selectionError) {
      await measure("google_nearby", "error", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "Could not hold that search." }, { status: 503 });
    }
    const tokenByPlace = new Map<string, string>();
    for (const row of (selections ?? []) as { token: string; google_place_id: string }[]) {
      tokenByPlace.set(row.google_place_id, row.token);
    }
    const places = found
      .map(({ place }) => ({
        selectionToken: tokenByPlace.get(place.id!) ?? null,
        name: place.displayName!.text!,
        detail: place.shortFormattedAddress ?? null,
        kind: nearbyKind(place.types, place.primaryType),
      }))
      .filter((place) => place.selectionToken !== null);

    if (places.length === 0) {
      await measure("google_nearby", "empty", session.session_id);
      await closeSession(session.session_id, "empty");
    } else {
      await measure("google_nearby", "ok", session.session_id);
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
        // The name, and the photo references beside it — both are drawn live
        // and stored nowhere, exactly like the name always was (D-054).
        "X-Goog-FieldMask": "id,displayName,photos",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      await measure("google_place_details", "error");
      return Response.json({ error: "Could not read that place." }, { status: 503 });
    }
    await measure("google_place_details", "ok");
    const place = (await response.json()) as {
      displayName?: { text?: string };
      photos?: { name?: string }[];
    };
    // One photo, resolved to a keyless googleusercontent URI the phone can
    // draw directly. `skipHttpRedirect` makes Google answer with JSON instead
    // of the image itself, so no image bytes pass through this function and
    // nothing needs proxying. Failing the photo never fails the name.
    let photoUri: string | null = null;
    const photoName = place.photos?.[0]?.name;
    if (typeof photoName === "string" && photoName.length > 0) {
      try {
        const media = await fetch(
          `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1000&skipHttpRedirect=true`,
          { headers: { "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(8_000) },
        );
        if (media.ok) {
          const payload = (await media.json()) as { photoUri?: string };
          if (typeof payload.photoUri === "string") photoUri = payload.photoUri;
          await measure("google_place_photo", "ok");
        } else {
          await measure("google_place_photo", "error");
        }
      } catch {
        await measure("google_place_photo", "error");
      }
    }
    return Response.json({
      placeId,
      name: place.displayName?.text ?? null,
      photoUri,
      attribution: "Powered by Google",
    });
  }

  /**
   * The shape both D-054 steps share: open or continue a session, refuse
   * before spending, ask Autocomplete once, deduplicate by Place ID, and hand
   * back opaque selection tokens.
   *
   * Deduplication happens here rather than on the client because the tokens
   * are minted from this list: two rows for one Place ID would be two ways to
   * select the same venue, and one of them would be left unspent (§4).
   */
  const autocomplete = async (options: {
    kind: "destination" | "venue";
    query: string;
    sessionQuery: string | null;
    sessionIn: string | null;
    restriction: Record<string, unknown> | null;
    includedPrimaryTypes: string[] | null;
    includedRegionCodes: string[] | null;
    origin: { latitude: number; longitude: number } | null;
  }): Promise<Response> => {
    const { data: sessionRows, error: sessionError } = await admin.rpc("open_search_session", {
      p_user: userId,
      p_session: options.sessionIn,
      p_query: options.sessionQuery ?? options.query,
      p_kind: options.kind,
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
      await measure(`google_${options.kind}`, "refused_session", session?.session_id);
      return Response.json({ error: session?.reason ?? "search_unavailable" }, { status: 429 });
    }

    // The same normalized input in the same session: nothing asked upstream,
    // nothing metered, and the caller keeps the predictions it already holds.
    if (session.duplicate) {
      await measure(`google_${options.kind}`, "deduplicated", session.session_id);
      return Response.json({
        duplicate: true,
        places: [],
        sessionId: session.session_id,
        attribution: "Powered by Google",
      });
    }

    const allowance = await claim("google_autocomplete", AUTOCOMPLETE_ALLOWANCE);
    if (!allowance.allowed) {
      await measure(`google_${options.kind}`, "refused_ceiling", session.session_id);
      return Response.json({ error: "allowance_spent", remaining: 0 }, { status: 429 });
    }

    const request: Record<string, unknown> = {
      input: options.query,
      sessionToken: session.google_token,
      // A prediction of the words themselves is not a place and cannot be
      // selected; asking for them would only pad the list.
      includeQueryPredictions: false,
    };
    if (options.restriction) request.locationRestriction = options.restriction;
    if (options.includedPrimaryTypes) request.includedPrimaryTypes = options.includedPrimaryTypes;
    if (options.includedRegionCodes) {
      request.includedRegionCodes = options.includedRegionCodes;
      request.regionCode = options.includedRegionCodes[0];
    }
    if (options.origin) request.origin = options.origin;

    let response: Response;
    try {
      response = await fetch(PLACES_AUTOCOMPLETE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": PREDICTION_MASK,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      await measure(`google_${options.kind}`, "error", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "Could not search just now." }, { status: 503 });
    }
    if (!response.ok) {
      await measure(`google_${options.kind}`, "error", session.session_id);
      await closeSession(session.session_id, "failed");
      return Response.json({ error: "Could not search just now." }, { status: 503 });
    }

    const parsed = (await response.json()) as {
      suggestions?: { placePrediction?: PlacePrediction }[];
    };
    const seen = new Set<string>();
    const predictions = (parsed.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is PlacePrediction =>
        Boolean(prediction?.placeId && prediction.structuredFormat?.mainText?.text)
      )
      .filter((prediction) => {
        if (seen.has(prediction.placeId!)) return false;
        seen.add(prediction.placeId!);
        return true;
      })
      .sort((left, right) =>
        (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
        (right.distanceMeters ?? Number.POSITIVE_INFINITY)
      );

    const { data: selections, error: selectionError } = await admin.rpc(
      "record_place_selections",
      {
        p_user: userId,
        p_session: session.session_id,
        p_place_ids: predictions.map((prediction) => prediction.placeId!),
        p_source: "search",
      },
    );
    if (selectionError) {
      await measure(`google_${options.kind}`, "error", session.session_id);
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
        kind: null,
      }))
      .filter((place) => place.selectionToken !== null);

    if (places.length === 0) {
      await measure(`google_${options.kind}`, "empty", session.session_id);
    } else {
      await measure(`google_${options.kind}`, "ok", session.session_id);
    }

    return Response.json({
      places,
      duplicate: false,
      sessionId: session.session_id,
      remaining: allowance.remaining,
      attribution: "Powered by Google",
    });
  };

  /** Step A: where are you going? Inside the chosen country, never a business. */
  if (operation === "destination_search") {
    const query = String(body.query ?? "").trim();
    const countryCode = String(body.countryCode ?? "").trim().toUpperCase();
    if (query.replace(/\s+/g, "").length < MIN_QUERY) {
      return Response.json({ error: "query_too_short", minimum: MIN_QUERY }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return Response.json({ error: "country_required" }, { status: 400 });
    }
    return await autocomplete({
      kind: "destination",
      query,
      sessionQuery: `${countryCode}:${query}`,
      sessionIn: typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId
        : null,
      restriction: null,
      includedPrimaryTypes: DESTINATION_TYPES,
      includedRegionCodes: [countryCode.toLowerCase()],
      origin: null,
    });
  }

  /**
   * Step A, committed. Spends the destination's selection token, resolves the
   * single thing step B needs, and opens the venue session around it.
   *
   * The viewport never reaches the client. If it did, the client could widen
   * it, and "results stay inside the destination you chose" would be a
   * suggestion rather than a rule (§10).
   */
  if (operation === "destination_choose") {
    const token = String(body.selectionToken ?? "").trim();
    if (token.length === 0) {
      return Response.json({ error: "selection_unusable" }, { status: 400 });
    }

    const { data: placeId, error: takeError } = await admin.rpc("take_place_selection", {
      p_user: userId,
      p_token: token,
    });
    if (takeError || typeof placeId !== "string" || placeId.length === 0) {
      return Response.json({ error: "selection_unusable" }, { status: 400 });
    }

    const allowance = await claim("google_place_details", DETAILS_ALLOWANCE);
    if (!allowance.allowed) {
      await measure("google_place_details", "refused_ceiling");
      return Response.json({ error: "allowance_spent" }, { status: 429 });
    }

    let details: Response;
    try {
      details = await fetch(`${PLACES_DETAILS}/${encodeURIComponent(placeId)}`, {
        headers: {
          "X-Goog-Api-Key": key,
          // The search area and the proof it is a place rather than a
          // business. Nothing that would be content to display.
          "X-Goog-FieldMask": "id,location,viewport,types",
        },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      await measure("google_place_details", "error");
      return Response.json({ error: "Could not read that place." }, { status: 503 });
    }
    if (!details.ok) {
      await measure("google_place_details", "error");
      return Response.json({ error: "Could not read that place." }, { status: 503 });
    }
    const place = (await details.json()) as {
      types?: string[];
      location?: { latitude?: number; longitude?: number };
      viewport?: {
        low?: { latitude?: number; longitude?: number };
        high?: { latitude?: number; longitude?: number };
      };
    };

    // Belt and braces over the `geocode` collection: an establishment is not a
    // destination, and neither is a single doorway.
    const types = place.types ?? [];
    if (
      types.includes("establishment") ||
      types.some((type) => TOO_SMALL_FOR_A_DESTINATION.has(type))
    ) {
      await measure("google_place_details", "refused_type");
      return Response.json({ error: "not_a_destination" }, { status: 422 });
    }

    const low = place.viewport?.low;
    const high = place.viewport?.high;
    const centre = place.location;
    const box = (typeof low?.latitude === "number" && typeof low?.longitude === "number" &&
        typeof high?.latitude === "number" && typeof high?.longitude === "number")
      ? padded({
        lowLat: low.latitude,
        lowLng: low.longitude,
        highLat: high.latitude,
        highLng: high.longitude,
      })
      : (typeof centre?.latitude === "number" && typeof centre?.longitude === "number")
      ? {
        lowLat: centre.latitude - DERIVED_HALF_SPAN,
        lowLng: centre.longitude - DERIVED_HALF_SPAN,
        highLat: centre.latitude + DERIVED_HALF_SPAN,
        highLng: centre.longitude + DERIVED_HALF_SPAN,
      }
      : null;
    if (!box) {
      await measure("google_place_details", "error");
      return Response.json({ error: "not_a_destination" }, { status: 422 });
    }

    // A new venue session. Opening one also closes the previous venue session,
    // which is what makes "a new destination clears the old venue search" true
    // on the server rather than only in the UI (§8.4).
    const { data: sessionRows, error: sessionError } = await admin.rpc("open_search_session", {
      p_user: userId,
      p_session: null,
      p_query: null,
      p_kind: "venue",
    });
    const session = (sessionRows ?? [])[0] as
      | { allowed?: boolean; session_id?: string; reason?: string }
      | undefined;
    if (sessionError || !session?.allowed || !session.session_id) {
      return Response.json({ error: session?.reason ?? "search_unavailable" }, { status: 429 });
    }

    const { data: held } = await admin.rpc("set_session_destination", {
      p_user: userId,
      p_session: session.session_id,
      p_place_id: placeId,
      p_low_lat: box.lowLat,
      p_low_lng: box.lowLng,
      p_high_lat: box.highLat,
      p_high_lng: box.highLng,
    });
    if (held !== true) {
      return Response.json({ error: "Could not hold that destination." }, { status: 503 });
    }

    await measure("google_place_details", "ok");
    return Response.json({
      sessionId: session.session_id,
      attribution: "Powered by Google",
    });
  }

  /** Step B: where in that destination? All eligible venues, by default. */
  if (operation === "venue_search") {
    const query = String(body.query ?? "").trim();
    const sessionIn = typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : null;
    const mode = typeof body.mode === "string" && body.mode in VENUE_TYPES
      ? body.mode
      : "all";

    if (query.replace(/\s+/g, "").length < MIN_QUERY) {
      return Response.json({ error: "query_too_short", minimum: MIN_QUERY }, { status: 400 });
    }
    if (!sessionIn) {
      return Response.json({ error: "destination_required" }, { status: 409 });
    }

    const { data: destinationRows } = await admin.rpc("session_destination", {
      p_user: userId,
      p_session: sessionIn,
    });
    const destination = (destinationRows ?? [])[0] as
      | {
        low_latitude: number;
        low_longitude: number;
        high_latitude: number;
        high_longitude: number;
      }
      | undefined;
    if (!destination) {
      // The session lapsed, or was never a venue session. The screen sends the
      // user back to step A rather than quietly searching the whole planet.
      return Response.json({ error: "destination_required" }, { status: 409 });
    }

    return await autocomplete({
      kind: "venue",
      query,
      sessionQuery: null,
      sessionIn,
      restriction: {
        rectangle: {
          low: { latitude: destination.low_latitude, longitude: destination.low_longitude },
          high: { latitude: destination.high_latitude, longitude: destination.high_longitude },
        },
      },
      includedPrimaryTypes: VENUE_TYPES[mode],
      includedRegionCodes: null,
      origin: null,
    });
  }

  /**
   * Here Now, for a venue whose coordinate we may not keep.
   *
   * The order matters and is the point of the whole operation: the venue is
   * read from the *server's* record of who is active where, the coordinate
   * comes from Google over the server-side key, and the comparison happens in
   * PostGIS against the one radius definition. A provider failure returns
   * before the check is recorded, so it consumes nothing and corrupts nothing
   * — the room, the membership, the matches and the chat are untouched (§8.23).
   */
  if (operation === "verify_presence") {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    /**
     * V-010: how good the device said the reading was. It travels only so the
     * database can refuse to learn a venue's ~1.5 km cell from a fix that is
     * vaguer than the cell. A missing or bad value costs the caller nothing —
     * the check still runs — it simply teaches us nothing.
     */
    const accuracy = Number(body.accuracyMeters);
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    const { data: activeRows, error: activeError } = await admin.rpc("active_venue_of", {
      p_user: userId,
    });
    if (activeError) {
      return Response.json({ error: "Could not read your venue." }, { status: 503 });
    }
    const venue = (activeRows ?? [])[0] as
      | { provider?: string; google_place_id?: string }
      | undefined;
    if (!venue) {
      return Response.json({ error: "no_active_venue" }, { status: 409 });
    }
    if (venue.provider !== "google") {
      // A catalogue venue has its own coordinate and needs no provider call.
      return Response.json({ error: "use_catalogue_check" }, { status: 409 });
    }

    // D-055a: a reading vaguer than the ceiling cannot show somebody is inside
    // 500 m, so resolving the venue to measure against it would be buying an
    // answer we already know. The database still decides — it refuses on the
    // same rule, and in the same order as everything else, so a free member
    // with a bad fix is told about Premium rather than about their GPS. All
    // this skips is the *paid call*.
    const usable = Number.isFinite(accuracy) && accuracy > 0 &&
      accuracy <= ACCURACY_CEILING_METERS;

    let venueLat: number | null = null;
    let venueLng: number | null = null;

    if (usable) {
      const allowance = await claim("google_place_details", DETAILS_ALLOWANCE);
      if (!allowance.allowed) {
        await measure("google_place_details", "refused_ceiling");
        return Response.json({ error: "allowance_spent" }, { status: 429 });
      }

      let details: Response;
      try {
        details = await fetch(
          `${PLACES_DETAILS}/${encodeURIComponent(venue.google_place_id ?? "")}`,
          {
            headers: {
              "X-Goog-Api-Key": key,
              // The one field the measurement needs.
              "X-Goog-FieldMask": "id,location",
            },
            signal: AbortSignal.timeout(8_000),
          },
        );
      } catch {
        await measure("google_place_details", "error");
        return Response.json({ error: "venue_unreachable" }, { status: 503 });
      }
      if (!details.ok) {
        await measure("google_place_details", "error");
        return Response.json({ error: "venue_unreachable" }, { status: 503 });
      }
      const place = (await details.json()) as {
        location?: { latitude?: number; longitude?: number };
      };
      if (typeof place.location?.latitude !== "number" ||
          typeof place.location?.longitude !== "number") {
        await measure("google_place_details", "empty");
        return Response.json({ error: "venue_unreachable" }, { status: 503 });
      }
      venueLat = place.location.latitude;
      venueLng = place.location.longitude;
      await measure("google_place_details", "ok");
    }

    const { data: checkRows, error: checkError } = await admin.rpc("record_presence_verified", {
      p_user: userId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_venue_latitude: venueLat,
      p_venue_longitude: venueLng,
      p_accuracy_meters: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null,
    });
    if (checkError) {
      // The premium gate and the rate limit both arrive here. The code travels
      // so the app can say the right thing; the coordinate never does.
      return Response.json(
        { error: (checkError as { code?: string }).code ?? "check_failed" },
        { status: 400 },
      );
    }
    const row = (checkRows ?? [])[0] as
      | { outcome?: string; within_range?: boolean; expires_at?: string }
      | undefined;
    if (!row) {
      return Response.json({ error: "check_failed" }, { status: 503 });
    }

    // An outcome, a boolean and an expiry. No coordinate, no distance — not
    // even to the person who was just measured (D-005).
    return Response.json({
      outcome: row.outcome ?? "TOO_FAR",
      withinRange: row.within_range === true,
      expiresAt: row.expires_at ?? null,
    });
  }

  return Response.json({ error: "Unknown operation." }, { status: 400 });
});
