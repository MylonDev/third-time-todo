import { useEffect, useRef, useState } from 'react';
import { useSession } from '../store/session';
import { useTasks } from '../store/tasks';
import { useElapsed } from './useNow';
import type { FocusTarget } from '../types';

/**
 * Everything a focusable row needs: whether it holds the focus, whether it is
 * currently accruing time, and how much this stint has added so far.
 *
 * Only tasks can be the active target now — `activeTaskId` is a plain field
 * on the session store, and the ledger records a task's time directly on the
 * `TimeEntry` it writes when the timer stops. Goals lost the affordance along
 * with the cross-store commit that used to fund `Goal.progress`; there is no
 * `activeGoalId` to hold one, so a goal target is never focused here.
 */
export function useFocusable(target: FocusTarget, enabled = true) {
  const activeTaskId = useSession((s) => s.activeTaskId);
  const timerState = useSession((s) => s.timerState);
  const setActive = useSession((s) => s.setActive);
  const adjustTrackedMs = useTasks((s) => s.adjustTrackedMs);

  const isFocused = target.kind === 'task' && activeTaskId === target.id;
  const tracking = isFocused && timerState === 'working';

  // `segmentStart` is this row's own state, so setting it mid-render (to open
  // a stint the instant `tracking` flips true) is the same safe trick
  // `BreakBank` uses for its break-mode reset. Committing the finished stint
  // into `trackedMs` is a *different* component's state (the tasks store),
  // and React will not tolerate that happening mid-render — it has to wait
  // for the effect below.
  const [segmentStart, setSegmentStart] = useState<number | null>(null);
  const prevTracking = useRef(tracking);
  if (prevTracking.current !== tracking) {
    prevTracking.current = tracking;
    if (tracking) setSegmentStart(Date.now());
  }

  useEffect(() => {
    if (tracking || segmentStart === null) return;
    const elapsed = Date.now() - segmentStart;
    if (target.kind === 'task' && elapsed > 0) adjustTrackedMs(target.id, elapsed);
    setSegmentStart(null);
    // Only the transition matters; re-running on every id/adjustTrackedMs
    // identity change would commit nothing new but is harmless — kept out of
    // the deps list because `target` is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking]);

  const segmentMs = useElapsed(segmentStart, tracking);

  // A row can unmount mid-stint — switching tabs away from Tasks, say — with
  // no transition through `tracking` to catch it. Commit whatever is pending
  // on the way out rather than lose it.
  const segmentStartRef = useRef(segmentStart);
  segmentStartRef.current = segmentStart;
  useEffect(
    () => () => {
      const start = segmentStartRef.current;
      if (start !== null && target.kind === 'task') {
        adjustTrackedMs(target.id, Date.now() - start);
      }
    },
    // Only the row's identity needs to be stable here — re-running this on
    // every render would commit the same open segment repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.kind, target.id]
  );

  /** Focusing the row that already holds focus clears it. */
  const toggleFocus = () => {
    if (!enabled || target.kind !== 'task') return;
    setActive(undefined, isFocused ? undefined : target.id);
  };

  return { isFocused, tracking, segmentMs, toggleFocus, timerState };
}
