import { useItems } from './items';
import { useSettings } from './settings';
import { useTimer } from './timer';

/**
 * Two windows on one device (a browser tab and the installed app, or two tabs)
 * each hold their own copy of the stores. When one writes, the browser tells the
 * others, and they reload from storage rather than overwriting it later.
 */
export function watchOtherWindows() {
  const stores: Record<string, { persist: { rehydrate: () => Promise<void> | void } }> = {
    'tt2-ledger': useTimer,
    'tt2-items': useItems,
    'tt2-settings': useSettings,
  };
  window.addEventListener('storage', (e) => {
    if (e.key && stores[e.key]) void stores[e.key].persist.rehydrate();
  });
}
