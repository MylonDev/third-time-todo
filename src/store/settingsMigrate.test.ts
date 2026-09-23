import { describe, expect, it } from 'vitest';
import { migrateTtSettings } from './settings';

describe('migrateTtSettings — v7 and below', () => {
  it('a v7 store with no activeTab at all defaults to tasks', () => {
    const state = migrateTtSettings({}, 7);
    expect(state.activeTab).toBe('tasks');
  });

  it('a v7 store carrying "habits" still ends on tasks', () => {
    const state = migrateTtSettings({ activeTab: 'habits' }, 7);
    expect(state.activeTab).toBe('tasks');
  });

  it('a v7 store carrying "goals" ends on projects, not tasks', () => {
    const state = migrateTtSettings({ activeTab: 'goals' }, 7);
    expect(state.activeTab).toBe('projects');
  });
});

describe('migrateTtSettings — v9 and v10, already covered but re-asserted here', () => {
  it('a v9 store carrying "goals" ends on projects', () => {
    const state = migrateTtSettings({ activeTab: 'goals' }, 9);
    expect(state.activeTab).toBe('projects');
  });

  it('a v9 store carrying "habits" ends on tasks', () => {
    const state = migrateTtSettings({ activeTab: 'habits' }, 9);
    expect(state.activeTab).toBe('tasks');
  });
});

describe('migrateTtSettings — v11 → v12', () => {
  it('keeps the stored mode as the new-day default and adds a one-a-day quota', () => {
    const state = migrateTtSettings({ mode: 'quarter', activeTab: 'tasks' }, 11);
    expect(state.mode).toBe('quarter');
    expect(state.difficultyPolicy).toEqual({ kind: 'quota', perDay: 1 });
  });
});
