import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store/settings';
import type { GetReadyStep } from '../types';
import { makeStep, removeStep, renameStep } from '../utils/getReady';

/** Edit the list as it is now, not as it was when this component last rendered. */
function change(edit: (steps: GetReadyStep[]) => GetReadyStep[]) {
  const { getReadySteps, setGetReadySteps } = useSettings.getState();
  setGetReadySteps(edit(getReadySteps));
}

/**
 * A text box that commits on blur or Enter, and on unmount if it holds an
 * uncommitted edit: Escape or a click on the scrim closes the dialog without a
 * blur, and a button on iOS may not take focus.
 */
function StepField({
  value,
  label,
  placeholder,
  onCommit,
  clear,
}: {
  value: string;
  label: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  /** Empty the box after a commit, for the field that adds a step. */
  clear?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // The unmount cleanup is the one caller that outlives a render, so it reads these.
  const latest = useRef({ draft, dirty: false, onCommit });
  useEffect(() => {
    latest.current.onCommit = onCommit;
  });

  const commit = () => {
    const l = latest.current;
    if (!l.dirty) return;
    l.dirty = false;
    l.onCommit(l.draft);
    if (clear) {
      l.draft = '';
      setDraft('');
    }
  };

  useEffect(
    () => () => {
      const l = latest.current;
      if (l.dirty) l.onCommit(l.draft);
    },
    [],
  );

  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        latest.current.draft = e.target.value;
        latest.current.dirty = true;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
      }}
      className="min-h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text outline-none"
    />
  );
}

/** The Get ready steps: edited here, empty by default, offered before the day's first session. */
export function GetReadySettings() {
  const steps = useSettings((s) => s.getReadySteps);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="section-label">Get ready</span>
      <ul className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-center gap-2">
            <StepField value={step.text} label={`Get ready step ${i + 1}`} onCommit={(text) => change((all) => renameStep(all, step.id, text))} />
            <button
              type="button"
              aria-label={`Remove ${step.text}`}
              onClick={() => change((all) => removeStep(all, step.id))}
              className="press min-h-12 cursor-pointer rounded-full border border-border px-4 text-sm font-medium text-text-muted hover:text-text"
            >
              Remove
            </button>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <StepField
            value=""
            clear
            label="Add a get ready step"
            placeholder="Water, desk, air…"
            onCommit={(text) => text.trim() && change((all) => [...all, makeStep(text)])}
          />
        </li>
      </ul>
      <span className="text-xs text-text-muted">Offered before the day's first session. Always skippable.</span>
    </div>
  );
}
