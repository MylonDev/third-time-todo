-- Remove Practices and Get ready.
--
-- Apply only once the build that no longer uses them is live: an older build
-- reads and writes everything dropped here, and its sync fails from then on.

-- The merge function reads the columns dropped below, so it goes first. With one
-- version left on the row, `keep_newest` from the sync schema is enough again.
drop trigger user_settings_merge on public.user_settings;
create trigger keep_newest before insert or update on public.user_settings
  for each row execute function public.keep_newest();
drop function public.user_settings_merge();

drop table public.practices;
drop table public.get_ready_days;
drop function public.practice_level_targets();

alter table public.user_settings
  drop column weekly_cap_min,
  drop column get_ready_steps,
  drop column get_ready_steps_updated_at;

alter table public.time_entries drop column practice_id;
