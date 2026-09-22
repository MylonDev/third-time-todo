import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PeriodTarget, Project, TimeEntry } from '../types';
import { targetPeriodKey, prunePeriods } from '../utils/goalPeriod';
import { dayKeyOf, todayKey } from '../utils/thirdTime';
import { useSettings } from './settings';
import { useTasks } from './tasks';
import { forgetProject, resyncAggregates } from './sessionBridge';
import { migrateGoalsChain } from './projectsMigrate';
import { readPersistedLedger, readPersistedTaskProjects } from './persistedLedger';

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
  /**
   * Add focused time (ms) to a project's period. Called by the session store.
   * `at` buckets the period the same way `recomputeFrom` does — by when the
   * work happened, not by when it's being committed — which matters for the
   * boundary-split half of a stint: that half's own `startedAt` is before
   * today, so it must file under yesterday's bucket even though the commit
   * itself runs after the boundary. Defaults to now for every ordinary,
   * same-moment commit.
   *
   * An id with no project behind it is a deliberate no-op. Entries outlive the
   * projects they name — one can be deleted in the middle of a stint — and the
   * ledger keeps that record whether or not a bucket is still there to add it
   * to. Nothing upstream has a better answer to give, so there is nothing to
   * raise.
   */
  commitTime: (projectId: string, ms: number, at?: number) => void;
  /**
   * Re-sum a project's period buckets from the ledger. Retroactive edits to the
   * timeline recompute rather than patch — a delta that is ever computed against
   * a stale entry is a wrong total that nothing will ever correct.
   */
  recomputeFrom: (entries: TimeEntry[]) => void;
  /**
   * Entries about to leave the ledger for good (history ages out) hand their
   * time to `carried`, so the next re-sum still counts it. Totals don't move.
   */
  carryForward: (entries: TimeEntry[]) => void;
}

function periodKeyFor(project: Project, dayEndHour: number, at: number = Date.now()): string {
  return project.target
    ? targetPeriodKey(project.target, project.createdAt, dayEndHour, at)
    : dayKeyOf(at, dayEndHour);
}

/**
 * What the ledger alone says a project has: its period buckets and running
 * total. An entry that names only a task still belongs to that task's project
 * — `stopWork` writes exactly that shape whenever the timer is aimed at a task
 * — so ownership is read through `projectOfTask`.
 */
export function ledgerRollup(
  project: Project,
  entries: TimeEntry[],
  projectOfTask: Map<string, string | undefined>,
  dayEndHour: number
): { time: Record<string, number>; total: number } {
  const time: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    if (entry.kind !== 'work') continue;
    const owner = entry.projectId ?? (entry.taskId ? projectOfTask.get(entry.taskId) : undefined);
    if (owner !== project.id) continue;
    const duration = entry.endedAt - entry.startedAt;
    if (duration <= 0) continue;
    // Bucket by when the work actually happened, not by today's date — a
    // re-sum runs long after the fact.
    const key = periodKeyFor(project, dayEndHour, entry.startedAt);
    time[key] = (time[key] ?? 0) + duration;
    total += duration;
  }
  return { time, total };
}

function addBuckets(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

function taskProjectMap(): Map<string, string | undefined> {
  return new Map(useTasks.getState().tasks.map((t) => [t.id, t.projectId]));
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

      updateProject: (id, patch) => {
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
        // A target's period is the key its progress is bucketed under, so
        // changing it re-keys every bucket the project ever filled — time
        // logged against a daily target is invisible to a weekly one until
        // the buckets are rebuilt. Re-sum rather than try to move them: the
        // ledger is what they were a summary of in the first place.
        resyncAggregates();
      },

      deleteProject: (id) => {
        // Tasks lose the tag, not their history — a task's own record of what
        // it did stays put; only the pointer to a project that no longer
        // exists is cleared. Entries are untouched for the same reason: they
        // record what happened, not what still exists to be filed under.
        useTasks.getState().clearTaskProject(id);
        // Then the timer, which may be aimed here: order matters, because
        // re-aiming it resolves the target's project through the task, and
        // the task has to have lost the tag by then.
        forgetProject(id);
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
      },

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

      commitTime: (projectId, ms, at = Date.now()) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId || ms <= 0) return p;
            const key = periodKeyFor(p, dayEndHour, at);
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
        const projectOfTask = taskProjectMap();
        set((s) => ({
          projects: s.projects.map((p) => {
            const ledger = ledgerRollup(p, entries, projectOfTask, dayEndHour);
            const carried = p.carried ?? { time: {}, total: 0 };
            return {
              ...p,
              progress: { time: prunePeriods(addBuckets(carried.time, ledger.time)) },
              total: { time: carried.total + ledger.total },
            };
          }),
        }));
      },

      carryForward: (entries) => {
        if (entries.length === 0) return;
        const dayEndHour = useSettings.getState().dayEndHour;
        const projectOfTask = taskProjectMap();
        set((s) => ({
          projects: s.projects.map((p) => {
            const leaving = ledgerRollup(p, entries, projectOfTask, dayEndHour);
            if (leaving.total === 0) return p;
            const carried = p.carried ?? { time: {}, total: 0 };
            return {
              ...p,
              carried: {
                time: prunePeriods(addBuckets(carried.time, leaving.time)),
                total: carried.total + leaving.total,
              },
            };
          }),
        }));
      },
    }),
    {
      name: 'tt-goals',
      version: 5,
      migrate: migrateTtGoals,
    }
  )
);

/**
 * The store's actual `migrate`, pulled out so the version chain itself
 * (v1/v2/v3 → v4, in order) is what tests exercise — not just the final leg
 * in isolation, which is exactly the gap that let the v1/v2 legs go missing
 * unnoticed.
 */
export function migrateTtGoals(
  persisted: unknown,
  version: number,
  ledger: TimeEntry[] = readPersistedLedger(),
  projectOfTask: Map<string, string | undefined> = readPersistedTaskProjects()
): { projects: Project[] } {
  let state = persisted as { projects: Project[] };
  if (version < 4) {
    state = migrateGoalsChain(persisted, version);
  }
  if (version < 5) {
    state = { ...state, projects: state.projects.map((p) => withCarried(p, ledger, projectOfTask)) };
  }
  return state;
}

/**
 * v4 → v5. Whatever a project holds beyond what the ledger can account for is
 * time the ledger will never see again — every hour logged against a goal
 * before entries existed — and becomes `carried`, so re-sums keep it.
 *
 * The day boundary isn't readable from here (settings may not have hydrated),
 * so buckets are keyed at midnight. At worst an entry logged between midnight
 * and a later `dayEndHour` is attributed to the neighbouring bucket in this
 * one subtraction; the total is exact either way.
 */
function withCarried(
  p: Project,
  ledger: TimeEntry[],
  projectOfTask: Map<string, string | undefined>
): Project {
  const fromLedger = ledgerRollup(p, ledger, projectOfTask, 0);
  const time: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.progress?.time ?? {})) {
    const rest = v - (fromLedger.time[k] ?? 0);
    if (rest > 0) time[k] = rest;
  }
  return { ...p, carried: { time, total: Math.max(0, (p.total?.time ?? 0) - fromLedger.total) } };
}
