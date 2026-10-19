import { useState } from 'react';
import { usePractices } from '../store/practices';
import type { Need, Practice, PracticeLevel } from '../types';
import { LEVEL_ORDER, LEVELS, levelHint } from '../utils/practices';
import { Modal } from './Modal';
import { Segmented } from './Segmented';

const FIELD = 'min-h-12 rounded-2xl px-4 text-base bg-surface-2 border border-border text-text outline-none';

const NEEDS: { value: Need; label: string }[] = [
  { value: 'clarity', label: 'Clarity' },
  { value: 'energy', label: 'Energy' },
];

/** One step: what it is, and what it asks of you. No tag means little of either. */
function StepField({
  label,
  hint,
  text,
  needs,
  onText,
  onNeeds,
}: {
  label: string;
  hint: string;
  text: string;
  needs: Need[];
  onText: (t: string) => void;
  onNeeds: (n: Need[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="section-label">{label}</span>
        <input value={text} onChange={(e) => onText(e.target.value)} placeholder={hint} className={FIELD} />
      </label>
      <div role="group" aria-label={`${label} needs`} className="flex flex-wrap items-center gap-2">
        {NEEDS.map((n) => {
          const on = needs.includes(n.value);
          return (
            <button
              key={n.value}
              type="button"
              aria-pressed={on}
              onClick={() => onNeeds(on ? needs.filter((x) => x !== n.value) : [...needs, n.value])}
              className={`press min-h-10 cursor-pointer rounded-full border px-3.5 text-sm font-medium ${
                on ? 'bg-accent-dim border-accent-edge text-accent' : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {n.label}
            </button>
          );
        })}
        {needs.length === 0 && <span className="text-sm text-text-muted">Little of either</span>}
      </div>
    </div>
  );
}

/** Add a practice, or edit one. Leave `practice` out to add. */
export function PracticeEditor({ practice, onClose }: { practice?: Practice; onClose: () => void }) {
  const add = usePractices((s) => s.add);
  const edit = usePractices((s) => s.edit);
  const remove = usePractices((s) => s.remove);

  const [name, setName] = useState(practice?.name ?? '');
  const [level, setLevel] = useState<PracticeLevel>(practice?.level ?? 'steady');
  const [smallStep, setSmallStep] = useState(practice?.smallStep ?? '');
  const [smallNeeds, setSmallNeeds] = useState<Need[]>(practice?.smallNeeds ?? []);
  const [lowStep, setLowStep] = useState(practice?.lowStep ?? '');
  const [lowNeeds, setLowNeeds] = useState<Need[]>(practice?.lowNeeds ?? []);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const valid = name.trim() !== '';
  const title = practice ? 'Edit practice' : 'Add practice';

  const save = () => {
    if (!valid) return;
    const fields = {
      name: name.trim(),
      level,
      smallStep: smallStep.trim(),
      lowStep: lowStep.trim(),
      smallNeeds,
      lowNeeds,
    };
    if (practice) edit(practice.id, fields);
    else add(fields);
    onClose();
  };

  return (
    <Modal label={title} onClose={onClose} size="md" className="p-5 gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-5"
      >
        <h2 className="text-lg font-semibold">{title}</h2>

        <label className="flex flex-col gap-1.5">
          <span className="section-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Guitar, drawing, Spanish…"
            className={FIELD}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="section-label">Level</span>
          <Segmented<PracticeLevel>
            label="Level"
            value={level}
            options={LEVEL_ORDER.map((l) => ({ value: l, label: LEVELS[l].label, hint: levelHint(l) }))}
            onChange={setLevel}
          />
        </div>

        <StepField
          label="Small step"
          hint="The smallest session that still counts"
          text={smallStep}
          needs={smallNeeds}
          onText={setSmallStep}
          onNeeds={setSmallNeeds}
        />
        <StepField
          label="Low-day step"
          hint="An even smaller one, for low days"
          text={lowStep}
          needs={lowNeeds}
          onText={setLowStep}
          onNeeds={setLowNeeds}
        />

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="press min-h-12 rounded-full border border-border text-text-muted font-medium cursor-pointer hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="press min-h-12 rounded-full bg-accent text-on-accent font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>

        {practice && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {confirmingDelete ? (
              <>
                <p className="text-sm text-text-muted">
                  Delete {practice.name}? The time you logged for it stays in your history.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="press min-h-10 cursor-pointer rounded-lg border border-border px-3 text-sm text-text-muted hover:text-text"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove(practice.id);
                      onClose();
                    }}
                    className="press min-h-10 cursor-pointer rounded-lg border border-debt-edge bg-debt-dim px-3 text-sm font-semibold text-debt"
                  >
                    Delete {practice.name}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-10 self-start rounded-lg border border-debt-edge px-3 text-sm text-debt cursor-pointer hover:bg-debt-dim"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
