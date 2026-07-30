/**
 * The one door Ticketmaster is allowed through (D-056).
 *
 * Four operations, and deliberately no others:
 *
 *   search  — Discovery v2 `events.json` for an *area the user chose*, served
 *             from a shared cache first and coalesced when it misses, so an
 *             advertising spike is one upstream request rather than ten
 *             thousand. The response carries an opaque selection token per
 *             event rather than a bare provider id.
 *   detail  — one event, for confirming a selection or refreshing a status.
 *   join    — spends a selection token; the room is created in SQL.
 *   verify  — the live-event check: fresh status, the venue's coordinate, and
 *             the same 500 m PostGIS test the hotel rooms use.
 *
 * The rules this file exists to keep:
 *
 *   1. The key never leaves the backend, so the app bundle cannot carry it.
 *   2. Nothing upstream happens without passing, in order: the kill switch,
 *      the circuit breaker, the per-second limit and the daily ceiling — all
 *      claimed *before* the request, never counted after it.
 *   3. The client never learns a provider event id it did not receive from a
 *      search, and cannot create a room from one it invented.
 *   4. Provider content is written to a lease with an expiry and never to a
 *      room, a membership, a match or a message.
 *   5. Nothing is logged that could identify where somebody is: no
 *      coordinates, no search text, no full payloads, no key.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const DISCOVERY = "https://app.ticketmaster.com/discovery/v2";

/**
 * Ticketmaster's published public quota is 2 requests/second and 5,000 a day
 * (§12); another page still says 5/second. The lower number is the one we
 * believe, and ours sit under it so a burst never reaches theirs.
 */
const PER_SECOND = Number(Deno.env.get("TICKETMASTER_MAX_REQUESTS_PER_SECOND") ?? "1");
const DAILY_ALLOWANCE = Number(Deno.env.get("TICKETMASTER_DAILY_REQUEST_ALLOWANCE") ?? "4500");
const TIMEOUT_MS = Number(Deno.env.get("TICKETMASTER_REQUEST_TIMEOUT_MS") ?? "5000");

/**
 * Cache lifetimes (§7.1). Operational defaults, not a claim that any duration
 * is permitted indefinitely — the agreement controls, and every one of these
 * is short.
 */
const TTL_TODAY_SECONDS = 15 * 60;
const TTL_UPCOMING_SECONDS = 60 * 60;
const TTL_DETAIL_FAR_SECONDS = 6 * 60 * 60;
const TTL_DETAIL_LIVE_SECONDS = 10 * 60;
const TTL_DETAIL_UNSTABLE_SECONDS = 10 * 60;

/** Bounded, and nowhere near the provider's deep-paging boundary (§6.1). */
const MAX_PAGE = 4;
const PAGE_SIZE = 20;

/**
 * Category chips → Discovery classification names. Configurable by design
 * (§4): adding Sports or Theatre later is an entry here, not a migration.
 */
const CLASSIFICATIONS: Record<string, string | null> = {
  all: null,
  music: "Music",
  sports: "Sports",
  arts: "Arts & Theatre",
};

interface Reading {
  latitude: number;
  longitude: number;
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

/**
 * A coarse area key from a reading (§3.2).
 *
 * The user's precise coordinate is never sent to Ticketmaster and never put in
 * a cache key: it is rounded to about eleven kilometres first, which is far
 * coarser than any event search needs and coarse enough that the key is about
 * a region rather than a person.
 */
function coarseArea(reading: Reading): { key: string; geoPoint: string } {
  const lat = Math.round(reading.latitude * 10) / 10;
  const lng = Math.round(reading.longitude * 10) / 10;
  return { key: `geo:${lat.toFixed(1)},${lng.toFixed(1)}`, geoPoint: `${lat},${lng}` };
}

/**
 * The window a bucket covers.
 *
 * `days` is how far "Yaklaşan" reaches, bounded and configurable rather than
 * hardcoded (§20). The tab asks for the default; the coverage measurement asks
 * for thirty as well as ninety, which is the reason it is a parameter and not
 * a constant — a measurement that cannot vary the window cannot say whether
 * a market is thin or merely far off.
 */
const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 180;

function dateWindow(bucket: string, days: number): { start: string; end: string; ttl: number } {
  const now = new Date();
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
  if (bucket === "today") {
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 0);
    return { start: iso(now), end: iso(end), ttl: TTL_TODAY_SECONDS };
  }
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + days);
  return { start: iso(now), end: iso(end), ttl: TTL_UPCOMING_SECONDS };
}

/**
 * Only what §6.4 lists, and a test event is dropped rather than normalized.
 *
 * Everything here goes into the lease. Nothing here reaches a room table.
 */
function normalize(raw: Record<string, unknown>): Record<string, unknown> | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  // §6.4 and §16.5: the provider marks its own test fixtures, and they are not
  // events anybody can go to.
  if (raw.test === true) return null;

  const dates = raw.dates as Record<string, any> | undefined;
  const start = dates?.start as Record<string, any> | undefined;
  const venue = ((raw._embedded as any)?.venues ?? [])[0] as Record<string, any> | undefined;
  const classification = ((raw.classifications as any[]) ?? [])[0] as
    | Record<string, any>
    | undefined;
  const image = ((raw.images as any[]) ?? [])
    .filter((candidate) => typeof candidate?.url === "string")
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];

  return {
    id,
    status: dates?.status?.code ?? "unknown",
    name: typeof raw.name === "string" ? raw.name : null,
    startsAt: start?.dateTime ?? null,
    localDate: start?.localDate ?? null,
    localTime: start?.localTime ?? null,
    dateTbd: start?.dateTBD === true || start?.dateTBA === true || start?.timeTBA === true,
    endsAt: (dates?.end as any)?.dateTime ?? null,
    timezone: dates?.timezone ?? null,
    classification: classification?.segment?.name ?? null,
    venueId: venue?.id ?? null,
    venueName: venue?.name ?? null,
    city: venue?.city?.name ?? null,
    country: venue?.country?.name ?? null,
    latitude: venue?.location?.latitude ? Number(venue.location.latitude) : null,
    longitude: venue?.location?.longitude ? Number(venue.location.longitude) : null,
    imageUrl: image?.url ?? null,
    url: typeof raw.url === "string" ? raw.url : null,
  };
}

Deno.serve(async (req) => {
  const authorization = req.headers.get("Authorization") ?? "";
  const role = claimOf(authorization, "role");
  const userId = claimOf(authorization, "sub");
  if ((role !== "authenticated" && role !== "service_role") || !userId) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
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

  const flag = async (name: string): Promise<boolean> => {
    const { data } = await admin.rpc("feature_flags");
    return ((data ?? []) as { flag: string; enabled: boolean }[])
      .some((row) => row.flag === name && row.enabled);
  };

  if (!(await flag("EVENTS_FEATURE_ENABLED"))) {
    return Response.json({ error: "events_disabled" }, { status: 503 });
  }

  const measure = (outcome: string, quantity = 1): Promise<unknown> =>
    admin
      .rpc("record_provider_event", {
        p_operation: "ticketmaster",
        p_outcome: outcome,
        p_user: userId,
        p_session: null,
      })
      .then(() => undefined, () => undefined);

  const key = Deno.env.get("TICKETMASTER_DISCOVERY_API_KEY");

  /**
   * Everything that must be true before an upstream request, in the order a
   * refusal is cheapest. Returns a refusal code, or null to proceed.
   */
  const mayCallProvider = async (): Promise<string | null> => {
    if (!key) return "unconfigured";
    if (!(await flag("TICKETMASTER_PROVIDER_ENABLED"))) return "provider_disabled";

    const { data: open } = await admin.rpc("provider_breaker", {
      p_service: "ticketmaster",
      p_outcome: "check",
    });
    if (open === true) return "provider_unavailable";

    const { data: second } = await admin.rpc("claim_provider_second", {
      p_service: "ticketmaster",
      p_allowance: PER_SECOND,
    });
    if (second !== true) return "rate_limited";

    const { data: daily, error } = await admin.rpc("claim_metered_call", {
      p_service: "ticketmaster_daily",
      p_allowance: DAILY_ALLOWANCE,
    });
    // A counter we cannot reach means the paid call does not happen: failing
    // closed is the entire point of having a ceiling (D-052's rule, reused).
    if (error) return "ceiling_unknown";
    const row = (daily ?? [])[0] as { allowed?: boolean } | undefined;
    if (row?.allowed !== true) return "allowance_spent";

    return null;
  };

  /** One upstream request, with a timeout, and the breaker told either way. */
  const ask = async (path: string, params: URLSearchParams): Promise<unknown | null> => {
    params.set("apikey", key!);
    try {
      const response = await fetch(`${DISCOVERY}${path}?${params.toString()}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        await admin.rpc("provider_breaker", { p_service: "ticketmaster", p_outcome: "fail" });
        await measure(response.status === 429 ? "provider_rate_limited" : "provider_error");
        return null;
      }
      await admin.rpc("provider_breaker", { p_service: "ticketmaster", p_outcome: "ok" });
      return await response.json();
    } catch {
      await admin.rpc("provider_breaker", { p_service: "ticketmaster", p_outcome: "fail" });
      await measure("provider_timeout");
      return null;
    }
  };

  /* ----------------------------------------------------------------- search */
  if (operation === "search") {
    const bucket = body.bucket === "today" ? "today" : "upcoming";
    const category = typeof body.category === "string" && body.category in CLASSIFICATIONS
      ? body.category
      : "all";
    const locale = typeof body.locale === "string" ? body.locale.slice(0, 5) : "*";
    const page = Math.min(Math.max(Number(body.page ?? 0) | 0, 0), MAX_PAGE);
    const days = Math.min(
      Math.max(Number(body.days ?? DEFAULT_WINDOW_DAYS) | 0, 1),
      MAX_WINDOW_DAYS,
    );

    // The area is either a place the user named, or a coarse cell derived from
    // a reading they explicitly offered. Never a precise coordinate, and never
    // anything derived from where the phone merely happens to be.
    let areaKey: string;
    const params = new URLSearchParams();
    if (typeof body.city === "string" && body.city.trim().length >= 2) {
      const city = body.city.trim().slice(0, 60);
      const country = typeof body.countryCode === "string"
        ? body.countryCode.trim().slice(0, 2).toUpperCase()
        : "";
      areaKey = `city:${city.toLowerCase()}${country ? `:${country.toLowerCase()}` : ""}`;
      params.set("city", city);
      if (country) params.set("countryCode", country);
    } else if (Number.isFinite(Number(body.latitude)) && Number.isFinite(Number(body.longitude))) {
      const area = coarseArea({
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
      });
      areaKey = area.key;
      // `geoPoint`, never the deprecated `latlong` (§6.1).
      params.set("geoPoint", area.geoPoint);
      params.set("radius", "50");
      params.set("unit", "km");
    } else {
      return Response.json({ error: "area_required" }, { status: 400 });
    }

    const window = dateWindow(bucket, days);
    // The window is part of the key: a thirty-day answer is not a ninety-day
    // answer, and serving one for the other would be a cache that lies.
    const cacheKey = [
      "ticketmaster",
      areaKey,
      bucket === "today" ? "today" : `d${days}`,
      category,
      locale,
      `p${page}`,
    ].join("|");

    let { data: cached } = await admin.rpc("take_event_search_cache", { p_key: cacheKey });
    let state = ((cached ?? [])[0] ?? {}) as { state?: string; payload?: unknown };

    // Somebody else is upstream for this exact key right now. Waiting briefly
    // for their answer is the whole point of coalescing (§7.1, §16.33) — one
    // request serves the burst instead of one request per person in it.
    for (let attempt = 0; state.state === "wait" && attempt < 3; attempt += 1) {
      await measure("coalesced");
      await new Promise((resolve) => setTimeout(resolve, 400));
      ({ data: cached } = await admin.rpc("take_event_search_cache", { p_key: cacheKey }));
      state = ((cached ?? [])[0] ?? {}) as { state?: string; payload?: unknown };
    }

    let payload = state.payload;
    if (state.state === "hit") {
      await measure("cache_hit");
    } else if (state.state === "wait") {
      // The filler is taking too long. Refusing is honest; making a second
      // identical upstream request is what this whole path exists to avoid.
      return Response.json({ error: "provider_unavailable", events: [] }, { status: 503 });
    } else {
      await measure("cache_miss");
      const refusal = await mayCallProvider();
      if (refusal) {
        await measure(`refused_${refusal}`);
        return Response.json({ error: refusal, events: [] }, { status: 503 });
      }

      params.set("startDateTime", window.start);
      params.set("endDateTime", window.end);
      params.set("sort", "date,asc");
      params.set("size", String(PAGE_SIZE));
      params.set("page", String(page));
      if (locale !== "*") params.set("locale", locale);
      const classification = CLASSIFICATIONS[category];
      if (classification) params.set("classificationName", classification);

      await measure("search_request");
      const raw = await ask("/events.json", params) as
        | { _embedded?: { events?: Record<string, unknown>[] }; page?: { totalPages?: number } }
        | null;
      if (!raw) {
        return Response.json({ error: "provider_unavailable", events: [] }, { status: 503 });
      }

      const events = (raw._embedded?.events ?? [])
        .map(normalize)
        .filter((event): event is Record<string, unknown> => event !== null);

      payload = {
        events,
        totalPages: Math.min(raw.page?.totalPages ?? 1, MAX_PAGE + 1),
        // What the provider says exists behind the page we are allowed to
        // fetch. Reported so a count of twenty is readable as "a page of them"
        // rather than as "twenty in the world".
        totalElements: raw.page?.totalElements ?? null,
      };
      await admin.rpc("put_event_search_cache", {
        p_key: cacheKey,
        p_payload: payload,
        p_ttl: `${window.ttl} seconds`,
      });
      if (events.length === 0) await measure("search_empty");
    }

    const events = ((payload as { events?: Record<string, unknown>[] })?.events ?? []);

    // Provenance. The client never learns a provider id it could invent one
    // from; it gets a token bound to itself, this search, and the status the
    // event had when we saw it (§6.2).
    const { data: tokens } = await admin.rpc("record_event_selections", {
      p_user: userId,
      p_search_key: cacheKey,
      p_events: events,
    });
    const tokenById = new Map<string, string>();
    for (const row of (tokens ?? []) as { token: string; provider_event_id: string }[]) {
      tokenById.set(row.provider_event_id, row.token);
    }

    return Response.json({
      events: events.map((event) => ({
        selectionToken: tokenById.get(String(event.id)) ?? null,
        name: event.name,
        startsAt: event.startsAt,
        localDate: event.localDate,
        localTime: event.localTime,
        dateTbd: event.dateTbd,
        status: event.status,
        venueName: event.venueName,
        city: event.city,
        country: event.country,
        imageUrl: event.imageUrl,
        classification: event.classification,
      })).filter((event) => event.selectionToken !== null),
      totalPages: (payload as { totalPages?: number })?.totalPages ?? 1,
      totalElements: (payload as { totalElements?: number })?.totalElements ?? null,
      attribution: "Powered by Ticketmaster",
    });
  }

  /* ----------------------------------------------------------------- detail */
  /**
   * Refreshes one event's lease. Called to confirm a selection, to refresh a
   * status, or before a live check — never on a render, and never twice for
   * the same event while the lease is fresh.
   */
  const refresh = async (providerEventId: string): Promise<
    { ok: true; event: Record<string, unknown> } | { ok: false; reason: string }
  > => {
    const refusal = await mayCallProvider();
    if (refusal) return { ok: false, reason: refusal };

    await measure("detail_request");
    const raw = await ask(
      `/events/${encodeURIComponent(providerEventId)}.json`,
      new URLSearchParams(),
    ) as Record<string, unknown> | null;
    if (!raw) return { ok: false, reason: "provider_unavailable" };

    const event = normalize(raw);
    if (!event) return { ok: false, reason: "not_an_event" };

    // §7.1: how long the lease runs depends on what it is about. An event
    // whose status is unsettled, or which is happening now, is re-checked
    // sooner than one three months out.
    const status = String(event.status ?? "");
    const startsAt = event.startsAt ? Date.parse(String(event.startsAt)) : null;
    const soon = startsAt !== null && startsAt - Date.now() < 12 * 60 * 60 * 1000;
    const unstable = ["cancelled", "canceled", "postponed", "rescheduled"].includes(
      status.toLowerCase(),
    );
    const ttl = unstable
      ? TTL_DETAIL_UNSTABLE_SECONDS
      : soon
      ? TTL_DETAIL_LIVE_SECONDS
      : TTL_DETAIL_FAR_SECONDS;

    await admin.rpc("put_event_content", {
      p_provider_event_id: String(event.id),
      p_payload: event,
      p_status: status,
      p_starts_at: event.startsAt ?? null,
      p_ends_at: event.endsAt ?? null,
      p_timezone: event.timezone ?? null,
      p_date_tbd: event.dateTbd === true,
      p_latitude: event.latitude ?? null,
      p_longitude: event.longitude ?? null,
      p_ttl: `${ttl} seconds`,
    });

    return { ok: true, event };
  };

  if (operation === "detail") {
    const token = String(body.selectionToken ?? "").trim();
    if (token.length === 0) {
      return Response.json({ error: "selection_unusable" }, { status: 400 });
    }
    // The id comes from the token, never from the request body — the client
    // has no way to ask about an event it was not shown.
    const { data: taken } = await admin.rpc("take_event_selection", {
      p_user: userId,
      p_token: token,
    });
    const selection = (taken ?? [])[0] as { provider_event_id?: string } | undefined;
    if (!selection?.provider_event_id) {
      return Response.json({ error: "selection_unusable" }, { status: 400 });
    }

    const detail = await refresh(selection.provider_event_id);
    if (!detail.ok) {
      return Response.json({ error: detail.reason }, { status: 503 });
    }

    // A fresh single-use token for the join that follows, carrying the status
    // we have this second rather than the one the search saw.
    const { data: reissued } = await admin.rpc("record_event_selections", {
      p_user: userId,
      p_search_key: "detail",
      p_events: [detail.event],
    });
    const joinToken = ((reissued ?? [])[0] as { token?: string } | undefined)?.token ?? null;

    return Response.json({
      selectionToken: joinToken,
      event: detail.event,
      attribution: "Powered by Ticketmaster",
    });
  }

  /* ------------------------------------------------------- live verification */
  if (operation === "verify") {
    const eventId = String(body.eventId ?? "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracyMeters);
    if (eventId.length === 0) {
      return Response.json({ error: "event_required" }, { status: 400 });
    }
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    const { data: rows } = await admin
      .from("events")
      .select("id, provider_event_id")
      .eq("id", eventId)
      .maybeSingle();
    const event = rows as { provider_event_id?: string } | null;
    if (!event?.provider_event_id) {
      return Response.json({ error: "event_required" }, { status: 404 });
    }

    // §9.3: the status and the window must be *fresh*. A lease older than the
    // live-window TTL is refreshed before anybody is told they are at a
    // concert that was called off this morning.
    let status: string | null = null;
    let venueLat: number | null = null;
    let venueLng: number | null = null;

    const { data: leased } = await admin.rpc("event_content", { p_event_ids: [eventId] });
    const lease = (leased ?? [])[0] as
      | { provider_status?: string; payload?: Record<string, unknown> }
      | undefined;

    const detail = await refresh(event.provider_event_id);
    if (detail.ok) {
      status = String(detail.event.status ?? "");
      venueLat = detail.event.latitude as number | null;
      venueLng = detail.event.longitude as number | null;
    } else if (lease) {
      // The provider is unreachable but the lease is still fresh. Using it is
      // honest — it is what we were told, recently — and refusing outright
      // would make a concert unreachable because Ticketmaster had a bad
      // minute (§12).
      status = lease.provider_status ?? null;
      venueLat = (lease.payload?.latitude as number | null) ?? null;
      venueLng = (lease.payload?.longitude as number | null) ?? null;
    } else {
      return Response.json({ error: "provider_unavailable" }, { status: 503 });
    }

    const { data: checkRows, error: checkError } = await admin.rpc("record_event_presence", {
      p_user: userId,
      p_event: eventId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_venue_latitude: venueLat,
      p_venue_longitude: venueLng,
      p_accuracy_meters: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null,
      p_provider_status: status,
    });
    if (checkError) {
      return Response.json(
        { error: (checkError as { code?: string }).code ?? "check_failed" },
        { status: 400 },
      );
    }
    const answer = (checkRows ?? [])[0] as
      | { outcome?: string; within_range?: boolean; expires_at?: string }
      | undefined;
    if (!answer) {
      return Response.json({ error: "check_failed" }, { status: 503 });
    }

    // An outcome, a boolean and an expiry. No coordinate, no distance — not
    // even to the person who was just measured (D-005).
    return Response.json({
      outcome: answer.outcome ?? "TOO_FAR",
      withinRange: answer.within_range === true,
      expiresAt: answer.expires_at ?? null,
    });
  }

  /**
   * E-21 — the live check from a selection alone.
   *
   * Same freshness rules as `verify`; the difference is where the event comes
   * from and what is *not* created. There is no membership lookup because
   * there is no membership requirement, and none is made: being somewhere and
   * having said you would go are two separate claims.
   */
  if (operation === "verify_selection") {
    const selectionToken = String(body.selectionToken ?? "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracyMeters);
    if (selectionToken.length === 0) {
      return Response.json({ error: "selection_required" }, { status: 400 });
    }
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return Response.json({ error: "That location reading is not usable." }, { status: 400 });
    }

    // The token names the provider event; the database is what decides whether
    // this caller may use it, and it re-checks ownership and expiry itself.
    const { data: peek } = await admin
      .from("event_selections")
      .select("provider_event_id")
      .eq("token", selectionToken)
      .maybeSingle();
    const providerEventId = (peek as { provider_event_id?: string } | null)?.provider_event_id;
    if (!providerEventId) {
      return Response.json({ error: "selection_required" }, { status: 404 });
    }

    let status: string | null = null;
    let venueLat: number | null = null;
    let venueLng: number | null = null;
    const detail = await refresh(providerEventId);
    if (detail.ok) {
      status = String(detail.event.status ?? "");
      venueLat = detail.event.latitude as number | null;
      venueLng = detail.event.longitude as number | null;
    } else {
      // No lease to fall back on: this event may never have been opened before.
      return Response.json({ error: "provider_unavailable" }, { status: 503 });
    }

    const { data: rows, error } = await admin.rpc("record_event_presence_from_selection", {
      p_user: userId,
      p_token: selectionToken,
      p_latitude: latitude,
      p_longitude: longitude,
      p_venue_latitude: venueLat,
      p_venue_longitude: venueLng,
      p_accuracy_meters: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null,
    });
    if (error) {
      return Response.json(
        { error: (error as { code?: string }).code ?? "check_failed" },
        { status: 400 },
      );
    }
    const answer = (rows ?? [])[0] as
      | { outcome?: string; within_range?: boolean; expires_at?: string; event_id?: string }
      | undefined;
    if (!answer) {
      return Response.json({ error: "check_failed" }, { status: 503 });
    }
    return Response.json({
      outcome: answer.outcome ?? "TOO_FAR",
      withinRange: answer.within_range === true,
      expiresAt: answer.expires_at ?? null,
      eventId: answer.event_id ?? null,
    });
  }

  return Response.json({ error: "Unknown operation." }, { status: 400 });
});
