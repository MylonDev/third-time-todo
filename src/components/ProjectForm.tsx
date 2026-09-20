import { useState } from 'react';
import { Modal } from './Modal';
import { useProjects } from '../store/projects';
import type { GoalPeriod, Project } from '../types';
import { projectDraftIsValid, type ProjectDraft } from '../utils/project';

const label = 'text-xs font-semibold uppercase tracking-wide';
const labelStyle = { color: 'var(--color-text-muted)' } as const;

const fieldStyle = {
  background: 'var(--color-surface-2)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
} as const;

function draftFromProject(project: Project | undefined): ProjectDraft {
  if (!project) return { name: '', targetEnabled: true, targetAmount: '', targetPeriod: 'weekly' };
  return {
    name: project.name,
    targetEnabled: true,
    targetAmount: project.target ? String(project.target.amount / 3_600_000) : '',
    targetPeriod: project.target?.period ?? 'weekly',
  };
}

export function ProjectForm({
  project,
  onClose,
}: {
  /** Present = editing; absent = adding. */
  project?: Project;
  onClose: () => void;
}) {
  const addProject = useProjects((s) => s.addProject);
  const updateProject = useProjects((s) => s.updateProject);

  const [d, setD] = useState<ProjectDraft>(() => draftFromProject(project));
  const [targetPeriodDays, setTargetPeriodDays] = useState(String(project?.target?.periodDays ?? 3));
  const [color, setColor] = useState(project?.color ?? '');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');

  const patch = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const valid = projectDraftIsValid(d);

  const buildTarget = () => {
    if (!(Number(d.targetAmount) > 0)) return undefined;
    return {
      metric: 'time' as const,
      amount: Number(d.targetAmount) * 3_600_000,
      period: d.targetPeriod,
      ...(d.targetPeriod === 'custom' ? { periodDays: Math.max(1, Number(targetPeriodDays) || 1) } : {}),
    };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const common = {
      name: d.name.trim(),
      color: color || undefined,
      target: buildTarget(),
      deadline: deadline || undefined,
    };
    if (project) {
      updateProject(project.id, common);
    } else {
      addProject(common);
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} label={project ? 'Edit project' : 'New project'} size="md">
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 overflow-y-auto">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {project ? 'Edit project' : 'New project'}
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Name
          </span>
          <input
            autoFocus
            value={d.name}
            onChange={(e) => patch('name', e.target.value)}
            placeholder="e.g. Learn to code"
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Color · optional
          </span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-16 rounded-lg border outline-none"
            style={fieldStyle}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Target · optional
          </span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              aria-label="Target"
              type="number"
              inputMode="numeric"
              value={d.targetAmount}
              onChange={(e) => patch('targetAmount', e.target.value)}
              placeholder="10"
              className="num w-24 rounded-xl border px-3 py-2 outline-none"
              style={fieldStyle}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>hours per</span>
            <select
              aria-label="per"
              value={d.targetPeriod}
              onChange={(e) => patch('targetPeriod', e.target.value as GoalPeriod)}
              className="rounded-xl border px-2 py-2 outline-none"
              style={fieldStyle}
            >
              <option value="daily">day</option>
              <option value="weekly">week</option>
              <option value="custom">N days</option>
            </select>
            {d.targetPeriod === 'custom' && (
              <input
                aria-label="days"
                type="number"
                inputMode="numeric"
                value={targetPeriodDays}
                onChange={(e) => setTargetPeriodDays(e.target.value)}
                className="num w-16 rounded-xl border px-3 py-2 outline-none"
                style={fieldStyle}
              />
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Deadline · optional
          </span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="num rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={!valid}
            className="rounded-xl border px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
            }}
          >
            {project ? 'Save' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
