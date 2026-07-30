/**
 * D-056 §6/§12 — a static contract over the one file that may talk to
 * Ticketmaster.
 *
 * Read as text rather than run, because the things worth guarding are not
 * behaviours a mock would exercise: which endpoint, which parameters, and in
 * what order the refusals happen. Each of them silently changes what we are
 * billed or what we are allowed to do, and none of them shows up on screen.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(__dirname, '../../../supabase/functions/events-ticketmaster/index.ts'),
  'utf8',
);

/** The same file with its prose removed, so a comment cannot satisfy a check. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('the Ticketmaster endpoint', () => {
  it('is Discovery v2, not the legacy International API', () => {
    expect(source).toContain('https://app.ticketmaster.com/discovery/v2');
    expect(code).not.toContain('/discovery/v1');
    expect(code).not.toMatch(/international.*discovery/i);
  });

  it('uses geoPoint, never the deprecated latlong', () => {
    expect(source).toContain('"geoPoint"');
    expect(code).not.toContain('latlong');
  });

  it('bounds pagination well short of the deep-paging boundary', () => {
    expect(source).toMatch(/const MAX_PAGE = \d+;/);
    const max = Number(/const MAX_PAGE = (\d+);/.exec(source)![1]);
    expect(max).toBeLessThanOrEqual(10);
  });

  it('never asks for ticket inventory, prices or seats', () => {
    for (const field of ['priceRanges', 'seatmap', 'ticketLimit', 'products', 'offers']) {
      expect(code).not.toContain(field);
    }
  });
});

describe('the key', () => {
  it('comes from the platform and is never written down', () => {
    expect(source).toContain('Deno.env.get("TICKETMASTER_DISCOVERY_API_KEY")');
    expect(code).not.toMatch(/apikey["']?\s*[:=]\s*["'][A-Za-z0-9]{8,}/);
  });

  it('is attached to the request rather than logged with it', () => {
    // Every measurement in this file is an operation and an outcome; nothing
    // carries the query, the coordinates or the payload (§12).
    expect(code).not.toMatch(/console\.(log|error|warn)/);
    expect(source).toContain('measure(');
  });
});

describe('the ceilings, before the call', () => {
  it('checks the switch, the breaker, the second and the day, in that order', () => {
    const order = [
      'provider_disabled',
      'provider_breaker',
      'claim_provider_second',
      'claim_metered_call',
    ].map((needle) => source.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('refuses rather than guessing when the counter is unreachable', () => {
    expect(source).toContain('return "ceiling_unknown"');
  });

  it('claims before it spends, never counts after', () => {
    const claimAt = source.indexOf('mayCallProvider');
    const fetchAt = source.indexOf('fetch(`${DISCOVERY}');
    expect(claimAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(claimAt);
  });

  it('carries the approved pilot defaults, under the provider’s own quota', () => {
    expect(source).toMatch(/TICKETMASTER_MAX_REQUESTS_PER_SECOND"\s*\)\s*\?\?\s*"1"/);
    expect(source).toMatch(/TICKETMASTER_DAILY_REQUEST_ALLOWANCE"\s*\)\s*\?\?\s*"4500"/);
    expect(source).toMatch(/TICKETMASTER_REQUEST_TIMEOUT_MS"\s*\)\s*\?\?\s*"5000"/);
  });
});

describe('the cache key', () => {
  it('separates area, window, classification, locale and page', () => {
    const key = /const cacheKey = \[([\s\S]*?)\]\.join/.exec(source)![1];
    expect(key).toContain('areaKey');
    expect(key).toContain('category');
    expect(key).toContain('locale');
    expect(key).toContain('page');
    // The window too: a thirty-day answer is not a ninety-day answer.
    expect(key).toMatch(/days|today/);
  });

  it('holds no user and no precise coordinate', () => {
    const key = /const cacheKey = \[([\s\S]*?)\]\.join/.exec(source)![1];
    expect(key).not.toContain('userId');
    expect(key).not.toContain('latitude');
    // The area is rounded to about eleven kilometres before it becomes a key.
    expect(source).toContain('Math.round(reading.latitude * 10) / 10');
  });
});

describe('what reaches the room', () => {
  it('rejects a provider test event before it can be selected', () => {
    expect(source).toContain('if (raw.test === true) return null;');
  });

  it('hands back selection tokens, never bare provider ids', () => {
    expect(source).toContain('record_event_selections');
    expect(source).toContain('selectionToken');
  });

  it('writes provider content only to the lease', () => {
    expect(source).toContain('put_event_content');
    // Nothing here writes a room, a membership, a match or a message.
    for (const table of ['event_memberships', 'matches', 'messages', 'swipes']) {
      expect(code).not.toContain(table);
    }
  });
});
