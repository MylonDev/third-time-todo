import { useState } from 'react';
import { usePractices } from '../store/practices';
import type { Practice } from '../types';
import { useSettings } from '../store/settings';
import {
  targetFits,
  targetHint,
  targetOf,
  targetOverBy,
  TEMPLATE_ORDER,
  TEMPLATES,
  templateOf,
  weekCost,
  type Target,
  type TemplateKey,
} from '../utils/practices';
import { formatDuration } from '../utils/time';
import { Modal } from './Modal';
import { Segmented } from './Segmented';

const FIELD = 'min-h-12 rounded-2xl px-4 text-base bg-surface-2 border border-border text-text outline-none';

/** The longest a day can ask for, the same limit as a Timed session. */
const MAX_MINUTES = 600;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_COUNTS = ['1', '2', '3', '4', '5', '6', '7'];

type Choice = TemplateKey | 'custom';

/** A pill that is on or off, as the Timed length chips are. */
function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`press min-h-10 cursor-pointer rounded-full border px-3.5 text-sm font-medium ${
        on ? 'bg-accent-dim border-accent-edge text-accent' : 'border-border text-text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

/** Add a practice, or edit one. Leave `practice` out to add. */
export function PracticeEditor({ practice, onClose }: { practice?: Practice; onClose: () => void }) {
  const add = usePractices((s) => s.add);
  const edit = usePractices((s) => s.edit);
  const remove = usePractices((s) => s.remove);

  const all = usePractices((s) => s.practices);
  const cap = useSettings((s) => s.weeklyCapMin);

  const [name, setName] = useState(practice?.name ?? '');
  // A new practice starts at Steady, or the most that still fits under the cap.
  const [choice, setChoice] = useState<Choice>(() => {
    if (practice) return templateOf(practice) ?? 'custom';
    return TEMPLATE_ORDER.findLast((t) => weekCost(targetOf(t)) <= weekCost(targetOf('steady')) && targetFits(all, undefined, targetOf(t), cap)) ?? 'paused';
  });
  // What Custom holds. A template's own values live in the table, not here.
  const [days, setDays] = useState(practice?.targetDays || 3);
  const [specific, setSpecific] = useState((practice?.targetWeekdays.length ?? 0) > 0);
  const [weekdays, setWeekdays] = useState<number[]>(practice?.targetWeekdays ?? []);
  const [minutes, setMinutes] = useState(practice?.targetMin || 20);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const custom = choice === 'custom';
  // Chosen weekdays set the days, so the count follows the chips.
  const target: Target = custom
    ? { targetDays: specific ? weekdays.length : days, targetWeekdays: specific ? weekdays : [], targetMin: minutes }
    : targetOf(choice);
  const customValid = Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES && target.targetDays >= 1;
  // A half-typed minutes box costs nothing yet, rather than NaN.
  const cost: Target = custom && !Number.isFinite(minutes) ? { ...target, targetMin: 0 } : target;
  const customOver = custom ? targetOverBy(all, practice?.id, cost, cap) : 0;

  const valid = name.trim() !== '' && (!custom || (customValid && customOver === 0));
  // The nearest template above the ones that fit says how far over the cap the next step up would go.
  const blocked = TEMPLATE_ORDER.find((t) => !targetFits(all, practice?.id, targetOf(t), cap));
  const overBy = customOver > 0 ? customOver : blocked ? targetOverBy(all, practice?.id, targetOf(blocked), cap) : 0;
  const title = practice ? 'Edit practice' : 'Add practice';

  // Picking Custom starts from what is picked now, so nothing jumps. A Paused one has nothing to start from.
  const pickCustom = () => {
    if (custom) return;
    const now = targetOf(choice);
    setDays(now.targetDays || 3);
    setSpecific(false);
    setWeekdays([]);
    setMinutes(now.targetMin || 20);
    setChoice('custom');
  };

  const toggleSpecific = () => {
    if (specific) setDays(weekdays.length || days);
    setWeekdays([]);
    setSpecific(!specific);
  };

  const toggleWeekday = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort((a, b) => a - b)));

  const save = () => {
    if (!valid) return;
    const fields = { name: name.trim(), ...target };
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guitar, drawing, Spanish…" className={FIELD} />
        </label>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="section-label">Template</span>
            <Segmented<Choice>
              label="Template"
              // Six buttons with a hint each do not fit in one row at phone width.
              grid
              value={choice}
              options={[
                ...TEMPLATE_ORDER.map((t) => ({
                  value: t,
                  label: TEMPLATES[t].label,
                  hint: targetHint(t),
                  disabled: !targetFits(all, practice?.id, targetOf(t), cap),
                })),
                { value: 'custom' as const, label: 'Custom', hint: 'Your own' },
              ]}
              onChange={(c) => (c === 'custom' ? pickCustom() : setChoice(c))}
            />
          </div>

          {custom && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="section-label">Days a week</span>
                {specific ? (
                  <p data-testid="chosen-days" className="min-h-11 content-center text-base">
                    {weekdays.length === 0 ? 'Pick the days below' : `${weekdays.length} ${weekdays.length === 1 ? 'day' : 'days'}`}
                  </p>
                ) : (
                  <Segmented<string>
                    label="Days a week"
                    value={String(days)}
                    options={DAY_COUNTS.map((d) => ({ value: d, label: d }))}
                    onChange={(d) => setDays(Number(d))}
                  />
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex">
                  <Chip label="Specific days" on={specific} onClick={toggleSpecific} />
                </div>
                {specific && (
                  <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((w, d) => (
                      <Chip key={w} label={w} on={weekdays.includes(d)} onClick={() => toggleWeekday(d)} />
                    ))}
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="section-label">Minutes a day</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_MINUTES}
                  value={Number.isFinite(minutes) ? minutes : ''}
                  onChange={(e) => setMinutes(e.target.value === '' ? Number.NaN : Number(e.target.value))}
                  className={FIELD}
                />
              </label>
            </>
          )}

          {cap !== null && (blocked || customOver > 0) && (
            <p data-testid="cap-warning" className="text-sm text-debt">
              Over your {formatDuration(cap * 60_000)} cap by {formatDuration(overBy * 60_000)}. Lower another practice or raise the cap.
            </p>
          )}
        </div>

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
                <p className="text-sm text-text-muted">Delete {practice.name}? The time you logged for it stays in your history.</p>
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
