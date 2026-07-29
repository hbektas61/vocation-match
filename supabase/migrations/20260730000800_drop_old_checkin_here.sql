-- The two-argument `checkin_here` has to go.
--
-- D-052 added the labelled form with a default, which left both signatures
-- resolvable and PostgREST unable to choose: an unlabelled call — the
-- here-anchor, the one path that must never fail — came back as
-- "could not choose the best candidate function". The three-argument form with
-- its default covers both callers, so the older one is simply removed.
drop function if exists public.checkin_here(double precision, double precision);

-- PostgREST caches the schema; a new function is invisible until it is told.
notify pgrst, 'reload schema';
