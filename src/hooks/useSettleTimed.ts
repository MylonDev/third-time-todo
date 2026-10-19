import { useEffect } from 'react';
import { useTimer } from '../store/timer';
import { runningEntry } from '../utils/ledger';
import { useNow } from './useNow';

/**
 * Close a Timed session when its time is up. The entry is closed at exactly its
 * planned end, so an app reopened long afterwards still records the moment it
 * really ended. Idle unless a Timed session is running.
 */
export function useSettleTimed() {
  const waiting = useTimer((s) => runningEntry(s.entries)?.state === 'timed');
  const settle = useTimer((s) => s.settle);
  const now = useNow(waiting);
  useEffect(() => {
    if (waiting) settle();
  }, [waiting, now, settle]);
}
