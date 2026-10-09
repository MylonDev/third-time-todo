import { useEffect, useState } from 'react';

/**
 * Keep the screen on while `active`. Returns whether the lock is actually held,
 * so the UI can say so rather than promise it.
 *
 * The browser drops the lock whenever the page is hidden, so it is taken again
 * each time the page comes back. A refusal (unsupported, low battery, a build
 * that doesn't allow it in an installed app) is not an error: the timer is
 * timestamp-based and works with the screen off, the lock only saves you
 * unlocking the phone.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener('release', () => {
          if (sentinel === s) {
            sentinel = null;
            setHeld(false);
          }
        });
      } catch {
        // Not granted. Carry on without it.
      }
    };

    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active]);

  return active && held;
}
