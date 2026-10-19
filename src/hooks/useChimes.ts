import { useEffect, useMemo, useRef } from 'react';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import { timedEnd } from '../utils/ledger';
import { sendNotification } from '../utils/notifications';
import { playSound, type SoundType } from '../utils/sounds';
import { formatDuration } from '../utils/time';
import { useDay } from './useDay';

/** A line crossed longer ago than this is stale news, e.g. after reopening the app. */
const FRESH_MS = 60_000;

function announce(sound: SoundType, title: string, body: string) {
  playSound(sound);
  sendNotification(title, body);
}

/**
 * Awareness, not enforcement: a chime and a notification when a Timed session
 * runs out, and once when running Rest crosses from credit into debt. Nothing
 * stops or switches by itself. This covers the app while it is open.
 */
export function useChimes() {
  const { now, running, balance } = useDay();
  const entries = useTimer((s) => s.entries);
  const sounds = useSettings((s) => s.sounds);

  // The latest Timed session that ran its full length. One stopped early is not announced.
  const finished = useMemo(() => {
    let latest: (typeof entries)[number] | undefined;
    for (const e of entries) {
      if (e.deletedAt !== undefined || e.state !== 'timed') continue;
      if (e.endedAt !== null && e.endedAt < timedEnd(e)) continue;
      if (!latest || e.startedAt > latest.startedAt) latest = e;
    }
    return latest;
  }, [entries]);

  const chimedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || chimedFor.current === finished.id) return;
    const end = timedEnd(finished);
    if (now < end || now - end > FRESH_MS) return;
    // Once per session, even with sounds off, so turning them on later doesn't replay it.
    chimedFor.current = finished.id;
    if (!sounds) return;
    announce(
      'break-end',
      'Timed session done',
      `${formatDuration(finished.plannedMs ?? 0)} is up. Nothing switches by itself: keep going, rest or stop.`
    );
  }, [finished, now, sounds]);

  const lastBalance = useRef<number | null>(null);
  useEffect(() => {
    const before = lastBalance.current;
    lastBalance.current = balance;
    if (!sounds || before === null || running?.state !== 'want') return;
    // Rest spends the balance second for second, so a crossing is -balance old.
    if (before >= 0 && balance < 0 && -balance <= FRESH_MS) {
      announce('bank-empty', 'Rest is in debt', 'Focus time pays it back.');
    }
  }, [balance, running, sounds]);
}
