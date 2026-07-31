-- The retry guard added one migration ago did not actually guard anything.
--
-- `messages_client_token_unique` was created as a *partial* index (`where
-- client_token is not null`). Postgres will only use an index for `on conflict
-- (cols)` if it can infer it from the column list alone, and a partial index
-- needs its predicate restated to be inferable. PostgREST sends the column
-- list and nothing else — so every upsert failed to match an arbiter, and the
-- client's retry path wrote nothing at all. Four concurrent retries stored
-- zero rows instead of one, which is a worse failure than the duplicate it was
-- meant to prevent, and it was silent.
--
-- Found by running the two-account journey against staging. It could not have
-- been found by reading the SQL: the index is correct, the constraint is
-- correct, and the two simply cannot be combined the way the client needs.
--
-- A plain unique index is the fix. Nulls are distinct in a unique index by
-- default, so every message sent without a token still coexists happily — the
-- partial predicate was never buying anything the default did not already give.

drop index if exists public.messages_client_token_unique;

create unique index messages_client_token_unique
  on public.messages (match_id, sender_id, client_token);

comment on index public.messages_client_token_unique is
  'Inferable from its column list, so `on conflict (match_id, sender_id, client_token) '
  'do nothing` resolves to it. Not partial: null tokens are distinct from each other '
  'under the default NULLS DISTINCT, so untokened sends are unaffected.';
