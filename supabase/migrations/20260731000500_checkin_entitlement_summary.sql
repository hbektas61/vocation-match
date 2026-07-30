-- N-07 — the screen may say how many Google-backed check-ins are left, and the
-- server is the only thing that may count them.
--
-- `google_finds_remaining()` already existed and returns one integer. The
-- approved design (frames N-07 / N-08) shows more than a number: the ceiling it
-- is out of, what has been spent, when it comes back, and whether the account
-- is on the free or the premium ceiling. Four of those five were derivable
-- client-side from the fifth, which is exactly how a client ends up disagreeing
-- with the server about somebody's rights — so all five come from here, in one
-- row, computed from the same expressions `checkin_here` charges against.
--
-- Three things this deliberately is not:
--
--   1. **Not "advanced search".** The right is spent on a *completed*
--      Google-labelled check-in and nothing else — not on a search, an empty
--      result, a cancellation, a provider failure or a check-in that failed.
--      `checkin_here` charges it inside the same transaction as the check-in it
--      belongs to, and the naming here follows the thing being counted.
--   2. **Not readable for anybody else.** It takes no argument. There is no
--      shape of this call that reads another person's entitlement, and `anon`
--      cannot execute it at all.
--   3. **Not a new rule.** The 3/10 split, the UTC month boundary and the
--      premium test are D-053's, unchanged; this only reports them.

/**
 * This account's Google-backed check-in allowance, as the screen needs it.
 *
 * `resets_at` is the first instant of the next UTC month — the same boundary
 * `checkin_here` keys `app.google_finds.period` on, so the number a person is
 * shown and the number they are charged against can never drift apart.
 */
create or replace function public.google_checkin_entitlement()
returns table (
  "limit"    integer,
  used       integer,
  remaining  integer,
  resets_at  timestamptz,
  is_premium boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select app.require_user() as user_id),
  period as (select date_trunc('month', now())::date as month),
  spent as (
    select coalesce(gf.used, 0) as used
      from me
      left join app.google_finds gf
        on gf.user_id = me.user_id
       and gf.period = (select month from period)
  )
  select
    app.google_find_allowance((select user_id from me)),
    (select used from spent),
    greatest(
      app.google_find_allowance((select user_id from me)) - (select used from spent),
      0
    ),
    -- The boundary itself, not a duration: a client that renders "resets in N
    -- days" from a duration we computed would be wrong the moment it was
    -- backgrounded.
    (date_trunc('month', now()) + interval '1 month')::timestamptz,
    app.is_premium((select user_id from me));
$$;

comment on function public.google_checkin_entitlement() is
  'N-07: this account''s Google-backed check-in allowance — ceiling, spent, left, when it returns, and which ceiling applies. Server-authoritative; never computed on a client.';

revoke all on function public.google_checkin_entitlement() from public, anon;
grant execute on function public.google_checkin_entitlement() to authenticated, service_role;

notify pgrst, 'reload schema';
