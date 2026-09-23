import type { TimeEntry } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The ledger as `tt-session` last wrote it, read straight from storage. For
 * migrations in the project and task stores only: they hydrate before the
 * session store does (it imports them), and they need to know which of their
 * stored time the ledger already accounts for.
 *
 * A session store still on v3 has no entries yet — its logs never named a
 * project or a task — so an empty ledger is the right answer there too, and
 * for anything missing or unreadable.
 */
export function readPersistedLedger(): TimeEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem('tt-session');
    if (!raw) return [];
    const state = JSON.parse(raw)?.state;
    const daily: TimeEntry[] = Array.isArray(state?.daily?.entries) ? state.daily.entries : [];
    const history: TimeEntry[] = Array.isArray(state?.history)
      ? state.history.flatMap((h: any) => (Array.isArray(h?.entries) ? h.entries : []))
      : [];
    return [...history, ...daily].filter(
      (e) => e && typeof e.startedAt === 'number' && typeof e.endedAt === 'number'
    );
  } catch {
    return [];
  }
}

/** taskId → projectId, as `tt-tasks` last wrote it. Same caveats as above. */
export function readPersistedTaskProjects(): Map<string, string | undefined> {
  try {
    const raw = globalThis.localStorage?.getItem('tt-tasks');
    const tasks: any[] = raw ? JSON.parse(raw)?.state?.tasks ?? [] : [];
    return new Map(tasks.map((t) => [t.id, t.projectId]));
  } catch {
    return new Map();
  }
}
