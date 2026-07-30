/**
 * What counts as "the same search", on both sides of the wire.
 *
 * The backend fingerprints an advanced-search query so a repeat inside one
 * session costs nothing (D-053 §3): `md5(regexp_replace(lower(btrim(q)), '\s+',
 * ' ', 'g'))`. The screen needs the same notion of sameness for a different
 * reason — to know whether the Google option has already been used up on the
 * name currently in the box, or whether this is a new name and therefore a new
 * chance.
 *
 * Two functions rather than one, because two different rules are at work and
 * conflating them was the bug:
 *
 *   normalizeQuery  — case and spacing, mirroring the server's fingerprint. Two
 *                     queries that normalize alike are the same question.
 *   queryWeight     — non-whitespace characters, which is what the three-
 *                     character minimum counts. "  a b  " is two, not seven.
 *
 * The md5 itself is deliberately not reproduced here: the client never needs to
 * name the server's hash, only to group by the same equivalence.
 */

/** The server's normalisation, without the digest. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Characters that are actually a name, for the D-053 §3 minimum. */
export function queryWeight(query: string): number {
  return query.replace(/\s+/g, '').length;
}

/** The floor below which there is nothing to search for (D-053 §3). */
export const MIN_QUERY_WEIGHT = 3;
