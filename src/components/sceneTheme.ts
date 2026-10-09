export type SceneMode = 'rest' | 'should' | 'want';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';

/** Northern hemisphere, by calendar month. */
export function seasonOf(d: Date): Season {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

export function timeOfDayOf(d: Date): TimeOfDay {
  const h = d.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  return 'night';
}

export const PAPER = '#EDE6D3';
export const FOREST = '#2F6B4A';
export const RED = '#D9503A';
export const MOSS = '#86B594';
export const PINK = '#EFC1C8';

export const BASE = {
  rest: { sky: '#0F2418', hill: '#0A1A11', city: '#050D08', sun: PAPER, ink: PAPER },
  should: { sky: FOREST, hill: '#25563B', city: '#0B1F15', sun: PAPER, ink: PAPER },
  want: { sky: PAPER, hill: '#D9D0B8', city: '#1F4A33', sun: RED, ink: '#06120B' },
} as const;

/** The ink to set text in over a scene, so callers don't repeat the sky logic. */
export function sceneInk(mode: SceneMode, time: TimeOfDay): string {
  return mode === 'want' && time === 'night' ? PAPER : BASE[mode].ink;
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

/** Deterministic pseudo-random in 0..1, so particles don't jump on every render. */
export function rnd(i: number, k: number): number {
  return ((i * 9301 + k * 49297) % 233280) / 233280;
}
