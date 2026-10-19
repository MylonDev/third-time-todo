-- Timed sessions.
--
-- A Timed entry is a count-down session. It is history only: it never touches
-- the Flow balance. It is stored beside the Focus and Rest entries, with the
-- length it was set to in `planned_ms`; the entry ends itself at
-- `started_at + planned_ms`. Flow entries leave `planned_ms` null.

alter table public.time_entries
  drop constraint time_entries_state_check;

alter table public.time_entries
  add constraint time_entries_state_check check (state in ('should', 'want', 'timed'));

alter table public.time_entries
  add column planned_ms bigint check (planned_ms is null or planned_ms > 0);
