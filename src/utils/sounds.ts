export type SoundType = 'break-end' | 'one-minute' | 'bank-empty' | 'work-reminder';

interface Tone {
  freq: number;
  startTime: number;
  duration: number;
  volume?: number;
}

function playTones(tones: Tone[]): void {
  try {
    const ctx = new AudioContext();
    tones.forEach(({ freq, startTime, duration, volume = 0.3 }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + duration);
      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration + 0.05);
    });
  } catch {
    // AudioContext not available (e.g., test environment)
  }
}

export function playSound(type: SoundType): void {
  switch (type) {
    // Break timer has ended — two pleasant mid tones
    case 'break-end':
      playTones([
        { freq: 523, startTime: 0, duration: 0.2 },    // C5
        { freq: 659, startTime: 0.25, duration: 0.3 },  // E5
      ]);
      break;

    // 1 minute of break remaining — three quick high pings
    case 'one-minute':
      playTones([
        { freq: 880, startTime: 0,    duration: 0.12 }, // A5
        { freq: 880, startTime: 0.18, duration: 0.12 },
        { freq: 880, startTime: 0.36, duration: 0.12 },
      ]);
      break;

    // Break bank is empty (0:00) — low descending tone
    case 'bank-empty':
      playTones([
        { freq: 440, startTime: 0,    duration: 0.25 }, // A4
        { freq: 330, startTime: 0.28, duration: 0.35 }, // E4
      ]);
      break;

    // Long work reminder — gentle single chime
    case 'work-reminder':
      playTones([
        { freq: 528, startTime: 0, duration: 0.4, volume: 0.2 },
      ]);
      break;
  }
}
