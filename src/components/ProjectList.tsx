import { useState } from 'react';
import { useProjects } from '../store/projects';
import { ProjectCard } from './ProjectCard';
import { ProjectForm } from './ProjectForm';
import { formatProjectTotal } from '../utils/project';

type Dialog = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; id: string };

export function ProjectList() {
  const projects = useProjects((s) => s.projects);
  const deleteProject = useProjects((s) => s.deleteProject);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [showArchived, setShowArchived] = useState(false);

  const active = projects.filter((p) => !p.archivedAt).sort((a, b) => a.order - b.order);
  const archived = projects
    .filter((p) => p.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const byId = (id: string) => projects.find((p) => p.id === id);
  const close = () => setDialog({ kind: 'none' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          Projects · {active.length} active
        </span>
        <button
          onClick={() => setDialog({ kind: 'add' })}
          className="rounded-xl border px-3 py-1.5 text-sm font-semibold"
          style={{
            background: 'var(--color-accent-dim)',
            color: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
          }}
        >
          New project
        </button>
      </div>

      {active.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No projects yet — add one to give your time somewhere to go.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} onEdit={() => setDialog({ kind: 'edit', id: p.id })} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="self-start text-xs font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showArchived ? '▾' : '▸'} {archived.length} archived project{archived.length === 1 ? '' : 's'}
          </button>
          {showArchived &&
            archived.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                <span>
                  {p.name} · <span className="num">{formatProjectTotal(p)}</span>
                </span>
                <button
                  onClick={() => deleteProject(p.id)}
                  className="text-xs"
                  style={{ color: 'var(--color-debt)' }}
                  aria-label={`Delete ${p.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {dialog.kind === 'add' && <ProjectForm onClose={close} />}

      {dialog.kind === 'edit' && byId(dialog.id) && (
        <ProjectForm project={byId(dialog.id)} onClose={close} />
      )}
    </div>
  );
}
