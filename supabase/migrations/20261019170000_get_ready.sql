-- Get ready.
--
-- A short checklist (desk, water, food, air) offered before the day's first
-- session, and always skippable. Two parts, both owned by one user:
--
--   * the steps themselves are one jsonb list on `user_settings`, `[{id, text}]`.
--     Edits are rare and the list is short, so it is replaced whole and follows
--     the other settings' last-writer-wins;
--   * what happened each day is a row here, keyed by the day key (`2026-10-12`).
--     `done` holds the ids of the steps ticked, `skipped` says the checklist was
--     skipped. A row also means "already offered that day".
--
-- Synced by last-writer-wins on the client's `updated_at`, like the other tables.
-- A row is never deleted, so `deleted_at` is never written. It is here only so
-- every synced table has the same shape. There is no `created_at`.

create table public.get_ready_days (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null,                  -- the day key
  done              text[] not null default '{}',   -- ids of the steps ticked
  skipped           boolean not null default false,
  updated_at        bigint not null,
  deleted_at        bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index get_ready_days_cursor on public.get_ready_days (user_id, server_updated_at);

-- `keep_newest` comes from the sync schema migration.
create trigger keep_newest before insert or update on public.get_ready_days
  for each row execute function public.keep_newest();

alter table public.get_ready_days enable row level security;

create policy "own rows" on public.get_ready_days
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.get_ready_days from anon;

alter publication supabase_realtime add table public.get_ready_days;

-- The steps: a jsonb list of {id, text}, in order.
alter table public.user_settings
  add column get_ready_steps jsonb not null default '[]';
