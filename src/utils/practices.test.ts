import { describe, expect, it } from 'vitest';
import type { Practice } from '../types';
import { LEVELS, makePractice, removePractice, reorderPractices, setNextStep, updatePractice } from './practices';

const fields = {
  name: 'Guitar',
  level: 'steady' as const,
  smallStep: 'Play one scale',
  lowStep: 'Hold the guitar',
  smallNeeds: ['clarity' as const],
  lowNeeds: [],
};

const live = (ps: Practice[]) =>
  ps
    .filter((p) => p.deletedAt === undefined)
    .sort((a, b) => a.order - b.order)
    .map((p) => p.name);

function three(): Practice[] {
  let ps: Practice[] = [];
  for (const name of ['A', 'B', 'C']) ps = [...ps, makePractice(ps, { ...fields, name }, 1)];
  return ps;
}

describe('levels', () => {
  it('asks for more as the level goes up', () => {
    const order = ['paused', 'minimal', 'light', 'steady', 'serious'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(LEVELS[order[i]].sessions).toBeGreaterThanOrEqual(LEVELS[order[i - 1]].sessions);
      expect(LEVELS[order[i]].weekMin).toBeGreaterThan(LEVELS[order[i - 1]].weekMin);
    }
  });

  it('matches the decided table', () => {
    expect(LEVELS.paused).toMatchObject({ sessions: 0, minMin: 0, weekMin: 0 });
    expect(LEVELS.minimal).toMatchObject({ sessions: 1, minMin: 10, weekMin: 15 });
    expect(LEVELS.light).toMatchObject({ sessions: 3, minMin: 15, weekMin: 50 });
    expect(LEVELS.steady).toMatchObject({ sessions: 4, minMin: 20, weekMin: 90 });
    expect(LEVELS.serious).toMatchObject({ sessions: 6, minMin: 30, weekMin: 180 });
  });
});

describe('changing practices', () => {
  it('makes a practice with the fields, a fresh id and the next order', () => {
    const [a, b] = three();
    expect(a).toMatchObject({ ...fields, name: 'A', createdAt: 1, updatedAt: 1 });
    expect(a).not.toHaveProperty('nextStep');
    expect(b.order).toBeGreaterThan(a.order);
    expect(b.id).not.toBe(a.id);
  });

  it('edits fields and bumps updatedAt, leaving the others alone', () => {
    const ps = three();
    const out = updatePractice(ps, ps[1].id, { level: 'light', name: 'Bee' }, 9);
    expect(out[1]).toMatchObject({ level: 'light', name: 'Bee', updatedAt: 9, createdAt: 1 });
    expect(out[0]).toBe(ps[0]);
    expect(out[2]).toBe(ps[2]);
  });

  it('removes by tombstone, keeping the row', () => {
    const ps = three();
    const out = removePractice(ps, ps[0].id, 9);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ deletedAt: 9, updatedAt: 9 });
    expect(live(out)).toEqual(['B', 'C']);
  });

  it('sets the next step, trimmed, and clears it when blank', () => {
    const ps = three();
    const set = setNextStep(ps, ps[0].id, '  Learn the intro  ', 5);
    expect(set[0]).toMatchObject({ nextStep: 'Learn the intro', updatedAt: 5 });
    const cleared = setNextStep(set, ps[0].id, '   ', 6);
    expect(cleared[0].nextStep).toBeUndefined();
  });

  it('moves a practice to a position, changing only that row', () => {
    const ps = three();
    const first = reorderPractices(ps, ps[2].id, 0, 9);
    expect(live(first)).toEqual(['C', 'A', 'B']);
    expect(first[0]).toBe(ps[0]);
    expect(first[1]).toBe(ps[1]);
    expect(first[2].updatedAt).toBe(9);

    expect(live(reorderPractices(ps, ps[0].id, 1, 9))).toEqual(['B', 'A', 'C']);
    expect(live(reorderPractices(ps, ps[0].id, 99, 9))).toEqual(['B', 'C', 'A']);
  });

  it('ignores deleted practices when counting the position', () => {
    const [a, b, c] = three();
    const withGone = [{ ...a, deletedAt: 2 }, b, c];
    expect(live(reorderPractices(withGone, c.id, 0, 9))).toEqual(['C', 'B']);
  });

  it('a lone practice keeps a usable order', () => {
    const [a] = three();
    expect(reorderPractices([a], a.id, 0, 9)[0].order).toBe(1);
  });
});
