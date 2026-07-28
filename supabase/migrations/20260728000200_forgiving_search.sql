-- Vacation Match — D-037: the search forgives the way people actually type.
--
-- Two real misses from the owner's device (2026-07-28), both on a venue the
-- catalogue already held: "beforesunset" (joined words) and "before sunset
-- beach" (the colloquial name carries a word the stored name does not —
-- OSM calls the place "Before Sunset Bar"). Plain substring matching answers
-- neither. Two additions, both still plain SQL over a pilot-sized table:
--
--   * squashed matching — letters and digits only, case folded, spaces and
--     punctuation gone — so a joined or oddly-spaced query still lands;
--   * token matching — every word of the query is looked for on its own in
--     name, city and address, and the row answers when at most one word of
--     a multi-word query is a stranger. One stray word is a colloquialism;
--     two is a different search.
--
-- The single-word behaviour and the starts-with-first ordering are unchanged.

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
           -- Letters and digits only: a LIKE pattern with nothing left to
           -- escape, on both sides of the comparison.
           regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:]]+', '', 'g')
             as squashed
  ),
  toks as (
    select t.tok
      from q, unnest(regexp_split_to_array(q.term, '\s+')) as t(tok)
     where t.tok <> ''
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
         and regexp_replace(lower(h.name || ' ' || h.city), '[^[:alnum:]]+', '', 'g')
             like '%' || q.squashed || '%'
       )
       or (
         select count(*)
           from toks t
          where h.name ilike '%' || t.tok || '%'
             or h.city ilike '%' || t.tok || '%'
             or coalesce(h.address, '') ilike '%' || t.tok || '%'
       ) >= (select hits from need)
     )
   order by
     case when h.name ilike q.term || '%' then 0 else 1 end,
     h.name,
     h.id
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_hotels(text, integer) from public, anon;
grant execute on function public.search_hotels(text, integer) to authenticated, service_role;
