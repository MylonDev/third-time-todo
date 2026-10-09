import { useMemo } from 'react';
import {
  BASE,
  FOREST,
  MOSS,
  PAPER,
  PINK,
  RED,
  mix,
  rnd,
  type SceneMode,
  type Season,
  type TimeOfDay,
  type Weather,
} from './sceneTheme';

const BUILDINGS = [
  [0, 238, 40, 72], [40, 258, 30, 52], [70, 228, 36, 82], [106, 252, 28, 58], [134, 242, 44, 68],
  [178, 264, 26, 46], [204, 234, 38, 76], [242, 254, 32, 56], [274, 224, 40, 86], [314, 248, 44, 62],
] as const;
const WINDOWS = [[10, 250], [24, 266], [80, 240], [92, 262], [146, 256], [214, 248], [226, 270], [284, 238], [296, 262]] as const;
const STARS = [[210, 24], [250, 52], [286, 20], [326, 44], [300, 96], [340, 110], [230, 120], [270, 140], [120, 130], [60, 150]] as const;
const SPOTS = [[346, 14], [332, 19], [318, 26], [306, 36], [296, 44], [284, 54], [272, 60], [258, 64], [244, 66], [300, 60], [292, 72], [312, 48], [274, 44], [262, 36], [336, 34]] as const;
const CLOUD_SETS: Record<Weather, readonly (readonly [number, number, number, number])[]> = {
  clear: [[150, 118, 80, 10], [172, 106, 46, 10], [250, 150, 60, 9]],
  cloudy: [[10, 110, 120, 16], [40, 96, 70, 16], [150, 120, 130, 16], [170, 106, 80, 16], [240, 90, 100, 16], [60, 160, 110, 14], [210, 170, 120, 14]],
  rain: [[0, 60, 150, 22], [40, 44, 90, 22], [120, 80, 160, 22], [170, 60, 120, 22], [250, 90, 108, 22], [0, 110, 110, 20], [210, 120, 148, 20]],
  snow: [[10, 110, 120, 16], [40, 96, 70, 16], [150, 120, 130, 16], [240, 90, 100, 16], [60, 160, 110, 14]],
  fog: [],
};

interface Particle {
  x: number;
  y: number;
  cls: string;
  dur: string;
  delay: string;
  rx: number;
  ry: number;
  fill: string;
  op: number;
}

/**
 * The timer's backdrop: a flat print of a town under power lines, Mount Fuji
 * behind it. The sun (or the moon after dark) climbs as the day's Should target
 * fills. Mode sets the colour family, season sets the branch and what drifts
 * down, time of day sets the light, weather sets the sky.
 */
export function Scene({
  mode,
  progress,
  season,
  time,
  weather = 'clear',
}: {
  mode: SceneMode;
  /** 0..1, how far the sun has climbed. */
  progress: number;
  season: Season;
  time: TimeOfDay;
  weather?: Weather;
}) {
  const d = useMemo(() => {
    const want = mode === 'want';
    const base = BASE[mode];
    const night = time === 'night';
    const dusk = time === 'dusk';
    const dawn = time === 'dawn';
    const dark = !want;
    const darken = { dawn: 0.12, day: 0, dusk: 0.22, night: 0.55 }[time] * (mode === 'rest' ? 0.5 : 1);
    let sky = mix(base.sky, want ? '#13261C' : '#000000', darken);
    const grey = want ? '#B9B3A0' : '#3A4A40';
    const greyAmt = { clear: 0, cloudy: 0.25, rain: 0.4, snow: 0.2, fog: 0 }[weather];
    if (greyAmt) sky = mix(sky, grey, greyAmt);
    if (weather === 'fog') sky = mix(sky, want ? '#FFFFFF' : PAPER, 0.35);
    const hill = weather === 'fog' ? mix(base.hill, sky, 0.5) : base.hill;
    const mountain = mix(hill, sky, weather === 'fog' ? 0.7 : 0.4);
    const clearish = weather === 'clear' || weather === 'cloudy';

    const p = Math.max(0, Math.min(1, progress));
    const ornaments = SPOTS.map((s, i) => ({
      x: s[0],
      y: s[1],
      kind: season === 'autumn' ? 'maple' : season === 'winter' ? (i % 3 === 0 ? 'snow' : 'none') : 'round',
      r: season === 'spring' ? 3 + (i % 3) : 4 + (i % 2),
      fill: season === 'spring' ? PINK : season === 'summer' ? MOSS : season === 'autumn' ? RED : PAPER,
    }));

    const particles: Particle[] = [];
    const add = (n: number, mk: (i: number, a: number, b: number, c: number) => Particle) => {
      for (let i = 0; i < n; i++) particles.push(mk(i, rnd(i, 1), rnd(i, 2), rnd(i, 3)));
    };
    if (weather === 'rain') {
      add(24, (_i, a, b, c) => ({ x: Math.round(a * 380) - 10, y: 0, cls: 'scene-rain', dur: (0.8 + b * 0.5).toFixed(2), delay: (-c * 1.5).toFixed(2), rx: 0.8, ry: 7, fill: dark ? PAPER : FOREST, op: 0.5 }));
    } else if (weather === 'snow') {
      add(22, (_i, a, b, c) => ({ x: Math.round(a * 358), y: 0, cls: 'scene-snow', dur: (6 + b * 4).toFixed(2), delay: (-c * 8).toFixed(2), rx: 1.6 + b * 1.4, ry: 1.6 + b * 1.4, fill: dark ? PAPER : FOREST, op: dark ? 0.9 : 0.55 }));
    } else if (clearish && !night && season === 'spring') {
      add(9, (_i, a, b, c) => ({ x: Math.round(150 + a * 208), y: 0, cls: 'scene-petal', dur: (9 + b * 4).toFixed(2), delay: (-c * 11).toFixed(2), rx: 3, ry: 2, fill: PINK, op: 0.95 }));
    } else if (clearish && !night && season === 'autumn') {
      add(8, (_i, a, b, c) => ({ x: Math.round(150 + a * 208), y: 0, cls: 'scene-petal', dur: (9 + b * 4).toFixed(2), delay: (-c * 11).toFixed(2), rx: 3.2, ry: 2.4, fill: RED, op: 0.95 }));
    } else if (clearish && season === 'summer' && (night || dusk)) {
      add(8, (_i, a, b, c) => ({ x: Math.round(a * 330) + 10, y: Math.round(170 + b * 90), cls: 'scene-float', dur: (3 + c * 3).toFixed(2), delay: (-c * 4).toFixed(2), rx: 1.8, ry: 1.8, fill: '#CFE8A8', op: 1 }));
    }

    return {
      sky,
      hill,
      mountain,
      city: base.city,
      ink: base.ink,
      glow: dusk || want ? RED : PAPER,
      glowOn: (dawn || dusk) && weather !== 'rain' && weather !== 'fog',
      starOp: night && clearish ? (weather === 'clear' ? 0.85 : 0.4) : 0,
      celX: 70 + 218 * p,
      celY: 218 - 140 * p,
      celColor: night ? PAPER : dusk ? RED : base.sun,
      celOp: { clear: 1, cloudy: 0.85, rain: 0, snow: 0.35, fog: 0.5 }[weather],
      night,
      clouds: CLOUD_SETS[weather],
      cloudFill:
        weather === 'rain'
          ? dark ? 'rgba(0,0,0,0.3)' : 'rgba(47,107,74,0.3)'
          : dark ? 'rgba(237,230,211,0.22)' : 'rgba(47,107,74,0.14)',
      litOp: { dawn: 0.7, day: 0.25, dusk: 0.9, night: 1 }[time],
      snowCaps: season === 'winter' ? BUILDINGS.filter((_, i) => i % 2 === 0) : [],
      birds: (dawn || time === 'day') && clearish ? [[96, 150, 1.1], [118, 140, 0.8], [140, 154, 0.9]] : [],
      ornaments,
      particles,
      fog: weather === 'fog' ? [150, 196, 244] : [],
      fogFill: want ? 'rgba(47,107,74,0.10)' : 'rgba(237,230,211,0.18)',
    };
  }, [mode, progress, season, time, weather]);

  const t = (props: string) => `${props} .7s`;

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 358 310"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="358" height="310" style={{ fill: d.sky, transition: 'fill .7s cubic-bezier(.2,.8,.2,1)' }} />
      <ellipse cx="179" cy="236" rx="270" ry="84" style={{ fill: d.glow, opacity: d.glowOn ? 0.3 : 0, transition: `${t('fill')},${t('opacity')}` }} />
      <g fill={PAPER} style={{ opacity: d.starOp, transition: t('opacity') }}>
        {STARS.map((s, i) => (
          <circle key={i} cx={s[0]} cy={s[1]} r={i % 3 === 0 ? 1.8 : 1.2} />
        ))}
      </g>
      <g
        style={{
          transform: `translate(${d.celX}px, ${d.celY}px)`,
          opacity: d.celOp,
          transition: 'transform 1.2s cubic-bezier(.3,.8,.3,1), opacity .7s',
        }}
      >
        <circle r="52" style={{ fill: d.celColor, opacity: 0.14, transition: t('fill') }} />
        <circle r="36" style={{ fill: d.celColor, transition: t('fill') }} />
        {d.night && <circle cx="13" cy="-8" r="30" style={{ fill: d.sky, transition: t('fill') }} />}
      </g>
      <g className="scene-drift" style={{ fill: d.cloudFill, transition: t('fill') }}>
        {d.clouds.map((c, i) => (
          <rect key={i} x={c[0]} y={c[1]} width={c[2]} height={c[3]} rx={c[3] / 2} />
        ))}
      </g>
      <path d="M100 238L188 156Q210 138 232 156L320 238Z" style={{ fill: d.mountain, transition: t('fill') }} />
      <path d="M188 156Q210 138 232 156L222 163L214 154L208 165L200 157L194 165Z" fill={PAPER} opacity="0.92" />
      <path d="M0 232Q70 192 140 216T290 204T358 222V310H0Z" style={{ fill: d.hill, transition: t('fill') }} />
      <g style={{ fill: d.city, transition: t('fill') }}>
        {BUILDINGS.map((b, i) => (
          <rect key={i} x={b[0]} y={b[1]} width={b[2]} height={b[3]} />
        ))}
      </g>
      <g fill={PAPER} opacity="0.92">
        {d.snowCaps.map((b, i) => (
          <rect key={i} x={b[0]} y={b[1] - 2} width={b[2]} height="4" rx="2" />
        ))}
      </g>
      <g fill={PAPER} style={{ opacity: d.litOp, transition: t('opacity') }}>
        {WINDOWS.map((w, i) => (
          <rect key={i} x={w[0]} y={w[1]} width="4" height="5" />
        ))}
      </g>
      <g fill="none" style={{ stroke: d.city, transition: t('stroke') }}>
        <path d="M320 118V310" strokeWidth="4" />
        <path d="M302 136H338" strokeWidth="3" />
        <path d="M0 150Q120 196 320 136" strokeWidth="1.5" />
        <path d="M0 166Q130 210 320 144" strokeWidth="1.5" />
        <path d="M320 136Q342 148 358 138" strokeWidth="1.5" />
        <path d="M358 10Q318 24 290 48Q268 64 240 66" strokeWidth="3.2" />
        <path d="M306 36Q304 56 298 72" strokeWidth="2" />
        <path d="M284 54Q276 44 266 34" strokeWidth="2" />
        <path d="M318 26Q326 38 336 36" strokeWidth="2" />
      </g>
      <g className="scene-drift" fill="none" strokeWidth="1.4" strokeLinecap="round" style={{ stroke: d.city, transition: t('stroke') }}>
        {d.birds.map((b, i) => (
          <path key={i} d="M-5 0Q-2.5 -4 0 0Q2.5 -4 5 0" transform={`translate(${b[0]} ${b[1]}) scale(${b[2]})`} />
        ))}
      </g>
      {d.ornaments.map((o, i) => (
        <g key={i} transform={`translate(${o.x} ${o.y})`}>
          {o.kind === 'round' && <circle r={o.r} fill={o.fill} />}
          {o.kind === 'maple' && (
            <path d="M0 -6L1.6 -2.2L5.6 -3.2L3 0.6L4.4 4.6L0 2.6L-4.4 4.6L-3 0.6L-5.6 -3.2L-1.6 -2.2Z" fill={o.fill} />
          )}
          {o.kind === 'snow' && <rect x="-6" y="-5" width="12" height="4" rx="2" fill={o.fill} />}
        </g>
      ))}
      {d.particles.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <g className={p.cls} style={{ animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}>
            <ellipse rx={p.rx} ry={p.ry} style={{ fill: p.fill, opacity: p.op }} />
          </g>
        </g>
      ))}
      <g style={{ fill: d.fogFill }}>
        {d.fog.map((y) => (
          <rect key={y} className="scene-drift" x="-30" y={y} width="420" height="30" rx="15" />
        ))}
      </g>
      <rect x="8" y="8" width="342" height="294" rx="20" fill="none" strokeWidth="1" style={{ stroke: d.ink, strokeOpacity: 0.22, transition: t('stroke') }} />
      <g transform="rotate(-4 339 291)">
        <rect x="332" y="284" width="14" height="14" rx="2.5" fill={RED} />
        <circle cx="339" cy="291" r="2.6" fill={PAPER} />
      </g>
    </svg>
  );
}
