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
