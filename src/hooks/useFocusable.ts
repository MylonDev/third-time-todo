import { useSession } from '../store/session';

/**
 * The current attribution target — whichever project or task a running (or
 * about-to-run) timer credits. `setActive` keeps `activeProjectId` in sync
 * with `activeTaskId` (a task always resolves to its own project), so reading
 * both off the session store is all a row needs to know whether it holds the
 * target.
 */
export function useActiveTarget(): { projectId?: string; taskId?: string } {
  const projectId = useSession((s) => s.activeProjectId);
  const taskId = useSession((s) => s.activeTaskId);
  return { projectId, taskId };
}
