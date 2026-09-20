/**
 * The session store owns the ledger and the running timer, and it already
 * reaches down into the project and task stores to keep their aggregates in
 * step. Letting those two import it back would close the loop, so they reach
 * up through here instead: the session store registers these as it loads, and
 * an edit that can strand time calls whichever one it needs without knowing
 * where the ledger lives.
 *
 * Before the session store has loaded there is no ledger to consult and no
 * timer to point anywhere, so the defaults do nothing.
 */
export interface SessionBridge {
  /** Re-sum every project and task total from the ledger. */
  resyncAggregates: () => void;
  /** Re-aim the running timer at a task whose project has just changed. */
  reattributeActiveTask: (taskId: string) => void;
  /** Stop the timer pointing at a project that is about to stop existing. */
  forgetProject: (projectId: string) => void;
}

let bridge: SessionBridge = {
  resyncAggregates: () => {},
  reattributeActiveTask: () => {},
  forgetProject: () => {},
};

export function provideSessionBridge(impl: SessionBridge): void {
  bridge = impl;
}

export function resyncAggregates(): void {
  bridge.resyncAggregates();
}

export function reattributeActiveTask(taskId: string): void {
  bridge.reattributeActiveTask(taskId);
}

export function forgetProject(projectId: string): void {
  bridge.forgetProject(projectId);
}
