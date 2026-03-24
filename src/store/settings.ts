import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode } from '../types';

interface SettingsState {
  mode: Mode;
  longWorkReminderMin: number;
  soundsEnabled: boolean;
  darkMode: boolean;
  setMode: (mode: Mode) => void;
  setLongWorkReminderMin: (min: number) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setDarkMode: (dark: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'third',
      longWorkReminderMin: 90,
      soundsEnabled: true,
      darkMode: false,
      setMode: (mode) => set({ mode }),
      setLongWorkReminderMin: (min) => set({ longWorkReminderMin: Math.max(15, min) }),
      setSoundsEnabled: (enabled) => set({ soundsEnabled: enabled }),
      setDarkMode: (dark) => set({ darkMode: dark }),
    }),
    { name: 'tt-settings' }
  )
);
