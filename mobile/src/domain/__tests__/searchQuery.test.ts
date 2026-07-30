/**
 * D-053 §3 — the client and the server have to mean the same thing by "again".
 *
 * The screen decides whether the advanced find has already been used on the
 * name in the box; the backend decides whether to charge for a repeat. If those
 * two notions of sameness drift apart, one of them is wrong in a way nobody
 * notices until a bill arrives — so the normalisation is one function, and this
 * test also reads the SQL to check the two still describe the same transform.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MIN_QUERY_WEIGHT, normalizeQuery, queryWeight } from '../searchQuery';

describe('normalizing a search query', () => {
  it.each([
    ['case', 'ESSLAB', 'esslab'],
    ['surrounding space', '  esslab  ', 'esslab'],
    ['runs of space inside', 'kral   espresso', 'kral espresso'],
    ['tabs and newlines', 'kral\t\nespresso', 'kral espresso'],
    ['all three at once', '  KRAL   Espresso  ', 'kral espresso'],
  ])('ignores %s', (_label, written, normalized) => {
    expect(normalizeQuery(written)).toBe(normalized);
  });

  it('keeps names that are genuinely different apart', () => {
    expect(normalizeQuery('eslab')).not.toBe(normalizeQuery('esslab'));
  });

  it('agrees with app.query_fingerprint about what it ignores', () => {
    const sql = readFileSync(
      join(__dirname, '../../../../supabase/migrations/20260730001100_google_metrics_sessions.sql'),
      'utf8',
    );
    // lower + btrim + collapse whitespace, then a digest the client never needs.
    expect(sql).toContain("md5(regexp_replace(lower(btrim(coalesce(p_query, ''))), '\\s+', ' ', 'g'))");
  });
});

describe('weighing a search query', () => {
  it('counts the name, not the spacing', () => {
    // The minimum is about having typed something, so "  a b  " is two
    // characters of intent — and below the floor.
    expect(queryWeight('  a b  ')).toBe(2);
    expect(queryWeight('  a b  ')).toBeLessThan(MIN_QUERY_WEIGHT);
    expect(queryWeight('esslab')).toBe(6);
  });

  it('carries the floor the server enforces again', () => {
    expect(MIN_QUERY_WEIGHT).toBe(3);
  });
});
