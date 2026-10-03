import { MAX_CLIP_MS } from '@/storage/parentVoice';

/** Picks a MediaRecorder container this browser supports (Chrome webm/opus, Safari mp4/aac). */
export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}

export type MicState = 'unknown' | 'insecure' | 'unsupported' | 'denied' | 'ok';

export function micCapability(): MicState {
  if (typeof window === 'undefined') return 'unknown';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'unsupported';
  return 'unknown';
}

export interface RecordingResult {
  blob: Blob;
  mime: string;
  durationMs: number;
}

/**
 * One microphone recording with a live level meter; auto-stops at the clip limit.
 * Lives outside React so render stays pure.
 */
export class VoiceRecorder {
  private mr: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private start = 0;
  /** set by cancel(); checked after async steps so a recorder cancelled mid-permission never runs */
  private cancelled = false;

  constructor(
    private readonly onTick: (elapsedMs: number, level: number) => void,
    private readonly onDone: (r: RecordingResult | null) => void,
  ) {}

  /** Throws 'denied' if the microphone can't be opened, 'cancelled' if cancel() ran meanwhile. */
  async begin(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error(this.cancelled ? 'cancelled' : 'denied');
    }
    if (this.cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('cancelled');
    }
    this.stream = stream;
    const mime = pickMime();
    const mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.mr = mr;
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const ctx = new AudioContext();
    this.ctx = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(this.stream).connect(an);
    const data = new Uint8Array(an.fftSize);
    this.start = performance.now();
    const loop = () => {
      an.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      this.onTick(performance.now() - this.start, peak / 128);
      this.raf = requestAnimationFrame(loop);
    };
    mr.onstop = () => {
      const durationMs = Math.min(MAX_CLIP_MS, performance.now() - this.start);
      this.release();
      const type = mr.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      this.onDone(blob.size > 0 && durationMs >= 300 ? { blob, mime: type, durationMs: Math.round(durationMs) } : null);
    };
    this.timer = setTimeout(() => this.stop(), MAX_CLIP_MS);
    this.raf = requestAnimationFrame(loop);
    mr.start(250);
  }

  stop() {
    if (this.mr && this.mr.state === 'recording') this.mr.stop();
  }

  /** Abort without saving (component unmount, superseded start). Safe at any time. */
  cancel() {
    this.cancelled = true;
    if (this.mr) this.mr.onstop = null;
    this.stop();
    this.release();
  }

  private release() {
    cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
  }
}
