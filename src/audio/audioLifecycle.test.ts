import { afterEach, describe, expect, it, vi } from 'vitest';
import { SampleBank } from './SampleBank';
import { SpeechManager, type SpeechHooks } from './SpeechManager';

const fakeBuffer = (duration = 1) => ({ duration, getChannelData: () => new Float32Array(10), sampleRate: 48000 }) as unknown as AudioBuffer;

function fakeDecodeCtx() {
  return {
    decodeAudioData: (_d: ArrayBuffer, ok: (b: AudioBuffer) => void) => {
      ok(fakeBuffer());
      return undefined;
    },
  } as unknown as BaseAudioContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SampleBank', () => {
  it('retries a failed URL after the back-off', async () => {
    let now = 0;
    let ok = false;
    vi.stubGlobal('fetch', vi.fn(async () => (ok ? { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } : { ok: false, status: 503 })));
    const bank = new SampleBank(fakeDecodeCtx(), () => now);
    expect(await bank.load('/a.mp3')).toBeNull();
    ok = true;
    expect(await bank.load('/a.mp3')).toBeNull(); // still inside back-off
    now += SampleBank.RETRY_MS + 1;
    expect(await bank.load('/a.mp3')).not.toBeNull();
    expect(bank.has('/a.mp3')).toBe(true);
  });

  it('evicts only matching buffers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    const bank = new SampleBank(fakeDecodeCtx());
    await bank.loadMany(['/music/a.mp3', '/music/b.mp3', '/sfx/pop.mp3']);
    expect(bank.evictWhere((u) => u.startsWith('/music/') && u !== '/music/a.mp3')).toBe(1);
    expect(bank.has('/music/a.mp3')).toBe(true);
    expect(bank.has('/music/b.mp3')).toBe(false);
    expect(bank.has('/sfx/pop.mp3')).toBe(true);
    bank.clear();
    expect(bank.size).toBe(0);
  });
});

/** Minimal Web Audio double: buffer sources end after `duration` (fake timers) unless stopped. */
function fakeAudioOut() {
  const started: { stop: () => void }[] = [];
  const ctx = {
    state: 'running',
    createBufferSource() {
      const node = {
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
        onended: null as null | (() => void),
        connect() {},
        disconnect() {},
        start() {
          const t = setTimeout(() => node.onended?.(), (node.buffer?.duration ?? 0) * 1000);
          started.push({ stop: () => clearTimeout(t) });
        },
        stop() {
          started.pop()?.stop();
        },
      };
      return node;
    },
  } as unknown as AudioContext;
  return { ctx, out: {} as AudioNode };
}

function hooks(audio: ReturnType<typeof fakeAudioOut> | null) {
  const speaking: [boolean, string][] = [];
  const h: SpeechHooks = {
    onCaption: () => {},
    onSpeaking: (on, sp) => speaking.push([on, sp]),
    duck: () => {},
    volume: () => 1,
    rate: () => 0.9,
    audio: () => audio,
  };
  return { h, speaking };
}

describe('SpeechManager', () => {
  it('say() resolves true when it completes and false when cancelled', async () => {
    vi.useFakeTimers();
    const { h } = hooks(null);
    const sm = new SpeechManager(h);
    const done = sm.say([{ text: 'Blue!', lang: 'en' }]);
    await vi.runAllTimersAsync();
    expect(await done).toBe(true);
    const cut = sm.say([{ text: 'Find blue!', lang: 'en' }]);
    sm.cancel();
    await vi.runAllTimersAsync();
    expect(await cut).toBe(false);
  });

  it('playBuffer is narration: cancel() stops it and it reports not completed', async () => {
    vi.useFakeTimers();
    const audio = fakeAudioOut();
    const { h, speaking } = hooks(audio);
    const sm = new SpeechManager(h);
    const full = sm.playBuffer(fakeBuffer(2));
    await vi.runAllTimersAsync();
    expect(await full).toBe(true);
    const cut = sm.playBuffer(fakeBuffer(5));
    await vi.advanceTimersByTimeAsync(100);
    sm.cancel();
    await vi.runAllTimersAsync();
    expect(await cut).toBe(false);
    // mouth closes exactly once per opening
    expect(speaking.filter(([on]) => on).length).toBe(speaking.filter(([on]) => !on).length);
  });

  it('a newer say() supersedes the old one without leaving the old mouth open', async () => {
    vi.useFakeTimers();
    const { h, speaking } = hooks(null);
    const sm = new SpeechManager(h);
    const a = sm.say([{ text: 'one two three', lang: 'en' }], 'sparky');
    await vi.advanceTimersByTimeAsync(10);
    const b = sm.say([{ text: 'Goal!', lang: 'en' }], 'commentator');
    await vi.runAllTimersAsync();
    expect(await a).toBe(false);
    expect(await b).toBe(true);
    const last = speaking[speaking.length - 1];
    expect(last).toEqual([false, 'commentator']);
    expect(speaking).toContainEqual([false, 'sparky']);
  });
});
