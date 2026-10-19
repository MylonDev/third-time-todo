-- Practices.
--
-- A practice is a hobby or skill with no end point, with a commitment level,
-- a small step and a note for the next session. Like the other tables it is
-- owned by one user and synced by last-writer-wins on the client's `updated_at`.
--
-- The time spent on a practice is not stored here: it is read from the ledger.
-- An entry names its practice in `practice_id`. That column has no foreign key
-- on purpose: entries and practices sync independently, so an entry can arrive
-- before its practice, and a deleted practice is only a tombstone whose time
-- stays in the ledger.

create table public.practices (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null,
  level             text not null check (level in ('paused', 'minimal', 'light', 'steady', 'serious')),
  small_step        text not null default '',
  low_step          text not null default '',
  small_needs       text[] not null default '{}',   -- 'clarity' and/or 'energy'; empty = little of either
  low_needs         text[] not null default '{}',
  next_step         text,
  sort_order        double precision not null default 0,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted_at        bigint,                         -- tombstone, so a delete syncs
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index practices_cursor on public.practices (user_id, server_updated_at);

-- `keep_newest` comes from the sync schema migration.
create trigger keep_newest before insert or update on public.practices
  for each row execute function public.keep_newest();

alter table public.practices enable row level security;

create policy "own rows" on public.practices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.practices from anon;

alter publication supabase_realtime add table public.practices;

-- What an entry was spent on.
alter table public.time_entries
  add column practice_id text;

-- A weekly cap on the practices' planned time, in minutes. Null means no cap.
alter table public.user_settings
  add column weekly_cap_min integer check (weekly_cap_min is null or weekly_cap_min > 0);
