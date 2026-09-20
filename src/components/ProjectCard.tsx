import { useSettings } from '../store/settings';
import { useProjects } from '../store/projects';
import { ActionMenu } from './ActionMenu';
import type { Project } from '../types';
import { formatProjectTotal, paceReading, targetReading, widthPct } from '../utils/project';

function Bar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--color-surface-2)' }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: 'var(--color-accent)' }}
      />
    </div>
  );
}

export function ProjectCard({
  project,
  onEdit,
}: {
  project: Project;
  onEdit: () => void;
}) {
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const archiveProject = useProjects((s) => s.archiveProject);

  const target = targetReading(project, dayEndHour);
  const pace = project.deadline ? paceReading(project) : null;

  return (
    <li
      className="flex flex-col gap-3 rounded-2xl border p-4"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            {project.color && (
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: project.color }}
                aria-hidden
              />
            )}
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
              {project.name}
            </h3>
          </div>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {formatProjectTotal(project)} total
          </span>
        </div>

        <ActionMenu
          label="Project actions"
          actions={[
            { label: 'Edit', onSelect: onEdit },
            { label: 'Archive', onSelect: () => archiveProject(project.id) },
          ]}
        />
      </div>

      {target && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            <span>{target.text}</span>
            <span className="num">{Math.round(widthPct(target.fraction))}%</span>
          </div>
          <Bar pct={widthPct(target.fraction)} />
        </div>
      )}

      {pace && (
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {pace.text}
        </span>
      )}
    </li>
  );
}
