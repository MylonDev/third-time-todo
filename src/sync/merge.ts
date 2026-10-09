import type { TimeEntry } from '../types';

interface Versioned {
  id: string;
  updatedAt: number;
}

/**
 * Pick between two versions of one row: the newer wins. On a tie the choice is
 * made from the content, so two devices comparing the same pair agree.
 */
function pick<T extends Versioned>(local: T, remote: T): T {
  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? remote : local;
  return JSON.stringify(remote) > JSON.stringify(local) ? remote : local;
}

/**
 * Last-writer-wins merge by id. Returns `local` itself when nothing changed, so
 * a store can skip the write and nothing downstream wakes for a no-op sync.
 */
export function mergeById<T extends Versioned>(local: T[], remote: T[]): T[] {
  if (remote.length === 0) return local;
  const byId = new Map(local.map((row) => [row.id, row]));
  let changed = false;
  for (const row of remote) {
    const mine = byId.get(row.id);
    if (!mine) {
      byId.set(row.id, row);
      changed = true;
    } else {
      const chosen = pick(mine, row);
      if (chosen !== mine) {
        byId.set(row.id, chosen);
        changed = true;
      }
    }
  }
  return changed ? [...byId.values()] : local;
}

/**
 * After a local edit, make sure every changed row is stamped newer than the
 * version it replaced. Without this, a device whose clock runs behind would
 * make an edit that loses to the very row it was editing.
 */
export function stampChanged<T extends Versioned>(prev: T[], next: T[]): T[] {
  const before = new Map(prev.map((row) => [row.id, row]));
  return next.map((row) => {
    const old = before.get(row.id);
    if (!old || old === row || row.updatedAt > old.updatedAt) return row;
    return { ...row, updatedAt: old.updatedAt + 1 };
  });
}

/**
 * Make the ledger a single timeline again after merging two devices' views.
 *
 * Two devices can disagree: one left Should running while the other, offline,
 * started Want. Each of those is valid alone; together they overlap. The rule
 * is that a later start ends whatever was running before it. It depends only on
 * the rows themselves, so every device that sees the same rows repairs them the
 * same way, and the repaired rows are bumped one tick so they beat the stale copies.
 */
export function repairEntries(entries: TimeEntry[]): TimeEntry[] {
  const live = entries
    .filter((e) => e.deletedAt === undefined)
    .sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1));
  const fixed = new Map<string, TimeEntry>();
  let prev: TimeEntry | undefined;

  for (const cur of live) {
    if (prev && (prev.endedAt ?? Infinity) > cur.startedAt) {
      const updatedAt = Math.max(prev.updatedAt, cur.updatedAt) + 1;
      fixed.set(
        prev.id,
        cur.startedAt <= prev.startedAt
          ? { ...prev, deletedAt: updatedAt, updatedAt }
          : { ...prev, endedAt: cur.startedAt, updatedAt }
      );
    }
    prev = cur;
  }
  if (fixed.size === 0) return entries;
  return entries.map((e) => fixed.get(e.id) ?? e);
}
