-- Vacation Match — D-037, continued: the two forgivenesses compose.
--
-- The owner's fourth spelling (2026-07-28): "beforesunset beach" — joined-up
-- words *and* a stray word at once. The squashed match alone fails (the
-- stray word pollutes the squash), and the token match alone fails (the
-- joined token is not a substring of any single word). Two additions close
-- the gap without loosening anything a single rule already refused:
--
--   * tokens are also compared in squashed form against the squashed
--     name+city+address, so a joined-up token still lands on its own;
--   * for a multi-word query, the query minus its last word is tried as a
--     squashed whole — the trailing word is where colloquialisms live
--     ("beach", "club", "hotel"), exactly as the Nominatim fallback already
--     assumes.

create or replace function public.search_hotels(p_query text, p_limit integer default 20)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_')
             as term,
           regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:]]+', '', 'g')
             as squashed
  ),
  toks as (
    select t.tok, t.ord
      from q, unnest(regexp_split_to_array(q.term, '\s+')) with ordinality as t(tok, ord)
     where t.tok <> ''
  ),
  -- The query with its last word dropped, squashed. Empty below two words.
  minus_last as (
    select coalesce(
             (select regexp_replace(lower(string_agg(t.tok, '' order by t.ord)),
                                    '[^[:alnum:]]+', '', 'g')
                from toks t
               where t.ord < (select max(t2.ord) from toks t2)),
             '') as squashed
  ),
  need as (
    -- With n words, n-1 must be found (and never fewer than two for a
    -- multi-word query, so one common word cannot match the whole table).
    select greatest(count(*) - 1, least(count(*), 2))::int as hits from toks
  )
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution
    from public.hotels h, q
   where h.is_active
     and (
       q.term = ''
       or h.name ilike '%' || q.term || '%'
       or h.city ilike '%' || q.term || '%'
       or (
         q.squashed <> ''
         and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                            '[^[:alnum:]]+', '', 'g')
             like '%' || q.squashed || '%'
       )
       or (
         (select ml.squashed from minus_last ml) <> ''
         and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                            '[^[:alnum:]]+', '', 'g')
             like '%' || (select ml.squashed from minus_last ml) || '%'
       )
       or (
         select count(*)
           from toks t
          where h.name ilike '%' || t.tok || '%'
             or h.city ilike '%' || t.tok || '%'
             or coalesce(h.address, '') ilike '%' || t.tok || '%'
             or (
               -- The squashed form of a token made only of punctuation is
               -- empty, and an empty pattern would match the whole table.
               regexp_replace(lower(t.tok), '[^[:alnum:]]+', '', 'g') <> ''
               and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                                  '[^[:alnum:]]+', '', 'g')
                   like '%' || regexp_replace(lower(t.tok), '[^[:alnum:]]+', '', 'g') || '%'
             )
       ) >= (select n.hits from need n)
     )
   order by
     case when h.name ilike q.term || '%' then 0 else 1 end,
     h.name,
     h.id
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_hotels(text, integer) from public, anon;
grant execute on function public.search_hotels(text, integer) to authenticated, service_role;
