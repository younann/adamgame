import { CORE_SFX, JITTER, SCENE_AUDIO, THEME_AMBIENCE } from './audioGroups';
import { CrossfadeLoop } from './CrossfadeLoop';
import { MusicPlayer, type MusicTheme } from './music';
import { SampleBank } from './SampleBank';
import { SampledMusic } from './SampledMusic';
import { playSfx, type SfxName, type SfxOpts } from './sfx';
import { AMB_SAMPLES, MUSIC_SAMPLES, SFX_SAMPLES } from './soundManifest';

/** Large decoded buffers (music + ambience beds) — evicted when not needed to bound memory. */
const LARGE_URLS = new Set<string>([
  ...Object.values(MUSIC_SAMPLES).map((e) => e.file),
  ...Object.values(AMB_SAMPLES).map((e) => e.file),
]);

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  muted: boolean;
}

export interface EngineHandle {
  setSpeed: (v: number) => void;
  stop: () => void;
}

/**
 * Centralised Web Audio graph.
 *
 *   music ─┐ (duck)
 *   amb ───┤
 *   sfx ───┤
 *   crowd ─┼─> master ─> compressor ─> destination
 *   voice ─┘
 *
 * Real CC0 recordings (public/audio, see docs/AUDIO_CREDITS.md) are decoded into a SampleBank
 * after the first child tap (autoplay rules). Until a sample is ready — or if it fails — the
 * original synthesised recipes play instead, so the game is never silent and never blocks.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  crowdBus!: GainNode;
  ambBus!: GainNode;
  /** recorded narration (Sparky / commentator / parent clips) — not ducked */
  voiceBus!: GainNode;
  private duckGain!: GainNode;
  /** procedural fallback music */
  music: MusicPlayer | null = null;
  bank: SampleBank | null = null;
  private sampled: SampledMusic | null = null;
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings = { musicVolume: 0.55, sfxVolume: 0.9, voiceVolume: 1, muted: false };
  private crowd:
    | { kind: 'sample'; loop: CrossfadeLoop; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; base: number }
    | { kind: 'synth'; src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; lfo: OscillatorNode }
    | null = null;
  private ambience: { name: string; loop: CrossfadeLoop } | null = null;
  private pendingTheme: MusicTheme | null = null;
  private wantedTheme: MusicTheme | null = null;
  private intensity = 0;
  private lastVariant = new Map<string, number>();
  private voicesPlaying = new Map<string, number>();
  /** large buffers the next scene asked for (kept alongside what is playing) */
  private preloadedLarge = new Set<string>();
  private engines = new Set<EngineHandle>();
  private silentEl: HTMLAudioElement | null = null;
  private disposed = false;
  unlocked = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (typeof window === 'undefined' || this.disposed) return;
    try {
      this.claimPlaybackSession();
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
      // iOS: play a silent buffer inside the gesture
      if (this.ctx && !this.unlocked) {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
        this.unlocked = true;
        void this.preloadCore();
        if (this.pendingTheme) {
          const t = this.pendingTheme;
          this.pendingTheme = null;
          this.playMusic(t);
        }
      }
    } catch {
      /* audio unavailable — game still works visually */
    }
  }

  /**
   * iOS: Web Audio is silenced by the ring/silent switch unless the page's audio session is
   * 'playback'. Safari 16.4+ exposes navigator.audioSession; older iOS switches category when
   * an <audio> element plays, so loop a silent clip (started inside this gesture).
   */
  private claimPlaybackSession() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback';
      } catch {
        /* ignore */
      }
      return;
    }
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!iOS) return;
    try {
      if (!this.silentEl) {
        const el = document.createElement('audio');
        el.setAttribute('x-webkit-airplay', 'deny');
        el.preload = 'auto';
        el.loop = true;
        el.src = silentWavDataUri();
        this.silentEl = el;
      }
      if (this.silentEl.paused) void this.silentEl.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.duckGain);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.crowdBus = ctx.createGain();
    this.crowdBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.duckGain);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.noise = makeNoise(ctx, 3);
    this.music = new MusicPlayer(ctx, this.musicBus, this.noise);
    this.bank = new SampleBank(ctx);
    this.sampled = new SampledMusic(ctx, this.bank, this.musicBus);
    this.applySettings(this.settings);
  }

  applySettings(s: AudioSettings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVolume * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.crowdBus.gain.setTargetAtTime(s.sfxVolume * 0.8, t, 0.1);
    this.ambBus.gain.setTargetAtTime(s.musicVolume * 0.6, t, 0.1);
    this.voiceBus.gain.setTargetAtTime(s.voiceVolume, t, 0.05);
  }

  get voiceVolume() {
    return this.settings.muted ? 0 : this.settings.voiceVolume;
  }

  get isMuted() {
    return this.settings.muted;
  }

  // ---------- loading ----------
  private sfxUrls(names: SfxName[]): string[] {
    return names.flatMap((n) => SFX_SAMPLES[n]?.files ?? []);
  }

  private preloadCore(): Promise<void> {
    if (!this.bank) return Promise.resolve();
    return this.bank.loadMany(this.sfxUrls(CORE_SFX));
  }

  /**
   * Decode the sounds a scene needs (call while the transition covers the screen).
   * Resolves immediately before audio is unlocked; never rejects.
   */
  preloadFor(sceneId: string): Promise<void> {
    const bank = this.bank;
    if (!bank || !this.unlocked) return Promise.resolve();
    const g = SCENE_AUDIO[sceneId];
    if (!g) return Promise.resolve();
    const urls = this.sfxUrls(g.sfx);
    if (g.music) {
      const u = this.sampled?.urlFor(g.music);
      if (u) urls.push(u);
    }
    for (const a of g.amb ?? []) {
      const e = AMB_SAMPLES[a];
      if (e) urls.push(e.file);
    }
    this.preloadedLarge = new Set(urls.filter((u) => LARGE_URLS.has(u)));
    this.evictLarge();
    return bank.loadMany(urls).catch(() => undefined);
  }

  /** Keep only the music/ambience buffers in use or just preloaded (bounded decoded memory). */
  private evictLarge() {
    if (!this.bank) return;
    const keep = new Set<string>(this.preloadedLarge);
    const cur = this.sampled?.currentUrl;
    if (cur) keep.add(cur);
    const wanted = this.wantedTheme ? this.sampled?.urlFor(this.wantedTheme) : null;
    if (wanted) keep.add(wanted);
    if (this.ambience) {
      const e = AMB_SAMPLES[this.ambience.name];
      if (e) keep.add(e.file);
    }
    if (this.crowd && AMB_SAMPLES.crowd) keep.add(AMB_SAMPLES.crowd.file);
    if (this.engines.size && AMB_SAMPLES.engine) keep.add(AMB_SAMPLES.engine.file);
    this.bank.evictWhere((u) => LARGE_URLS.has(u) && !keep.has(u));
  }

  /** Debug / smoke tests: how many real samples are decoded. */
  get samplesLoaded(): number {
    return this.bank?.size ?? 0;
  }

  // ---------- music ----------
  /** Crossfades to a world theme. Queued until audio is unlocked. */
  playMusic(theme: MusicTheme) {
    if (!this.ctx || !this.unlocked) {
      this.pendingTheme = theme;
      return;
    }
    this.wantedTheme = theme;
    this.updateAmbience(theme);
    if (this.sampled?.play(theme)) {
      this.music?.stop();
      this.evictLarge();
      return;
    }
    // Not decoded yet: stop the previous recording (never layer two tracks), play the
    // procedural theme now, and swap to the recording when it is ready.
    this.sampled?.stop(1);
    this.music?.play(theme);
    this.evictLarge();
    const url = this.sampled?.urlFor(theme);
    if (url && this.bank) {
      void this.bank.load(url).then((buf) => {
        if (buf && this.wantedTheme === theme && this.sampled?.play(theme)) {
          this.music?.stop();
          this.sampled.setIntensity(this.intensity);
        }
      });
    }
  }

  setMusicIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
    this.music?.setIntensity(this.intensity);
    this.sampled?.setIntensity(this.intensity);
  }

  /** Lower music while narration speaks. */
  duck(on: boolean) {
    if (!this.ctx) return;
    this.duckGain.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, on ? 0.08 : 0.4);
  }

  // ---------- ambience beds ----------
  private updateAmbience(theme: MusicTheme) {
    const want = THEME_AMBIENCE[theme];
    if (this.ambience && this.ambience.name === want?.name) return;
    this.stopAmbience();
    if (want) this.startAmbience(want.name, want.level);
  }

  startAmbience(name: string, level = 0.5) {
    if (!this.ctx || !this.bank) return;
    const entry = AMB_SAMPLES[name];
    if (!entry) return;
    const begin = (buf: AudioBuffer) => {
      if (!this.ctx || this.ambience) return;
      const loop = new CrossfadeLoop(this.ctx, buf, this.ambBus, entry.xfade);
      loop.start(2, level);
      this.ambience = { name, loop };
    };
    const ready = this.bank.get(entry.file);
    if (ready) begin(ready);
    else
      void this.bank.load(entry.file).then((buf) => {
        const want = this.wantedTheme ? THEME_AMBIENCE[this.wantedTheme] : undefined;
        if (buf && want?.name === name) begin(buf);
      });
  }

  stopAmbience() {
    this.ambience?.loop.stop(1.2);
    this.ambience = null;
  }

  // ---------- sound effects ----------
  sfx(name: SfxName, opts: SfxOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || ctx.state !== 'running') return;
    try {
      if (!this.playSample(name, opts)) playSfx(ctx, this.sfxBus, this.noise, name, opts);
    } catch {
      /* never let a sound break gameplay */
    }
  }

  private playSample(name: SfxName, opts: SfxOpts): boolean {
    const ctx = this.ctx!;
    const entry = SFX_SAMPLES[name];
    if (!entry || !this.bank) return false;
    const ready = entry.files.filter((f) => this.bank!.has(f));
    if (ready.length === 0) {
      void this.bank.loadMany(entry.files);
      return false;
    }
    // polyphony cap per sound (e.g. many stars landing at once)
    const playing = this.voicesPlaying.get(name) ?? 0;
    if (playing >= 6) return true;
    // pick a variant, avoiding an immediate repeat
    let idx = Math.floor(Math.random() * ready.length);
    if (ready.length > 1 && idx === this.lastVariant.get(name)) idx = (idx + 1) % ready.length;
    this.lastVariant.set(name, idx);
    const buf = this.bank.get(ready[idx])!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const jitter = JITTER.has(name) ? 1 + (Math.random() - 0.5) * 0.08 : 1;
    src.playbackRate.value = Math.pow(2, (opts.pitch ?? 0) / 12) * jitter;
    const g = ctx.createGain();
    g.gain.value = entry.vol * (opts.volume ?? 1);
    src.connect(g).connect(this.sfxBus);
    src.start(ctx.currentTime + (opts.delay ?? 0));
    this.voicesPlaying.set(name, playing + 1);
    src.onended = () => {
      this.voicesPlaying.set(name, Math.max(0, (this.voicesPlaying.get(name) ?? 1) - 1));
      g.disconnect();
    };
    return true;
  }

  // ---------- crowd ----------
  startCrowd(level = 0.35) {
    if (!this.ctx || !this.noise || this.crowd) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // slow breathing swell keeps the crowd alive
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    const entry = AMB_SAMPLES.crowd;
    const buf = entry ? this.bank?.get(entry.file) : undefined;
    if (buf && entry) {
      filter.type = 'lowpass';
      filter.frequency.value = 4000;
      filter.connect(gain).connect(this.crowdBus);
      const loop = new CrossfadeLoop(ctx, buf, filter, entry.xfade);
      loop.start(1.5, 1);
      gain.gain.setTargetAtTime(level * 1.4, ctx.currentTime, 1.2);
      this.crowd = { kind: 'sample', loop, filter, gain, lfo, base: 1.4 };
      return;
    }
    // synthesised fallback
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    src.connect(filter).connect(gain).connect(this.crowdBus);
    src.start();
    gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    this.crowd = { kind: 'synth', src, gain, filter, lfo };
    if (entry) void this.bank?.load(entry.file);
  }

  /** brightness is in "synth Hz" (900 calm … 1700 roaring) for API compatibility. */
  setCrowd(level: number, brightness = 900) {
    if (!this.ctx || !this.crowd) return;
    const t = this.ctx.currentTime;
    const c = this.crowd;
    if (c.kind === 'sample') {
      c.gain.gain.setTargetAtTime(level * c.base, t, 0.3);
      c.filter.frequency.setTargetAtTime(Math.min(16000, brightness * 4.5), t, 0.3);
    } else {
      c.gain.gain.setTargetAtTime(level, t, 0.3);
      c.filter.frequency.setTargetAtTime(brightness, t, 0.3);
    }
  }

  /** Crowd eruption: a real cheer burst plus a bright swell of the crowd bed. */
  cheer(strength = 1) {
    if (!this.ctx) return;
    this.sfx('cheer', { volume: strength });
    const c = this.crowd;
    if (!c) return;
    const t = this.ctx.currentTime;
    const base = c.kind === 'sample' ? c.base : 1;
    const g = c.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.9 * strength * base, t + 0.15);
    g.setTargetAtTime(0.35 * base, t + 1.6, 0.9);
    const f = c.filter.frequency;
    const hi = c.kind === 'sample' ? 12000 : 1700;
    const lo = c.kind === 'sample' ? 4000 : 900;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(hi, t + 0.15);
    f.setTargetAtTime(lo, t + 1.6, 0.9);
  }

  stopCrowd() {
    if (!this.ctx || !this.crowd) return;
    const c = this.crowd;
    this.crowd = null;
    c.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    c.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    if (c.kind === 'sample') c.loop.stop(1.5);
    setTimeout(() => {
      try {
        if (c.kind === 'synth') c.src.stop();
        c.lfo.stop();
      } catch {
        /* already stopped */
      }
    }, 2000);
  }

  // ---------- engine (racing) ----------
  startEngine(): EngineHandle {
    const noop = { setSpeed: () => {}, stop: () => {} };
    if (!this.ctx) return noop;
    const ctx = this.ctx;
    const entry = AMB_SAMPLES.engine;
    const buf = entry ? this.bank?.get(entry.file) : undefined;
    if (buf && entry) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      lp.connect(g).connect(this.sfxBus);
      // native looping: pitch changes every frame, which the crossfade scheduler can't track
      const loop = new CrossfadeLoop(ctx, buf, lp, entry.xfade, true);
      loop.start(0.4, 1);
      const setSpeed = (v: number) => {
        const k = Math.max(0, Math.min(1.4, v));
        const t = ctx.currentTime;
        loop.setRate(0.7 + k * 0.85);
        lp.frequency.setTargetAtTime(900 + k * 5200, t, 0.12);
        g.gain.setTargetAtTime(0.35 + k * 0.3, t, 0.2);
      };
      setSpeed(0.2);
      const handle: EngineHandle & { dispose?: () => void } = {
        setSpeed,
        stop: () => {
          this.engines.delete(handle);
          loop.stop(0.5);
          setTimeout(() => g.disconnect(), 1200);
        },
        dispose: () => loop.dispose(),
      };
      this.engines.add(handle);
      return handle;
    }
    if (entry) void this.bank?.load(entry.file);
    const synth = this.startSynthEngine(ctx);
    const handle: EngineHandle = {
      setSpeed: synth.setSpeed,
      stop: () => {
        this.engines.delete(handle);
        synth.stop();
      },
    };
    this.engines.add(handle);
    return handle;
  }

  private startSynthEngine(ctx: AudioContext): EngineHandle {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.sfxBus);
    o1.start();
    o2.start();
    g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.3);
    const setSpeed = (v: number) => {
      const t = ctx.currentTime;
      const f = 55 + v * 150;
      o1.frequency.setTargetAtTime(f, t, 0.12);
      o2.frequency.setTargetAtTime(f * 0.502, t, 0.12);
      lp.frequency.setTargetAtTime(400 + v * 1600, t, 0.12);
      g.gain.setTargetAtTime(0.06 + v * 0.06, t, 0.2);
    };
    setSpeed(0.2);
    return {
      setSpeed,
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => {
          try {
            o1.stop();
            o2.stop();
          } catch {
            /* ignore */
          }
        }, 1200);
      },
    };
  }

  // ---------- lifecycle ----------
  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
    this.silentEl?.pause();
  }

  /** Not a gesture on iOS — may not succeed; the engine also re-unlocks on the next tap. */
  resume() {
    const st = this.ctx?.state as string | undefined;
    if (this.ctx && this.unlocked && (st === 'suspended' || st === 'interrupted')) void this.ctx.resume().catch(() => {});
    if (this.silentEl?.paused && this.unlocked) void this.silentEl.play().catch(() => {});
  }

  /** True when audio was started but the context is no longer running (call unlock in a gesture). */
  get needsReunlock(): boolean {
    return this.unlocked && !this.disposed && !!this.ctx && this.ctx.state !== 'running';
  }

  /**
   * Full teardown (engine destroyed, e.g. leaving for the Parent Zone): stop every loop and
   * timer, release buffers and close the AudioContext so nothing keeps the old engine alive.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.music?.stop();
      this.sampled?.dispose();
      this.ambience?.loop.dispose();
      this.ambience = null;
      const c = this.crowd;
      this.crowd = null;
      if (c) {
        if (c.kind === 'sample') c.loop.dispose();
        else {
          try {
            c.src.stop();
          } catch {
            /* ignore */
          }
        }
        try {
          c.lfo.stop();
        } catch {
          /* ignore */
        }
      }
      for (const e of [...this.engines]) {
        (e as EngineHandle & { dispose?: () => void }).dispose?.();
        e.stop();
      }
      this.engines.clear();
      this.bank?.clear();
      this.pendingTheme = null;
      if (this.silentEl) {
        this.silentEl.pause();
        this.silentEl.removeAttribute('src');
        this.silentEl.load();
        this.silentEl = null;
      }
      if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
    } catch {
      /* best effort */
    }
  }

  stopAllLoops() {
    this.stopCrowd();
  }
}

let silentUri: string | null = null;
/** 0.5 s of 8 kHz 8-bit mono silence as a WAV data URI (iOS audio-session trick). */
function silentWavDataUri(): string {
  if (silentUri) return silentUri;
  const n = 4000;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o: number, t: string) => [...t].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data');
  dv.setUint32(40, n, true);
  buf.fill(128, 44); // 8-bit PCM silence is the mid value
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  silentUri = `data:audio/wav;base64,${btoa(bin)}`;
  return silentUri;
}

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // slightly pink-ish noise
    const white = Math.random() * 2 - 1;
    last = (last + 0.04 * white) / 1.04;
    d[i] = white * 0.6 + last * 3;
  }
  return buf;
}
