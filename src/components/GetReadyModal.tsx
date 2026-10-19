import { useState } from 'react';
import type { GetReadyStep } from '../types';
import { Modal } from './Modal';

/**
 * The checklist offered before the day's first session. Skip is never blocked,
 * and Start works with nothing ticked. Escape or the scrim backs out: nothing
 * starts and nothing is recorded, so it is offered again.
 */
export function GetReadyModal({
  steps,
  onStart,
  onSkip,
  onClose,
}: {
  steps: GetReadyStep[];
  /** The ids of the steps ticked. */
  onStart: (done: string[]) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [ticked, setTicked] = useState<string[]>([]);
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <Modal label="Get ready" onClose={onClose} size="sm" className="p-5 gap-5">
      <div>
        <h2 className="text-lg font-semibold">Get ready</h2>
        <p className="text-sm text-text-muted">Before the day's first session. Tick what you have done, or skip.</p>
      </div>
      <ul className="flex flex-col">
        {steps.map((step) => (
          <li key={step.id} className="border-t border-border first:border-t-0">
            <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1">
              <input type="checkbox" checked={ticked.includes(step.id)} onChange={() => toggle(step.id)} className="check press" />
              <span className="min-w-0 flex-1 break-words text-[1.0625rem] font-medium">{step.text}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="press min-h-12 cursor-pointer rounded-full border border-border font-medium text-text-muted hover:text-text"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => onStart(steps.filter((s) => ticked.includes(s.id)).map((s) => s.id))}
          className="press min-h-12 cursor-pointer rounded-full bg-accent font-semibold text-on-accent"
        >
          Start
        </button>
      </div>
    </Modal>
  );
}
