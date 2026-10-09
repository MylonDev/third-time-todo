import { useState } from 'react';
import { useSettings } from '../store/settings';
import type { Theme } from '../types';
import { Modal } from './Modal';
import { Segmented } from './Segmented';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const setDayEndHour = useSettings((s) => s.setDayEndHour);
  const targetMin = useSettings((s) => s.shouldTargetMin);
  const setTargetMin = useSettings((s) => s.setShouldTargetMin);
  const wakeLock = useSettings((s) => s.wakeLock);
  const setWakeLock = useSettings((s) => s.setWakeLock);
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  // Typed hours, committed when valid, so clearing the box doesn't fight the user.
  const [targetHours, setTargetHours] = useState(targetMin ? String(targetMin / 60) : '');

  return (
    <Modal label="Settings" onClose={onClose} size="md" className="p-5 gap-5">
      <h2 className="text-lg font-semibold">Settings</h2>

      <label className="flex flex-col gap-1.5">
        <span className="section-label">Daily Should target (hours)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          placeholder="None"
          value={targetHours}
          onChange={(e) => {
            setTargetHours(e.target.value);
            const h = Number(e.target.value);
            setTargetMin(e.target.value !== '' && h > 0 ? Math.round(h * 60) : null);
          }}
          className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none"
        />
        <span className="text-xs text-text-muted">
          Optional. When you reach it the app says you can stop for the day.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="section-label">Day ends at</span>
        <select
          value={dayEndHour}
          onChange={(e) => setDayEndHour(Number(e.target.value))}
          className="min-h-12 rounded-lg px-3 bg-surface-2 border border-border text-text outline-none"
        >
          <option value={0}>Midnight</option>
          {[1, 2, 3, 4].map((h) => (
            <option key={h} value={h}>
              {h}:00 AM
            </option>
          ))}
        </select>
        <span className="text-xs text-text-muted">
          Want available and debt reset when the day ends. Push this past midnight if you work late.
        </span>
      </label>

      <label className="flex items-center justify-between gap-4 min-h-12">
        <span>
          <span className="block">Keep screen on while timing</span>
          <span className="block text-xs text-text-muted">Stops the phone locking mid-session.</span>
        </span>
        <input
          type="checkbox"
          checked={wakeLock}
          onChange={(e) => setWakeLock(e.target.checked)}
          className="size-6 accent-accent cursor-pointer"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="section-label">Theme</span>
        <Segmented<Theme>
          label="Theme"
          value={theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={setTheme}
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="min-h-12 rounded-xl bg-accent text-on-accent font-semibold cursor-pointer"
      >
        Done
      </button>
    </Modal>
  );
}
