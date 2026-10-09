import type { Item, TimeEntry } from '../types';
import { mergeById, repairEntries } from './merge';
import type { SyncedSettings } from './rows';

/** What the app holds that syncs. */
export interface Snapshot {
  entries: TimeEntry[];
  items: Item[];
  settings: SyncedSettings;
}

/** Where sync has got to, per table. Kept on the device between runs. */
export interface Cursors {
  /** The newest `updatedAt` this device has pushed. Anything above it is unsent. */
  pushed: { entries: number; items: number; settings: number };
  /** The server's own cursor for what this device has pulled. Opaque. */
  pulled: { entries: string | null; items: string | null; settings: string | null };
}

export const FRESH_CURSORS: Cursors = {
  pushed: { entries: 0, items: 0, settings: 0 },
  pulled: { entries: null, items: null, settings: null },
};

export interface Pull<T> {
  rows: T[];
  cursor: string | null;
}

/** The server, in the app's own types. Row mapping lives behind it. */
export interface Remote {
  pushEntries(rows: TimeEntry[]): Promise<void>;
  pushItems(rows: Item[]): Promise<void>;
  pushSettings(settings: SyncedSettings): Promise<void>;
  pullEntries(since: string | null): Promise<Pull<TimeEntry>>;
  pullItems(since: string | null): Promise<Pull<Item>>;
  pullSettings(since: string | null): Promise<Pull<SyncedSettings>>;
}

/** The app's side: read what's there, and fold in what came from the server. */
export interface Local {
  read(): Snapshot;
  apply(incoming: { entries: TimeEntry[]; items: Item[]; settings: SyncedSettings | null }): void;
}

const BATCH = 500;

async function inBatches<T>(rows: T[], send: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += BATCH) await send(rows.slice(i, i + BATCH));
}

async function pushDirty(local: Local, remote: Remote, cursors: Cursors): Promise<{ cursors: Cursors }> {
  const snap = local.read();
  const entries = snap.entries.filter((e) => e.updatedAt > cursors.pushed.entries);
  const items = snap.items.filter((i) => i.updatedAt > cursors.pushed.items);
  const settingsDirty = snap.settings.updatedAt > cursors.pushed.settings;
  const next: Cursors = { pushed: { ...cursors.pushed }, pulled: { ...cursors.pulled } };

  // The cursor moves only after the rows are accepted, so a failed push is
  // simply sent again next time.
  if (entries.length) {
    await inBatches(entries, (b) => remote.pushEntries(b));
    next.pushed.entries = Math.max(...entries.map((e) => e.updatedAt));
  }
  if (items.length) {
    await inBatches(items, (b) => remote.pushItems(b));
    next.pushed.items = Math.max(...items.map((i) => i.updatedAt));
  }
  if (settingsDirty) {
    await remote.pushSettings(snap.settings);
    next.pushed.settings = snap.settings.updatedAt;
  }
  return { cursors: next };
}

async function pullAll(local: Local, remote: Remote, cursors: Cursors): Promise<Cursors> {
  const [entries, items, settings] = await Promise.all([
    remote.pullEntries(cursors.pulled.entries),
    remote.pullItems(cursors.pulled.items),
    remote.pullSettings(cursors.pulled.settings),
  ]);
  local.apply({
    entries: entries.rows,
    items: items.rows,
    settings: settings.rows[0] ?? null,
  });
  return {
    pushed: { ...cursors.pushed },
    pulled: {
      entries: entries.cursor ?? cursors.pulled.entries,
      items: items.cursor ?? cursors.pulled.items,
      settings: settings.cursor ?? cursors.pulled.settings,
    },
  };
}

/**
 * One round of sync: send what's unsent, then (optionally) bring in what's new.
 * Merging can itself change rows (a repaired overlap), so it goes round again
 * until there is nothing left to send. Throws if the server can't be reached;
 * the cursors it returns up to that point are lost and everything is retried,
 * which is safe because pushes and merges are idempotent.
 */
export async function syncOnce(
  local: Local,
  remote: Remote,
  start: Cursors,
  opts: { pull: boolean } = { pull: true }
): Promise<Cursors> {
  let cursors = start;
  for (let round = 0; round < 4; round++) {
    cursors = (await pushDirty(local, remote, cursors)).cursors;
    if (!opts.pull) return cursors;
    cursors = await pullAll(local, remote, cursors);
    // Pulling can produce rows to send (a repaired overlap). If it didn't, done.
    const snap = local.read();
    const dirty =
      snap.entries.some((e) => e.updatedAt > cursors.pushed.entries) ||
      snap.items.some((i) => i.updatedAt > cursors.pushed.items) ||
      snap.settings.updatedAt > cursors.pushed.settings;
    if (!dirty) break;
  }
  return cursors;
}

/** The merge the app applies to its own state when rows arrive. Exported for the app and the tests. */
export function mergeIncoming(
  current: Snapshot,
  incoming: { entries: TimeEntry[]; items: Item[]; settings: SyncedSettings | null }
): Snapshot {
  const merged = mergeById(current.entries, incoming.entries);
  const entries = merged === current.entries ? current.entries : repairEntries(merged);
  const items = mergeById(current.items, incoming.items);
  const settings =
    incoming.settings && incoming.settings.updatedAt > current.settings.updatedAt
      ? incoming.settings
      : current.settings;
  if (entries === current.entries && items === current.items && settings === current.settings) return current;
  return { entries, items, settings };
}
