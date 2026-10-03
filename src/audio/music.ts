/**
 * Procedural music: each world has its own theme (tempo, key, chords, melody, groove).
 * A lookahead scheduler plays notes on the Web Audio clock; switching themes crossfades.
 * `intensity` (0..1) adds layers (hats, octave lead) — e.g. when Adam powers up a kick.
 */

export type MusicTheme = 'map' | 'football' | 'racing' | 'hero' | 'treasure' | 'closet' | 'rest' | 'title';

interface ThemeDef {
  bpm: number;
  root: number; // MIDI note of key root
  scale: number[]; // semitone offsets
  chords: number[][]; // per bar, scale-degree triads (semitones from root)
  melody: (number | null)[]; // 16th-note steps across 2 bars, scale degrees index (null = rest)
  bass: (number | null)[]; // 8 steps per bar, chord-tone index
  drums: { kick: number[]; snare: number[]; hat: number[] }; // 16 steps
  lead: OscillatorType;
  pad: boolean;
  volume: number;
}

const MAJ = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
const MIX = [0, 2, 4, 5, 7, 9, 10, 12, 14, 16];
const MIN = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15];

const I = [0, 4, 7], IV = [5, 9, 12], V = [7, 11, 14], vi = [9, 12, 16], ii = [2, 5, 9];
const i = [0, 3, 7], VI = [8, 12, 15], III = [3, 7, 10], VII = [10, 14, 17], iv = [5, 8, 12];

const THEMES: Record<MusicTheme, ThemeDef> = {
  title: {
    bpm: 112, root: 60, scale: MAJ, chords: [I, V, vi, IV], lead: 'triangle', pad: true, volume: 0.9,
    melody: [4, null, 4, 5, 7, null, 5, 4, 2, null, 4, null, 0, null, null, null, 4, null, 4, 5, 7, null, 9, 7, 5, null, 4, null, 2, null, null, null],
    bass: [0, null, 0, null, 2, null, 1, null],
    drums: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] },
  },
  map: {
    bpm: 118, root: 62, scale: MAJ, chords: [I, IV, V, I, vi, IV, ii, V], lead: 'triangle', pad: true, volume: 0.85,
    melody: [0, null, 2, null, 4, null, 7, null, 5, 4, 2, null, 4, null, null, null, 7, null, 5, 4, 5, null, 9, null, 7, null, 4, 2, 4, null, null, null],
    bass: [0, null, 2, null, 1, null, 2, null],
    drums: { kick: [0, 6, 8], snare: [4, 12], hat: [2, 6, 10, 14] },
  },
  football: {
    bpm: 132, root: 57, scale: MIX, chords: [I, [10, 14, 17], IV, I], lead: 'square', pad: false, volume: 0.8,
    melody: [7, null, 7, 9, 7, null, 4, null, 6, null, 4, 2, 0, null, null, null, 7, null, 7, 9, 10, null, 9, 7, 4, null, 6, null, 7, null, null, null],
    bass: [0, 0, null, 0, 2, null, 1, 0],
    drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  },
  racing: {
    bpm: 150, root: 52, scale: MIN, chords: [i, VI, III, VII], lead: 'sawtooth', pad: false, volume: 0.7,
    melody: [0, 2, 3, null, 4, null, 3, 2, 0, null, 6, null, 4, null, null, null, 0, 2, 3, null, 4, null, 7, 6, 4, null, 3, 2, 3, null, null, null],
    bass: [0, 0, 0, 0, 0, 0, 2, 1],
    drums: { kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  },
  hero: {
    bpm: 124, root: 55, scale: MAJ, chords: [I, [3, 7, 10], IV, I, I, [8, 12, 15], [10, 14, 17], V], lead: 'sawtooth', pad: true, volume: 0.75,
    melody: [0, null, null, 4, 7, null, null, null, 9, null, 7, null, 4, null, null, null, 0, null, null, 4, 7, null, 11, null, 12, null, null, null, null, null, null, null],
    bass: [0, null, 0, 2, null, 0, 1, null],
    drums: { kick: [0, 7, 8], snare: [4, 12], hat: [2, 6, 10, 14] },
  },
  treasure: {
    bpm: 104, root: 57, scale: MIN, chords: [i, iv, VII, III, VI, iv, V, i], lead: 'triangle', pad: true, volume: 0.85,
    melody: [0, null, 2, 3, 4, null, 3, null, 2, null, 0, null, null, null, 4, null, 5, null, 4, 3, 2, null, 0, null, 2, null, null, null, null, null, null, null],
    bass: [0, null, null, 2, 0, null, 1, null],
    drums: { kick: [0, 10], snare: [8], hat: [4, 12] },
  },
  closet: {
    bpm: 100, root: 65, scale: MAJ, chords: [I, vi, IV, V], lead: 'sine', pad: true, volume: 0.8,
    melody: [4, null, 2, null, 0, null, 2, 4, 4, null, 4, null, null, null, null, null, 2, null, 2, null, 2, null, 4, 7, 7, null, null, null, null, null, null, null],
    bass: [0, null, 2, null, 1, null, 2, null],
    drums: { kick: [0, 8], snare: [12], hat: [4, 12] },
  },
  rest: {
    bpm: 72, root: 60, scale: MAJ, chords: [I, IV, I, V], lead: 'sine', pad: true, volume: 0.7,
    melody: [4, null, null, null, 2, null, null, null, 0, null, null, null, null, null, null, null, 4, null, null, null, 5, null, 4, null, 2, null, null, null, null, null, null, null],
    bass: [0, null, null, null, 2, null, null, null],
    drums: { kick: [], snare: [], hat: [] },
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Track {
  out: GainNode;
  step = 0;
  nextTime = 0;
  constructor(public theme: MusicTheme, ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
  }
}

export class MusicPlayer {
  private current: Track | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intensity = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  get theme(): MusicTheme | null {
    return this.current?.theme ?? null;
  }

  play(theme: MusicTheme) {
    if (this.current?.theme === theme) return;
    const t = this.ctx.currentTime;
    const old = this.current;
    if (old) {
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => old.out.disconnect(), 2500);
    }
    const tr = new Track(theme, this.ctx, this.dest);
    tr.nextTime = t + 0.08;
    tr.out.gain.linearRampToValueAtTime(THEMES[theme].volume, t + 1.4);
    this.current = tr;
    this.intensity = 0;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.current) {
      const g = this.current.out.gain;
      g.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }
    this.current = null;
  }

  private schedule() {
    const tr = this.current;
    if (!tr || this.ctx.state !== 'running') return;
    const def = THEMES[tr.theme];
    const stepDur = 60 / def.bpm / 4;
    // resync after suspension
    if (tr.nextTime < this.ctx.currentTime - 0.2) tr.nextTime = this.ctx.currentTime + 0.05;
    while (tr.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(tr, def, tr.step, tr.nextTime, stepDur);
      tr.nextTime += stepDur;
      tr.step = (tr.step + 1) % (def.chords.length * 16);
    }
  }

  private playStep(tr: Track, def: ThemeDef, step: number, t: number, sd: number) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const chord = def.chords[bar % def.chords.length];
    const out = tr.out;
    const hot = this.intensity;

    // drums
    if (def.drums.kick.includes(s16)) this.kick(out, t);
    if (def.drums.snare.includes(s16)) this.snare(out, t);
    if (def.drums.hat.includes(s16) || (hot > 0.5 && s16 % 2 === 1 && def.drums.hat.length)) this.hat(out, t, s16 % 4 === 2 ? 0.05 : 0.03);

    // bass on 8ths
    if (s16 % 2 === 0) {
      const bi = def.bass[(s16 / 2) % def.bass.length];
      if (bi !== null && bi !== undefined) this.note(out, 'triangle', def.root - 24 + chord[bi % chord.length], t, sd * 1.8, 0.22);
    }

    // pad on bar start
    if (def.pad && s16 === 0) {
      for (const n of chord) this.note(out, 'sawtooth', def.root - 12 + n, t, sd * 15, 0.025, 0.3, 900);
    }

    // melody (2-bar pattern)
    const mi = def.melody[(bar % 2) * 16 + s16];
    if (mi !== null && mi !== undefined) {
      const midi = def.root + def.scale[mi % def.scale.length];
      this.note(out, def.lead, midi, t, sd * 1.6, def.lead === 'sawtooth' || def.lead === 'square' ? 0.045 : 0.09, 0.01, 2600);
      if (hot > 0.6) this.note(out, 'triangle', midi + 12, t, sd * 1.2, 0.04);
    }
    // arpeggio sparkle when intense
    if (hot > 0.3 && s16 % 2 === 1) {
      const n = chord[(s16 >> 1) % chord.length];
      this.note(out, 'sine', def.root + 12 + n, t, sd * 0.9, 0.035 * hot);
    }
  }

  private note(out: AudioNode, type: OscillatorType, midi: number, t: number, dur: number, vol: number, attack = 0.008, cutoff = 4000) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (type === 'sawtooth' || type === 'square') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(out: AudioNode, t: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  private snare(out: AudioNode, t: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 2, 0.16);
  }

  private hat(out: AudioNode, t: number, vol: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 2, 0.05);
  }
}
