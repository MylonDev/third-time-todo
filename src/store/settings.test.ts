import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateSettings, useSettings } from './settings';

describe('settings version', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    useSettings.setState({ updatedAt: 0, dayEndHour: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an edit is stamped with the clock', () => {
    useSettings.getState().setDayEndHour(2);
    expect(useSettings.getState()).toMatchObject({ dayEndHour: 2, updatedAt: 5000 });
  });

  it('stays ahead of the version it replaces when the clock is behind', () => {
    useSettings.setState({ updatedAt: 9000 });
    useSettings.getState().setShouldTargetMin(60);
    expect(useSettings.getState().updatedAt).toBe(9001);
  });
});

describe('migrateSettings', () => {
  it('fills the defaults on an old blob', () => {
    expect(migrateSettings({ dayEndHour: 1, shouldTargetMin: null })).toEqual({ dayEndHour: 1, shouldTargetMin: null, sounds: true, updatedAt: 0 });
  });

  it('keeps what the blob holds, including fields from older builds', () => {
    const blob = { dayEndHour: 3, sounds: false, updatedAt: 700, getReadyStepsUpdatedAt: 900 };
    expect(migrateSettings(blob)).toEqual(blob);
  });
});
