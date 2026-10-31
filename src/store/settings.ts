import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../types';

interface SettingsState {
  /** The day ends at this local hour. 0 is midnight; up to 4 for late workers. */
  dayEndHour: number;
  /** Optional daily goal for Focus time, in minutes. */
  shouldTargetMin: number | null;
  /** Keep the screen on while a timer runs. */
  wakeLock: boolean;
  theme: Theme;
  /** Chime and notify when a Timed session ends or Rest runs into debt. Per device, never synced. */
  sounds: boolean;
  /**
   * When `dayEndHour` or `shouldTargetMin` last changed. These follow you
   * between devices, so they carry a version; 0 means never changed, and a
   * default never overrides a real setting elsewhere.
   */
  updatedAt: number;
  setDayEndHour: (h: number) => void;
  setShouldTargetMin: (m: number | null) => void;
  setWakeLock: (on: boolean) => void;
  setTheme: (t: Theme) => void;
  setSounds: (on: boolean) => void;
}

/** A version newer than the current one, even if the clock ran behind it. */
const nextVersion = (s: { updatedAt: number }) => Math.max(Date.now(), s.updatedAt + 1);

/**
 * Older blobs get the defaults of what was added since. Version 7 drops the
 * practice cap and the Get ready steps. The push cursor used to cover the steps
 * version too, so `updatedAt` is lifted to it: otherwise a new edit could be
 * stamped below the cursor and never be sent. Safe to run twice.
 */
export function migrateSettings(state: unknown): SettingsState {
  const { weeklyCapMin: _cap, getReadySteps: _steps, getReadyStepsUpdatedAt, ...rest } = {
    updatedAt: 0,
    sounds: true,
    ...(state as object),
  } as SettingsState & { weeklyCapMin?: unknown; getReadySteps?: unknown; getReadyStepsUpdatedAt?: number };
  return { ...rest, updatedAt: Math.max(rest.updatedAt, getReadyStepsUpdatedAt ?? 0) };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      dayEndHour: 0,
      shouldTargetMin: null,
      wakeLock: true,
      theme: 'system',
      sounds: true,
      updatedAt: 0,
      setDayEndHour: (dayEndHour) =>
        set((s) => ({
          dayEndHour: Math.min(4, Math.max(0, Math.round(dayEndHour))),
          updatedAt: nextVersion(s),
        })),
      setShouldTargetMin: (shouldTargetMin) => set((s) => ({ shouldTargetMin, updatedAt: nextVersion(s) })),
      setWakeLock: (wakeLock) => set({ wakeLock }),
      setTheme: (theme) => set({ theme }),
      setSounds: (sounds) => set({ sounds }),
    }),
    {
      name: 'tt2-settings',
      version: 7,
      migrate: migrateSettings,
    },
  ),
);
