import { CrossfadeLoop } from './CrossfadeLoop';
import type { MusicTheme } from './music';
import type { SampleBank } from './SampleBank';
import { MUSIC_SAMPLES } from './soundManifest';

/** Relative level of recorded music under the music bus (it is mastered louder than the synth). */
const TRACK_LEVEL = 0.6;

/**
 * Real (CC0) music per world. Tracks crossfade on theme change; `intensity` adds a musical
 * lift (brighter high-shelf + a little more level) for big moments such as a powered kick.
 */
export class SampledMusic {
  private current: { theme: MusicTheme; loop: CrossfadeLoop } | null = null;
  private readonly shelf: BiquadFilterNode;
  private readonly lift: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bank: SampleBank,
    dest: AudioNode,
  ) {
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 3200;
    this.shelf.gain.value = 0;
    this.lift = ctx.createGain();
    this.lift.connect(this.shelf).connect(dest);
  }

  get theme(): MusicTheme | null {
    return this.current?.theme ?? null;
  }

  urlFor(theme: MusicTheme): string | null {
    return MUSIC_SAMPLES[theme]?.file ?? null;
  }

  isReady(theme: MusicTheme): boolean {
    const url = this.urlFor(theme);
    return !!url && this.bank.has(url);
  }

  /** Starts the theme if its buffer is decoded. Returns false if it isn't (caller falls back). */
  play(theme: MusicTheme): boolean {
    if (this.current?.theme === theme) return true;
    const entry = MUSIC_SAMPLES[theme];
    const buf = entry ? this.bank.get(entry.file) : undefined;
    if (!entry || !buf) return false;
    this.current?.loop.stop(1.2);
    const loop = new CrossfadeLoop(this.ctx, buf, this.lift, entry.xfade);
    loop.start(1.2, TRACK_LEVEL);
    this.current = { theme, loop };
    this.setIntensity(0);
    return true;
  }

  setIntensity(v: number) {
    const k = Math.max(0, Math.min(1, v));
    const t = this.ctx.currentTime;
    this.shelf.gain.setTargetAtTime(k * 5, t, 0.25);
    this.lift.gain.setTargetAtTime(1 + k * 0.3, t, 0.25);
  }

  stop(fade = 1) {
    this.current?.loop.stop(fade);
    this.current = null;
  }

  /** URL of the decoded track currently playing (kept when evicting buffers). */
  get currentUrl(): string | null {
    return this.current ? this.urlFor(this.current.theme) : null;
  }

  dispose() {
    this.current?.loop.dispose();
    this.current = null;
    try {
      this.lift.disconnect();
      this.shelf.disconnect();
    } catch {
      /* ignore */
    }
  }
}
