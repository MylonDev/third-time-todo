import { useMemo } from 'react';
import { useNow } from '../hooks/useNow';
import { usePractices } from '../store/practices';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import { needsAttention } from '../utils/practices';

/** How many suggestions the card shows. */
const SHOWN = 3;

/**
 * The practices furthest behind their weekly target, as suggestions. Tapping
 * one only picks it for the next session; nothing starts or changes.
 */
export function NeedsAttention({ selectedId, onPick }: { selectedId: string | undefined; onPick: (id: string) => void }) {
  const practices = usePractices((s) => s.practices);
  const entries = useTimer((s) => s.entries);
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const now = useNow();
  const top = useMemo(
    () => needsAttention(practices, entries, now, dayEndHour).slice(0, SHOWN),
    [practices, entries, now, dayEndHour]
  );

  if (top.length === 0) return null;

  return (
    <section aria-label="Needs attention" className="flex flex-col gap-1 rounded-3xl border border-border px-4 py-3">
      <h2 className="section-label">Needs attention</h2>
      <ul>
        {top.map(({ practice, done, left, daysLeft }) => (
          <li key={practice.id}>
            <button
              type="button"
              aria-pressed={selectedId === practice.id}
              onClick={() => onPick(practice.id)}
              className={`press min-h-11 w-full cursor-pointer text-left text-[0.9375rem] ${
                selectedId === practice.id ? 'font-semibold text-accent' : 'text-text'
              }`}
            >
              {practice.name} · {done} of {done + left} this week · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
