import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from './settings';

const water = [{ id: 'water', text: 'Water' }];

describe('settings versions', () => {
  beforeEach(() => {
    // The store persists to localStorage, which node does not have.
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    useSettings.setState({ getReadySteps: [], getReadyStepsUpdatedAt: 0, updatedAt: 0, dayEndHour: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('changing the steps bumps only the steps version', () => {
    useSettings.getState().setGetReadySteps(water);
    expect(useSettings.getState()).toMatchObject({ getReadySteps: water, getReadyStepsUpdatedAt: 5000, updatedAt: 0 });
  });

  it('changing another setting bumps only the settings version', () => {
    useSettings.getState().setDayEndHour(2);
    expect(useSettings.getState()).toMatchObject({ dayEndHour: 2, updatedAt: 5000, getReadyStepsUpdatedAt: 0 });
  });

  it('stays ahead of the version it replaces when the clock is behind', () => {
    useSettings.setState({ getReadyStepsUpdatedAt: 9000 });
    useSettings.getState().setGetReadySteps(water);
    expect(useSettings.getState().getReadyStepsUpdatedAt).toBe(9001);
  });

  it('is a no-op when the list is unchanged', () => {
    useSettings.getState().setGetReadySteps(water);
    vi.setSystemTime(6000);
    useSettings.getState().setGetReadySteps([{ id: 'water', text: 'Water' }]);
    expect(useSettings.getState().getReadyStepsUpdatedAt).toBe(5000);
  });
});
