import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, TabId } from '../types';

export type Theme = 'dark' | 'light' | 'system';

interface SettingsState {
  mode: Mode;
  longWorkReminderMin: number;
  soundsEnabled: boolean;
  theme: Theme;
  breakIncrements: number[]; // in minutes
  /** Legacy — the accordion sections are gone. Left here so the key survives. */
  collapsedSections: Record<string, boolean>;
  lastBreakMs: number | null; // in ms
  activeTab: TabId;
  quotes: string[]; // user-entered, shown once on the first session of the day
  showQuote: boolean;
  setMode: (mode: Mode) => void;
  setLongWorkReminderMin: (min: number) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setTheme: (theme: Theme) => void;
  setBreakIncrements: (increments: number[]) => void;
  toggleSection: (key: string) => void;
  setLastBreakMs: (ms: number | null) => void;
  setActiveTab: (tab: TabId) => void;
  setQuotes: (quotes: string[]) => void;
  setShowQuote: (show: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'third',
      longWorkReminderMin: 90,
      soundsEnabled: true,
      theme: 'system',
      breakIncrements: [5, 10],
      collapsedSections: {},
      lastBreakMs: null,
      activeTab: 'tasks',
      quotes: [],
      showQuote: true,
      setMode: (mode) => set({ mode }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setQuotes: (quotes) => set({ quotes }),
      setShowQuote: (showQuote) => set({ showQuote }),
      setLongWorkReminderMin: (min) => set({ longWorkReminderMin: Math.max(15, min) }),
      setSoundsEnabled: (enabled) => set({ soundsEnabled: enabled }),
      setTheme: (theme) => set({ theme }),
      setBreakIncrements: (increments) => set({ breakIncrements: increments }),
      toggleSection: (key) =>
        set((s) => ({
          collapsedSections: { ...s.collapsedSections, [key]: !s.collapsedSections[key] },
        })),
      setLastBreakMs: (ms) => set({ lastBreakMs: ms }),
    }),
    {
      name: 'tt-settings',
      version: 8,
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persisted as any;
        if (version < 2) {
          return {
            ...state,
            theme: state.darkMode ? 'dark' : 'light',
            breakIncrements: state.breakIncrements ?? [5, 10],
            lastBreakMs: state.lastBreakMs ?? null,
                };
        }
        if (version < 5) {
          // Checklists became routines; the collapse flag has no section to hide.
          delete state.checklistsCollapsed;
        }
        if (version < 6) {
          // The stale-task banner was removed; the row badge says the same thing.
          delete state.staleAlertDismissedOn;
        }
        if (version < 7) {
          state.collapsedSections = {};
        }
        if (version < 8) {
          return {
            ...state,
            activeTab: 'tasks',
            quotes: state.quotes ?? [],
            showQuote: state.showQuote ?? true,
          };
        }
        return state;
      },
    }
  )
);
