import { useEffect, useRef, useState } from 'react';
import { useTimer } from '../store/timer';
import { endedPractice, type RunningPractice } from '../utils/practices';
import { runningEntry } from '../utils/ledger';

/**
 * The practice whose session just ended, so the screen can ask for its next
 * step. It covers a Stop, a Timed session running out while the app is open,
 * and one settled on reopening (if it ended recently). The prompt lives only
 * here: reloading the page forgets it.
 */
export function useNextStepPrompt(): [practiceId: string | null, dismiss: () => void] {
  const entries = useTimer((s) => s.entries);
  const [pending, setPending] = useState<string | null>(null);
  const before = useRef<RunningPractice | null>(null);

  useEffect(() => {
    const ended = endedPractice(entries, before.current, Date.now());
    if (ended) setPending(ended);
    const running = runningEntry(entries);
    before.current = running?.practiceId ? { id: running.id, practiceId: running.practiceId } : null;
  }, [entries]);

  return [pending, () => setPending(null)];
}
