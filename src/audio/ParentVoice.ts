import {
  FREQUENCY_CHANCE,
  getVoiceEnabledPref,
  getVoiceFrequency,
  listClips,
  onClipsChanged,
  type VoiceCategory,
} from '@/storage/parentVoice';

/**
 * Game-side player for the parent's recorded voice. Playback goes through the engine's
 * SpeechManager (registered with setParentVoiceHost), so it shares the narration token:
 * cancel()/say() stop it, it ducks the music, and it never overlaps Sparky.
 * Every function is safe to call at any time and never throws.
 */
export interface ParentVoiceHost {
  /** the engine's AudioContext (null until audio is unlocked) */
  ctx(): AudioContext | null;
  /** play a decoded clip as narration; true if it played to the end */
  play(buf: AudioBuffer): Promise<boolean>;
}

const MAX_DECODED = 6;
/** decoded clips, LRU via Map insertion order (each clip can be several MB of PCM) */
const decoded = new Map<string, AudioBuffer>();
let host: ParentVoiceHost | null = null;
let playing = false;

if (typeof window !== 'undefined') {
  onClipsChanged(() => decoded.clear());
}

export function setParentVoiceHost(h: ParentVoiceHost | null) {
  host = h;
  if (!h) decoded.clear();
}

/**
 * Compatibility shim: direct output without a SpeechManager (used only if no host was
 * registered). Passing nulls clears everything (engine teardown).
 */
export function setParentVoiceOutput(ctx: AudioContext | null, out: AudioNode | null) {
  if (!ctx || !out) {
    setParentVoiceHost(null);
    return;
  }
  setParentVoiceHost({
    ctx: () => ctx,
    play: (buf) =>
      new Promise<boolean>((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(out);
        src.onended = () => {
          try {
            src.disconnect();
          } catch {
            /* ignore */
          }
          resolve(true);
        };
        src.start();
      }),
  });
}

async function enabledWithClips(category: VoiceCategory) {
  const pref = getVoiceEnabledPref();
  if (pref === false) return [];
  try {
    return await listClips(category);
  } catch {
    return [];
  }
}

export async function hasParentClip(category: VoiceCategory): Promise<boolean> {
  return (await enabledWithClips(category)).length > 0;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Play a random clip of a category. Resolves true when it played to the end. */
export async function playParentClip(category: VoiceCategory): Promise<boolean> {
  // claim before any await so two callers can't both start a clip
  if (playing || !host) return false;
  playing = true;
  const h = host;
  try {
    const c = h.ctx();
    if (!c) return false;
    const clips = await enabledWithClips(category);
    if (!clips.length) return false;
    const clip = clips[Math.floor(Math.random() * clips.length)];
    let buf = decoded.get(clip.id);
    if (buf) {
      decoded.delete(clip.id);
    } else {
      buf = await c.decodeAudioData(await clip.blob.arrayBuffer());
    }
    decoded.set(clip.id, buf);
    while (decoded.size > MAX_DECODED) decoded.delete(decoded.keys().next().value as string);
    // outside a gesture iOS may never settle resume(): don't hang the caller
    if (c.state !== 'running') await Promise.race([c.resume().catch(() => {}), sleep(800)]);
    if (c.state !== 'running' || host !== h) return false;
    if (process.env.NODE_ENV !== 'production') console.info(`[parent-voice] playing ${category} clip ${clip.id}`);
    return await h.play(buf);
  } catch {
    return false;
  } finally {
    playing = false;
  }
}

/** Praise after a correct answer, with the parent-chosen frequency. */
export async function maybePlayPraise(): Promise<boolean> {
  if (Math.random() >= FREQUENCY_CHANCE[getVoiceFrequency()]) return false;
  return playParentClip('praise');
}
