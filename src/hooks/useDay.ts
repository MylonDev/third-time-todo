import { useMemo } from 'react';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import { activeEntry, balanceOf, balanceWindow, totalsFor } from '../utils/ledger';
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
  const running = activeEntry(entries, now);
  const totals = totalsFor(entries, win, now);
  // Totals and history stop at the day end; the balance of a running timer carries past it.
  const balanceWin = balanceWindow(entries, win, now);
  const carried = balanceWin !== win;
  const balance = balanceOf(carried ? totalsFor(entries, balanceWin, now) : totals);

  return { now, today, win, running, totals, balance, carried };
}
