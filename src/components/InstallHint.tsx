import { useState } from 'react';

const KEY = 'tt2-install-hint-dismissed';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** True in Safari on an iPhone or iPad, outside the installed app. */
function shouldShow(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone && !read();
}

/** Nudges iOS users to install, since the badge and full-screen need the Home Screen app. */
export function InstallHint() {
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-accent-edge bg-accent-dim px-3 py-2 text-sm"
    >
      <p className="flex-1">
        For full screen and the icon badge, tap Share, then <strong>Add to Home Screen</strong>, and open it from there.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            // Private mode: it will show again next visit.
          }
          setVisible(false);
        }}
        className="min-h-9 min-w-9 rounded-lg text-text-muted hover:text-text cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
}
