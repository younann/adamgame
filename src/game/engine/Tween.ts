/** Minimal promise-based tween system driven by the game ticker (pauses with the game). */

export type EaseFn = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  quadIn: (t: number) => t * t,
  quadOut: (t: number) => t * (2 - t),
  quadInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t: number) => t * t * t,
  cubicOut: (t: number) => --t * t * t + 1,
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  backIn: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  elasticOut: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  bounceOut: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} satisfies Record<string, EaseFn>;

export interface TweenOptions {
  duration: number; // ms
  ease?: EaseFn;
  delay?: number;
  onUpdate?: (t: number) => void;
}

interface Active {
  target: object;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  ease: EaseFn;
  delay: number;
  elapsed: number;
  onUpdate?: (t: number) => void;
  resolve: () => void;
  started: boolean;
  dead: boolean;
}

export class Tweener {
  private active: Active[] = [];
  /** time multiplier (slow-motion moments) */
  timeScale = 1;

  /** Tween numeric properties of any object (Pixi points, containers, plain state). */
  to(target: object, props: Record<string, number>, opts: TweenOptions): Promise<void> {
    return new Promise((resolve) => {
      this.active.push({
        target,
        from: {},
        to: props,
        duration: Math.max(1, opts.duration),
        ease: opts.ease ?? Ease.quadOut,
        delay: opts.delay ?? 0,
        elapsed: 0,
        onUpdate: opts.onUpdate,
        resolve,
        started: false,
        dead: false,
      });
    });
  }

  /** Tween an arbitrary 0→1 progress value. */
  progress(opts: TweenOptions & { onUpdate: (t: number) => void }): Promise<void> {
    const box = { t: 0 };
    return this.to(box, { t: 1 }, { ...opts, onUpdate: () => opts.onUpdate(box.t) });
  }

  wait(ms: number): Promise<void> {
    return this.to({ t: 0 }, { t: 1 }, { duration: ms, ease: Ease.linear });
  }

  /**
   * Stop tweens on a target. Their promises RESOLVE (at the current value), so any sequence
   * awaiting them continues — killing a tween must never freeze gameplay (e.g. a child tapping
   * a ball while it is still rolling in).
   */
  kill(target: object) {
    for (const a of this.active) {
      if (a.target === target && !a.dead) {
        a.dead = true;
        a.resolve();
      }
    }
  }

  /** Teardown variant: stop tweens on a target WITHOUT resolving (use before destroying it). */
  drop(target: object) {
    for (const a of this.active) if (a.target === target) a.dead = true;
  }

  /** Is anything currently animating this target? */
  isTweening(target: object): boolean {
    return this.active.some((a) => a.target === target && !a.dead);
  }

  /** Scene teardown: drop everything WITHOUT resolving, so abandoned sequences simply stop. */
  clear() {
    for (const a of this.active) a.dead = true;
    this.active = [];
  }

  update(dtMs: number) {
    const dt = dtMs * this.timeScale;
    for (const a of this.active) {
      if (a.dead) continue;
      if (a.delay > 0) {
        a.delay -= dt;
        if (a.delay > 0) continue;
      }
      if ((a.target as { destroyed?: boolean }).destroyed) {
        a.dead = true;
        continue;
      }
      if (!a.started) {
        a.started = true;
        const t = a.target as Record<string, number>;
        for (const k of Object.keys(a.to)) a.from[k] = t[k];
      }
      a.elapsed += dt;
      const p = Math.min(1, a.elapsed / a.duration);
      const e = a.ease(p);
      const t = a.target as Record<string, number>;
      try {
        for (const k of Object.keys(a.to)) t[k] = a.from[k] + (a.to[k] - a.from[k]) * e;
        a.onUpdate?.(p);
      } catch {
        // target was destroyed mid-tween (Pixi setters throw): drop it so one bad tween
        // can't stop every other animation in the scene
        a.dead = true;
        continue;
      }
      if (p >= 1) {
        a.dead = true;
        a.resolve();
      }
    }
    if (this.active.some((a) => a.dead)) this.active = this.active.filter((a) => !a.dead);
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Quadratic bezier point. */
export function bezier2(p0: number, p1: number, p2: number, t: number) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}
