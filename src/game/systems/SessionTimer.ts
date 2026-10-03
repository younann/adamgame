/**
 * Play-session timing. Only *active* time counts (backgrounded / paused time is excluded).
 * When the limit passes we never interrupt a kick or race — scenes ask `shouldWrapUp()`
 * at mission boundaries and finish gracefully.
 */
export type SessionLimit = 0 | 10 | 15 | 20 | 30; // 0 = unlimited

export class SessionTimer {
  activeMs = 0;
  private overrideMs = 0;

  constructor(
    public limitMin: SessionLimit,
    public readonly startedAt = Date.now(),
  ) {}

  tick(dtMs: number) {
    if (dtMs > 0 && dtMs < 5000) this.activeMs += dtMs; // guard against resume spikes
  }

  get limitMs(): number {
    return this.limitMin === 0 ? Infinity : this.limitMin * 60_000 + this.overrideMs;
  }

  get remainingMs(): number {
    return Math.max(0, this.limitMs - this.activeMs);
  }

  /** Time is up — the current mission may still finish. */
  isExpired(): boolean {
    return this.activeMs >= this.limitMs;
  }

  /** Called at a mission boundary. */
  shouldWrapUp(): boolean {
    return this.isExpired();
  }

  /** Parent override: grant extra minutes. */
  extend(minutes: number) {
    this.overrideMs += minutes * 60_000;
  }

  /** Debug / testing: jump to the end of the session. */
  expireNow() {
    this.activeMs = this.limitMs === Infinity ? this.activeMs : this.limitMs;
  }

  setLimit(limit: SessionLimit) {
    this.limitMin = limit;
  }
}
