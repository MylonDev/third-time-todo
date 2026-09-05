import { useCallback, useSyncExternalStore } from 'react';

/**
 * One 1-second ticker for the whole app.
 *
 * Every panel that shows a running figure used to own its own `setInterval`,
 * so each one advanced on the phase of whenever its component happened to
 * mount and the seconds rolled at visibly different moments across the page.
 * They now share this clock, so they roll together.
 *
 * The value is read through `useSyncExternalStore`, which keeps `Date.now()`
 * out of render — calling it during render is impure and makes the displayed
 * figure depend on when React happens to re-render rather than on the clock.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function subscribe(listener: Listener): () => void {
  // The shared `now` goes stale while nobody is watching, so refresh it as the
  // first listener arrives. Later listeners join the running phase instead,
  // which is the whole point of sharing one ticker.
  if (listeners.size === 0) {
    now = Date.now();
    intervalId = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

const noopSubscribe = () => () => {};
const getSnapshot = () => now;

/**
 * The shared clock, in ms. Pass `active: false` when the caller has nothing
 * running — it skips the subscription so an idle panel costs nothing.
 */
export function useNow(active = true): number {
  return useSyncExternalStore(
    useCallback((l: Listener) => (active ? subscribe(l) : noopSubscribe()), [active]),
    getSnapshot,
    getSnapshot
  );
}

/**
 * Milliseconds since `startedAt`, advancing once a second. Returns 0 when
 * there is nothing to count from, or when `active` is false.
 */
export function useElapsed(startedAt: number | null | undefined, active = true): number {
  const current = useNow(active && startedAt != null);
  if (!active || startedAt == null) return 0;
  return Math.max(0, current - startedAt);
}
