import { audibleRange } from './SampleBank';

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Seamless looping of an AudioBuffer by overlapping the tail of one pass with the head of
 * the next (equal-power crossfade). Works for real loops (short crossfade hides mp3 encoder
 * padding) and for trimmed excerpts of longer tracks (longer crossfade). Supports live
 * playback-rate changes (engine pitch) by integrating buffer position over time.
 */
export class CrossfadeLoop {
  readonly out: GainNode;
  private voices: Voice[] = [];
  private rate = 1;
  private pos = 0; // seconds into the current pass (buffer time)
  private lastT = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly start0: number;
  private readonly len: number;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly buffer: AudioBuffer,
    dest: AudioNode,
    private readonly xfade: number,
    /**
     * Native looping (src.loop + loopStart/loopEnd): sample-accurate at any playback rate.
     * Used for short loops whose pitch changes live (engine), where the crossfade scheduler
     * could drift because playbackRate ramps are not instantaneous.
     */
    private readonly native = false,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const r = audibleRange(buffer);
    this.start0 = r.start;
    this.len = Math.max(0.2, r.end - r.start);
  }

  start(fadeIn = 0.6, level = 1) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(level, t + Math.max(0.01, fadeIn));
    this.spawn(0);
    this.lastT = t;
    if (!this.native) this.timer = setInterval(() => this.tick(), 50);
  }

  setLevel(level: number, tc = 0.3) {
    this.out.gain.setTargetAtTime(level, this.ctx.currentTime, tc);
  }

  setRate(rate: number, tc = 0.12) {
    this.rate = Math.max(0.25, Math.min(4, rate));
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.src.playbackRate.setTargetAtTime(this.rate, t, tc);
  }

  stop(fadeOut = 0.8) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fadeOut));
    const voices = this.voices;
    this.voices = [];
    setTimeout(() => {
      for (const v of voices) {
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
        v.gain.disconnect();
      }
      this.out.disconnect();
    }, (fadeOut + 0.2) * 1000);
  }

  private spawn(fadeTime: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    if (this.native) {
      src.loop = true;
      src.loopStart = this.start0;
      src.loopEnd = this.start0 + this.len;
    }
    const g = ctx.createGain();
    if (fadeTime > 0) {
      g.gain.setValueCurveAtTime(equalPower(true), t, fadeTime);
    } else {
      g.gain.value = 1;
    }
    src.connect(g).connect(this.out);
    src.start(t, this.start0);
    this.voices.push({ src, gain: g });
    this.pos = 0;
  }

  /** Immediate teardown (engine destroy / AudioContext close). */
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopped = true;
    for (const v of this.voices) {
      try {
        v.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.voices = [];
    try {
      this.out.disconnect();
    } catch {
      /* ignore */
    }
  }

  private tick() {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    const dt = t - this.lastT;
    this.lastT = t;
    if (dt <= 0) return; // context suspended
    this.pos += dt * this.rate;
    const xf = Math.min(this.xfade, this.len * 0.4);
    if (this.pos >= this.len - xf) {
      // fade out the current pass, bring in the next
      const fadeReal = xf / this.rate;
      const old = this.voices[this.voices.length - 1];
      if (old) {
        old.gain.gain.cancelScheduledValues(t);
        old.gain.gain.setValueCurveAtTime(equalPower(false), t, Math.max(0.02, fadeReal));
        const o = old;
        setTimeout(() => {
          try {
            o.src.stop();
          } catch {
            /* ignore */
          }
          o.gain.disconnect();
          this.voices = this.voices.filter((v) => v !== o);
        }, (fadeReal + 0.3) * 1000);
      }
      this.spawn(Math.max(0.02, fadeReal));
    }
  }
}

const curves = new Map<boolean, Float32Array>();
function equalPower(rising: boolean): Float32Array {
  let c = curves.get(rising);
  if (!c) {
    c = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const x = i / 63;
      c[i] = rising ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
    }
    curves.set(rising, c);
  }
  return c;
}
