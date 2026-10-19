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

/** Version 1 cursors had no practices table. Start it from the beginning, as a fresh device would. */
export function migrateSyncMeta(state: unknown, version: number): SyncMeta {
  const meta = state as SyncMeta;
  if (version >= 2) return meta;
  return {
    ...meta,
    cursors: {
      pushed: { ...meta.cursors.pushed, practices: 0 },
      pulled: { ...meta.cursors.pulled, practices: null },
    },
  };
}

/** Where sync has got to. Kept, so a restart doesn't re-send or re-fetch everything. */
export const useSyncMeta = create<SyncMeta>()(
  persist(
    (set) => ({
      userId: null,
      cursors: FRESH_CURSORS,
      set: (userId, cursors) => set({ userId, cursors }),
    }),
    { name: 'tt2-sync', version: 2, migrate: migrateSyncMeta },
  ),
);
