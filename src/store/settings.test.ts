import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateSettings, useSettings } from './settings';

const water = [{ id: 'water', text: 'Water' }];

describe('settings versions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    useSettings.setState({ getReadySteps: [], getReadyStepsUpdatedAt: 0, updatedAt: 0, dayEndHour: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an edit is stamped above the other version too, so the one push cursor still sees it', () => {
    useSettings.setState({ getReadyStepsUpdatedAt: 9000 });
    useSettings.getState().setDayEndHour(2);
    expect(useSettings.getState().updatedAt).toBe(9001);
    useSettings.setState({ updatedAt: 20000 });
    useSettings.getState().setGetReadySteps(water);
    expect(useSettings.getState().getReadyStepsUpdatedAt).toBe(20001);
  });

  it('a v5 blob keeps its settings version and starts the steps version at 0', () => {
    expect(migrateSettings({ dayEndHour: 3, updatedAt: 700, getReadySteps: water })).toMatchObject({
      updatedAt: 700,
      getReadyStepsUpdatedAt: 0,
      getReadySteps: water,
    });
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
