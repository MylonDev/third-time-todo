import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Item, Recurrence, TimerState } from '../types';
import {
  completeItem,
  makeItem,
  removeItem,
  skipItem,
  uncompleteItem,
  updateItem,
} from '../utils/items';
import { dayKeyOf } from '../utils/time';
import { useSettings } from './settings';

const today = () => dayKeyOf(Date.now(), useSettings.getState().dayEndHour);

interface ItemsStore {
  items: Item[];
  add: (fields: { text: string; kind: TimerState; dueOn: string | null; repeat?: Recurrence }) => void;
  toggle: (id: string) => void;
  edit: (id: string, patch: Partial<Pick<Item, 'text' | 'kind' | 'dueOn' | 'repeat'>>) => void;
  skip: (id: string) => void;
  remove: (id: string) => void;
}

export const useItems = create<ItemsStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (fields) => {
        const text = fields.text.trim();
        if (!text) return;
        const now = Date.now();
        set({ items: [...get().items, makeItem(get().items, { ...fields, text }, now)] });
      },
      toggle: (id) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;
        const now = Date.now();
        set({
          items: item.done
            ? uncompleteItem(get().items, id, now)
            : completeItem(get().items, id, today(), now),
        });
      },
      edit: (id, patch) => set({ items: updateItem(get().items, id, patch, Date.now()) }),
      skip: (id) => set({ items: skipItem(get().items, id, today(), Date.now()) }),
      remove: (id) => set({ items: removeItem(get().items, id, Date.now()) }),
    }),
    { name: 'tt2-items', version: 1 }
  )
);
