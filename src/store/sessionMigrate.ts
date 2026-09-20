import type { DailyState, HistoryEntry, Mode, TimeEntry } from '../types';

/** A `SessionLog` as `tt-session` v3 and earlier persisted it. */
export interface LegacySessionLog {
  id: string;
  workMs: number;
  breakMs: number;
  mode: Mode;
  startedAt: number;
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * One old log fused a work stint and the break that followed it. The timeline
 * needs them as two wall-clock blocks:
 *
 *   work:  [startedAt,          startedAt + workMs]
 *   break: [startedAt + workMs, startedAt + workMs + breakMs]
 *
 * A zero-length half is dropped rather than stored as a point in time.
 */
export function splitSessionLog(log: LegacySessionLog): TimeEntry[] {
  const out: TimeEntry[] = [];
  const workEnd = log.startedAt + (log.workMs ?? 0);
  if ((log.workMs ?? 0) > 0) {
    out.push({ id: newId(), kind: 'work', startedAt: log.startedAt, endedAt: workEnd, mode: log.mode });
  }
  if ((log.breakMs ?? 0) > 0) {
    out.push({ id: newId(), kind: 'break', startedAt: workEnd, endedAt: workEnd + log.breakMs, mode: log.mode });
  }
  return out;
}

interface LegacyState {
  daily?: { date?: string; sessions?: LegacySessionLog[] };
  history?: (Omit<HistoryEntry, 'entries'> & { sessions?: LegacySessionLog[] })[];
}

export function migrateSessionV3(persisted: unknown): { daily: DailyState; history: HistoryEntry[] } {
  const s = (persisted ?? {}) as LegacyState;
  const daily: DailyState = {
    date: s.daily?.date ?? '',
    entries: (s.daily?.sessions ?? []).flatMap(splitSessionLog),
  };
  const history: HistoryEntry[] = (s.history ?? []).map((h) => ({
    date: h.date,
    totalWorkMs: h.totalWorkMs,
    totalBreakMs: h.totalBreakMs,
    unusedRestMs: h.unusedRestMs,
    entries: (h.sessions ?? []).flatMap(splitSessionLog),
  }));
  return { daily, history };
}
