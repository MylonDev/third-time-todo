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
  /** Show Want available (in minutes) on the app icon. */
  badge: boolean;
  theme: Theme;
  setDayEndHour: (h: number) => void;
  setShouldTargetMin: (m: number | null) => void;
  setWakeLock: (on: boolean) => void;
  setBadge: (on: boolean) => void;
  setTheme: (t: Theme) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      dayEndHour: 0,
      shouldTargetMin: null,
      wakeLock: true,
      badge: false,
      theme: 'system',
      setDayEndHour: (dayEndHour) => set({ dayEndHour: Math.min(4, Math.max(0, Math.round(dayEndHour))) }),
      setShouldTargetMin: (shouldTargetMin) => set({ shouldTargetMin }),
      setWakeLock: (wakeLock) => set({ wakeLock }),
      setBadge: (badge) => set({ badge }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'tt2-settings', version: 1 }
  )
);
