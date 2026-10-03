import type { VoiceLine } from '@/learning/types';
import { voiceIndexKey, voiceTextKey, type VoiceManifest } from './voiceKey';

export type Speaker = 'sparky' | 'commentator' | 'narrator' | 'adam';

export interface SpeechHooks {
  onCaption(text: string | null, lang: 'ar' | 'en', speaker: Speaker): void;
  onSpeaking(speaking: boolean, speaker: Speaker): void;
  duck(on: boolean): void;
  volume(): number;
  rate(): number;
  /** Web Audio output for recorded clips (null until audio is unlocked). */
  audio?(): { ctx: AudioContext; out: AudioNode } | null;
}

const MANIFEST_URL = '/audio/voice/manifest.json';
const CLIP_DIR = '/audio/voice/';
const CACHE_SIZE = 60;

/**
 * Voice abstraction. Priority per line:
 *   1. VoiceLine.audio (explicit recorded clip)
 *   2. pre-generated neural voice clip from /audio/voice/manifest.json (scripts/voice) played
 *      through the Web Audio voice bus — natural Levantine Arabic + kid-friendly English
 *   3. browser speech synthesis (robotic fallback)
 *   4. caption-only timing when no voice exists
 * Every promise resolves even if the platform never fires `onend` (WebKit/Chrome bugs),
 * so gameplay never stalls. cancel() stops a clip instantly (early taps cut the prompt).
 */
export class SpeechManager {
  private voices: { en?: SpeechSynthesisVoice; ar?: SpeechSynthesisVoice } = {};
  private token = 0;
  private unlocked = false;
  private clip: HTMLAudioElement | null = null;
  private manifest: VoiceManifest | null = null;
  private manifestPromise: Promise<VoiceManifest | null> | null = null;
  /** decoded clip cache (LRU via Map insertion order) */
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private source: { node: AudioBufferSourceNode; stop: () => void } | null = null;
  /** speaker whose mouth is currently animating (so a superseded line can close it) */
  private speaking: Speaker | null = null;
  private onVoicesChanged = () => this.pickVoices();
  private disposed = false;
  /** test/debug instrumentation */
  stats = { clips: 0, tts: 0, captionOnly: 0 };

  constructor(private readonly hooks: SpeechHooks) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.pickVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', this.onVoicesChanged);
    void this.loadManifest();
  }

  private loadManifest(): Promise<VoiceManifest | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    this.manifestPromise ??= fetch(MANIFEST_URL)
      .then((r) => (r.ok ? (r.json() as Promise<VoiceManifest>) : null))
      .then((m) => (this.manifest = m))
      .catch(() => null);
    return this.manifestPromise;
  }

  /** Recorded clip id for a line, or null. */
  clipFor(line: VoiceLine, speaker: Speaker): string | null {
    const m = this.manifest;
    if (!m) return null;
    return m.index[voiceIndexKey(speaker, line.lang, line.text)] ?? m.byText[voiceTextKey(line.lang, line.text)] ?? null;
  }

  private buffer(id: string, ctx: AudioContext): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id);
    if (hit) {
      this.buffers.delete(id);
      this.buffers.set(id, hit);
      return hit;
    }
    const file = this.manifest?.clips[id]?.f ?? `${id}.mp3`;
    const p = fetch(CLIP_DIR + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => ctx.decodeAudioData(ab))
      .catch(() => {
        this.buffers.delete(id);
        return null;
      });
    this.buffers.set(id, p);
    while (this.buffers.size > CACHE_SIZE) this.buffers.delete(this.buffers.keys().next().value as string);
    return p;
  }

  /** Warm the decode cache for upcoming lines. */
  prefetch(lines: VoiceLine[], speaker: Speaker = 'sparky') {
    const out = this.hooks.audio?.();
    if (!out) return;
    for (const l of lines) {
      const id = this.clipFor(l, speaker);
      if (id) void this.buffer(id, out.ctx);
    }
  }

  get available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private pickVoices() {
    const all = window.speechSynthesis.getVoices();
    const score = (v: SpeechSynthesisVoice, lang: string) => {
      let s = 0;
      if (v.lang.toLowerCase().startsWith(lang)) s += 10;
      if (/en-us|ar-sa|ar-jo|ar-ae/i.test(v.lang)) s += 2;
      if (/samantha|karen|google us english|aria|jenny|zira|nicky|tessa/i.test(v.name)) s += 4;
      if (/maged|laila|tarik|hamed|zariyah|google.*(arabic|العربية)/i.test(v.name)) s += 4;
      if (v.localService) s += 1; // offline-capable
      return s;
    };
    const best = (lang: string) =>
      all.filter((v) => v.lang.toLowerCase().startsWith(lang)).sort((a, b) => score(b, lang) - score(a, lang))[0];
    this.voices = { en: best('en'), ar: best('ar') };
  }

  /** Call inside the first user gesture (iOS requires a speak() call from a gesture). */
  unlock() {
    if (this.unlocked || !this.available) return;
    this.unlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  private setSpeaking(speaker: Speaker | null) {
    if (this.speaking && this.speaking !== speaker) this.hooks.onSpeaking(false, this.speaking);
    this.speaking = speaker;
    if (speaker) this.hooks.onSpeaking(true, speaker);
  }

  /** Engine teardown: stop audio, drop listeners and decoded clips. */
  dispose() {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    try {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', this.onVoicesChanged);
    } catch {
      /* ignore */
    }
    this.buffers.clear();
  }

  cancel() {
    this.token++;
    this.setSpeaking(null);
    if (this.available) window.speechSynthesis.cancel();
    if (this.clip) {
      this.clip.pause();
      this.clip = null;
    }
    this.source?.stop();
    this.source = null;
    this.hooks.duck(false);
    this.hooks.onCaption(null, 'en', 'narrator');
  }

  /**
   * Speak lines sequentially. Resolves when finished or cancelled: `true` only if every line
   * played to the end (callers that chain more audio — e.g. parent praise — check this).
   */
  async say(lines: VoiceLine[], speaker: Speaker = 'sparky', opts: { keepCaption?: boolean } = {}): Promise<boolean> {
    if (this.disposed) return false;
    const my = ++this.token;
    if (this.available) window.speechSynthesis.cancel();
    this.source?.stop();
    this.source = null;
    if (!this.manifest) await Promise.race([this.loadManifest(), sleep(400)]);
    if (my !== this.token) return false;
    this.prefetch(lines, speaker);
    this.hooks.duck(true);
    for (const line of lines) {
      if (my !== this.token) return false;
      this.hooks.onCaption(line.text, line.lang, speaker);
      this.setSpeaking(speaker);
      await this.speakOne(line, my, speaker);
      // a newer say() may already own the mouth — only close it if this line is still current
      if (my !== this.token) return false;
      this.setSpeaking(null);
      await sleep(140);
    }
    if (my !== this.token) return false;
    this.hooks.duck(false);
    if (!opts.keepCaption) setTimeout(() => my === this.token && this.hooks.onCaption(null, 'en', speaker), 900);
    return true;
  }

  /**
   * Play an already-decoded buffer (the parent's recorded voice) as narration: it takes the
   * speech token, so cancel()/say() stop it, and the music is ducked while it plays.
   * Resolves true only if it played to the end.
   */
  async playBuffer(buf: AudioBuffer, speaker: Speaker = 'narrator'): Promise<boolean> {
    if (this.disposed) return false;
    const out = this.hooks.audio?.();
    if (!out || out.ctx.state !== 'running') return false;
    const my = ++this.token;
    if (this.available) window.speechSynthesis.cancel();
    this.source?.stop();
    this.source = null;
    this.hooks.duck(true);
    this.setSpeaking(speaker);
    const ended = await this.playNode(buf, out, 1);
    if (my !== this.token) return false;
    this.setSpeaking(null);
    this.hooks.duck(false);
    return ended;
  }

  private estimate(line: VoiceLine): number {
    const words = line.text.split(/\s+/).length;
    return Math.max(700, words * (line.lang === 'ar' ? 430 : 380) * (line.slow ? 1.35 : 1));
  }

  private async speakOne(line: VoiceLine, my: number, speaker: Speaker): Promise<void> {
    const vol = this.hooks.volume();
    if (!line.audio) {
      const played = await this.playClip(line, my, speaker);
      if (played) return;
      if (my !== this.token) return;
    }
    // recorded clip takes precedence
    if (line.audio) {
      return new Promise((resolve) => {
        const a = new Audio(line.audio);
        a.volume = vol;
        this.clip = a;
        // onerror and the play() rejection can both fire: fall back to TTS only once
        let fellBack = false;
        const fallback = () => {
          if (fellBack) return;
          fellBack = true;
          void this.ttsOrWait(line, my, vol).then(resolve);
        };
        a.onended = () => resolve();
        a.onerror = fallback;
        a.play().catch(fallback);
      });
    }
    return this.ttsOrWait(line, my, vol);
  }

  /** Play the pre-generated clip. Resolves true if a clip played (or was cancelled mid-way). */
  private async playClip(line: VoiceLine, my: number, speaker: Speaker): Promise<boolean> {
    const out = this.hooks.audio?.();
    const id = this.clipFor(line, speaker);
    if (!out || !id || out.ctx.state !== 'running') return false;
    const buf = await Promise.race([this.buffer(id, out.ctx), sleep(2500).then(() => null)]);
    if (my !== this.token) return true;
    if (!buf) return false;
    this.stats.clips++;
    // parent speech-rate setting (default 0.9 ≈ natural); small range keeps pitch natural
    await this.playNode(buf, out, Math.max(0.85, Math.min(1.15, this.hooks.rate() / 0.9)));
    return true;
  }

  /** Plays a buffer on the voice bus. Resolves true if it ended naturally, false if stopped. */
  private playNode(buf: AudioBuffer, out: { ctx: AudioContext; out: AudioNode }, rate: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const node = out.ctx.createBufferSource();
      node.buffer = buf;
      node.playbackRate.value = rate;
      node.connect(out.out);
      let finished = false;
      const finish = (natural: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
        if (this.source?.node === node) this.source = null;
        resolve(natural);
      };
      const guard = setTimeout(() => finish(true), (buf.duration / rate) * 1000 + 1500);
      node.onended = () => finish(true);
      this.source = {
        node,
        stop: () => {
          try {
            node.stop();
          } catch {
            /* not started */
          }
          finish(false);
        },
      };
      node.start();
    });
  }

  private ttsOrWait(line: VoiceLine, my: number, vol: number): Promise<void> {
    const est = this.estimate(line);
    const voice = line.lang === 'ar' ? this.voices.ar : this.voices.en;
    if (!this.available || vol === 0 || (!voice && line.lang === 'ar' && !this.hasAnyArabic())) {
      // caption-only: give time to see/hear the visual cue
      this.stats.captionOnly++;
      return sleep(Math.min(est, 2200));
    }
    this.stats.tts++;
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        resolve();
      };
      const guard = setTimeout(finish, est * 2.5 + 2500);
      try {
        const u = new SpeechSynthesisUtterance(line.text);
        if (voice) u.voice = voice;
        u.lang = line.lang === 'ar' ? (voice?.lang ?? 'ar-SA') : (voice?.lang ?? 'en-US');
        const base = this.hooks.rate();
        u.rate = (line.lang === 'en' ? 0.88 : 0.95) * base * (line.slow ? 0.82 : 1);
        u.pitch = 1.12;
        u.volume = vol;
        u.onend = finish;
        u.onerror = finish;
        if (my !== this.token) return finish();
        window.speechSynthesis.speak(u);
      } catch {
        finish();
      }
    });
  }

  private hasAnyArabic() {
    return !!this.voices.ar;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
