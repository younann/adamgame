import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { color, font } from '@/design-system/tokens';
import { vGrad } from '../../draw/paint';

interface Tower {
  x: number;
  w: number;
  h: number;
  base: number;
}

interface Pulse {
  a: [number, number];
  b: [number, number];
  t: number;
  speed: number;
}

/**
 * Hero City environment: twilight sky, far + mid skyline (parallax layers), neon windows,
 * blinking antenna lights, energy grapple lines with travelling pulses, neon signs,
 * drifting clouds, and the near rooftop where Adam stands.
 */
export class Skyline {
  readonly far = new Container();
  readonly mid = new Container();
  readonly near = new Container();
  private sky = new Graphics();
  private stars = new Graphics();
  private moon: Sprite;
  private farG = new Graphics();
  private midG = new Graphics();
  private lines = new Graphics();
  private clouds = new Container();
  private signs = new Container();
  private antennas: Sprite[] = [];
  private roof = new Graphics();
  private padGlow: Sprite;
  private rings: Sprite[] = [];
  private starField: { x: number; y: number; r: number; p: number }[] = [];
  private pulses: Pulse[] = [];
  private t = 0;
  private w = 1;
  private h = 1;
  roofY = 0;

  constructor(private readonly glow: Texture, private readonly ring: Texture) {
    this.moon = new Sprite(glow);
    this.moon.anchor.set(0.5);
    this.moon.tint = 0xffe7b0;
    this.moon.blendMode = 'add';
    this.far.addChild(this.sky, this.stars, this.moon, this.farG, this.clouds);
    this.mid.addChild(this.midG, this.lines, this.signs);
    this.padGlow = new Sprite(glow);
    this.padGlow.anchor.set(0.5);
    this.padGlow.tint = color.blue;
    this.padGlow.blendMode = 'add';
    this.near.addChild(this.padGlow, this.roof);
    for (let i = 0; i < 4; i++) {
      const r = new Sprite(ring);
      r.anchor.set(0.5);
      r.blendMode = 'add';
      r.tint = i % 2 ? color.mint : color.gold;
      r.alpha = 0;
      this.rings.push(r);
      this.near.addChild(r);
    }
    for (let i = 0; i < 5; i++) {
      const c = new Graphics();
      for (let k = 0; k < 5; k++) c.ellipse(k * 28 - 56, Math.sin(k * 1.7) * 8, 38, 18 + (k % 2) * 6).fill({ color: 0xc9b8ff, alpha: 0.12 });
      (c as Graphics & { speed: number }).speed = 8 + Math.random() * 12;
      this.clouds.addChild(c);
    }
  }

  layout(w: number, h: number, roofY: number) {
    this.w = w;
    this.h = h;
    this.roofY = roofY;
    const W0 = -w * 0.6;
    const W1 = w * 1.6;
    this.sky.clear().rect(W0, -h, W1 - W0, h * 2.5).fill(vGrad([[0, 0x070b2e], [0.35, 0x151d63], [0.62, 0x3a2f8f], [0.8, 0xb04e8c], [1, 0xff9a5c]]));
    this.starField = Array.from({ length: Math.round(w / 6) }, () => ({ x: W0 + Math.random() * (W1 - W0), y: -h * 0.2 + Math.random() * h * 0.5, r: 0.6 + Math.random() * 1.5, p: Math.random() * 6 }));
    this.moon.position.set(w * 0.82, h * 0.12);
    this.moon.scale.set(Math.min(w, h) / 260);

    // far skyline silhouettes
    const horizon = roofY - h * 0.14;
    const fg = this.farG.clear();
    for (let x = W0; x < W1; ) {
      const tw = 24 + Math.random() * 46;
      const th = h * (0.12 + Math.random() * 0.22);
      fg.rect(x, horizon - th, tw, th + h).fill(0x1c1f5a);
      for (let wy = horizon - th + 8; wy < horizon; wy += 12) {
        for (let wx = x + 5; wx < x + tw - 5; wx += 9) if (Math.random() < 0.35) fg.rect(wx, wy, 3, 4).fill({ color: 0xffd98a, alpha: 0.5 });
      }
      x += tw + 2;
    }

    // mid towers: bluer, neon, antenna lights
    const midBase = roofY + 4;
    const towers: Tower[] = [];
    const mg = this.midG.clear();
    for (const a of this.antennas) a.destroy();
    this.antennas = [];
    for (const s of this.signs.removeChildren()) s.destroy();
    let x = W0;
    let i = 0;
    while (x < W1) {
      const tw = Math.min(w, h) * (0.12 + Math.random() * 0.1);
      const th = h * (0.24 + Math.random() * 0.3);
      towers.push({ x, w: tw, h: th, base: midBase });
      const top = midBase - th;
      mg.roundRect(x, top, tw, th + h, 6).fill(vGrad([[0, 0x2f4fc0], [1, 0x0f1a4a]]));
      mg.roundRect(x, top, tw, th + h, 6).stroke({ width: 2, color: i % 3 === 0 ? color.mint : color.blue, alpha: 0.8 });
      mg.rect(x + 3, top + 3, tw * 0.18, th - 6).fill({ color: 0xffffff, alpha: 0.07 });
      for (let wy = top + 12; wy < midBase - 10; wy += 15) {
        for (let wx = x + 7; wx < x + tw - 9; wx += 12) {
          const r = Math.random();
          if (r < 0.55) mg.roundRect(wx, wy, 6, 8, 1.5).fill({ color: r < 0.18 ? 0x67e8f9 : 0xfff3a3, alpha: 0.85 });
        }
      }
      // antenna
      mg.rect(x + tw / 2 - 1.5, top - 26, 3, 26).fill(0x8c90a1);
      const a = new Sprite(this.glow);
      a.anchor.set(0.5);
      a.position.set(x + tw / 2, top - 28);
      a.scale.set(0.22);
      a.tint = i % 2 ? color.red : color.mint;
      a.blendMode = 'add';
      this.antennas.push(a);
      this.mid.addChild(a);
      // neon sign on some towers
      if (i % 3 === 1 && th > h * 0.3) {
        const label = ['HERO', '★', 'ZAP!', 'آدم'][i % 4];
        const sign = new Text({
          text: label,
          style: { fontFamily: font.display, fontWeight: '900', fontSize: Math.max(14, tw * 0.28), fill: i % 2 ? color.mint : color.gold, stroke: { color: 0x0a0f2c, width: 3 } },
        });
        sign.anchor.set(0.5);
        sign.position.set(x + tw / 2, top + th * 0.25);
        this.signs.addChild(sign);
      }
      x += tw + Math.min(w, h) * (0.03 + Math.random() * 0.06);
      i++;
    }

    // grapple lines between neighbouring towers
    this.pulses = [];
    for (let k = 0; k < towers.length - 1; k++) {
      if (k % 2) continue;
      const A = towers[k];
      const B = towers[k + 1];
      this.pulses.push({
        a: [A.x + A.w, A.base - A.h * 0.7],
        b: [B.x, B.base - B.h * 0.6],
        t: Math.random(),
        speed: 0.3 + Math.random() * 0.4,
      });
    }

    // near rooftop
    const g = this.roof.clear();
    g.rect(W0, roofY, W1 - W0, h * 1.5).fill(vGrad([[0, 0x3a4470], [0.12, 0x232a4d], [1, 0x0d1230]]));
    g.rect(W0, roofY - 6, W1 - W0, 10).fill(0x4a5590);
    g.rect(W0, roofY - 6, W1 - W0, 3).fill({ color: color.blue, alpha: 0.95 });
    // railing
    for (let rx = W0; rx < W1; rx += 34) g.rect(rx, roofY - 34, 4, 30).fill(0x5d6aa8);
    g.rect(W0, roofY - 36, W1 - W0, 4).fill(0x7c8ad0);
    // vents
    const K = Math.min(w, h * 0.6) / 400;
    for (const vx of [w * 0.08, w * 0.9]) {
      g.roundRect(vx - 18 * K, roofY + 10 * K, 36 * K, 26 * K, 6 * K).fill(0x4a5590).stroke({ width: 2, color: 0x7c8ad0 });
      for (let k = 0; k < 3; k++) g.rect(vx - 12 * K, roofY + (16 + k * 7) * K, 24 * K, 3 * K).fill(0x232a4d);
    }
    // hero pad
    const padX = w / 2;
    const padY = roofY + Math.min(h * 0.09, 70 * K);
    g.ellipse(padX, padY, 120 * K, 30 * K).fill({ color: 0x0a0f2c, alpha: 0.6 });
    g.ellipse(padX, padY, 120 * K, 30 * K).stroke({ width: 4 * K, color: color.mint, alpha: 0.9 });
    g.ellipse(padX, padY, 84 * K, 20 * K).stroke({ width: 2 * K, color: color.gold, alpha: 0.6 });
    this.padGlow.position.set(padX, padY);
    this.padGlow.scale.set(3.2 * K, 0.9 * K);
    this.rings.forEach((r, k) => {
      r.position.set(k % 2 ? w * 0.9 : w * 0.08, roofY + 10 * K);
      (r as Sprite & { phase: number }).phase = k * 0.6;
    });
    this.clouds.children.forEach((c, k) => {
      c.position.set(W0 + Math.random() * (W1 - W0), h * (0.08 + k * 0.08));
      c.scale.set(K);
    });
  }

  update(dt: number, reduced: boolean) {
    this.t += dt;
    const sg = this.stars.clear();
    for (const s of this.starField) sg.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.35 + Math.sin(this.t * 2 + s.p) * 0.3 });
    this.moon.alpha = 0.75 + Math.sin(this.t * 0.7) * 0.1;
    for (const c of this.clouds.children) {
      c.x += (c as Graphics & { speed: number }).speed * dt;
      if (c.x > this.w * 1.6) c.x = -this.w * 0.6;
    }
    this.antennas.forEach((a, i) => (a.alpha = Math.sin(this.t * 3 + i * 1.3) > 0.2 ? 0.95 : 0.25));
    this.signs.children.forEach((s, i) => (s.alpha = Math.sin(this.t * 2.2 + i * 2) > -0.7 ? 1 : 0.35));
    const lg = this.lines.clear();
    for (const p of this.pulses) {
      const [ax, ay] = p.a;
      const [bx, by] = p.b;
      const mx = (ax + bx) / 2;
      const my = Math.max(ay, by) + 22;
      lg.moveTo(ax, ay).quadraticCurveTo(mx, my, bx, by).stroke({ width: 3, color: 0xdff6ff, alpha: 0.45 });
      lg.moveTo(ax, ay).quadraticCurveTo(mx, my, bx, by).stroke({ width: 8, color: color.blue, alpha: 0.15 });
      p.t = (p.t + dt * p.speed * (reduced ? 0.4 : 1)) % 1;
      const s = p.t;
      const px = (1 - s) * (1 - s) * ax + 2 * (1 - s) * s * mx + s * s * bx;
      const py = (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * my + s * s * by;
      lg.circle(px, py, 5).fill({ color: color.mint, alpha: 0.9 });
      lg.circle(px, py, 11).fill({ color: color.mint, alpha: 0.25 });
    }
    this.padGlow.alpha = 0.45 + Math.sin(this.t * 2.4) * 0.15;
    for (const r of this.rings) {
      const ph = ((this.t * 0.45 + (r as Sprite & { phase: number }).phase) % 1);
      r.scale.set(0.15 + ph * 0.6);
      r.alpha = (1 - ph) * 0.6;
      r.y = this.roofY + 10 - ph * 60;
    }
  }

  /** Parallax: far layers move less than the camera. */
  parallax(camX: number, camY: number, cx: number, cy: number) {
    const dx = camX - cx;
    const dy = camY - cy;
    this.far.position.set(dx * 0.7, dy * 0.7);
    this.mid.position.set(dx * 0.35, dy * 0.35);
  }
}
