/** Local wall-clock "HH:MM" for an instant. */
export function toClockInput(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The instant an "HH:MM" names within the day `date`. A day that ends at
 * `dayEndHour` runs past midnight, so a time before that hour is on the next
 * calendar date — and, for an end time, exactly that hour is the day's end.
 */
export function fromClockInput(date: string, hhmm: string, dayEndHour: number, isEnd: boolean): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const minutes = hh * 60 + mm;
  const cutoff = dayEndHour * 60;
  const nextDay = minutes < cutoff || (isEnd && minutes === cutoff);
  return new Date(y, m - 1, d + (nextDay ? 1 : 0), hh, mm, 0, 0).getTime();
}
