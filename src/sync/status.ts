import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FRESH_CURSORS, type Cursors } from './engine';

export type Phase = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';

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

/** Where sync has got to. Kept, so a restart doesn't re-send or re-fetch everything. */
export const useSyncMeta = create<SyncMeta>()(
  persist(
    (set) => ({
      userId: null,
      cursors: FRESH_CURSORS,
      set: (userId, cursors) => set({ userId, cursors }),
    }),
    { name: 'tt2-sync', version: 1 }
  )
);
