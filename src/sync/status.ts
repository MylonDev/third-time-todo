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
 * Older cursors lack the tables added since: practices in version 2, Get ready days
 * in version 3. Each starts from the beginning, as a fresh device would.
 */
export function migrateSyncMeta(state: unknown, version: number): SyncMeta {
  let meta = state as SyncMeta;
  if (version < 2) {
    meta = {
      ...meta,
      cursors: {
        pushed: { ...meta.cursors.pushed, practices: 0 },
        pulled: { ...meta.cursors.pulled, practices: null },
      },
    };
  }
  if (version < 3) {
    meta = {
      ...meta,
      cursors: {
        pushed: { ...meta.cursors.pushed, getReadyDays: 0 },
        pulled: { ...meta.cursors.pulled, getReadyDays: null },
      },
    };
  }
  return meta;
}

/** Where sync has got to. Kept, so a restart doesn't re-send or re-fetch everything. */
export const useSyncMeta = create<SyncMeta>()(
  persist(
    (set) => ({
      userId: null,
      cursors: FRESH_CURSORS,
      set: (userId, cursors) => set({ userId, cursors }),
    }),
    { name: 'tt2-sync', version: 3, migrate: migrateSyncMeta },
  ),
);
