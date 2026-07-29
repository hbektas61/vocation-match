-- D-051: two searches, because they were never one question.
--
-- `search_hotels` served both the trip tab ("which hotel am I staying at")
-- and Çevremde's name fallback ("what is this place I am sitting in") over
-- one table with no filter on kind. While the catalogue was small the noise
-- was invisible. It is not any more: searching "sorgun" on the *hotel* tab
-- returned Sorgun Beach Club and Sorgun Sahil Bar and no hotel at all, and
-- "marina" returned four restaurants and a beach. The owner called this
-- before the numbers did — "algoritma bozulacak".
--
-- So the matching logic moves into one internal function and the two public
-- questions differ only in what they will accept: lodging for the trip tab,
-- anywhere-a-person-can-be for Çevremde. Cells are excluded from both, as
-- they have been since D-048.

-- Every row that predates the kind vocabulary (D-041) is a hotel: the
-- catalogue was hotels-only until then, and every provider path has written a
-- kind since. Verified by sampling — Rixos, Hilton, Cratos, Kempinski, and
-- the seeded pilot hotels are exactly what is in there.
update public.hotels set venue_kind = 'hotel' where venue_kind is null;

create or replace function app.search_places(
  p_query        text,
  p_limit        integer,
  p_lodging_only boolean
)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text
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
  minus_last as (
    select coalesce(
             (select regexp_replace(lower(string_agg(t.tok, '' order by t.ord)),
                                    '[^[:alnum:]]+', '', 'g')
                from toks t
               where t.ord < (select max(t2.ord) from toks t2)),
             '') as squashed
  ),
  need as (
    select greatest(count(*) - 1, least(count(*), 2))::int as hits from toks
  )
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution, h.venue_kind
    from public.hotels h, q
   where h.is_active
     -- A cell is a place to stand in, never one to be found by name (D-048).
     and coalesce(h.venue_kind, '') <> 'cell'
     -- D-051: the two questions are not the same question. Choosing where to
     -- stay wants lodging; finding where you are standing wants anywhere a
     -- person can be.
     and (not p_lodging_only or h.venue_kind = 'hotel')
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

comment on function app.search_places(text, integer, boolean) is
  'D-051: the shared name search. `p_lodging_only` is the difference between the trip tab and Çevremde.';

revoke all on function app.search_places(text, integer, boolean) from public, anon, authenticated;

-- The trip tab: somewhere to stay.
create or replace function public.search_hotels(p_query text, p_limit integer default 20)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.search_places(p_query, p_limit, true);
$$;

revoke all on function public.search_hotels(text, integer) from public, anon;
grant execute on function public.search_hotels(text, integer) to authenticated, service_role;

-- Çevremde: anywhere a person can actually be, including a hotel lobby.
create or replace function public.search_venues(p_query text, p_limit integer default 20)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.search_places(p_query, p_limit, false);
$$;

revoke all on function public.search_venues(text, integer) from public, anon;
grant execute on function public.search_venues(text, integer) to authenticated, service_role;
