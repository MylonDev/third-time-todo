import { useSession } from '../store/session';
import { useElapsed } from './useNow';
import type { FocusTarget } from '../types';

/**
 * Everything a focusable row needs: whether it holds the focus, whether it is
 * currently accruing time, and how much this segment has added so far.
 *
 * Tasks, routine steps and time goals are all focusable and all used to derive
 * this themselves from four props drilled down from `App`. They read the
 * session store directly now, the same way every other component does.
 */
export function useFocusable(target: FocusTarget, enabled = true) {
  const focusedItem = useSession((s) => s.focusedItem);
  const timerState = useSession((s) => s.timerState);
  const focusSegmentStart = useSession((s) => s.focusSegmentStart);
  const setFocus = useSession((s) => s.setFocus);

  const isFocused =
    focusedItem !== null && focusedItem.kind === target.kind && focusedItem.id === target.id;
  const tracking = isFocused && timerState === 'working' && focusSegmentStart !== null;

  // Time accrued since the focus segment began. The committed total lives in
  // the store; this is only the part not yet written back.
  const segmentMs = useElapsed(focusSegmentStart, tracking);

  /** Focusing the row that already holds focus clears it. */
  const toggleFocus = () => {
    if (!enabled) return;
    setFocus(isFocused ? null : target);
  };

  return { isFocused, tracking, segmentMs, toggleFocus, timerState };
}
