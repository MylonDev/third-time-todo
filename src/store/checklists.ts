import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Checklist, ChecklistItem, GoalPeriod } from '../types';
import { tomorrowKey } from '../utils/thirdTime';
import { getPeriodKey } from '../utils/goalPeriod';

interface AddChecklistParams {
  title: string;
  period: GoalPeriod;
  periodDays?: number;
}

interface ChecklistsState {
  checklists: Checklist[];
  addChecklist: (params: AddChecklistParams) => void;
  updateChecklist: (id: string, patch: Partial<Omit<Checklist, 'id' | 'createdAt' | 'items'>>) => void;
  deleteChecklist: (id: string) => void;
  reorderChecklists: (activeId: string, overId: string) => void;
  addItem: (checklistId: string, title: string) => void;
  updateItem: (checklistId: string, itemId: string, patch: Partial<Omit<ChecklistItem, 'id'>>) => void;
  deleteItem: (checklistId: string, itemId: string) => void;
  reorderItems: (checklistId: string, activeId: string, overId: string) => void;
  toggleItem: (checklistId: string, itemId: string) => void;
  snoozeForToday: (id: string) => void;
  resetStaleChecklists: () => void;
}

export const useChecklists = create<ChecklistsState>()(
  persist(
    (set, get) => ({
      checklists: [],

      addChecklist: ({ title, period, periodDays }) => {
        const now = Date.now();
        const newChecklist: Checklist = {
          id: crypto.randomUUID(),
          title,
          period,
          periodDays,
          items: [],
          createdAt: now,
          order: get().checklists.length,
          lastResetKey: getPeriodKey(period, periodDays, now),
        };
        set((s) => ({ checklists: [...s.checklists, newChecklist] }));
      },

      updateChecklist: (id, patch) =>
        set((s) => ({
          checklists: s.checklists.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteChecklist: (id) =>
        set((s) => ({ checklists: s.checklists.filter((c) => c.id !== id) })),

      reorderChecklists: (activeId, overId) => {
        const { checklists } = get();
        const active = checklists.find((c) => c.id === activeId);
        const over = checklists.find((c) => c.id === overId);
        if (!active || !over) return;
        const activeOrder = active.order;
        const overOrder = over.order;
        set({
          checklists: checklists.map((c) => {
            if (c.id === activeId) return { ...c, order: overOrder };
            if (c.id === overId) return { ...c, order: activeOrder };
            return c;
          }),
        });
      },

      addItem: (checklistId, title) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === checklistId
              ? {
                  ...c,
                  items: [...c.items, { id: crypto.randomUUID(), title, done: false } as ChecklistItem],
                }
              : c
          ),
        })),

      updateItem: (checklistId, itemId, patch) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === checklistId
              ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
              : c
          ),
        })),

      deleteItem: (checklistId, itemId) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === checklistId
              ? { ...c, items: c.items.filter((it) => it.id !== itemId) }
              : c
          ),
        })),

      reorderItems: (checklistId, activeId, overId) => {
        const { checklists } = get();
        const checklist = checklists.find((c) => c.id === checklistId);
        if (!checklist) return;
        const activeIdx = checklist.items.findIndex((it) => it.id === activeId);
        const overIdx = checklist.items.findIndex((it) => it.id === overId);
        if (activeIdx === -1 || overIdx === -1) return;
        const newItems = [...checklist.items];
        const [moved] = newItems.splice(activeIdx, 1);
        newItems.splice(overIdx, 0, moved);
        set({
          checklists: checklists.map((c) =>
            c.id === checklistId ? { ...c, items: newItems } : c
          ),
        });
      },

      toggleItem: (checklistId, itemId) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === checklistId
              ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) }
              : c
          ),
        })),

      snoozeForToday: (id) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === id ? { ...c, snoozedUntil: tomorrowKey() } : c
          ),
        })),

      resetStaleChecklists: () => {
        const { checklists } = get();
        const updates = checklists.map((c) => {
          const currentKey = getPeriodKey(c.period, c.periodDays, c.createdAt);
          if (c.lastResetKey === currentKey) return c;
          return {
            ...c,
            items: c.items.map((it) => ({ ...it, done: false })),
            lastResetKey: currentKey,
          };
        });
        set({ checklists: updates });
      },
    }),
    {
      name: 'tt-checklists',
      version: 1,
    }
  )
);
