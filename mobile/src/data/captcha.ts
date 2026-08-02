/**
 * The CAPTCHA that stands in front of phone sign-in.
 *
 * `/auth/v1/otp` is public, unauthenticated and — the moment an SMS provider is
 * enabled — billable. Rate limits bound one source; a CAPTCHA is what addresses
 * distributed automation, and without one the endpoint is a way for a stranger
 * to spend the project's SMS quota until nobody can sign in at all.
 * `scripts/verify-hosted-auth.mjs` reports exactly that state today.
 *
 * This module owns the rules; `CaptchaChallenge` owns the widget.
 *
 * Two things are load-bearing and easy to get wrong:
 *
 *   * **A token is single-use.** Cloudflare refuses a token it has already
 *     seen, and the refusal reaches the person as "the code did not send" —
 *     for something they did not do. So the token is taken once and forgotten,
 *     and a resend solves a fresh challenge rather than reusing the last one.
 *   * **The secret never comes here.** The site key identifies the site and is
 *     public by construction; the *secret* is exchanged server-side, by the
 *     auth server, and belongs only in the Supabase dashboard.
 */

/** Cloudflare's Turnstile origins. The challenge page talks to these. */
export const TURNSTILE_ORIGINS = [
  'https://challenges.cloudflare.com',
] as const;

/**
 * The public site key. Public by construction — it is visible in the markup of
 * any page that renders a challenge.
 *
 * Cloudflare publishes dummy keys for exactly this situation, which is why the
 * absence of a production key is not a reason to leave the flow untested:
 * `1x00000000000000000000AA` always passes, `2x00000000000000000000AB` always
 * blocks, `3x00000000000000000000FF` forces an interactive challenge.
 */
export function captchaSiteKey(): string | null {
  const key = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  return key && key.trim() ? key.trim() : null;
}

/**
 * Where the challenge page is served from, parsed rather than pattern-matched.
 *
 * A `startsWith('https://')` check accepts a great deal it should not:
 * `https://` alone, `https://user:pass@evil.example`, a URL with a fragment
 * that changes what the page does. Since this string decides which origin the
 * app will trust with a token, it is parsed by the URL constructor and every
 * part of it is checked.
 *
 * Returns the *canonical* form — origin plus path, no query, no fragment, no
 * credentials — which is what everything downstream compares against.
 */
export function captchaPageUrl(): URL | null {
  const raw = process.env.EXPO_PUBLIC_TURNSTILE_PAGE_URL;
  if (!raw || !raw.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  // Exactly https. `http:` puts the token on the wire in clear, and anything
  // else is not a page at all.
  if (parsed.protocol !== 'https:') return null;
  // Credentials in a URL are a way to make one origin look like another in a
  // glance at a config file.
  if (parsed.username || parsed.password) return null;
  // `new URL('https://')` throws, but `https://#x` and similar do not always
  // produce a host — a hostless URL has no origin to trust.
  if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) return null;
  // A fragment cannot change which document loads, but it can change what a
  // page does with itself, and it has no business in a trust anchor.
  if (parsed.hash) return null;

  const canonical = new URL(`${parsed.origin}${parsed.pathname}`);
  return canonical;
}

/** The page's canonical string, for comparing a message's origin against. */
export function captchaPageHref(): string | null {
  return captchaPageUrl()?.href ?? null;
}

/**
 * The exact URL the WebView is asked to load.
 *
 * Built with `searchParams` rather than by joining strings: a site key is
 * configuration and configuration is not always what you expect, and a `&` in
 * the wrong place is a second parameter nobody meant to send.
 */
export function captchaRequestUrl(): string | null {
  const page = captchaPageUrl();
  const key = captchaSiteKey();
  if (!page || !key) return null;
  const url = new URL(page.href);
  url.searchParams.set('sitekey', key);
  return url.toString();
}

/**
 * Whether a message really came from our challenge page.
 *
 * The `source` field inside the JSON is not evidence of anything: whatever
 * document the WebView has loaded can write it. `nativeEvent.url` is the frame
 * the message was posted from, and it is the only part of a message the page
 * cannot forge.
 *
 * Compared against origin *and* path. Same-origin is not enough — any other
 * page on the same host, including one somebody else can put there, would
 * otherwise be able to hand the app a token.
 *
 * Cloudflare's own origin is deliberately **not** accepted here. The widget
 * runs in an iframe and reports to its parent; the parent — our page — is what
 * calls `postMessage`. A token arriving directly from `challenges.cloudflare.com`
 * is not the flow working, it is something else happening.
 */
export function isCaptchaMessageOrigin(url: unknown): boolean {
  const page = captchaPageUrl();
  if (!page || typeof url !== 'string' || !url) return false;
  let from: URL;
  try {
    from = new URL(url);
  } catch {
    return false;
  }
  return from.origin === page.origin && from.pathname === page.pathname;
}

/** Whether this build must solve a challenge before asking for a code. */
export function captchaRequired(): boolean {
  return captchaSiteKey() !== null;
}

/**
 * Which URLs the WebView may load *at all* — top-level page or subresource.
 *
 * Cloudflare's origin is here because the widget's script and iframe come from
 * it. That is a very different permission from "may become the page", which is
 * `allowedTopLevelNavigation` below. Conflating the two would let a redirect
 * chain end up on a Cloudflare-hosted document with our bridge attached.
 */
export function allowedCaptchaOrigin(url: string): boolean {
  const page = captchaPageUrl();
  if (!page) return false;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  if (origin === page.origin) return true;
  return (TURNSTILE_ORIGINS as readonly string[]).includes(origin);
}

/** What the challenge page can tell us. Anything else is ignored. */
export type CaptchaOutcome =
  | { kind: 'success'; token: string }
  | { kind: 'error'; code: string }
  | { kind: 'expired' };

/**
 * Reads a message posted by the challenge page.
 *
 * Deliberately strict. The page is ours, but a WebView will hand up whatever
 * the loaded document posts, so this treats the payload as untrusted input and
 * returns null for anything that is not one of the three shapes.
 */
export function parseCaptchaMessage(raw: unknown): CaptchaOutcome | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (data.source !== 'vocation-turnstile') return null;

  if (data.kind === 'success') {
    const token = data.token;
    return typeof token === 'string' && token.length > 0 && token.length <= 2048
      ? { kind: 'success', token }
      : null;
  }
  if (data.kind === 'expired') return { kind: 'expired' };
  if (data.kind === 'error') {
    return { kind: 'error', code: typeof data.code === 'string' ? data.code : 'unknown' };
  }
  return null;
}

/**
 * One token, one request.
 *
 * The single-use rule is made explicit here rather than left to whoever calls
 * next: take it and it is gone.
 */
export class CaptchaToken {
  private token: string | null;

  constructor(token: string) {
    this.token = token;
  }

  /** Returns the token once, then forgets it. */
  take(): string | undefined {
    const value = this.token;
    this.token = null;
    return value ?? undefined;
  }

  get spent(): boolean {
    return this.token === null;
  }
}

/** How long a challenge may sit unanswered before it is abandoned. */
export const CAPTCHA_TIMEOUT_MS = 45_000;

/**
 * Which URL may become the top-level document.
 *
 * Exactly one: the configured page, with or without its query. Not the same
 * question as `allowedCaptchaOrigin`, which also permits the subresources the
 * widget needs — a WebView that follows arbitrary top-level navigation is a
 * browser wearing the app's name, and this one exists to render one page.
 */
export function allowedTopLevelNavigation(url: string): boolean {
  const page = captchaPageUrl();
  if (!page) return false;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  return target.origin === page.origin && target.pathname === page.pathname;
}
