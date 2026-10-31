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
  const v6 = {
    dayEndHour: 3,
    shouldTargetMin: 240,
    weeklyCapMin: 480,
    getReadySteps: [{ id: 'water', text: 'Water' }],
    updatedAt: 700,
    getReadyStepsUpdatedAt: 900,
  };

  it('lifts updatedAt to the steps version and strips the removed fields', () => {
    const out = migrateSettings(v6);
    expect(out).toEqual({ dayEndHour: 3, shouldTargetMin: 240, sounds: true, updatedAt: 900 });
  });

  it('keeps updatedAt when it is already the larger', () => {
    expect(migrateSettings({ ...v6, updatedAt: 1200 })).toMatchObject({ updatedAt: 1200 });
  });

  it('is safe to run twice', () => {
    const once = migrateSettings(v6);
    expect(migrateSettings(once)).toEqual(once);
  });

  it('fills the defaults on a very old blob', () => {
    expect(migrateSettings({ dayEndHour: 1, shouldTargetMin: null })).toEqual({ dayEndHour: 1, shouldTargetMin: null, sounds: true, updatedAt: 0 });
  });
});
