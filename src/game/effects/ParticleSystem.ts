import { Container, Sprite, type Texture } from 'pixi.js';

export interface BurstOptions {
  count?: number;
  texture: Texture;
  tints?: number[];
  speed?: [number, number]; // px/s
  angle?: [number, number]; // radians
  gravity?: number; // px/s²
  drag?: number; // 0..1 per second
  life?: [number, number]; // seconds
  scale?: [number, number];
  scaleEnd?: number; // multiplier at end of life
  alpha?: number;
  fadeIn?: number; // seconds
  spin?: [number, number];
  additive?: boolean;
  /** spawn radius around the origin */
  spread?: number;
  /** stretch along velocity (spark/streak look) */
  stretch?: boolean;
}

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  drag: number;
  spin: number;
  s0: number;
  s1: number;
  a0: number;
  fadeIn: number;
  stretch: boolean;
}

const r = (a: [number, number]) => a[0] + Math.random() * (a[1] - a[0]);

/**
 * Pooled sprite particle system. One per scene; lives inside the scene's world (so
 * particles move with the camera) or in a screen-space layer.
 */
export class ParticleSystem {
  readonly view = new Container();
  private live: P[] = [];
  private pool: Sprite[] = [];
  /** reduced-motion multiplies counts down */
  density = 1;

  constructor(private readonly maxParticles = 700) {}

  burst(x: number, y: number, o: BurstOptions) {
    const count = Math.round((o.count ?? 20) * this.density);
    for (let i = 0; i < count && this.live.length < this.maxParticles; i++) {
      const s = this.pool.pop() ?? new Sprite();
      s.texture = o.texture;
      s.anchor.set(0.5);
      s.blendMode = o.additive ? 'add' : 'normal';
      s.tint = o.tints ? o.tints[Math.floor(Math.random() * o.tints.length)] : 0xffffff;
      const spread = o.spread ?? 0;
      const sa = Math.random() * Math.PI * 2;
      s.position.set(x + Math.cos(sa) * spread * Math.random(), y + Math.sin(sa) * spread * Math.random());
      const ang = r(o.angle ?? [0, Math.PI * 2]);
      const sp = r(o.speed ?? [80, 260]);
      const sc = r(o.scale ?? [0.3, 0.6]);
      s.scale.set(sc);
      s.rotation = Math.random() * Math.PI * 2;
      s.alpha = o.fadeIn ? 0 : (o.alpha ?? 1);
      s.visible = true;
      this.view.addChild(s);
      const life = r(o.life ?? [0.6, 1.1]);
      this.live.push({
        s,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life,
        max: life,
        g: o.gravity ?? 0,
        drag: o.drag ?? 0,
        spin: r(o.spin ?? [-3, 3]),
        s0: sc,
        s1: sc * (o.scaleEnd ?? 0.2),
        a0: o.alpha ?? 1,
        fadeIn: o.fadeIn ?? 0,
        stretch: !!o.stretch,
      });
    }
  }

  update(dt: number) {
    if (this.live.length === 0) return;
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.view.removeChild(p.s);
        this.pool.push(p.s);
        continue;
      }
      p.vy += p.g * dt;
      if (p.drag) {
        const k = Math.pow(1 - p.drag, dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      const t = 1 - p.life / p.max;
      const sc = p.s0 + (p.s1 - p.s0) * t;
      if (p.stretch) {
        p.s.rotation = Math.atan2(p.vy, p.vx);
        p.s.scale.set(sc * 1.6, sc * 0.6);
      } else {
        p.s.rotation += p.spin * dt;
        p.s.scale.set(sc);
      }
      const elapsed = p.max - p.life;
      p.s.alpha = p.fadeIn && elapsed < p.fadeIn ? (elapsed / p.fadeIn) * p.a0 : p.a0 * Math.min(1, (p.life / p.max) * 2.2);
      this.live[w++] = p;
    }
    this.live.length = w;
  }

  clear() {
    for (const p of this.live) {
      this.view.removeChild(p.s);
      this.pool.push(p.s);
    }
    this.live = [];
  }

  destroy() {
    this.clear();
    for (const s of this.pool) s.destroy();
    this.pool = [];
    this.view.destroy({ children: true });
  }
}
