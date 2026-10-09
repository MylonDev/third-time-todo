-- Sync schema for Third Time.
--
-- Three tables, each owned by one user and visible to nobody else. The app
-- keeps the real state on the device and syncs rows here, so every row carries
-- the client's own `updated_at` (ms since the epoch) for last-writer-wins, and a
-- server-stamped `server_updated_at` that devices use as a pull cursor.
--
-- Row level security is ON for every table. The anon key ships inside the app,
-- so RLS is what keeps one person's rows from another's.

-- ── Time entries ─────────────────────────────────────────────────────────────
create table public.time_entries (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                uuid not null,
  state             text not null check (state in ('should', 'want')),
  started_at        bigint not null,
  ended_at          bigint,                       -- null = the running entry
  updated_at        bigint not null,
  deleted_at        bigint,                       -- tombstone, so a delete syncs
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- ── Items (checklist lines) ──────────────────────────────────────────────────
-- `id` is text: a repeating item's next occurrence has a derived id, "series:date".
create table public.items (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null,
  text              text not null,
  kind              text not null check (kind in ('should', 'want')),
  due_on            text,                         -- YYYY-MM-DD, null = Later
  done              boolean not null default false,
  done_at           bigint,
  repeat            jsonb,
  series_id         text,
  next_id           text,
  sort_order        double precision not null default 0,
  updated_at        bigint not null,
  deleted_at        bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- ── Settings shared across devices ───────────────────────────────────────────
-- Only what changes the numbers (day end, target). Theme and wake lock are
-- per-device and stay on the device.
create table public.user_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  day_end_hour      smallint not null default 0 check (day_end_hour between 0 and 4),
  should_target_min integer check (should_target_min is null or should_target_min > 0),
  updated_at        bigint not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index time_entries_cursor on public.time_entries (user_id, server_updated_at);
create index items_cursor        on public.items        (user_id, server_updated_at);

-- ── Last writer wins ─────────────────────────────────────────────────────────
-- A device that was offline may push an edit older than what the server holds.
-- Returning null from a BEFORE UPDATE trigger skips that update quietly. An
-- equal `updated_at` is accepted, so replaying the same push is harmless.
create function public.keep_newest() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger keep_newest before insert or update on public.time_entries
  for each row execute function public.keep_newest();
create trigger keep_newest before insert or update on public.items
  for each row execute function public.keep_newest();
create trigger keep_newest before insert or update on public.user_settings
  for each row execute function public.keep_newest();

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.time_entries enable row level security;
alter table public.items        enable row level security;
alter table public.user_settings enable row level security;

create policy "own rows" on public.time_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nothing here is for the anonymous role, whatever a policy says.
revoke all on public.time_entries, public.items, public.user_settings from anon;

-- ── Live updates between devices ─────────────────────────────────────────────
alter publication supabase_realtime add table public.time_entries, public.items, public.user_settings;
