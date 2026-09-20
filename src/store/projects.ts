import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PeriodTarget, Project, TimeEntry } from '../types';
import { targetPeriodKey, prunePeriods } from '../utils/goalPeriod';
import { dayKeyOf, todayKey } from '../utils/thirdTime';
import { useSettings } from './settings';
import { migrateGoalsV3 } from './projectsMigrate';

interface AddProjectParams {
  name: string;
  color?: string;
  target?: PeriodTarget;
  deadline?: string;
}

interface ProjectsState {
  projects: Project[];
  addProject: (params: AddProjectParams) => string;
  updateProject: (
    id: string,
    patch: Partial<Omit<Project, 'id' | 'createdAt' | 'progress' | 'total'>>
  ) => void;
  deleteProject: (id: string) => void;
  reorderProjects: (orderedIds: string[]) => void;
  archiveProject: (id: string) => void;

  /** The period key a bit of progress belongs in right now. */
  currentPeriodKey: (projectId: string) => string;
  /** Add focused time (ms) to a project's current period. Called by the session store. */
  commitTime: (projectId: string, ms: number) => void;
  /**
   * Re-sum a project's period buckets from the ledger. Retroactive edits to the
   * timeline recompute rather than patch — a delta that is ever computed against
   * a stale entry is a wrong total that nothing will ever correct.
   */
  recomputeFrom: (entries: TimeEntry[]) => void;
}

function periodKeyFor(project: Project, dayEndHour: number, at: number = Date.now()): string {
  return project.target
    ? targetPeriodKey(project.target, project.createdAt, dayEndHour, at)
    : dayKeyOf(at, dayEndHour);
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],

      addProject: (params) => {
        const id = crypto.randomUUID();
        set((s) => ({
          projects: [
            ...s.projects,
            {
              id,
              name: params.name,
              color: params.color,
              target: params.target,
              deadline: params.deadline,
              createdAt: Date.now(),
              order: s.projects.length,
              progress: { time: {} },
              total: { time: 0 },
            },
          ],
        }));
        return id;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      deleteProject: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

      reorderProjects: (orderedIds) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            const i = orderedIds.indexOf(p.id);
            return i >= 0 ? { ...p, order: i } : p;
          }),
        })),

      archiveProject: (id) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, archivedAt: Date.now() } : p)),
        })),

      currentPeriodKey: (projectId) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        const project = get().projects.find((p) => p.id === projectId);
        return project ? periodKeyFor(project, dayEndHour) : todayKey(dayEndHour);
      },

      commitTime: (projectId, ms) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId || ms <= 0) return p;
            const key = periodKeyFor(p, dayEndHour);
            return {
              ...p,
              progress: {
                time: prunePeriods({ ...p.progress.time, [key]: (p.progress.time[key] ?? 0) + ms }),
              },
              total: { time: p.total.time + ms },
            };
          }),
        }));
      },

      recomputeFrom: (entries) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        set((s) => ({
          projects: s.projects.map((p) => {
            const time: Record<string, number> = {};
            let total = 0;
            for (const entry of entries) {
              if (entry.kind !== 'work' || entry.projectId !== p.id) continue;
              const duration = entry.endedAt - entry.startedAt;
              if (duration <= 0) continue;
              // Bucket by when the work actually happened, not by today's date —
              // a re-sum runs long after the fact.
              const key = periodKeyFor(p, dayEndHour, entry.startedAt);
              time[key] = (time[key] ?? 0) + duration;
              total += duration;
            }
            return { ...p, progress: { time: prunePeriods(time) }, total: { time: total } };
          }),
        }));
      },
    }),
    {
      name: 'tt-goals',
      version: 4,
      migrate: (persisted: unknown, version: number) => {
        if (version < 4) {
          return migrateGoalsV3(persisted);
        }
        return persisted as { projects: Project[] };
      },
    }
  )
);
