/**
 * Vocation Match — the photo road that stores nothing of Google's.
 *
 * Google's Places terms allow keeping a place ID forever and a photo not at
 * all. So `hotels.photo_url` points here, and this function walks the same
 * three steps on every request: hotel id → stored place id → today's photo
 * name → a redirect to today's image URL. If any step comes up empty the
 * answer is 404 and the client keeps showing its drawing.
 *
 * The role gate exists so strangers cannot burn the Places quota through
 * us; the image bytes themselves are public marketing photographs.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  // The platform gateway has already checked the project key before this
  // code runs, and with the new publishable-key format the Authorization
  // header is not always a JWT this code could read. When it *is* a JWT,
  // its role still has to be one of ours; when it is not, the gateway's
  // check is the check.
  const authorization = req.headers.get("Authorization") ?? "";
  const role = roleOf(authorization);
  if (role !== null && role !== "authenticated" && role !== "service_role" && role !== "anon") {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return new Response(null, { status: 404 });

  const requestUrl = new URL(req.url);
  const hotelId = requestUrl.searchParams.get("hotel") ?? "";
  const city = requestUrl.searchParams.get("city") ?? "";
  const isCity = city !== "";
  if (!isCity && !/^[0-9a-f-]{36}$/i.test(hotelId)) return new Response(null, { status: 404 });
  // List thumbnails ask small, the card asks big; both are clamped so a
  // stranger cannot request a wall-sized bill.
  const width = Math.min(1600, Math.max(64, Number(requestUrl.searchParams.get("w")) || 1200));

  // The destination strip's three covers, resolved the same way a hotel is.
  // A fixed allowlist: this endpoint photographs our pilot's places, not the
  // caller's choice of the whole planet.
  const CITY_QUERIES: Record<string, string> = {
    istanbul: "İstanbul",
    antalya: "Antalya",
    kapadokya: "Göreme Kapadokya",
  };

  let placeId: string | null = null;
  if (isCity) {
    const textQuery = CITY_QUERIES[city];
    if (!textQuery) return new Response(null, { status: 404 });
    try {
      const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({ textQuery, regionCode: "TR", maxResultCount: 1 }),
        signal: AbortSignal.timeout(4_000),
      });
      if (!search.ok) return new Response(null, { status: 404 });
      const found = await search.json();
      placeId = found?.places?.[0]?.id ?? null;
    } catch {
      return new Response(null, { status: 404 });
    }
  } else {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await admin
      .from("hotels")
      .select("google_place_id")
      .eq("id", hotelId)
      .maybeSingle();
    placeId = row?.google_place_id ?? null;
  }
  if (!placeId) return new Response(null, { status: 404 });

  try {
    const details = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" },
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!details.ok) return new Response(null, { status: 404 });
    const place = await details.json();
    const photoName = place?.photos?.[0]?.name;
    if (typeof photoName !== "string") return new Response(null, { status: 404 });

    const media = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(4_000) },
    );
    if (!media.ok) return new Response(null, { status: 404 });
    const body = await media.json();
    const photoUri = body?.photoUri;
    if (typeof photoUri !== "string" || !photoUri.startsWith("https://")) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: photoUri,
        // Fresh-enough for a session on the device; nothing of Google's is
        // ever at rest on our side.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
});
