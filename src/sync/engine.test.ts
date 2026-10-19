import { describe, expect, it } from 'vitest';
import type { GetReadyDay, Item, Practice, TimeEntry } from '../types';
import { applyFix, startState, stopTimer } from '../utils/ledger';
import { recordGetReady, sameSteps } from '../utils/getReady';
import { completeItem, makeItem, removeItem, updateItem } from '../utils/items';
import { makePractice, removePractice, setNextStep, updatePractice } from '../utils/practices';
import { FRESH_CURSORS, mergeIncoming, mergeSettings, syncOnce, type Cursors, type Local, type Pull, type Remote, type Snapshot } from './engine';
import { stampChanged } from './merge';
import type { SyncedSettings } from './rows';

// ── An in-memory server that behaves like the real one ──────────────────────
// Last writer wins on `updatedAt` (an equal one is accepted), every accepted
// write gets a rising server cursor, and it can be taken offline.

class FakeServer implements Remote {
  online = true;
  private seq = 0;
  private entries = new Map<string, { row: TimeEntry; seq: number }>();
  private items = new Map<string, { row: Item; seq: number }>();
  private practices = new Map<string, { row: Practice; seq: number }>();
  private getReadyDays = new Map<string, { row: GetReadyDay; seq: number }>();
  private settings: { row: SyncedSettings; seq: number } | null = null;
  pushes = 0;

  private check() {
    if (!this.online) throw new Error('offline');
  }
  private put<T extends { id: string; updatedAt: number }>(table: Map<string, { row: T; seq: number }>, rows: T[]) {
    for (const row of rows) {
      const old = table.get(row.id);
      if (old && row.updatedAt < old.row.updatedAt) continue;
      table.set(row.id, { row, seq: ++this.seq });
    }
  }
  private pull<T>(table: Map<string, { row: T; seq: number }>, since: string | null): Pull<T> {
    const from = since === null ? 0 : Number(since);
    const hit = [...table.values()].filter((x) => x.seq >= from);
    return { rows: hit.map((x) => x.row), cursor: hit.length ? String(Math.max(...hit.map((x) => x.seq))) : since };
  }

  async pushEntries(rows: TimeEntry[]) {
    this.check();
    this.pushes++;
    this.put(this.entries, rows);
  }
  async pushItems(rows: Item[]) {
    this.check();
    this.pushes++;
    this.put(this.items, rows);
  }
  async pushPractices(rows: Practice[]) {
    this.check();
    this.pushes++;
    this.put(this.practices, rows);
  }
  async pushGetReadyDays(rows: GetReadyDay[]) {
    this.check();
    this.pushes++;
    this.put(this.getReadyDays, rows);
  }
  /** Field by field, as the server's trigger does: a stale half of the row is dropped, the other half kept. */
  async pushSettings(s: SyncedSettings) {
    this.check();
    const old = this.settings?.row;
    const scalars = old && s.updatedAt < old.updatedAt ? old : s;
    const stepsKept = old !== undefined && !sameSteps(s.getReadySteps, old.getReadySteps) && s.getReadyStepsUpdatedAt <= old.getReadyStepsUpdatedAt;
    const steps = stepsKept ? old : s;
    this.settings = {
      row: {
        dayEndHour: scalars.dayEndHour,
        shouldTargetMin: scalars.shouldTargetMin,
        weeklyCapMin: scalars.weeklyCapMin,
        updatedAt: scalars.updatedAt,
        getReadySteps: steps.getReadySteps,
        getReadyStepsUpdatedAt: Math.max(steps.getReadyStepsUpdatedAt, old?.getReadyStepsUpdatedAt ?? 0),
      },
      seq: ++this.seq,
    };
  }
  async pullEntries(since: string | null) {
    this.check();
    return this.pull(this.entries, since);
  }
  async pullItems(since: string | null) {
    this.check();
    return this.pull(this.items, since);
  }
  async pullPractices(since: string | null) {
    this.check();
    return this.pull(this.practices, since);
  }
  async pullGetReadyDays(since: string | null) {
    this.check();
    return this.pull(this.getReadyDays, since);
  }
  async pullSettings(since: string | null) {
    this.check();
    const hit = this.settings && this.settings.seq >= (since === null ? 0 : Number(since)) ? [this.settings] : [];
    return { rows: hit.map((x) => x.row), cursor: hit.length ? String(hit[0].seq) : since };
  }
}

const NO_SETTINGS: SyncedSettings = { dayEndHour: 0, shouldTargetMin: null, weeklyCapMin: null, getReadySteps: [], getReadyStepsUpdatedAt: 0, updatedAt: 0 };

// ── A device: its own state and cursors, edited the way the stores edit it ──

class Device {
  state: Snapshot = {
    entries: [],
    items: [],
    practices: [],
    getReadyDays: [],
    settings: { ...NO_SETTINGS },
  };
  cursors: Cursors = FRESH_CURSORS;

  name: string;
  private server: FakeServer;

  constructor(name: string, server: FakeServer) {
    this.name = name;
    this.server = server;
  }

  private local: Local = {
    read: () => this.state,
    apply: (incoming) => {
      this.state = mergeIncoming(this.state, incoming);
    },
  };

  /** Edit entries as the timer store does: the pure change, then stamp. */
  setEntries(change: (e: TimeEntry[]) => TimeEntry[]) {
    this.state = { ...this.state, entries: stampChanged(this.state.entries, change(this.state.entries)) };
  }
  setItems(change: (i: Item[]) => Item[]) {
    this.state = { ...this.state, items: stampChanged(this.state.items, change(this.state.items)) };
  }

  setPractices(change: (p: Practice[]) => Practice[]) {
    this.state = { ...this.state, practices: stampChanged(this.state.practices, change(this.state.practices)) };
  }

  setGetReadyDays(change: (d: GetReadyDay[]) => GetReadyDay[]) {
    this.state = { ...this.state, getReadyDays: stampChanged(this.state.getReadyDays, change(this.state.getReadyDays)) };
  }

  async sync(opts?: { pull: boolean }) {
    this.cursors = await syncOnce(this.local, this.server, this.cursors, opts);
  }
}

const T = (min: number) => new Date(2026, 9, 12, 10, 0, 0).getTime() + min * 60_000;
const TODAY = '2026-10-12';

/**
 * Sync every device in turn, a few full rounds. A device only learns what the
 * others pushed after its own turn, so stopping at the first quiet round would
 * stop too early. Convergence is then asserted by the tests, not assumed here.
 */
async function settle(devices: Device[]) {
  for (let round = 0; round < 4; round++) {
    for (const d of devices) await d.sync();
  }
}

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => r.deletedAt === undefined);
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

function expectSame(a: Device, b: Device) {
  expect(byId(a.state.entries)).toEqual(byId(b.state.entries));
  expect(byId(a.state.items)).toEqual(byId(b.state.items));
  expect(byId(a.state.practices)).toEqual(byId(b.state.practices));
  expect(byId(a.state.getReadyDays)).toEqual(byId(b.state.getReadyDays));
  expect(a.state.settings).toEqual(b.state.settings);
}

describe('sync between two devices', () => {
  it('an item added on one device appears on the other', async () => {
    const server = new FakeServer();
    const phone = new Device('phone', server);
    const desktop = new Device('desktop', server);
    phone.setItems((items) => [...items, makeItem(items, { text: 'File taxes', kind: 'should', dueOn: TODAY }, T(0))]);

    await settle([phone, desktop]);

    expect(live(desktop.state.items).map((i) => i.text)).toEqual(['File taxes']);
    expectSame(phone, desktop);
  });

  it('the later edit to the same item wins on both', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setItems((items) => [...items, makeItem(items, { text: 'Original', kind: 'should', dueOn: TODAY }, T(0))]);
    await settle([a, b]);
    const id = a.state.items[0].id;

    a.setItems((items) => updateItem(items, id, { text: 'From A' }, T(5)));
    b.setItems((items) => updateItem(items, id, { text: 'From B' }, T(9)));
    await settle([a, b]);

    expect(a.state.items[0].text).toBe('From B');
    expectSame(a, b);
  });

  it('an older edit made offline does not undo a newer one', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setItems((items) => [...items, makeItem(items, { text: 'v0', kind: 'want', dueOn: TODAY }, T(0))]);
    await settle([a, b]);
    const id = a.state.items[0].id;

    server.online = false;
    a.setItems((items) => updateItem(items, id, { text: 'offline edit' }, T(10)));
    server.online = true;
    b.setItems((items) => updateItem(items, id, { text: 'newer edit' }, T(60)));
    await b.sync();
    await settle([a, b]);

    expect(a.state.items[0].text).toBe('newer edit');
    expectSame(a, b);
  });

  it('a delete reaches the other device and stays deleted', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setItems((items) => [...items, makeItem(items, { text: 'Gone', kind: 'want', dueOn: TODAY }, T(0))]);
    await settle([a, b]);

    b.setItems((items) => removeItem(items, items[0].id, T(3)));
    await settle([a, b]);

    expect(live(a.state.items)).toEqual([]);
    expectSame(a, b);
  });

  it('both devices completing the same repeating item make one next occurrence', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setItems((items) => [...items, makeItem(items, { text: 'Stretch', kind: 'should', dueOn: TODAY, repeat: { kind: 'daily' } }, T(0))]);
    await settle([a, b]);
    const id = a.state.items[0].id;

    a.setItems((items) => completeItem(items, id, TODAY, T(5)));
    b.setItems((items) => completeItem(items, id, TODAY, T(6)));
    await settle([a, b]);

    expect(live(a.state.items).filter((i) => !i.done)).toHaveLength(1);
    expectSame(a, b);
  });

  it('a timer started on one device shows as running on the other', async () => {
    const server = new FakeServer();
    const phone = new Device('phone', server);
    const desktop = new Device('desktop', server);
    phone.setEntries((e) => startState(e, 'should', T(0)));
    await settle([phone, desktop]);

    expect(live(desktop.state.entries)).toHaveLength(1);
    expect(live(desktop.state.entries)[0]).toMatchObject({ state: 'should', endedAt: null });

    desktop.setEntries((e) => stopTimer(e, T(30)));
    await settle([phone, desktop]);
    expect(live(phone.state.entries)[0].endedAt).toBe(T(30));
    expectSame(phone, desktop);
  });

  it('two timers started while apart end up as one timeline', async () => {
    const server = new FakeServer();
    const phone = new Device('phone', server);
    const desktop = new Device('desktop', server);

    // Both start offline, an hour apart, and each has its own running entry.
    server.online = false;
    phone.setEntries((e) => startState(e, 'should', T(0)));
    desktop.setEntries((e) => startState(e, 'want', T(60)));
    server.online = true;
    await settle([phone, desktop]);

    const entries = live(phone.state.entries).sort((x, y) => x.startedAt - y.startedAt);
    expect(entries.map((e) => [e.state, e.startedAt, e.endedAt])).toEqual([
      ['should', T(0), T(60)],
      ['want', T(60), null],
    ]);
    expectSame(phone, desktop);
  });

  it('a Fix timer on one device carries over', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setEntries((e) => startState(e, 'should', T(0)));
    await settle([a, b]);

    a.setEntries((e) => applyFix(e, { ms: 20 * 60_000, was: 'want', then: 'should' }, T(60)));
    await settle([a, b]);

    const states = live(b.state.entries)
      .sort((x, y) => x.startedAt - y.startedAt)
      .map((e) => [e.state, e.startedAt, e.endedAt]);
    expect(states).toEqual([
      ['should', T(0), T(40)],
      ['want', T(40), T(60)],
      ['should', T(60), null],
    ]);
    expectSame(a, b);
  });

  it('a device with a slow clock can still edit a row another device wrote', async () => {
    const server = new FakeServer();
    const fast = new Device('fast', server);
    const slow = new Device('slow', server);
    fast.setItems((items) => [...items, makeItem(items, { text: 'v0', kind: 'should', dueOn: TODAY }, T(500))]);
    await settle([fast, slow]);

    // The slow device's clock says T(0), long before the row's own stamp.
    slow.setItems((items) => updateItem(items, items[0].id, { text: 'edited on slow' }, T(0)));
    await settle([fast, slow]);

    expect(fast.state.items[0].text).toBe('edited on slow');
    expectSame(fast, slow);
  });

  it('settings follow you, and defaults never override a real setting', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    const chosen = { dayEndHour: 3, shouldTargetMin: 240, weeklyCapMin: 480, getReadySteps: [], getReadyStepsUpdatedAt: 0, updatedAt: T(0) };
    a.state = { ...a.state, settings: chosen };
    await settle([a, b]);
    expect(b.state.settings).toEqual(chosen);

    // A fresh device with untouched defaults must not push them over.
    const c = new Device('c', server);
    await settle([a, b, c]);
    expect(a.state.settings.dayEndHour).toBe(3);
    expect(c.state.settings.dayEndHour).toBe(3);
  });
});

describe('practices between two devices', () => {
  const fields = {
    name: 'Guitar',
    targetDays: 4,
    targetWeekdays: [] as number[],
    targetMin: 20,
  };

  it('a practice added on one device appears on the other', async () => {
    const server = new FakeServer();
    const phone = new Device('phone', server);
    const desktop = new Device('desktop', server);
    phone.setPractices((ps) => [...ps, makePractice(ps, fields, T(0))]);

    await settle([phone, desktop]);

    expect(live(desktop.state.practices).map((p) => p.name)).toEqual(['Guitar']);
    expectSame(phone, desktop);
  });

  it('the later edit wins, whichever device made it', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setPractices((ps) => [...ps, makePractice(ps, fields, T(0))]);
    await settle([a, b]);
    const id = a.state.practices[0].id;

    a.setPractices((ps) => updatePractice(ps, id, { targetDays: 3, targetMin: 15 }, T(5)));
    b.setPractices((ps) => setNextStep(ps, id, 'Learn the intro', T(9)));
    await settle([a, b]);

    expect(a.state.practices[0]).toMatchObject({ nextStep: 'Learn the intro', updatedAt: T(9) });
    expectSame(a, b);
  });

  it('a delete reaches the other device and stays deleted', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setPractices((ps) => [...ps, makePractice(ps, fields, T(0))]);
    await settle([a, b]);

    b.setPractices((ps) => removePractice(ps, ps[0].id, T(3)));
    await settle([a, b]);

    expect(live(a.state.practices)).toEqual([]);
    expect(a.state.practices).toHaveLength(1);
    expectSame(a, b);
  });

  it('an entry for a practice keeps its practice on the other device', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setPractices((ps) => [...ps, makePractice(ps, fields, T(0))]);
    const id = a.state.practices[0].id;
    a.setEntries((e) => startState(e, 'should', T(1), id));
    await settle([a, b]);

    expect(live(b.state.entries)[0]).toMatchObject({ state: 'should', practiceId: id });
    expectSame(a, b);
  });

  it('a push sends only the practices changed since the last one', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    a.setPractices((ps) => [...ps, makePractice(ps, fields, T(0))]);
    await a.sync();
    expect(a.cursors.pushed.practices).toBe(T(0));
    const pushes = server.pushes;
    await a.sync();
    expect(server.pushes).toBe(pushes);
  });
});

describe('Get ready between two devices', () => {
  const steps = [
    { id: 'water', text: 'Water' },
    { id: 'desk', text: 'Clear desk' },
  ];

  it('steps set on one device appear on the other', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.state = { ...a.state, settings: { ...a.state.settings, getReadySteps: steps, getReadyStepsUpdatedAt: T(0) } };

    await settle([a, b]);

    expect(b.state.settings.getReadySteps).toEqual(steps);
    expect(b.state.settings.getReadyStepsUpdatedAt).toBe(T(0));
    expectSame(a, b);
  });

  it('a steps-only edit is pushed, through the steps version alone', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.state = { ...a.state, settings: { ...a.state.settings, getReadySteps: steps, getReadyStepsUpdatedAt: T(5) } };
    expect(a.state.settings.updatedAt).toBe(0);

    await a.sync({ pull: false });
    expect(a.cursors.pushed.settings).toBe(T(5));

    await b.sync();
    expect(b.state.settings.getReadySteps).toEqual(steps);
  });

  it('a second steps-only edit moves the cursor and is sent again', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.state = { ...a.state, settings: { ...a.state.settings, getReadySteps: steps, getReadyStepsUpdatedAt: T(5) } };
    await settle([a, b]);

    const fewer = [steps[0]];
    a.state = { ...a.state, settings: { ...a.state.settings, getReadySteps: fewer, getReadyStepsUpdatedAt: T(8) } };
    await settle([a, b]);

    expect(a.cursors.pushed.settings).toBe(T(8));
    expect(b.state.settings.getReadySteps).toEqual(fewer);
    expectSame(a, b);
  });

  it('a stale device that changed another setting does not wipe the steps', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const stale = new Device('stale', server);
    a.state = { ...a.state, settings: { ...a.state.settings, getReadySteps: steps, getReadyStepsUpdatedAt: T(5) } };
    await a.sync();

    // Never synced, so its steps are empty at version 0; its day end edit is newer than anything on the server.
    stale.state = { ...stale.state, settings: { ...stale.state.settings, dayEndHour: 2, updatedAt: T(9) } };
    await settle([a, stale]);

    expect(stale.state.settings).toMatchObject({ dayEndHour: 2, getReadySteps: steps, getReadyStepsUpdatedAt: T(5) });
    expect(a.state.settings).toMatchObject({ dayEndHour: 2, getReadySteps: steps });
    expectSame(a, stale);
  });

  it('two devices recording the same day end up with the steps of both', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setGetReadyDays((d) => recordGetReady(d, TODAY, ['water'], false, T(0)));
    b.setGetReadyDays((d) => recordGetReady(d, TODAY, ['desk'], false, T(5)));

    await settle([a, b]);

    expect(a.state.getReadyDays).toMatchObject([{ id: TODAY, done: ['desk', 'water'], skipped: false }]);
    expectSame(a, b);
  });

  it('a day recorded on one device is there on the other, and a later skip does not undo a step done', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    a.setGetReadyDays((d) => recordGetReady(d, TODAY, ['water'], false, T(0)));
    await settle([a, b]);
    expect(b.state.getReadyDays).toEqual([{ id: TODAY, done: ['water'], skipped: false, updatedAt: T(0) }]);

    b.setGetReadyDays((d) => recordGetReady(d, TODAY, [], true, T(5)));
    await settle([a, b]);

    expect(a.state.getReadyDays).toMatchObject([{ id: TODAY, done: ['water'], skipped: false }]);
    expectSame(a, b);
  });

  it('a push sends only the days changed since the last one', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    a.setGetReadyDays((d) => recordGetReady(d, TODAY, [], true, T(0)));
    await a.sync();
    expect(a.cursors.pushed.getReadyDays).toBe(T(0));
    const pushes = server.pushes;
    await a.sync();
    expect(server.pushes).toBe(pushes);
  });
});

describe('when the server is not reachable', () => {
  it('keeps everything locally and sends it later, once', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    a.setEntries((e) => startState(e, 'should', T(0)));
    a.setItems((items) => [...items, makeItem(items, { text: 'Offline item', kind: 'want', dueOn: TODAY }, T(1))]);

    server.online = false;
    await expect(a.sync()).rejects.toThrow('offline');
    expect(a.cursors.pushed).toEqual({ entries: 0, items: 0, practices: 0, getReadyDays: 0, settings: 0 });

    server.online = true;
    await a.sync();
    const b = new Device('b', server);
    await b.sync();
    expect(live(b.state.items).map((i) => i.text)).toEqual(['Offline item']);
    expect(live(b.state.entries)).toHaveLength(1);
  });

  it('a failed push part-way is retried without losing or duplicating rows', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    a.setEntries((e) => startState(e, 'should', T(0)));
    a.setItems((items) => [...items, makeItem(items, { text: 'Item', kind: 'want', dueOn: TODAY }, T(1))]);

    // Entries go through, then the server drops before the items.
    const real = server.pushItems.bind(server);
    server.pushItems = async () => {
      throw new Error('dropped');
    };
    await expect(a.sync()).rejects.toThrow('dropped');
    server.pushItems = real;

    await a.sync();
    const b = new Device('b', server);
    await settle([a, b]);
    expect(live(b.state.items)).toHaveLength(1);
    expect(live(b.state.entries)).toHaveLength(1);
    expectSame(a, b);
  });

  it('a push-only sync sends changes without pulling', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    const b = new Device('b', server);
    b.setItems((items) => [...items, makeItem(items, { text: 'From B', kind: 'should', dueOn: TODAY }, T(0))]);
    await b.sync();

    a.setItems((items) => [...items, makeItem(items, { text: 'From A', kind: 'should', dueOn: TODAY }, T(1))]);
    await a.sync({ pull: false });
    expect(a.state.items.map((i) => i.text)).toEqual(['From A']);
  });

  it('syncing again with nothing new sends nothing and leaves state untouched', async () => {
    const server = new FakeServer();
    const a = new Device('a', server);
    a.setItems((items) => [...items, makeItem(items, { text: 'x', kind: 'should', dueOn: TODAY }, T(0))]);
    await a.sync();
    const state = a.state;
    const pushes = server.pushes;
    await a.sync();
    expect(server.pushes).toBe(pushes);
    expect(a.state).toBe(state);
  });
});

describe('mergeSettings', () => {
  const water = [{ id: 'water', text: 'Water' }];
  const desk = [{ id: 'desk', text: 'Clear desk' }];
  const base: SyncedSettings = { dayEndHour: 1, shouldTargetMin: 60, weeklyCapMin: 300, getReadySteps: water, getReadyStepsUpdatedAt: 50, updatedAt: 100 };

  it('takes the settings from the newer side and the steps from the side with the newer steps', () => {
    const staleScalarsFreshSteps = { ...base, dayEndHour: 3, updatedAt: 40, getReadySteps: desk, getReadyStepsUpdatedAt: 90 };
    expect(mergeSettings(base, staleScalarsFreshSteps)).toEqual({ ...base, getReadySteps: desk, getReadyStepsUpdatedAt: 90 });
  });

  it('a stale device with a newer setting and no steps does not wipe the steps', () => {
    const stale: SyncedSettings = { dayEndHour: 4, shouldTargetMin: null, weeklyCapMin: null, getReadySteps: [], getReadyStepsUpdatedAt: 0, updatedAt: 200 };
    expect(mergeSettings(base, stale)).toEqual({
      dayEndHour: 4,
      shouldTargetMin: null,
      weeklyCapMin: null,
      getReadySteps: water,
      getReadyStepsUpdatedAt: 50,
      updatedAt: 200,
    });
    expect(mergeSettings(stale, base)).toEqual({
      dayEndHour: 4,
      shouldTargetMin: null,
      weeklyCapMin: null,
      getReadySteps: water,
      getReadyStepsUpdatedAt: 50,
      updatedAt: 200,
    });
  });

  it('on an equal steps version with different lists, the incoming row wins, as on the server', () => {
    const a = { ...base, getReadySteps: water };
    const b = { ...base, getReadySteps: desk };
    expect(mergeSettings(a, b).getReadySteps).toBe(desk);
    expect(mergeSettings(b, a).getReadySteps).toBe(water);
    // A device that kept steps the server never got settles on the server's empty list.
    expect(mergeSettings(a, { ...base, getReadySteps: [] }).getReadySteps).toEqual([]);
  });

  it('a tie on the settings version with different values takes the incoming ones', () => {
    const other = { ...base, dayEndHour: 4 };
    expect(mergeSettings(base, other).dayEndHour).toBe(4);
    expect(mergeSettings(other, base).dayEndHour).toBe(base.dayEndHour);
  });

  it('returns the current settings itself when nothing is newer', () => {
    expect(mergeSettings(base, null)).toBe(base);
    expect(mergeSettings(base, { ...base })).toBe(base);
    expect(mergeSettings(base, { ...base, updatedAt: 99, getReadyStepsUpdatedAt: 49, getReadySteps: desk })).toBe(base);
  });
});

describe('mergeIncoming', () => {
  it('stamps a merged Get ready day above the time of the merge, so the next push sends it', () => {
    const current: Snapshot = {
      entries: [],
      items: [],
      practices: [],
      getReadyDays: [{ id: TODAY, done: ['water'], skipped: false, updatedAt: 10 }],
      settings: { ...NO_SETTINGS },
    };
    const next = mergeIncoming(
      current,
      { entries: [], items: [], practices: [], settings: null, getReadyDays: [{ id: TODAY, done: ['desk'], skipped: false, updatedAt: 20 }] },
      5000,
    );
    expect(next.getReadyDays).toEqual([{ id: TODAY, done: ['desk', 'water'], skipped: false, updatedAt: 5001 }]);
  });
});
