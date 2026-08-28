import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode } from '../types';

export type Theme = 'dark' | 'light' | 'system';

interface SettingsState {
  mode: Mode;
  longWorkReminderMin: number;
  soundsEnabled: boolean;
  theme: Theme;
  breakIncrements: number[]; // in minutes
  lastBreakMs: number | null; // in ms
  staleAlertDismissedOn: string | null; // YYYY-MM-DD
  setMode: (mode: Mode) => void;
  setLongWorkReminderMin: (min: number) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setTheme: (theme: Theme) => void;
  setBreakIncrements: (increments: number[]) => void;
  setLastBreakMs: (ms: number | null) => void;
  setStaleAlertDismissedOn: (day: string | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'third',
      longWorkReminderMin: 90,
      soundsEnabled: true,
      theme: 'system',
      breakIncrements: [5, 10],
      lastBreakMs: null,
      staleAlertDismissedOn: null,
      setMode: (mode) => set({ mode }),
      setLongWorkReminderMin: (min) => set({ longWorkReminderMin: Math.max(15, min) }),
      setSoundsEnabled: (enabled) => set({ soundsEnabled: enabled }),
      setTheme: (theme) => set({ theme }),
      setBreakIncrements: (increments) => set({ breakIncrements: increments }),
      setLastBreakMs: (ms) => set({ lastBreakMs: ms }),
      setStaleAlertDismissedOn: (day) => set({ staleAlertDismissedOn: day }),
    }),
    {
      name: 'tt-settings',
      version: 5,
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let state = persisted as any;
        if (version < 2) {
          return {
            ...state,
            theme: state.darkMode ? 'dark' : 'light',
            breakIncrements: state.breakIncrements ?? [5, 10],
            lastBreakMs: state.lastBreakMs ?? null,
                };
        }
        if (version < 4) {
          state = { ...state, staleAlertDismissedOn: null };
        }
        if (version < 5) {
          // Checklists became routines; the collapse flag has no section to hide.
          delete state.checklistsCollapsed;
          return state;
        }
        return state;
      },
    }
  )
);
