import type { GetReadyDay, Item, Practice, TimeEntry } from '../types';
import { mergeDays } from '../utils/getReady';
import { canonical, mergeById, repairEntries } from './merge';
import type { SyncedSettings } from './rows';

/** What the app holds that syncs. */
export interface Snapshot {
  entries: TimeEntry[];
  items: Item[];
  practices: Practice[];
  getReadyDays: GetReadyDay[];
  settings: SyncedSettings;
}

/** Where sync has got to, per table. Kept on the device between runs. */
export interface Cursors {
  /** The newest `updatedAt` this device has pushed. Anything above it is unsent. */
  pushed: { entries: number; items: number; practices: number; getReadyDays: number; settings: number };
  /** The server's own cursor for what this device has pulled. Opaque. */
  pulled: { entries: string | null; items: string | null; practices: string | null; getReadyDays: string | null; settings: string | null };
}

export const FRESH_CURSORS: Cursors = {
  pushed: { entries: 0, items: 0, practices: 0, getReadyDays: 0, settings: 0 },
  pulled: { entries: null, items: null, practices: null, getReadyDays: null, settings: null },
};

export interface Pull<T> {
  rows: T[];
  cursor: string | null;
}

/** The server, in the app's own types. Row mapping lives behind it. */
export interface Remote {
  pushEntries(rows: TimeEntry[]): Promise<void>;
  pushItems(rows: Item[]): Promise<void>;
  pushPractices(rows: Practice[]): Promise<void>;
  pushGetReadyDays(rows: GetReadyDay[]): Promise<void>;
  pushSettings(settings: SyncedSettings): Promise<void>;
  pullEntries(since: string | null): Promise<Pull<TimeEntry>>;
  pullItems(since: string | null): Promise<Pull<Item>>;
  pullPractices(since: string | null): Promise<Pull<Practice>>;
  pullGetReadyDays(since: string | null): Promise<Pull<GetReadyDay>>;
  pullSettings(since: string | null): Promise<Pull<SyncedSettings>>;
}

/** The app's side: read what's there, and fold in what came from the server. */
export interface Local {
  read(): Snapshot;
  apply(incoming: Incoming): void;
}

/** What a pull brings in. */
interface Incoming {
  entries: TimeEntry[];
  items: Item[];
  practices: Practice[];
  getReadyDays: GetReadyDay[];
  settings: SyncedSettings | null;
}

const BATCH = 500;

/** The settings row is dirty when either of its versions is above the pushed cursor. */
const settingsVersion = (s: SyncedSettings) => Math.max(s.updatedAt, s.getReadyStepsUpdatedAt);

async function inBatches<T>(rows: T[], send: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += BATCH) await send(rows.slice(i, i + BATCH));
}

async function pushDirty(local: Local, remote: Remote, cursors: Cursors): Promise<{ cursors: Cursors }> {
  const snap = local.read();
  const entries = snap.entries.filter((e) => e.updatedAt > cursors.pushed.entries);
  const items = snap.items.filter((i) => i.updatedAt > cursors.pushed.items);
  const practices = snap.practices.filter((p) => p.updatedAt > cursors.pushed.practices);
  const getReadyDays = snap.getReadyDays.filter((d) => d.updatedAt > cursors.pushed.getReadyDays);
  const settingsDirty = settingsVersion(snap.settings) > cursors.pushed.settings;
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
  if (practices.length) {
    await inBatches(practices, (b) => remote.pushPractices(b));
    next.pushed.practices = Math.max(...practices.map((p) => p.updatedAt));
  }
  if (getReadyDays.length) {
    await inBatches(getReadyDays, (b) => remote.pushGetReadyDays(b));
    next.pushed.getReadyDays = Math.max(...getReadyDays.map((d) => d.updatedAt));
  }
  if (settingsDirty) {
    await remote.pushSettings(snap.settings);
    next.pushed.settings = settingsVersion(snap.settings);
  }
  return { cursors: next };
}

async function pullAll(local: Local, remote: Remote, cursors: Cursors): Promise<Cursors> {
  const [entries, items, practices, getReadyDays, settings] = await Promise.all([
    remote.pullEntries(cursors.pulled.entries),
    remote.pullItems(cursors.pulled.items),
    remote.pullPractices(cursors.pulled.practices),
    remote.pullGetReadyDays(cursors.pulled.getReadyDays),
    remote.pullSettings(cursors.pulled.settings),
  ]);
  local.apply({
    entries: entries.rows,
    items: items.rows,
    practices: practices.rows,
    getReadyDays: getReadyDays.rows,
    settings: settings.rows[0] ?? null,
  });
  return {
    pushed: { ...cursors.pushed },
    pulled: {
      entries: entries.cursor ?? cursors.pulled.entries,
      items: items.cursor ?? cursors.pulled.items,
      practices: practices.cursor ?? cursors.pulled.practices,
      getReadyDays: getReadyDays.cursor ?? cursors.pulled.getReadyDays,
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
export async function syncOnce(local: Local, remote: Remote, start: Cursors, opts: { pull: boolean } = { pull: true }): Promise<Cursors> {
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
      snap.practices.some((p) => p.updatedAt > cursors.pushed.practices) ||
      snap.getReadyDays.some((d) => d.updatedAt > cursors.pushed.getReadyDays) ||
      settingsVersion(snap.settings) > cursors.pushed.settings;
    if (!dirty) break;
  }
  return cursors;
}

/**
 * Merge the settings row field by field: the settings from whichever side has
 * the larger `updatedAt` (a tie keeps `current`), the steps from whichever has
 * the larger steps version. On an equal steps version with different lists the
 * content decides, as in `pick`. Returns `current` itself when nothing changes.
 */
export function mergeSettings(current: SyncedSettings, incoming: SyncedSettings | null): SyncedSettings {
  if (!incoming) return current;
  const newerSettings = incoming.updatedAt > current.updatedAt;
  const newerSteps =
    incoming.getReadyStepsUpdatedAt !== current.getReadyStepsUpdatedAt
      ? incoming.getReadyStepsUpdatedAt > current.getReadyStepsUpdatedAt
      : canonical(incoming.getReadySteps) > canonical(current.getReadySteps);
  if (!newerSettings && !newerSteps) return current;
  const scalars = newerSettings ? incoming : current;
  const steps = newerSteps ? incoming : current;
  return {
    dayEndHour: scalars.dayEndHour,
    shouldTargetMin: scalars.shouldTargetMin,
    weeklyCapMin: scalars.weeklyCapMin,
    updatedAt: scalars.updatedAt,
    getReadySteps: steps.getReadySteps,
    getReadyStepsUpdatedAt: steps.getReadyStepsUpdatedAt,
  };
}

/**
 * The merge the app applies to its own state when rows arrive. Exported for the
 * app and the tests. `now` stamps a merged Get ready day above the push cursor.
 */
export function mergeIncoming(current: Snapshot, incoming: Incoming, now = Date.now()): Snapshot {
  const merged = mergeById(current.entries, incoming.entries);
  const entries = merged === current.entries ? current.entries : repairEntries(merged);
  const items = mergeById(current.items, incoming.items);
  const practices = mergeById(current.practices, incoming.practices);
  const getReadyDays = mergeById(current.getReadyDays, incoming.getReadyDays, (a, b) => mergeDays(a, b, now));
  const settings = mergeSettings(current.settings, incoming.settings);
  if (
    entries === current.entries &&
    items === current.items &&
    practices === current.practices &&
    getReadyDays === current.getReadyDays &&
    settings === current.settings
  ) {
    return current;
  }
  return { entries, items, practices, getReadyDays, settings };
}
