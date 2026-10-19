import { useMemo, useState } from 'react';
import { usePractices } from '../store/practices';
import { describeLevel, listPractices } from '../utils/practices';
import { PracticeEditor } from './PracticeEditor';

/** Everything you keep coming back to, and how much you have committed to each. */
export function PracticesView() {
  const all = usePractices((s) => s.practices);
  const practices = useMemo(() => listPractices(all), [all]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // Look it up by id so the editor sees the saved version, and closes if it is gone.
  const editingPractice = editing ? practices.find((p) => p.id === editing) : undefined;

  return (
    <section aria-label="Practices" className="flex flex-col gap-3">
      <div className="flex items-center gap-3 pb-1.5">
        <h2 className="text-[1.375rem] font-bold tracking-tight">Practices</h2>
        <span aria-hidden="true" className="flex-1 border-t border-border" />
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="press min-h-11 cursor-pointer rounded-full border border-border-strong px-4 text-sm font-semibold hover:bg-accent-dim"
        >
          Add practice
        </button>
      </div>

      {practices.length === 0 ? (
        <div className="pop flex flex-col gap-1 rounded-3xl border border-dashed border-border-strong/50 p-4">
          <p className="text-[1.0625rem] font-semibold">No practices yet.</p>
          <p className="text-sm text-text-muted">
            A practice is something you keep coming back to, with no end point: an instrument, drawing, a language.
          </p>
        </div>
      ) : (
        <ul>
          {practices.map((p) => (
            <li key={p.id} className="border-t border-border first:border-t-0">
              <button
                type="button"
                onClick={() => setEditing(p.id)}
                aria-label={`Edit ${p.name}`}
                data-paused={p.level === 'paused'}
                className={`flex min-h-[54px] w-full cursor-pointer flex-col justify-center py-2 text-left ${
                  p.level === 'paused' ? 'opacity-50' : ''
                }`}
              >
                <span className="block break-words text-[1.0625rem] font-medium">{p.name}</span>
                <span className="font-timer text-[0.625rem] uppercase tracking-[0.08em] text-text-muted">
                  {describeLevel(p.level)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && <PracticeEditor onClose={() => setAdding(false)} />}
      {editingPractice && <PracticeEditor practice={editingPractice} onClose={() => setEditing(null)} />}
    </section>
  );
}
