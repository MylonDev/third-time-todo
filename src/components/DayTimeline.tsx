import { useRef, useState } from 'react';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { useProjects } from '../store/projects';
import { useTasks } from '../store/tasks';
import { useNow } from '../hooks/useNow';
import { dayStartOf, dayEndOf, formatDuration } from '../utils/thirdTime';
import { durationOf } from '../utils/ledger';
import { EntryEditor, type EntryDraft } from './EntryEditor';
import type { TimeEntry } from '../types';

const HOUR = 3_600_000;
const HOUR_PX = 44;
const SNAP = 5 * 60_000;
/** A block shorter than this would be an unreadable sliver; draw it at least this tall. */
const MIN_BLOCK_PX = 6;

function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function floorHour(t: number): number {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function ceilHour(t: number): number {
  const f = floorHour(t);
  return f === t ? t : f + HOUR;
}

/**
 * One day as a vertical wall-clock column (spec 2.1). Blocks are placed and
 * sized by their own start and end, coloured by project; untracked stretches
 * are empty rail. The running timer, if it belongs to this day, is drawn as a
 * block that grows on the shared second clock.
 */
export function DayTimeline({ date, entries, isToday }: { date: string; entries: TimeEntry[]; isToday: boolean }) {
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const projects = useProjects((s) => s.projects);
  const tasks = useTasks((s) => s.tasks);
  const timerState = useSession((s) => s.timerState);
  const timerStart = useSession((s) => s.timerStart);
  const activeProjectId = useSession((s) => s.activeProjectId);

  const running = isToday && timerState !== 'idle' && timerStart !== null;
  const now = useNow(isToday);
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [ghost, setGhost] = useState<{ from: number; to: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);

  const dayStart = dayStartOf(date, dayEndHour);
  const dayEnd = dayEndOf(date, dayEndHour);
  const blocks = [...entries].sort((a, b) => a.startedAt - b.startedAt);

  // The window drawn: an hour either side of what happened, inside the day.
  // An empty day shows a plausible working stretch, so there is rail to drag.
  const edges = [
    ...blocks.flatMap((e) => [e.startedAt, e.endedAt]),
    ...(running ? [timerStart!, now] : []),
    ...(isToday ? [now] : []),
  ];
  const fallback = isToday
    ? [now - 3 * HOUR, now + HOUR]
    : [dayStart + (9 - dayEndHour) * HOUR, dayStart + (18 - dayEndHour) * HOUR];
  const lo = edges.length > 0 ? Math.min(...edges) - HOUR : fallback[0];
  const hi = edges.length > 0 ? Math.max(...edges) + HOUR : fallback[1];
  const viewStart = Math.max(dayStart, floorHour(Math.min(lo, fallback[0])));
  const viewEnd = Math.min(dayEnd, ceilHour(Math.max(hi, viewStart + 4 * HOUR)));
  const px = (t: number) => ((t - viewStart) / HOUR) * HOUR_PX;
  const height = px(viewEnd);

  const hours: number[] = [];
  for (let t = ceilHour(viewStart); t <= viewEnd; t += HOUR) hours.push(t);

  const colorOf = (e: { kind: string; projectId?: string; taskId?: string }) => {
    if (e.kind === 'break') return 'var(--color-rest)';
    const owner = e.projectId ?? tasks.find((t) => t.id === e.taskId)?.projectId;
    return projects.find((p) => p.id === owner)?.color ?? 'var(--color-accent)';
  };

  const describe = (e: TimeEntry) => {
    const project = projects.find((p) => p.id === e.projectId)?.name;
    const task = tasks.find((t) => t.id === e.taskId)?.title;
    return [project, task].filter(Boolean).join(' · ');
  };

  // ── Drag on empty rail to add a block ──────────────────────────────────────

  const timeAt = (clientY: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    const t = viewStart + ((clientY - rect.top) / HOUR_PX) * HOUR;
    const snapped = Math.round(t / SNAP) * SNAP;
    return Math.max(viewStart, Math.min(viewEnd, snapped));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== railRef.current) return; // on a block, not the rail
    const t = timeAt(e.clientY);
    dragFrom.current = t;
    setGhost({ from: t, to: t });
    railRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragFrom.current === null) return;
    const t = timeAt(e.clientY);
    setGhost({ from: Math.min(dragFrom.current, t), to: Math.max(dragFrom.current, t) });
  };

  const onPointerUp = () => {
    if (dragFrom.current === null || !ghost) return;
    const { from, to } = ghost;
    dragFrom.current = null;
    setGhost(null);
    // A tap rather than a drag still means "something happened here" — offer
    // a half-hour block starting at that point.
    const span = to - from >= SNAP ? { from, to } : { from, to: Math.min(from + 30 * 60_000, viewEnd) };
    setEditing({ kind: 'work', startedAt: span.from, endedAt: span.to, projectId: activeProjectId });
  };

  const addFromButton = () => {
    const last = blocks[blocks.length - 1];
    const end = isToday ? Math.min(now, running ? timerStart! : now) : dayStart + (10 - dayEndHour) * HOUR;
    const start = Math.max(last && last.endedAt < end ? last.endedAt : end - 30 * 60_000, dayStart);
    setEditing({ kind: 'work', startedAt: Math.floor(start / 60_000) * 60_000, endedAt: Math.floor(end / 60_000) * 60_000 });
  };

  const workBlocks = blocks.filter((e) => e.kind === 'work');
  const longest = workBlocks.length > 0 ? Math.max(...workBlocks.map(durationOf)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        <span>
          {workBlocks.length} block{workBlocks.length === 1 ? '' : 's'}
          {longest > 0 && (
            <>
              {' '}· longest <span className="num">{formatDuration(longest)}</span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={addFromButton}
          className="rounded-lg border px-2 py-0.5 text-xs font-semibold"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          + Add block
        </button>
      </div>

      <div className="flex gap-2 py-2" data-testid="day-timeline">
        {/* Hour gutter */}
        <div className="relative w-16 flex-shrink-0" style={{ height }} aria-hidden="true">
          {hours.map((t) => (
            <span
              key={t}
              className="num absolute right-0 -translate-y-1/2 whitespace-nowrap text-[10px] leading-none"
              style={{ top: px(t), color: 'var(--color-text-muted)' }}
            >
              {clockLabel(t)}
            </span>
          ))}
        </div>

        {/* The rail */}
        <div
          ref={railRef}
          role="group"
          aria-label="Day timeline — drag on empty space to add a block"
          className="relative flex-1 rounded-lg touch-none select-none cursor-crosshair"
          style={{ height, background: 'var(--color-surface)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { dragFrom.current = null; setGhost(null); }}
        >
          {hours.map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 border-t pointer-events-none"
              style={{ top: px(t), borderColor: 'var(--color-border)', opacity: 0.6 }}
            />
          ))}

          {blocks.map((e) => {
            const top = px(Math.max(e.startedAt, viewStart));
            const h = Math.max(px(Math.min(e.endedAt, viewEnd)) - top, MIN_BLOCK_PX);
            const what = describe(e);
            const kindLabel = e.kind === 'work' ? 'Active' : 'Rest';
            return (
              <button
                key={e.id}
                type="button"
                data-testid="timeline-block"
                data-kind={e.kind}
                onClick={() => setEditing(e)}
                aria-label={`${kindLabel} block, ${clockLabel(e.startedAt)} to ${clockLabel(e.endedAt)}${what ? `, ${what}` : ''}`}
                className="absolute left-1 right-1 rounded-md px-2 text-left overflow-hidden cursor-pointer"
                style={{
                  top,
                  height: h,
                  background: colorOf(e),
                  opacity: e.kind === 'work' ? 0.9 : 0.6,
                  color: 'var(--color-bg)',
                }}
              >
                {h >= 18 && (
                  <span className="block truncate text-[11px] font-semibold leading-[18px]">
                    {what || kindLabel} · <span className="num">{formatDuration(durationOf(e))}</span>
                  </span>
                )}
              </button>
            );
          })}

          {running && (
            <div
              data-testid="live-block"
              aria-label={`${timerState === 'working' ? 'Active' : 'Rest'} now, since ${clockLabel(timerStart!)}`}
              className="absolute left-1 right-1 rounded-md pointer-events-none"
              style={{
                top: px(timerStart!),
                height: Math.max(px(now) - px(timerStart!), MIN_BLOCK_PX),
                border: `1.5px dashed ${colorOf({ kind: timerState === 'working' ? 'work' : 'break', projectId: activeProjectId })}`,
                background: 'transparent',
              }}
            />
          )}

          {isToday && now >= viewStart && now <= viewEnd && (
            <div
              className="absolute left-0 right-0 border-t pointer-events-none"
              style={{ top: px(now), borderColor: 'var(--color-debt)' }}
              aria-hidden="true"
            />
          )}

          {ghost && ghost.to > ghost.from && (
            <div
              className="absolute left-1 right-1 rounded-md pointer-events-none"
              style={{
                top: px(ghost.from),
                height: px(ghost.to) - px(ghost.from),
                background: 'var(--color-accent-dim)',
                border: '1px solid var(--color-accent)',
              }}
            />
          )}
        </div>
      </div>

      {editing && <EntryEditor date={date} entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
