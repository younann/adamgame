import type { Container } from 'pixi.js';
import { Ease, type EaseFn, type Tweener } from './Tween';

/**
 * Simulated 2D camera. The scene's `world` container is transformed so that the camera's
 * focus point (x, y) appears at the screen centre at the given zoom.
 * Default focus is the screen centre, so world coordinates == screen coordinates at zoom 1.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  rotation = 0;
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeDur = 1;
  private viewW = 1;
  private viewH = 1;
  private followTarget: { x: number; y: number } | null = null;
  private followLerp = 0.08;

  constructor(
    private readonly world: Container,
    private readonly tw: Tweener,
    private readonly reducedMotion: () => boolean,
  ) {}

  resize(w: number, h: number) {
    const wasCentered = Math.abs(this.x - this.viewW / 2) < 1 && Math.abs(this.y - this.viewH / 2) < 1;
    this.viewW = w;
    this.viewH = h;
    if (wasCentered || (this.x === 0 && this.y === 0)) {
      this.x = w / 2;
      this.y = h / 2;
    }
  }

  get centerX() {
    return this.viewW / 2;
  }
  get centerY() {
    return this.viewH / 2;
  }

  /** Small screen shake (disabled under reduced motion). */
  shake(intensity = 8, ms = 350) {
    if (this.reducedMotion()) return;
    this.shakeAmp = Math.max(this.shakeAmp, intensity);
    this.shakeTime = ms;
    this.shakeDur = ms;
  }

  panTo(x: number, y: number, zoom = this.zoom, ms = 700, ease: EaseFn = Ease.cubicInOut): Promise<void> {
    this.followTarget = null;
    if (this.reducedMotion()) {
      // keep the framing change, but gentler and quicker
      zoom = 1 + (zoom - 1) * 0.4;
      ms = Math.min(ms, 300);
    }
    return this.tw.to(this as Camera, { x, y, zoom }, { duration: ms, ease });
  }

  /** Push in toward a point (focus). */
  focus(x: number, y: number, zoom = 1.25, ms = 600) {
    return this.panTo(x, y, zoom, ms);
  }

  reset(ms = 600) {
    return this.panTo(this.viewW / 2, this.viewH / 2, 1, ms);
  }

  snap(x = this.viewW / 2, y = this.viewH / 2, zoom = 1) {
    this.tw.kill(this);
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.apply(0);
  }

  follow(target: { x: number; y: number } | null, lerp = 0.08) {
    this.followTarget = target;
    this.followLerp = lerp;
  }

  apply(dtMs: number) {
    if (this.followTarget) {
      const k = 1 - Math.pow(1 - this.followLerp, dtMs / 16.67);
      this.x += (this.followTarget.x - this.x) * k;
      this.y += (this.followTarget.y - this.y) * k;
    }
    let sx = 0;
    let sy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dtMs;
      const k = Math.max(0, this.shakeTime / this.shakeDur);
      sx = (Math.random() * 2 - 1) * this.shakeAmp * k;
      sy = (Math.random() * 2 - 1) * this.shakeAmp * k;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
    this.world.pivot.set(this.x, this.y);
    this.world.position.set(this.viewW / 2 + sx, this.viewH / 2 + sy);
    this.world.scale.set(this.zoom);
    this.world.rotation = this.rotation;
  }

  /** world → screen coordinates */
  toScreen(x: number, y: number) {
    return {
      x: (x - this.x) * this.zoom + this.viewW / 2,
      y: (y - this.y) * this.zoom + this.viewH / 2,
    };
  }
}
