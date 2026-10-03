/** Synthesised sound-effect recipes. All original, generated at runtime (no files needed offline). */

export type SfxName =
  | 'tap'
  | 'press'
  | 'pop'
  | 'bounce'
  | 'whoosh'
  | 'kick'
  | 'net'
  | 'post'
  | 'goalHorn'
  | 'star'
  | 'starLand'
  | 'coin'
  | 'softBump'
  | 'power'
  | 'zap'
  | 'portal'
  | 'chest'
  | 'unlock'
  | 'nitro'
  | 'whistle'
  | 'sparkle'
  | 'cheer'
  | 'fanfare'
  | 'swoosh'
  | 'thud'
  | 'boing'
  | 'click'
  | 'beep'
  | 'go'
  | 'magic';

export interface SfxOpts {
  /** semitone offset (e.g. counting pops rise in pitch) */
  pitch?: number;
  volume?: number;
  delay?: number;
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
  curve?: 'exp' | 'lin';
}

function tone(ctx: AudioContext, out: AudioNode, o: ToneOpts) {
  const t = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) {
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.freqEnd, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + o.dur);
  }
  const v = o.vol ?? 0.3;
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
}

function noise(ctx: AudioContext, out: AudioNode, buf: AudioBuffer, o: NoiseOpts) {
  const t = ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 1;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  const offset = Math.random() * Math.max(0, buf.duration - o.dur - 0.1);
  src.start(t, offset, o.dur + 0.05);
}

const st = (semi: number) => Math.pow(2, semi / 12);

export function playSfx(ctx: AudioContext, bus: AudioNode, nb: AudioBuffer, name: SfxName, opts: SfxOpts) {
  const out = ctx.createGain();
  out.gain.value = opts.volume ?? 1;
  out.connect(bus);
  const p = st(opts.pitch ?? 0);
  const d = opts.delay ?? 0;
  switch (name) {
    case 'tap':
    case 'click':
      tone(ctx, out, { type: 'triangle', freq: 900 * p, freqEnd: 600 * p, dur: 0.07, vol: 0.18, delay: d });
      break;
    case 'press':
      tone(ctx, out, { type: 'square', freq: 320 * p, freqEnd: 180 * p, dur: 0.08, vol: 0.08, delay: d });
      tone(ctx, out, { type: 'sine', freq: 660 * p, dur: 0.1, vol: 0.12, delay: d + 0.03 });
      break;
    case 'pop':
      tone(ctx, out, { type: 'sine', freq: 520 * p, freqEnd: 980 * p, dur: 0.14, vol: 0.32, delay: d });
      tone(ctx, out, { type: 'triangle', freq: 1040 * p, dur: 0.12, vol: 0.1, delay: d + 0.04 });
      break;
    case 'bounce':
    case 'boing':
      tone(ctx, out, { type: 'sine', freq: 180 * p, freqEnd: 420 * p, dur: 0.22, vol: 0.32, delay: d, curve: 'lin' });
      tone(ctx, out, { type: 'sine', freq: 90 * p, freqEnd: 60 * p, dur: 0.12, vol: 0.3, delay: d });
      break;
    case 'whoosh':
    case 'swoosh':
      noise(ctx, out, nb, { type: 'bandpass', freq: 400, freqEnd: 2600, q: 1.4, dur: 0.38, vol: 0.32, attack: 0.12, delay: d });
      break;
    case 'kick':
      tone(ctx, out, { type: 'sine', freq: 150, freqEnd: 45, dur: 0.22, vol: 0.9, delay: d });
      noise(ctx, out, nb, { type: 'lowpass', freq: 1800, dur: 0.06, vol: 0.5, delay: d });
      break;
    case 'thud':
      tone(ctx, out, { type: 'sine', freq: 110, freqEnd: 50, dur: 0.18, vol: 0.6, delay: d });
      break;
    case 'net':
      noise(ctx, out, nb, { type: 'highpass', freq: 1800, dur: 0.45, vol: 0.4, attack: 0.01, delay: d });
      noise(ctx, out, nb, { type: 'bandpass', freq: 600, q: 0.8, dur: 0.3, vol: 0.4, delay: d });
      break;
    case 'post':
      tone(ctx, out, { type: 'triangle', freq: 1250, dur: 0.6, vol: 0.25, delay: d });
      tone(ctx, out, { type: 'sine', freq: 1870, dur: 0.4, vol: 0.12, delay: d });
      break;
    case 'goalHorn':
      for (const [f, dl] of [[233, 0], [311, 0], [233, 0.55], [311, 0.55]] as const) {
        tone(ctx, out, { type: 'sawtooth', freq: f, dur: 0.5, vol: 0.12, attack: 0.04, delay: d + dl });
      }
      break;
    case 'star':
      [0, 4, 7, 12].forEach((s, i) => tone(ctx, out, { type: 'triangle', freq: 880 * st(s) * p, dur: 0.25, vol: 0.18, delay: d + i * 0.05 }));
      break;
    case 'starLand':
      tone(ctx, out, { type: 'sine', freq: 1568 * p, dur: 0.18, vol: 0.2, delay: d });
      tone(ctx, out, { type: 'triangle', freq: 2093 * p, dur: 0.14, vol: 0.12, delay: d + 0.03 });
      break;
    case 'coin':
      tone(ctx, out, { type: 'square', freq: 988 * p, dur: 0.08, vol: 0.12, delay: d });
      tone(ctx, out, { type: 'square', freq: 1319 * p, dur: 0.3, vol: 0.12, delay: d + 0.07 });
      break;
    case 'softBump':
      tone(ctx, out, { type: 'sine', freq: 260, freqEnd: 200, dur: 0.18, vol: 0.28, delay: d });
      tone(ctx, out, { type: 'sine', freq: 196, freqEnd: 160, dur: 0.22, vol: 0.2, delay: d + 0.12 });
      break;
    case 'power':
      tone(ctx, out, { type: 'sawtooth', freq: 160 * p, freqEnd: 1100 * p, dur: 0.75, vol: 0.12, attack: 0.05, delay: d });
      tone(ctx, out, { type: 'sine', freq: 320 * p, freqEnd: 2200 * p, dur: 0.75, vol: 0.12, attack: 0.05, delay: d });
      break;
    case 'zap':
      tone(ctx, out, { type: 'sawtooth', freq: 1800, freqEnd: 120, dur: 0.35, vol: 0.18, delay: d });
      noise(ctx, out, nb, { type: 'bandpass', freq: 3000, freqEnd: 600, q: 2, dur: 0.3, vol: 0.25, delay: d });
      break;
    case 'portal':
      tone(ctx, out, { type: 'sine', freq: 200, freqEnd: 800, dur: 0.9, vol: 0.2, attack: 0.2, delay: d });
      tone(ctx, out, { type: 'triangle', freq: 300, freqEnd: 1200, dur: 0.9, vol: 0.12, attack: 0.2, delay: d + 0.05 });
      noise(ctx, out, nb, { type: 'bandpass', freq: 500, freqEnd: 3000, q: 3, dur: 0.9, vol: 0.18, attack: 0.3, delay: d });
      break;
    case 'chest':
      tone(ctx, out, { type: 'square', freq: 120, freqEnd: 90, dur: 0.15, vol: 0.12, delay: d });
      [0, 4, 7, 11, 14].forEach((s, i) => tone(ctx, out, { type: 'triangle', freq: 523 * st(s), dur: 0.5, vol: 0.14, delay: d + 0.15 + i * 0.07 }));
      break;
    case 'unlock':
    case 'magic':
      [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(ctx, out, { type: 'sine', freq: 659 * st(s) * p, dur: 0.4, vol: 0.14, delay: d + i * 0.06 }));
      break;
    case 'nitro':
      noise(ctx, out, nb, { type: 'bandpass', freq: 300, freqEnd: 2400, q: 0.8, dur: 1.0, vol: 0.5, attack: 0.05, delay: d });
      tone(ctx, out, { type: 'sawtooth', freq: 90, freqEnd: 260, dur: 0.9, vol: 0.15, delay: d });
      break;
    case 'whistle':
      tone(ctx, out, { type: 'sine', freq: 2600, dur: 0.18, vol: 0.18, delay: d });
      tone(ctx, out, { type: 'sine', freq: 2600, dur: 0.45, vol: 0.18, delay: d + 0.22 });
      break;
    case 'sparkle':
      for (let i = 0; i < 5; i++) tone(ctx, out, { type: 'sine', freq: (1800 + Math.random() * 1600) * p, dur: 0.15, vol: 0.07, delay: d + i * 0.045 });
      break;
    case 'cheer':
      noise(ctx, out, nb, { type: 'bandpass', freq: 1200, q: 0.7, dur: 2.4, vol: 0.45, attack: 0.12, delay: d });
      noise(ctx, out, nb, { type: 'bandpass', freq: 2600, q: 1.2, dur: 1.8, vol: 0.25, attack: 0.1, delay: d });
      break;
    case 'fanfare':
      [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.6], [12, 0.72]].forEach(([s, t]) => {
        tone(ctx, out, { type: 'square', freq: 523 * st(s), dur: 0.22, vol: 0.09, delay: d + t });
        tone(ctx, out, { type: 'triangle', freq: 523 * st(s), dur: 0.3, vol: 0.14, delay: d + t });
      });
      break;
    case 'beep':
      tone(ctx, out, { type: 'square', freq: 660, dur: 0.15, vol: 0.1, delay: d });
      break;
    case 'go':
      tone(ctx, out, { type: 'square', freq: 1320, dur: 0.4, vol: 0.12, delay: d });
      break;
  }
  setTimeout(() => out.disconnect(), ((d ?? 0) + 3) * 1000);
}
