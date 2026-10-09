import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../types';

interface SettingsState {
  /** The day ends at this local hour. 0 is midnight; up to 4 for late workers. */
  dayEndHour: number;
  /** Optional daily goal for Should time, in minutes. */
  shouldTargetMin: number | null;
  /** Keep the screen on while a timer runs. */
  wakeLock: boolean;
  theme: Theme;
  /**
   * When `dayEndHour` or `shouldTargetMin` last changed. These two follow you
   * between devices, so they carry a version; 0 means never changed, and a
   * default never overrides a real setting elsewhere.
   */
  updatedAt: number;
  setDayEndHour: (h: number) => void;
  setShouldTargetMin: (m: number | null) => void;
  setWakeLock: (on: boolean) => void;
  setTheme: (t: Theme) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      dayEndHour: 0,
      shouldTargetMin: null,
      wakeLock: true,
      theme: 'system',
      updatedAt: 0,
      setDayEndHour: (dayEndHour) =>
        set((s) => ({
          dayEndHour: Math.min(4, Math.max(0, Math.round(dayEndHour))),
          updatedAt: Math.max(Date.now(), s.updatedAt + 1),
        })),
      setShouldTargetMin: (shouldTargetMin) =>
        set((s) => ({ shouldTargetMin, updatedAt: Math.max(Date.now(), s.updatedAt + 1) })),
      setWakeLock: (wakeLock) => set({ wakeLock }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'tt2-settings',
      version: 2,
      migrate: (state) => ({ updatedAt: 0, ...(state as object) }) as SettingsState,
    }
  )
);
