import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import type { Mode } from '../types';

/** Today's difficulty: the day's own choice, else the default a new day starts at. */
export function useDayMode(): Mode {
  const chosen = useSession((s) => s.daily.mode);
  const fallback = useSettings((s) => s.mode);
  return chosen ?? fallback;
}
