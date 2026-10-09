import type { SupabaseClient } from '@supabase/supabase-js';
import type { Item, TimeEntry } from '../types';
import type { Pull, Remote } from './engine';
import {
  entryToRow,
  itemToRow,
  rowToEntry,
  rowToItem,
  rowToSettings,
  settingsToRow,
  type EntryRow,
  type ItemRow,
  type SettingsRow,
  type SyncedSettings,
} from './rows';

const PAGE = 1000;

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

/** The Supabase tables, behind the app's own types. */
export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  async function upsert(table: string, rows: object[], onConflict: string) {
    const { error } = await sb.from(table).upsert(rows, { onConflict });
    if (error) fail(error);
  }

  /** Everything the server has stamped at or after `since`, oldest first. */
  async function pull<R extends { server_updated_at: string }>(
    table: string,
    since: string | null,
    order: string[]
  ): Promise<{ rows: R[]; cursor: string | null }> {
    const rows: R[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select('*');
      // At or after, not after: rows stamped at the cursor are fetched again,
      // which a merge ignores, and none can slip through a tie.
      if (since) q = q.gte('server_updated_at', since);
      for (const col of order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) fail(error);
      rows.push(...(data as R[]));
      if (data.length < PAGE) break;
    }
    return { rows, cursor: rows.length ? rows[rows.length - 1].server_updated_at : since };
  }

  type Stamped<T> = T & { server_updated_at: string };

  return {
    pushEntries: (rows: TimeEntry[]) =>
      upsert('time_entries', rows.map((r) => ({ ...entryToRow(r), user_id: userId })), 'user_id,id'),
    pushItems: (rows: Item[]) =>
      upsert('items', rows.map((r) => ({ ...itemToRow(r), user_id: userId })), 'user_id,id'),
    pushSettings: (s: SyncedSettings) =>
      upsert('user_settings', [{ ...settingsToRow(s), user_id: userId }], 'user_id'),

    async pullEntries(since): Promise<Pull<TimeEntry>> {
      const r = await pull<Stamped<EntryRow>>('time_entries', since, ['server_updated_at', 'id']);
      return { rows: r.rows.map(rowToEntry), cursor: r.cursor };
    },
    async pullItems(since): Promise<Pull<Item>> {
      const r = await pull<Stamped<ItemRow>>('items', since, ['server_updated_at', 'id']);
      return { rows: r.rows.map(rowToItem), cursor: r.cursor };
    },
    async pullSettings(since): Promise<Pull<SyncedSettings>> {
      const r = await pull<Stamped<SettingsRow>>('user_settings', since, ['server_updated_at']);
      return { rows: r.rows.map(rowToSettings), cursor: r.cursor };
    },
  };
}
