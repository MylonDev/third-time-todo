import type { Mode } from '../types';
import type { PaceVerdict } from './pace';

/** Easiest to hardest — the order "raise" and "ease" move along. */
export const MODES: Mode[] = ['half', 'third', 'quarter'];

const harder = (m: Mode) => MODES[Math.min(MODES.length - 1, MODES.indexOf(m) + 1)];
const easier = (m: Mode) => MODES[Math.max(0, MODES.indexOf(m) - 1)];

/**
 * What the pace band suggests for today (spec 4.2). No new heuristic: below
 * your band → one step harder than yesterday, above → one step easier, within
 * → yesterday's again. Nothing before there is a band to read.
 */
export function recommendMode(verdict: PaceVerdict, yesterday: Mode): Mode | null {
  if (verdict === 'below') return harder(yesterday);
  if (verdict === 'above') return easier(yesterday);
  if (verdict === 'within') return yesterday;
  return null;
}
