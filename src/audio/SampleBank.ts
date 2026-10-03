/**
 * Fetches, decodes and caches AudioBuffers for the real (CC0) sound files under /audio.
 * Never throws: a failed or missing file just stays unavailable, and callers fall back to
 * the synthesised recipes. Files are precached by the service worker for offline play.
 */
export class SampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  /** url → time of the last failure; retried after RETRY_MS (e.g. a flaky first online load) */
  private failed = new Map<string, number>();
  static RETRY_MS = 20_000;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(url: string): AudioBuffer | undefined {
    return this.buffers.get(url);
  }

  has(url: string): boolean {
    return this.buffers.has(url);
  }

  /** Number of decoded buffers (debug / smoke tests). */
  get size(): number {
    return this.buffers.size;
  }

  get failedCount(): number {
    return this.failed.size;
  }

  load(url: string): Promise<AudioBuffer | null> {
    const ready = this.buffers.get(url);
    if (ready) return Promise.resolve(ready);
    const failedAt = this.failed.get(url);
    if (failedAt !== undefined) {
      if (this.now() - failedAt < SampleBank.RETRY_MS) return Promise.resolve(null);
      this.failed.delete(url);
    }
    let p = this.pending.get(url);
    if (!p) {
      p = this.fetchDecode(url);
      this.pending.set(url, p);
    }
    return p;
  }

  /**
   * Release decoded buffers to bound memory (decoded PCM is ~10× the mp3 size). A loop that
   * is still playing keeps its own reference, so evicting it is safe.
   */
  evictWhere(pred: (url: string) => boolean): number {
    let n = 0;
    for (const url of [...this.buffers.keys()]) {
      if (pred(url)) {
        this.buffers.delete(url);
        n++;
      }
    }
    return n;
  }

  clear() {
    this.buffers.clear();
    this.pending.clear();
    this.failed.clear();
  }

  loadMany(urls: string[]): Promise<void> {
    return Promise.all(urls.map((u) => this.load(u))).then(() => undefined);
  }

  private async fetchDecode(url: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.arrayBuffer();
      // callback form works on older iOS Safari, promise form everywhere else
      const buf = await new Promise<AudioBuffer>((resolve, reject) => {
        const r = this.ctx.decodeAudioData(data, resolve, reject) as unknown as Promise<AudioBuffer> | undefined;
        if (r && typeof r.then === 'function') r.then(resolve, reject);
      });
      this.buffers.set(url, buf);
      return buf;
    } catch {
      this.failed.set(url, this.now());
      return null;
    } finally {
      this.pending.delete(url);
    }
  }
}

/**
 * Audible range of a decoded buffer: mp3 encoders pad the start/end with near-silence,
 * which would leave a gap at every loop point. Scan the first/last 0.3 s for signal.
 */
export function audibleRange(buf: AudioBuffer, threshold = 0.0015): { start: number; end: number } {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const scan = Math.min(ch.length >> 1, Math.floor(sr * 0.3));
  let s = 0;
  while (s < scan && Math.abs(ch[s]) < threshold) s++;
  let e = ch.length - 1;
  while (e > ch.length - scan && Math.abs(ch[e]) < threshold) e--;
  return { start: s / sr, end: (e + 1) / sr };
}
