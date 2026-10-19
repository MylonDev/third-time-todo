-- Debt sweep: Get ready steps get a version of their own, and practices written
-- by an old build keep a target.
--
-- ── Get ready steps ──────────────────────────────────────────────────────────
-- `user_settings` was one last-writer-wins row, so a stale device that changed
-- another setting (a newer `updated_at`) also pushed its old steps over a list
-- another device had just edited. The steps now carry their own version, and the
-- row is merged field by field: the settings by `updated_at`, the steps by
-- `get_ready_steps_updated_at`.
--
-- A build from before this change never sends the version. Its upsert leaves the
-- column as it was, so its steps are accepted only when they equal the stored
-- ones: until it updates, it cannot change the list.

alter table public.user_settings
  add column get_ready_steps_updated_at bigint not null default 0;

-- Steps that exist today were last changed with the row.
update public.user_settings
  set get_ready_steps_updated_at = updated_at
  where get_ready_steps <> '[]'::jsonb;

-- Replaces `keep_newest` on this table. It never returns null: a stale push
-- still carries a newer list, or a newer setting, that must not be dropped.
create function public.user_settings_merge() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      new.day_end_hour      := old.day_end_hour;
      new.should_target_min := old.should_target_min;
      new.weekly_cap_min    := old.weekly_cap_min;
      new.updated_at        := old.updated_at;
    end if;
    if new.get_ready_steps is distinct from old.get_ready_steps
       and new.get_ready_steps_updated_at <= old.get_ready_steps_updated_at then
      new.get_ready_steps            := old.get_ready_steps;
      new.get_ready_steps_updated_at := old.get_ready_steps_updated_at;
    end if;
    -- The version only moves forward, even when the list is the same.
    new.get_ready_steps_updated_at := greatest(new.get_ready_steps_updated_at, old.get_ready_steps_updated_at);
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger keep_newest on public.user_settings;
create trigger user_settings_merge before insert or update on public.user_settings
  for each row execute function public.user_settings_merge();

-- ── Practices from an old build ──────────────────────────────────────────────
-- An old build writes a `level` and no targets. A new row would get targets of
-- zero and read as Paused; a changed level would leave the old targets behind.
-- Derive them from the level, as the targets migration did. A new client never
-- sends `level`, so on its writes this does nothing.
create function public.practice_level_targets() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.level <> 'paused'
        and new.target_days = 0 and new.target_min = 0 and cardinality(new.target_weekdays) = 0)
     or (tg_op = 'UPDATE' and new.level is distinct from old.level) then
    new.target_days     := case new.level when 'minimal' then 1 when 'light' then 3 when 'steady' then 4 when 'serious' then 6 else 0 end;
    new.target_min      := case new.level when 'minimal' then 10 when 'light' then 15 when 'steady' then 20 when 'serious' then 30 else 0 end;
    new.target_weekdays := '{}';
  end if;
  return new;
end;
$$;

create trigger level_targets before insert or update on public.practices
  for each row execute function public.practice_level_targets();
