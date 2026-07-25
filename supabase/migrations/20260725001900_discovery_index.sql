-- Vocation Match — H-410
-- The one index the performance pass said to add before a pilot.
--
-- `user_active_hotel` has a primary key on `user_id` and nothing else. Every
-- lookup by user is therefore free, which is most of them — but
-- `discovery_feed` filters the other way round, `where other.hotel_id = ...`,
-- and that was a sequential scan.
--
-- What makes it worth fixing now rather than later: there is exactly one row
-- per user, forever. A hotel switch updates the row in place (D-003) and
-- nothing deletes it, so the table's size is the number of people who have ever
-- activated a hotel anywhere on the platform — not the number currently at this
-- hotel. Measured, that scan's cost grew 25x when 5,000 users at other hotels
-- were added while the room itself stayed at 200 people and the answer stayed
-- at 20 cards.
--
-- At pilot density it is invisible either way: under 10 ms with or without.
-- The reason to add it is that discovery is the most-called endpoint in the
-- app and this is the one thing about it that gets slower for reasons that
-- have nothing to do with the hotel anyone is standing in.

create index user_active_hotel_hotel_idx on public.user_active_hotel (hotel_id);

comment on index public.user_active_hotel_hotel_idx is
  'Discovery filters by hotel. Without this the scan grows with lifetime '
  'platform signups rather than with the current hotel''s occupancy.';
