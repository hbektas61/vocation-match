-- Vocation Match — H-201, H-202
-- Deleting your own account, from inside the app.
--
-- There was no way to do this. For a dating-adjacent product that is both a
-- privacy failure and a store-review failure.
--
-- The function takes no arguments. That is the whole security design: there is
-- no id to pass, so there is nothing to tamper with — the account deleted is
-- whichever one the JWT belongs to, and a caller cannot ask for another.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
begin
  if v_user is null then
    raise exception 'Sign in to continue.' using errcode = '28000';
  end if;

  -- Deliberately *not* app.require_user(): a suspended account must be able to
  -- delete itself, and so must someone who signed up and never finished a
  -- profile. Neither is a reason to trap someone in the product.
  --
  -- Deleting the auth row is what makes this complete rather than cosmetic:
  -- `public.profiles.id` references `auth.users` on delete cascade, and every
  -- user-owned table references `profiles` the same way, so one delete takes
  -- the profile, the active hotel, the declared stay, the presence answer, the
  -- swipes, the matches, the messages, the blocks and the rate-limit counters
  -- with it. Leaving the auth row behind would leave an account that can still
  -- sign in and has nothing to sign in to.
  delete from auth.users u where u.id = v_user;

  if not found then
    raise exception 'That account no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated, service_role;

comment on function public.delete_my_account() is
  'Deletes the calling user''s account. Takes no arguments on purpose: the '
  'account is read from the JWT, so there is nothing for a caller to tamper '
  'with. Moderation history about the account survives, anonymised.';

-- ------------------------------------------------------------------- H-202
-- What deliberately survives, and what deliberately does not.
--
-- Survives, with the person's id set to NULL:
--   public.reports            — a report filed about this account, and a report
--                               it filed about someone else. Deleting an
--                               account must not be a way to erase the record
--                               that reports were made, or to wipe a complaint
--                               someone else is relying on.
--   public.moderation_actions — the same reasoning for the decisions taken.
--
-- Goes, because it is this person's:
--   profile, active hotel, activation events, declared stay, presence answer,
--   swipes, blocks, rate-limit counters.
--
-- Goes, and takes something of somebody else's with it:
--   matches and messages. `messages.sender_id` and both `matches` sides cascade,
--   so the conversation disappears from the other person's inbox as well — not
--   just this person's half of it. That is the honest consequence of "delete my
--   account" on a two-sided record, and it is the right way round for a privacy
--   product: the alternative is leaving a deleted person's words in somebody
--   else's app forever. The other side sees the conversation gone, not a ghost.
--
-- Cannot be finished by the database:
--   the bytes of any photo. The profile delete trigger removes the
--   `storage.objects` rows, which makes them unreadable immediately, and
--   records each one in `public.storage_cleanup_queue` for a service-role job
--   to delete from the object store. Until that job exists, the bytes are
--   unreachable rather than gone, and this comment is the record of it.
--
-- Not solved here:
--   a suspended account can delete itself and sign up again with another email.
--   That was already true — suspension is per account, not per person — and is
--   an open owner decision in .studio/decisions.md. Closing it needs device or
--   phone signals, which is a bigger privacy trade than the MVP should make.

comment on table public.reports is
  'Reports outlive the accounts involved: both id columns are ON DELETE SET '
  'NULL, so deleting an account anonymises a report but never removes it.';
