-- Reverses one of yesterday's gates. It was wrong, and wrong in the direction
-- that hurts the person the safety feature exists for.
--
-- `20260731001000` put the publication filter on four surfaces. Three were
-- right: a message, a display name and a bio are all things one member shows
-- another, and refusing to publish them is exactly what Apple 1.2 asks for.
--
-- `reports.details` is not that. It is the box where somebody types what was
-- said to them. The whole value of it is that it quotes the thing that was
-- wrong — the slur, the threat, the solicitation — and a filter on it refuses
-- the report precisely when the abuse was worst. It is evidence handed to a
-- moderator in private, not content published to anyone.
--
-- So the trigger goes. What stays is everything that made the field safe in
-- the first place, and none of it was the filter:
--
--   * the 1000-character limit (`reports_details_length`),
--   * `report_user` as the only write path, deriving the reporter from the JWT,
--   * the hourly rate limit,
--   * and the reason it is private: `reports_select_own` lets a reporter read
--     what they filed and nobody else read anything. The reported person
--     cannot see the report exists, let alone its text.
--
-- `tests/025_ugc_moderation.sql` had a test asserting the old behaviour. An
-- assertion can be wrong as easily as code, and that one was: it is replaced
-- rather than deleted, by a test that a report quoting abuse goes through.

drop trigger if exists reports_moderate_details on public.reports;
drop function if exists app.moderate_report_details();

comment on column public.reports.details is
  'What the reporter says happened, in their words, quoted as they need to quote it. '
  'Deliberately not run through the publication filter: this is private evidence for a '
  'moderator, and filtering it would refuse the report exactly when the abuse was worst. '
  'Bounded at 1000 characters and readable only by the reporter who wrote it.';
