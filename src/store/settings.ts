import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GetReadyStep, Theme } from '../types';
import { sameSteps } from '../utils/getReady';

interface SettingsState {
  /** The day ends at this local hour. 0 is midnight; up to 4 for late workers. */
  dayEndHour: number;
  /** Optional daily goal for Focus time, in minutes. */
  shouldTargetMin: number | null;
  /** Optional cap on the practices' planned time, in minutes a week. */
  weeklyCapMin: number | null;
  /** Keep the screen on while a timer runs. */
  wakeLock: boolean;
  theme: Theme;
  /** Chime and notify when a Timed session ends or Rest runs into debt. Per device, never synced. */
  sounds: boolean;
  /** The Get ready checklist, in order. Empty means it is never offered. */
  getReadySteps: GetReadyStep[];
  /**
   * When `dayEndHour`, `shouldTargetMin`, `weeklyCapMin` or `getReadySteps` last changed. These follow you
   * between devices, so they carry a version; 0 means never changed, and a
   * default never overrides a real setting elsewhere.
   */
  updatedAt: number;
  setDayEndHour: (h: number) => void;
  setShouldTargetMin: (m: number | null) => void;
  setWeeklyCapMin: (m: number | null) => void;
  /** A no-op when the list is unchanged, so a stale device cannot bump `updatedAt` and wipe another device's list. */
  setGetReadySteps: (steps: GetReadyStep[]) => void;
  setWakeLock: (on: boolean) => void;
  setTheme: (t: Theme) => void;
  setSounds: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      dayEndHour: 0,
      shouldTargetMin: null,
      weeklyCapMin: null,
      getReadySteps: [],
      wakeLock: true,
      theme: 'system',
      sounds: true,
      updatedAt: 0,
      setDayEndHour: (dayEndHour) =>
        set((s) => ({
          dayEndHour: Math.min(4, Math.max(0, Math.round(dayEndHour))),
          updatedAt: Math.max(Date.now(), s.updatedAt + 1),
        })),
      setShouldTargetMin: (shouldTargetMin) => set((s) => ({ shouldTargetMin, updatedAt: Math.max(Date.now(), s.updatedAt + 1) })),
      setWeeklyCapMin: (weeklyCapMin) => set((s) => ({ weeklyCapMin, updatedAt: Math.max(Date.now(), s.updatedAt + 1) })),
      setGetReadySteps: (getReadySteps) =>
        set((s) => (sameSteps(s.getReadySteps, getReadySteps) ? s : { getReadySteps, updatedAt: Math.max(Date.now(), s.updatedAt + 1) })),
      setWakeLock: (wakeLock) => set({ wakeLock }),
      setTheme: (theme) => set({ theme }),
      setSounds: (sounds) => set({ sounds }),
    }),
    {
      name: 'tt2-settings',
      version: 5,
      migrate: (state) => ({ updatedAt: 0, sounds: true, weeklyCapMin: null, getReadySteps: [] as GetReadyStep[], ...(state as object) }) as SettingsState,
    },
  ),
);
