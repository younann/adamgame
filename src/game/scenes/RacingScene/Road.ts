import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { vGrad } from '../../draw/paint';

/** Near plane distance: an object at d = D0 sits at the bottom of the screen (v = 1). */
export const D0 = 20;
const FAR = 700;
const SEG = 8; // distance per rumble segment

interface RoadsideItem {
  c: Container;
  d: number;
  side: -1 | 1;
  off: number;
}

/**
 * Pseudo-3D neon circuit: synthwave sky + sun, city skyline, neon ground grid, perspective
 * road with scrolling rumble strips / lane dashes / speed arrows, and roadside poles,
 * trees, grandstands and signs streaming past with parallax.
 */
export class Road {
  readonly back = new Container();
  readonly props = new Container();
  private sky = new Graphics();
  private sun = new Graphics();
  private skyline = new Graphics();
  private starsG = new Graphics();
  private ground = new Graphics();
  private items: RoadsideItem[] = [];
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private t = 0;
  offset = 0;
  w = 1;
  h = 1;
  cx = 0;
  hy = 0;
  by = 1;
  RB = 300;
  landscape = false;

  constructor(private readonly glow: Texture) {
    this.props.sortableChildren = true;
    this.back.addChild(this.sky, this.starsG, this.sun, this.skyline, this.ground);
  }

  v(d: number) {
    return D0 / Math.max(d, 1);
  }
  y(d: number) {
    return this.hy + (this.by - this.hy) * this.v(d);
  }
  x(u: number, d: number) {
    return this.cx + u * this.RB * this.v(d);
  }
  /** display scale of an object at distance d */
  s(d: number) {
    return (this.v(d) * this.RB) / 300;
  }

  layout(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.landscape = w > h * 1.1;
    this.hy = h * (this.landscape ? 0.36 : 0.33);
    this.by = h * 1.02;
    this.RB = this.landscape ? Math.min(w * 0.42, h * 0.75) : w * 0.82;
    const hy = this.hy;
    this.sky.clear().rect(-w, -h, w * 3, hy + h + 2).fill(vGrad([[0, 0x050816], [0.45, 0x1a1450], [0.8, 0x5a1f7a], [1, 0xff4f9a]]));
    this.stars = Array.from({ length: Math.round(w / 8) }, () => ({ x: Math.random() * w, y: Math.random() * hy * 0.7, r: 0.5 + Math.random() * 1.5, p: Math.random() * 6 }));
    // synthwave sun with stripes
    const sr = Math.min(w, h) * 0.17;
    const sg = this.sun.clear();
    sg.circle(this.cx, hy - sr * 0.15, sr).fill(vGrad([[0, 0xffe066], [0.6, 0xff8a1f], [1, 0xff3d8b]]));
    for (let i = 0; i < 5; i++) sg.rect(this.cx - sr, hy - sr * 0.15 + sr * (0.1 + i * 0.18), sr * 2, sr * (0.04 + i * 0.015)).fill(0x5a1f7a);
    // neon city skyline
    const k = this.skyline.clear();
    let x = -w * 0.2;
    while (x < w * 1.2) {
      const bw = 18 + Math.random() * 34;
      const bh = 20 + Math.random() * (this.landscape ? 90 : 70);
      k.rect(x, hy - bh, bw, bh + 2).fill(0x150c33);
      k.rect(x, hy - bh, bw, 2).fill({ color: Math.random() < 0.5 ? 0x67e8f9 : 0xff6fb5, alpha: 0.9 });
      for (let wy = hy - bh + 8; wy < hy - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (Math.random() < 0.35) k.rect(wx, wy, 3, 4).fill({ color: 0xfff3a3, alpha: 0.7 });
      x += bw + 2 + Math.random() * 6;
    }
    if (this.items.length === 0) this.spawnItems();
  }

  private spawnItems() {
    const n = this.landscape ? 26 : 20;
    for (let i = 0; i < n; i++) {
      const side: -1 | 1 = i % 2 ? 1 : -1;
      const kind = ['pole', 'tree', 'stand', 'pole', 'sign', 'tree'][Math.floor(Math.random() * 6)];
      const c = this.makeItem(kind, side);
      const item = { c, d: D0 + 10 + (i * (FAR - D0)) / n, side, off: 1.25 + Math.random() * (kind === 'stand' ? 0.6 : 0.35) + (kind === 'stand' ? 0.35 : 0) };
      this.items.push(item);
      this.props.addChild(c);
    }
  }

  private makeItem(kind: string, side: number): Container {
    const c = new Container();
    const g = new Graphics();
    c.addChild(g);
    if (kind === 'pole') {
      g.rect(-4, -230, 8, 230).fill(0x3a3f52);
      g.rect(-4 + side * -4, -232, side * -60, 8).fill(0x3a3f52);
      g.roundRect(side * -60 - 16, -238, 32, 14, 5).fill(0xf8fbff);
      const l = new Sprite(this.glow);
      l.anchor.set(0.5);
      l.position.set(side * -60, -228);
      l.scale.set(1.2);
      l.tint = 0x9fd8ff;
      l.blendMode = 'add';
      c.addChild(l);
    } else if (kind === 'tree') {
      g.rect(-8, -70, 16, 70).fill(0x5a3a20);
      g.circle(0, -100, 48).fill(0x1f7a46);
      g.circle(-20, -84, 30).fill(0x26935a);
      g.circle(22, -88, 28).fill(0x2fa866);
      g.circle(-12, -116, 18).fill({ color: 0x6fe39a, alpha: 0.5 });
    } else if (kind === 'stand') {
      g.poly([-120, 0, 120, 0, 110, -150, -110, -150]).fill(0x1d2547);
      g.rect(-125, -160, 250, 14).fill(0x0a1024);
      g.rect(-125, -148, 250, 3).fill(color.blue);
      const cols = [color.gold, 0xffffff, color.blue, color.mint, 0xff6fb5, color.red];
      for (let r = 0; r < 6; r++) for (let i = 0; i < 18; i++) {
        const xx = -104 + i * 12.2 + (r % 2) * 5;
        const yy = -136 + r * 22;
        g.circle(xx, yy, 5).fill(cols[(i * 7 + r * 3) % cols.length]);
        g.circle(xx, yy - 7, 3.5).fill(0xe9b48a);
      }
    } else {
      // neon chevron sign
      g.rect(-4, -120, 8, 120).fill(0x3a3f52);
      g.roundRect(-60, -190, 120, 70, 12).fill(0x0d1322).stroke({ width: 4, color: 0x67e8f9 });
      for (let i = 0; i < 3; i++) {
        const x0 = -36 + i * 26;
        g.poly(side > 0 ? [x0 + 14, -172, x0 + 28, -155, x0 + 14, -138, x0 + 4, -138, x0 + 18, -155, x0 + 4, -172] : [x0 + 14, -172, x0, -155, x0 + 14, -138, x0 + 24, -138, x0 + 10, -155, x0 + 24, -172]).fill(i === 1 ? color.gold : 0xff6fb5);
      }
    }
    return c;
  }

  update(dt: number, speed: number, steer: number) {
    this.t += dt;
    this.offset += speed * dt;
    const { w, cx, hy } = this;
    const sg = this.starsG.clear();
    for (const s of this.stars) sg.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.35 + Math.sin(this.t * 2 + s.p) * 0.3 });
    // gentle parallax: skyline drifts opposite to steering
    this.skyline.x += (-steer * 30 - this.skyline.x) * Math.min(1, dt * 3);
    this.sun.x = this.skyline.x * 0.4;

    const g = this.ground.clear();
    g.rect(-w, hy, w * 3, this.h - hy + 4).fill(vGrad([[0, 0x1a0b3a], [1, 0x07041a]]));
    // neon ground grid (horizontal lines scroll toward the camera)
    const gridL = SEG * 4;
    const gStart = D0 - (this.offset % gridL);
    for (let d = gStart; d < FAR; d += gridL) {
      if (d < D0 * 0.95) continue;
      const y = this.y(d);
      g.rect(-w, y, w * 3, Math.max(1, 2 * this.v(d))).fill({ color: 0xff3d8b, alpha: 0.18 + 0.4 * this.v(d) });
    }
    for (const u of [-6, -4, -3, -2.2, 2.2, 3, 4, 6]) {
      g.moveTo(cx, hy).lineTo(this.x(u, D0 * 0.9), this.y(D0 * 0.9)).stroke({ width: 1.5, color: 0xff3d8b, alpha: 0.25 });
    }
    // road surface
    const nearD = D0 * 0.92;
    g.poly([this.x(-1, FAR), this.y(FAR), this.x(1, FAR), this.y(FAR), this.x(1, nearD), this.y(nearD), this.x(-1, nearD), this.y(nearD)]).fill(vGrad([[0, 0x2a2440], [1, 0x343a52]]));
    // segments: rumble strips, lane dashes, speed arrows
    const start = D0 * 0.92 - (this.offset % (SEG * 2));
    let idx = Math.floor((this.offset + start) / SEG);
    for (let d = start; d < FAR; d += SEG, idx++) {
      const d1 = d + SEG;
      if (d1 < nearD * 0.98) continue;
      const a = Math.max(d, nearD * 0.9);
      const y0 = this.y(a);
      const y1 = this.y(d1);
      const quad = (u0: number, u1: number, c: number, alpha = 1) =>
        g.poly([this.x(u0, a), y0, this.x(u1, a), y0, this.x(u1, d1), y1, this.x(u0, d1), y1]).fill({ color: c, alpha });
      const even = idx % 2 === 0;
      quad(-1.12, -1, even ? 0xff3d3d : 0xffffff);
      quad(1, 1.12, even ? 0xff3d3d : 0xffffff);
      quad(-1.0, -0.97, 0x67e8f9, 0.9);
      quad(0.97, 1.0, 0x67e8f9, 0.9);
      if (even) {
        quad(-0.35, -0.32, 0xffffff, 0.75);
        quad(0.32, 0.35, 0xffffff, 0.75);
      }
      // neon speed arrows every 10 segments
      if (((idx % 10) + 10) % 10 === 0) {
        const am = (a + d1) / 2;
        const ya = this.y(am);
        const s = this.v(am);
        for (const u of [-0.66, 0, 0.66]) {
          const xa = this.x(u, am);
          g.poly([xa - 30 * s * (this.RB / 300), ya + 14 * s, xa, ya - 14 * s, xa + 30 * s * (this.RB / 300), ya + 14 * s, xa, ya]).fill({ color: color.mint, alpha: 0.55 });
        }
      }
    }
    // horizon glow line
    g.rect(-w, hy - 1, w * 3, 3).fill({ color: 0xff6fb5, alpha: 0.8 });

    // roadside items stream past
    for (const it of this.items) {
      it.d -= speed * dt;
      if (it.d < D0 * 0.75) it.d += FAR - D0;
      const s = this.s(it.d);
      it.c.position.set(this.x(it.side * it.off, it.d), this.y(it.d));
      it.c.scale.set(s);
      it.c.alpha = Math.min(1, (FAR - it.d) / 120);
      it.c.zIndex = Math.round(10000 - it.d * 10);
      it.c.visible = it.d < FAR - 5;
    }
  }
}
