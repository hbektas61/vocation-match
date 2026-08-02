-- The phone gate, moved from the door to the room.
--
-- `20260801000200` put it on creating a profile, which closes the way *in* and
-- nothing else. An account that already holds a profile — and staging has nine
-- of them, from before phone-only sign-in — could still swipe, match, check in
-- and join event rooms, because none of that asks how the account was made.
-- A gate on registration is not a gate on the product.
--
-- The split this uses already existed and is the right one:
--
--   `app.require_user()`     — the product. Discovery, swipes, rooms, stays,
--                              check-ins, events. Everything you do *with*
--                              other people. This is where the phone belongs.
--
--   `app.require_any_user()` — safety and self-service. Block, report,
--                              unmatch, read your own conversations, delete
--                              your account. None of it is gated, and that is
--                              deliberate: an account that cannot prove a
--                              phone must still be able to leave, and to
--                              protect itself while it is here. Taking
--                              somebody's block button away because of a
--                              migration would be the worst possible reading
--                              of "secure".
--
-- `service_role` is untouched. It does not call these functions to decide
-- anything about itself, and no policy for `authenticated` applies to it, so
-- moderation, the notification dispatcher, the storage drain and every
-- maintenance script keep working.

create or replace function app.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_suspended timestamptz;
begin
  if v_user is null then
    -- 28000 maps to "sign in", not "forbidden": the caller is not
    -- authenticated, which is a different thing from not being allowed.
    raise exception 'Sign in to continue.' using errcode = '28000';
  end if;

  select p.suspended_at into v_suspended
    from public.profiles p
   where p.id = v_user;

  if not found then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;
  if v_suspended is not null then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;

  -- The new condition, and last on purpose: an account with no profile hears
  -- "finish your profile" and a suspended one hears why it is suspended,
  -- rather than both being told about a phone.
  --
  -- Read through `app.current_user_has_verified_phone()`, which takes its
  -- answer from `auth.users.phone_confirmed_at` — never from the JWT or user
  -- metadata, both of which the user they describe can write.
  if not app.current_user_has_verified_phone() then
    raise exception 'Confirm your phone number to continue.' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

comment on function app.require_user() is
  'The product gate: signed in, has a profile, not suspended, and has proved a phone. '
  'Safety and self-service go through app.require_any_user() instead, which deliberately '
  'asks for none of the last three — leaving, blocking and reporting must never be gated.';

revoke all on function app.require_user() from public, anon;
grant execute on function app.require_user() to authenticated, service_role;
