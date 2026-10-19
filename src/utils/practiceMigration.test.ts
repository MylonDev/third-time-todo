import { describe, expect, it } from 'vitest';
import { targetOf, TEMPLATE_ORDER, type TemplateKey } from './practices';

const migrations = import.meta.glob<string>('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });

function migration(name: string): string {
  const sql = migrations[`../../supabase/migrations/${name}`];
  if (sql === undefined) throw new Error(`No migration ${name}`);
  return sql;
}

/** The `when '<level>' then <n>` pairs inside each `<column> = case ... end` (or `:=`) in the SQL. */
function casesFor(sql: string, column: string): Record<string, number>[] {
  const assignments = [...sql.matchAll(new RegExp(`\\b${column}\\s*:?=\\s*case\\s+([\\s\\S]*?)\\bend\\b`, 'g'))];
  return assignments.map((a) => Object.fromEntries([...a[1].matchAll(/when\s+'(\w+)'\s+then\s+(\d+)/g)].map((w) => [w[1], Number(w[2])])));
}

/** The number after `else` in the `<column> = case ... end`, which is what a paused (or unknown) level gets. */
function elseFor(sql: string, column: string): number {
  const m = new RegExp(`\\b${column}\\s*:?=\\s*case[\\s\\S]*?\\belse\\s+(\\d+)\\s+end\\b`).exec(sql);
  if (!m) throw new Error(`No else in the ${column} case`);
  return Number(m[1]);
}

// The SQL derives targets from the old level names. If a template changes, the
// migrations that carry old rows over have to say the same.
describe.each(['20261019190000_practice_targets.sql', '20261020120000_debt_sweep.sql'])('%s', (file) => {
  const sql = migration(file);
  const levels = TEMPLATE_ORDER.filter((t) => t !== 'paused');

  it.each([
    ['target_days', (level: TemplateKey) => targetOf(level).targetDays],
    ['target_min', (level: TemplateKey) => targetOf(level).targetMin],
  ] as const)('derives %s from the level as the templates do', (column, expected) => {
    const found = casesFor(sql, column);
    expect(found).toHaveLength(1);
    // Paused is the `else`; the four others are named.
    expect(Object.keys(found[0]).sort()).toEqual([...levels].sort());
    expect(found[0]).toEqual(Object.fromEntries(levels.map((level) => [level, expected(level)])));
    expect(elseFor(sql, column)).toBe(expected('paused'));
  });
});
