import { useEffect } from 'react';

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function badgeSupported(): boolean {
  return 'setAppBadge' in navigator;
}

/**
 * Show the whole minutes of Want available on the app icon. The badge can only
 * show a count, so debt and zero both clear it. It reflects the balance as of
 * the last time the app was open: a web app can't update it from the background.
 */
export function useBadge(enabled: boolean, minutes: number) {
  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    if (!enabled || !nav.setAppBadge) return;
    const apply = minutes > 0 ? nav.setAppBadge(minutes) : nav.clearAppBadge?.();
    apply?.catch(() => {});
  }, [enabled, minutes]);

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as BadgeNavigator;
    return () => {
      nav.clearAppBadge?.().catch(() => {});
    };
  }, [enabled]);
}
