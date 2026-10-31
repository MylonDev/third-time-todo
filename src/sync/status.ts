import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FRESH_CURSORS, type Cursors } from './engine';

type Phase = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';

interface SyncStatus {
  phase: Phase;
  email: string | null;
  userId: string | null;
  lastSyncedAt: number | null;
  error: string | null;
}

/** What the screen shows about sync. Not saved: it is rebuilt each time the app opens. */
export const useSyncStatus = create<SyncStatus>()(() => ({
  phase: 'off',
  email: null,
  userId: null,
  lastSyncedAt: null,
  error: null,
}));

interface SyncMeta {
  /** Whose rows these cursors are for. A different account starts over. */
  userId: string | null;
  cursors: Cursors;
  set: (userId: string | null, cursors: Cursors) => void;
}

/**
 * Version 6 drops the cursors of the practices and Get ready days tables, which
 * are gone, and sends the settings again. The old settings cursor also covered
 * the steps version, so it can sit above a new edit's version and the edit would
 * never be sent. The extra push is harmless: the server drops a stale row and the
 * pull brings the newer one. This replaces the older steps, which only dealt with
 * those tables. Safe to run twice.
 */
export function migrateSyncMeta(state: unknown): SyncMeta {
  const meta = state as SyncMeta;
  const { practices: _pp, getReadyDays: _pg, ...pushed } = meta.cursors.pushed as Cursors['pushed'] & { practices?: number; getReadyDays?: number };
  const {
    practices: _lp,
    getReadyDays: _lg,
    ...pulled
  } = meta.cursors.pulled as Cursors['pulled'] & { practices?: string | null; getReadyDays?: string | null };
  return { ...meta, cursors: { pushed: { ...pushed, settings: 0 }, pulled } };
}

/** Where sync has got to. Kept, so a restart doesn't re-send or re-fetch everything. */
export const useSyncMeta = create<SyncMeta>()(
  persist(
    (set) => ({
      userId: null,
      cursors: FRESH_CURSORS,
      set: (userId, cursors) => set({ userId, cursors }),
    }),
    { name: 'tt2-sync', version: 6, migrate: migrateSyncMeta },
  ),
);
