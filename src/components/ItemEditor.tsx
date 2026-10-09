import { useState } from 'react';
import { useItems } from '../store/items';
import type { Item, Recurrence } from '../types';
import { WEEKDAY_SHORT } from '../utils/recurrence';
import { shiftDayKey } from '../utils/time';
import { Modal } from './Modal';
import { Segmented } from './Segmented';

type When = 'today' | 'tomorrow' | 'someday' | 'date';
type RepeatKind = 'none' | Recurrence['kind'];

function initialWhen(item: Item, today: string): When {
  if (item.dueOn === null) return 'someday';
  if (item.dueOn === today) return 'today';
  if (item.dueOn === shiftDayKey(today, 1)) return 'tomorrow';
  return 'date';
}

export function ItemEditor({
  item,
  today,
  onClose,
}: {
  item: Item;
  today: string;
  onClose: () => void;
}) {
  const edit = useItems((s) => s.edit);
  const remove = useItems((s) => s.remove);
  const skip = useItems((s) => s.skip);

  const [text, setText] = useState(item.text);
  const [kind, setKind] = useState(item.kind);
  const [when, setWhen] = useState<When>(initialWhen(item, today));
  const [date, setDate] = useState(item.dueOn ?? today);
  const [repeatKind, setRepeatKind] = useState<RepeatKind>(item.repeat?.kind ?? 'none');
  const [days, setDays] = useState<number[]>(item.repeat?.kind === 'weekdays' ? item.repeat.days : []);
  const [n, setN] = useState(item.repeat?.kind === 'everyN' ? item.repeat.n : 2);

  const repeat: Recurrence | undefined =
    repeatKind === 'none'
      ? undefined
      : repeatKind === 'weekdays'
        ? { kind: 'weekdays', days }
        : repeatKind === 'everyN'
          ? { kind: 'everyN', n }
          : { kind: repeatKind };

  const valid =
    text.trim() !== '' &&
    (repeatKind !== 'weekdays' || days.length > 0) &&
    (repeatKind !== 'everyN' || (Number.isInteger(n) && n >= 2)) &&
    (when !== 'date' || date !== '');

  const save = () => {
    if (!valid) return;
    let dueOn: string | null =
      when === 'today' ? today : when === 'tomorrow' ? shiftDayKey(today, 1) : when === 'date' ? date : null;
    // A repeating item needs a date to repeat from.
    if (repeat && dueOn === null) dueOn = today;
    edit(item.id, { text: text.trim(), kind, dueOn, repeat });
    onClose();
  };

  return (
    <Modal label="Edit item" onClose={onClose} size="md" className="p-5 gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-5"
      >
        <h2 className="text-lg font-semibold">Edit item</h2>

        <label className="flex flex-col gap-1.5">
          <span className="section-label">Text</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="section-label">List</span>
          <Segmented
            label="List"
            value={kind}
            options={[
              { value: 'should', label: 'Should' },
              { value: 'want', label: 'Want' },
            ]}
            onChange={setKind}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="section-label">When</span>
          <Segmented<When>
            label="When"
            value={when}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'tomorrow', label: 'Tomorrow' },
              { value: 'date', label: 'Pick day' },
              { value: 'someday', label: 'Someday' },
            ]}
            onChange={setWhen}
          />
          {when === 'date' && (
            <input
              type="date"
              aria-label="Due date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="repeat" className="section-label">
            Repeat
          </label>
          <select
            id="repeat"
            value={repeatKind}
            onChange={(e) => setRepeatKind(e.target.value as RepeatKind)}
            className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none"
          >
            <option value="none">Never</option>
            <option value="daily">Daily</option>
            <option value="weekdays">On chosen days</option>
            <option value="weekly">Weekly</option>
            <option value="everyN">Every N days</option>
          </select>
          {repeatKind === 'weekdays' && (
            <div role="group" aria-label="Days" className="flex gap-1.5">
              {WEEKDAY_SHORT.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  aria-label={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d]}
                  onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                  className={`flex-1 min-h-10 rounded-lg text-sm font-medium cursor-pointer border ${
                    days.includes(d)
                      ? 'bg-accent-dim border-accent-edge text-accent'
                      : 'border-border text-text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {repeatKind === 'everyN' && (
            <label className="flex items-center gap-2 text-sm text-text-muted">
              Every
              <input
                type="number"
                inputMode="numeric"
                min={2}
                aria-label="Days between"
                value={Number.isFinite(n) ? n : ''}
                onChange={(e) => setN(e.target.value === '' ? Number.NaN : Number(e.target.value))}
                className="w-20 min-h-10 rounded-lg px-2 bg-surface-2 border border-border text-text outline-none"
              />
              days
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl border border-border text-text-muted font-medium cursor-pointer hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="min-h-12 rounded-xl bg-accent text-on-accent font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          {item.repeat && !item.done && (
            <button
              type="button"
              onClick={() => {
                skip(item.id);
                onClose();
              }}
              className="min-h-10 rounded-lg border border-border px-3 text-sm text-text-muted cursor-pointer hover:text-text"
            >
              Skip this one
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              remove(item.id);
              onClose();
            }}
            className="min-h-10 rounded-lg border border-debt-edge px-3 text-sm text-debt cursor-pointer hover:bg-debt-dim"
          >
            {item.repeat ? 'Delete and stop repeating' : 'Delete'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
