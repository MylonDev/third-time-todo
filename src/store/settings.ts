import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../types';

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
  /**
   * When `dayEndHour`, `shouldTargetMin` or `weeklyCapMin` last changed. These follow you
   * between devices, so they carry a version; 0 means never changed, and a
   * default never overrides a real setting elsewhere.
   */
  updatedAt: number;
  setDayEndHour: (h: number) => void;
  setShouldTargetMin: (m: number | null) => void;
  setWeeklyCapMin: (m: number | null) => void;
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
      setWakeLock: (wakeLock) => set({ wakeLock }),
      setTheme: (theme) => set({ theme }),
      setSounds: (sounds) => set({ sounds }),
    }),
    {
      name: 'tt2-settings',
      version: 4,
      migrate: (state) => ({ updatedAt: 0, sounds: true, weeklyCapMin: null, ...(state as object) }) as SettingsState,
    },
  ),
);
