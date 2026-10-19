-- Practice targets.
--
-- A practice's commitment is now a target of its own: days a week, optionally
-- which weekdays, and minutes a day. The five levels are only presets in the
-- client and are no longer stored.
--
-- The old columns (`level`, `small_*`, `low_*`, `*_needs`) stay in place and
-- unused, so a build cached on a device from before this change keeps working.
-- New clients stop sending them.

alter table public.practices
  add column target_days     integer  not null default 0 check (target_days between 0 and 7),
  add column target_weekdays smallint[] not null default '{}'
    check (cardinality(target_weekdays) <= 7 and target_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),  -- 0 = Monday; empty = any day
  add column target_min      integer  not null default 0 check (target_min between 0 and 600);

-- Carry each practice's old level over as the target it stood for: the same
-- days, and the minutes a session had to reach to count. `updated_at` is left
-- alone, so this equals what the client derives from a locally stored level.
-- `keep_newest` accepts an equal `updated_at` and moves `server_updated_at`, so
-- every device pulls the new columns.
update public.practices set
  target_days = case level when 'minimal' then 1 when 'light' then 3 when 'steady' then 4 when 'serious' then 6 else 0 end,
  target_min  = case level when 'minimal' then 10 when 'light' then 15 when 'steady' then 20 when 'serious' then 30 else 0 end;

-- A row a new client creates sends no level. The column stays not null, with
-- its check, so an old client never reads a null: it shows the row as Paused.
alter table public.practices
  alter column level set default 'paused';
