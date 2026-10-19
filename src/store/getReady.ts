import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GetReadyDay } from '../types';
import { recordGetReady } from '../utils/getReady';
import { stampChanged } from '../sync/merge';

/** Every local change is stamped newer than the row it replaced, so it wins when synced. */
const commit = stampChanged<GetReadyDay>;

interface GetReadyStore {
  /** One row per day the checklist was offered and answered. */
  days: GetReadyDay[];
  /** Note that the checklist was done (the ticked step ids) or skipped on this day. */
  record: (today: string, done: string[], skipped: boolean) => void;
}

export const useGetReady = create<GetReadyStore>()(
  persist(
    (set, get) => ({
      days: [],
      record: (today, done, skipped) => {
        const { days } = get();
        set({ days: commit(days, recordGetReady(days, today, done, skipped, Date.now())) });
      },
    }),
    { name: 'tt2-getready', version: 1 },
  ),
);
