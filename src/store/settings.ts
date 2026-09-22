import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DifficultyPolicy, Mode, TabId } from '../types';

export type Theme = 'dark' | 'light' | 'system';

interface SettingsState {
  /** The difficulty a new day starts at. Each day then keeps its own (session store). */
  mode: Mode;
  difficultyPolicy: DifficultyPolicy;
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
  /** Local hour (0–4) after midnight at which "today" turns into "tomorrow". */
  dayEndHour: number;
  setMode: (mode: Mode) => void;
  setDifficultyPolicy: (policy: DifficultyPolicy) => void;
  setLongWorkReminderMin: (min: number) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setTheme: (theme: Theme) => void;
  setBreakIncrements: (increments: number[]) => void;
  toggleSection: (key: string) => void;
  setLastBreakMs: (ms: number | null) => void;
  setActiveTab: (tab: TabId) => void;
  setQuotes: (quotes: string[]) => void;
  setShowQuote: (show: boolean) => void;
  setDayEndHour: (h: number) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'third',
      difficultyPolicy: { kind: 'quota', perDay: 1 },
      longWorkReminderMin: 90,
      soundsEnabled: true,
      theme: 'system',
      breakIncrements: [5, 10],
      collapsedSections: {},
      lastBreakMs: null,
      activeTab: 'tasks',
      quotes: [],
      showQuote: true,
      dayEndHour: 0,
      setMode: (mode) => set({ mode }),
      setDifficultyPolicy: (difficultyPolicy) => set({ difficultyPolicy }),
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
      setDayEndHour: (h) => set({ dayEndHour: Math.max(0, Math.min(4, h)) }),
    }),
    {
      name: 'tt-settings',
      version: 12,
      migrate: migrateTtSettings,
    }
  )
);

/**
 * The store's actual `migrate`, pulled out so the version chain itself is
 * what tests exercise — not just the final leg in isolation. (Same reason
 * `migrateTtGoals` in `src/store/projects.ts` is exported.)
 *
 * Every leg below used to `return` the instant it matched, which skipped
 * every leg after it — fine while each leg was written the version right
 * after the last, fatal once two legs needed to fire for the same stored
 * version (v10's habits cleanup and v11's goals rename both apply to someone
 * stuck on v9, and v8's "give activeTab a default" and v11's goals rename
 * both apply to someone stuck on v7). Falling through and returning once at
 * the end is what the sibling `tt-goals` chain had to be restored to as
 * well, for the identical reason.
 */
export function migrateTtSettings(persisted: unknown, version: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state = persisted as any;
  if (version < 2) {
    state = {
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
    // This is where `activeTab` was introduced — supply 'tasks' only as a
    // default for a store that has none yet. Overwriting it unconditionally
    // clobbered a real stored value (e.g. 'goals') before the later legs
    // ever got to translate it.
    state = {
      ...state,
      activeTab: state.activeTab ?? 'tasks',
      quotes: state.quotes ?? [],
      showQuote: state.showQuote ?? true,
    };
  }
  if (version < 9) {
    state = { ...state, dayEndHour: 0 };
  }
  if (version < 10) {
    // Habits are gone; a saved 'habits' tab has nowhere to land.
    // 'goals' is handled on its own below, since it has a real landing
    // spot now and must not get swept up in this one.
    state = {
      ...state,
      activeTab: state.activeTab === 'habits' ? 'tasks' : state.activeTab,
    };
  }
  if (version < 11) {
    // Goals were renamed to Projects; a stored 'goals' tab must land on
    // the renamed id, not fall through to Tasks.
    state = {
      ...state,
      activeTab: state.activeTab === 'goals' ? 'projects' : state.activeTab,
    };
  }
  if (version < 12) {
    // Difficulty became per-day; `mode` stays as the default for a new day.
    state = { ...state, difficultyPolicy: state.difficultyPolicy ?? { kind: 'quota', perDay: 1 } };
  }
  return state;
}
