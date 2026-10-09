import { useMemo } from 'react';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import { balanceOf, runningEntry, totalsFor } from '../utils/ledger';
import { dayKeyOf, windowOf } from '../utils/time';
import { useNow } from './useNow';

/**
 * Everything the screen needs to know about today, derived from the ledger and
 * the clock. Nothing here is stored.
 */
export function useDay() {
  const now = useNow();
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const entries = useTimer((s) => s.entries);

  const today = dayKeyOf(now, dayEndHour);
  const win = useMemo(() => windowOf(today, dayEndHour), [today, dayEndHour]);
  const running = runningEntry(entries);
  const totals = totalsFor(entries, win, now);

  return { now, today, win, running, totals, balance: balanceOf(totals) };
}
