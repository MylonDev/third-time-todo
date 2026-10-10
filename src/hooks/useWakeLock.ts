import { useEffect, useState } from 'react';

/**
 * Keep the screen on while `active`. Returns whether the lock is actually held,
 * so the UI can say so rather than promise it.
 *
 * The browser drops the lock whenever the page is hidden, so it is taken again
 * each time the page comes back. The release can land after the page is
 * visible again, so a release while visible asks again too, and so does the
 * next tap, for browsers that refused the request outside a user gesture.
 * A refusal (unsupported, low battery, a build that doesn't allow it in an
 * installed app) is not an error: the timer is timestamp-based and works with
 * the screen off, the lock only saves you unlocking the phone.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    let pending = false;

    const acquire = async () => {
      if (sentinel?.released) sentinel = null;
      if (cancelled || pending || sentinel || document.visibilityState !== 'visible') return;
      pending = true;
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
            void acquire();
          }
        });
      } catch {
        // Not granted. Carry on without it; the next tap or return asks again.
      } finally {
        pending = false;
      }
    };

    void acquire();
    const retry = () => void acquire();
    const RETRY_ON = ['visibilitychange', 'pageshow', 'focus', 'pointerdown'] as const;
    for (const type of RETRY_ON) window.addEventListener(type, retry, true);

    return () => {
      cancelled = true;
      for (const type of RETRY_ON) window.removeEventListener(type, retry, true);
      void sentinel?.release();
    };
  }, [active]);

  return active && held;
}
