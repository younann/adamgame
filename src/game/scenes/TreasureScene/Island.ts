import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { gameText, starPoints, vGrad } from '../../draw/paint';

/** Geometry of the side-scrolling island for the current viewport. */
export interface IslandGeo {
  w: number;
  h: number;
  K: number;
  landscape: boolean;
  horizonY: number;
  beachY: number;
  backY: number;
  chestY: number;
  spacing: number;
  span: number;
  stopX(i: number): number;
  adamX(i: number): number;
  caveX: number;
  endX: number;
}

export function makeGeo(w: number, h: number, safeBottom: number): IslandGeo {
  const landscape = w > h * 1.1;
  const K = Math.min(w, h) / 400;
  const span = landscape ? w * 0.75 : w * 1.05;
  const spacing = landscape ? Math.min(w * 0.17, 210) : Math.min(w * 0.3, 150);
  const stopX = (i: number) => w * 0.5 + i * span;
  return {
    w,
    h,
    K,
    landscape,
    horizonY: h * (landscape ? 0.36 : 0.38),
    beachY: h * (landscape ? 0.5 : 0.5),
    backY: h * (landscape ? 0.66 : 0.63),
    chestY: Math.min(h * (landscape ? 0.86 : 0.8), h - safeBottom - 30 * K),
    spacing,
    span,
    stopX,
    adamX: (i: number) => stopX(i) - spacing * (landscape ? 1.75 : 1.3),
    caveX: stopX(0) - w * (landscape ? 0.75 : 0.95),
    endX: stopX(3) + w * 0.9,
  };
}

/**
 * Screen-space parallax backdrop: golden-hour sky, sun, distant islands, clouds, seagulls.
 */
export class IslandBackdrop {
  readonly view = new Container();
  private sky = new Graphics();
  private sun: Sprite;
  private far = new Graphics();
  private clouds = new Graphics();
  private gulls = new Graphics();
  private g!: IslandGeo;
  private t = 0;
  private gullList: { x: number; y: number; s: number; v: number }[] = [];

  constructor(glow: Texture) {
    this.sun = new Sprite(glow);
    this.sun.anchor.set(0.5);
    this.sun.tint = 0xffd27a;
    this.sun.blendMode = 'add';
    this.view.addChild(this.sky, this.sun, this.far, this.clouds, this.gulls);
  }

  layout(g: IslandGeo) {
    this.g = g;
    this.sky.clear().rect(0, 0, g.w, g.horizonY + 4).fill(vGrad([[0, 0x0b1a46], [0.55, 0x2f4fa0], [0.85, 0xf2a65a], [1, 0xffd28a]]));
    this.sun.position.set(g.w * 0.7, g.horizonY - 30 * g.K);
    this.sun.scale.set(2.6 * g.K);
    this.gullList = Array.from({ length: 4 }, (_, i) => ({ x: Math.random() * g.w, y: g.horizonY * (0.3 + i * 0.15), s: (0.6 + Math.random() * 0.5) * g.K, v: 18 + Math.random() * 20 }));
  }

  update(dt: number, camX: number) {
    const g = this.g;
    if (!g) return;
    this.t += dt;
    // distant islands drift with parallax 0.15
    const f = this.far.clear();
    const off = -(camX * 0.15) % (g.w * 1.2);
    for (let k = -1; k < 3; k++) {
      const bx = off + k * g.w * 1.2;
      f.ellipse(bx + g.w * 0.2, g.horizonY + 2, 90 * g.K, 22 * g.K).fill({ color: 0x2a3d6e, alpha: 0.85 });
      f.ellipse(bx + g.w * 0.75, g.horizonY + 2, 60 * g.K, 14 * g.K).fill({ color: 0x324a80, alpha: 0.8 });
      f.moveTo(bx + g.w * 0.2, g.horizonY - 20 * g.K).lineTo(bx + g.w * 0.2 + 3, g.horizonY - 2).stroke({ width: 2, color: 0x2a3d6e });
    }
    const c = this.clouds.clear();
    const coff = -(camX * 0.3 + this.t * 8) % (g.w * 1.4);
    for (let k = -1; k < 3; k++) {
      const cx = coff + k * g.w * 1.4;
      for (const [dx, dy, r] of [[0.1, 0.18, 26], [0.16, 0.16, 34], [0.23, 0.19, 24], [0.62, 0.1, 22], [0.68, 0.08, 30], [0.74, 0.11, 20]] as const) {
        c.circle(cx + g.w * dx, g.horizonY * dy + 20, r * g.K).fill({ color: 0xffffff, alpha: 0.1 });
      }
    }
    // seagulls flapping across the sky
    const gl = this.gulls.clear();
    for (const s of this.gullList) {
      s.x += s.v * dt;
      if (s.x > g.w + 40) s.x = -40;
      const flap = Math.sin(this.t * 8 + s.y) * 6 * s.s;
      gl.moveTo(s.x - 12 * s.s, s.y + flap).quadraticCurveTo(s.x - 5 * s.s, s.y - 4 * s.s, s.x, s.y).quadraticCurveTo(s.x + 5 * s.s, s.y - 4 * s.s, s.x + 12 * s.s, s.y + flap).stroke({ width: 2.5 * s.s, color: 0xffffff, alpha: 0.85 });
    }
    this.sun.alpha = 0.75 + Math.sin(this.t * 0.8) * 0.1;
  }
}

/** World-space island scenery: sea, beach, palms, cave, rope bridge, boat, map sign. */
export class IslandScenery {
  readonly back = new Container(); // sea + boat + far beach
  readonly ground = new Container(); // sand + props (behind actors)
  private sea = new Graphics();
  private waves = new Graphics();
  private boat = new Container();
  private sand = new Graphics();
  private props = new Graphics();
  private foam = new Graphics();
  private palms: Container[] = [];
  private sparkles: Sprite[] = [];
  private g!: IslandGeo;
  private t = 0;

  constructor(private readonly glow: Texture) {
    this.back.addChild(this.sea, this.waves, this.boat);
    this.ground.addChild(this.sand, this.foam, this.props);
  }

  layout(g: IslandGeo) {
    this.g = g;
    const K = g.K;
    const x0 = g.caveX - g.w;
    const x1 = g.endX + g.w;
    this.sea.clear().rect(x0, g.horizonY, x1 - x0, g.beachY - g.horizonY + 40 * K).fill(vGrad([[0, 0x2f7fd0], [1, 0x1aa6b8]]));

    // boat moored between stop 1 and 2
    this.boat.removeChildren().forEach((c) => c.destroy());
    const b = new Graphics();
    b.poly([-60, 0, 60, 0, 44, 26, -44, 26]).fill(0x8a4a20).stroke({ width: 3, color: 0x4a2a10 });
    b.rect(-56, 4, 112, 5).fill(0xffffff);
    b.moveTo(0, 0).lineTo(0, -92).stroke({ width: 5, color: 0x4a2a10 });
    b.poly([4, -88, 58, -20, 4, -20]).fill(0xfff6e0).stroke({ width: 2, color: 0xc8a25a });
    b.poly([-4, -80, -44, -24, -4, -24]).fill(0xffffff).stroke({ width: 2, color: 0xc8a25a });
    b.poly([0, -92, 22, -86, 0, -80]).fill(color.red);
    this.boat.addChild(b);
    this.boat.position.set((g.stopX(1) + g.stopX(2)) / 2, (g.horizonY + g.beachY) / 2 + 8 * K);
    this.boat.scale.set(0.7 * K);

    // sand with a wavy top edge, and a creek crossed by a rope bridge
    const s = this.sand.clear();
    const pts: number[] = [];
    for (let x = x0; x <= x1; x += 40 * K) pts.push(x, g.beachY + Math.sin(x * 0.01) * 8 * K);
    pts.push(x1, g.h + 200, x0, g.h + 200);
    s.poly(pts).fill(vGrad([[0, 0xf2d79a], [0.35, 0xe8c27a], [1, 0xc9984e]]));
    const creekX = (g.stopX(0) + g.stopX(1)) / 2;
    const cw = 70 * K;
    s.poly([creekX - cw * 0.6, g.beachY + 4, creekX + cw * 0.6, g.beachY + 4, creekX + cw, g.h + 200, creekX - cw, g.h + 200]).fill(vGrad([[0, 0x2f9ad0], [1, 0x1a6ea8]]));

    const p = this.props.clear();
    // bridge planks + ropes over the creek (at walking depth)
    const by = g.backY;
    for (let i = -4; i <= 4; i++) {
      p.roundRect(creekX + i * 16 * K - 7 * K, by - 6 * K + Math.abs(i) * 1.5 * K, 14 * K, 16 * K, 3 * K).fill(0x9a5b2e).stroke({ width: 2, color: 0x5a3010 });
    }
    for (const dy of [-46, -20]) {
      p.moveTo(creekX - 80 * K, by + dy * K).quadraticCurveTo(creekX, by + (dy + 14) * K, creekX + 80 * K, by + dy * K).stroke({ width: 3 * K, color: 0xc8a25a });
    }
    for (const sx of [-1, 1]) p.rect(creekX + sx * 80 * K - 4 * K, by - 56 * K, 8 * K, 62 * K).fill(0x6b3f1d);

    // cave at the start
    const cx = g.caveX;
    p.ellipse(cx, g.backY - 10 * K, 150 * K, 150 * K).fill(0x6b5a4a);
    p.ellipse(cx + 20 * K, g.backY - 40 * K, 110 * K, 120 * K).fill(0x857160);
    p.ellipse(cx + 40 * K, g.backY - 6 * K, 54 * K, 80 * K).fill(0x1a1410);
    p.circle(cx - 40 * K, g.backY - 120 * K, 18 * K).fill({ color: 0xa08a74, alpha: 0.8 });

    // treasure-map signpost
    const mx = g.stopX(0) - g.spacing * 2.3;
    p.rect(mx - 4 * K, g.backY - 90 * K, 8 * K, 92 * K).fill(0x6b3f1d);
    p.roundRect(mx - 46 * K, g.backY - 130 * K, 92 * K, 62 * K, 6 * K).fill(0xf1d9a4).stroke({ width: 3 * K, color: 0x8a5a20 });
    for (let i = 0; i < 5; i++) p.circle(mx - 32 * K + i * 12 * K, g.backY - 100 * K + Math.sin(i) * 8 * K, 2.5 * K).fill(0x8a3a20);
    p.moveTo(mx + 26 * K, g.backY - 110 * K).lineTo(mx + 38 * K, g.backY - 98 * K).moveTo(mx + 38 * K, g.backY - 110 * K).lineTo(mx + 26 * K, g.backY - 98 * K).stroke({ width: 4 * K, color: 0xd0302a });

    // shells, starfish and rocks
    for (let x = x0 + 60 * K; x < x1; x += 170 * K) {
      const y = g.beachY + 40 * K + ((x * 7) % 60) * K;
      if (Math.abs(x - creekX) < 120 * K) continue;
      if (((x / K) | 0) % 3 === 0) p.poly(starPoints(9 * K, 0.45).map((v, i) => v + (i % 2 ? y : x))).fill(0xff8a5c);
      else p.ellipse(x, y, 12 * K, 7 * K).fill(0x8c8478).ellipse(x - 3 * K, y - 2 * K, 5 * K, 2.5 * K).fill({ color: 0xffffff, alpha: 0.35 });
    }

    // palms
    for (const pc of this.palms) pc.destroy({ children: true });
    this.palms = [];
    const palmXs: number[] = [];
    for (let x = g.caveX + g.w * 0.35; x < g.endX; x += g.span * 0.5) palmXs.push(x + g.span * 0.12);
    for (const [i, x] of palmXs.entries()) {
      const pc = this.makePalm(K * (0.85 + (i % 3) * 0.15));
      pc.position.set(x, g.beachY + 18 * K);
      this.palms.push(pc);
      this.ground.addChildAt(pc, 1);
    }

    // sparkles on the sand
    for (const sp of this.sparkles) sp.destroy();
    this.sparkles = Array.from({ length: 10 }, () => {
      const sp = new Sprite(this.glow);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.tint = color.gold;
      sp.scale.set(0.15 * K);
      sp.alpha = 0;
      this.ground.addChild(sp);
      return sp;
    });
  }

  private makePalm(k: number) {
    const c = new Container();
    const trunk = new Graphics();
    trunk.moveTo(0, 0).quadraticCurveTo(-18, -70, 6, -150).stroke({ width: 13, color: 0x8a5a33, cap: 'round' });
    for (let i = 0; i < 7; i++) trunk.moveTo(-6 - i * 0.4, -20 * i).lineTo(8, -20 * i - 4).stroke({ width: 2, color: 0x5a3a20, alpha: 0.6 });
    const crown = new Container();
    crown.position.set(6, -150);
    const fr = new Graphics();
    for (const a of [-2.9, -2.3, -1.7, -1.1, -0.4, 0.2]) {
      fr.moveTo(0, 0)
        .quadraticCurveTo(Math.cos(a) * 40, Math.sin(a) * 40 - 14, Math.cos(a) * 70, Math.sin(a) * 70 + 16)
        .stroke({ width: 12, color: 0x23a35a, cap: 'round' });
    }
    fr.circle(-6, 6, 8).fill(0x6b3f1d).circle(6, 8, 8).fill(0x6b3f1d);
    crown.addChild(fr);
    c.addChild(trunk, crown);
    c.scale.set(k);
    return c;
  }

  update(dt: number, camX: number, reduced: boolean) {
    const g = this.g;
    if (!g) return;
    this.t += dt;
    const K = g.K;
    const amp = reduced ? 0.4 : 1;
    // waves only over the visible stretch
    const w = this.waves.clear();
    const xa = camX - g.w;
    const xb = camX + g.w;
    for (let row = 0; row < 4; row++) {
      const y = g.horizonY + (g.beachY - g.horizonY) * (0.2 + row * 0.22);
      for (let x = Math.floor(xa / 60) * 60; x < xb; x += 60 * K) {
        const yy = y + Math.sin(this.t * 1.6 + x * 0.03 + row) * 3 * K * amp;
        w.moveTo(x, yy).quadraticCurveTo(x + 14 * K, yy - 5 * K, x + 28 * K, yy).stroke({ width: 2 * K, color: 0xffffff, alpha: 0.35 });
      }
    }
    // shoreline foam breathing in/out
    const f = this.foam.clear();
    const fo = Math.sin(this.t * 1.2) * 5 * K * amp;
    for (let x = Math.floor(xa / 40) * 40; x < xb; x += 40 * K) {
      f.ellipse(x, g.beachY + Math.sin(x * 0.01) * 8 * K + 2 + fo, 22 * K, 4 * K).fill({ color: 0xffffff, alpha: 0.55 });
    }
    this.boat.y = (g.horizonY + g.beachY) / 2 + 8 * K + Math.sin(this.t * 1.3) * 4 * K * amp;
    this.boat.rotation = Math.sin(this.t * 1.1) * 0.04 * amp;
    for (const [i, p] of this.palms.entries()) {
      const crown = p.children[1];
      crown.rotation = Math.sin(this.t * 1.4 + i) * 0.07 * amp;
    }
    for (const sp of this.sparkles) {
      if (sp.alpha > 0) sp.alpha = Math.max(0, sp.alpha - dt * 1.5);
      else if (Math.random() < 0.02) {
        sp.position.set(camX + (Math.random() - 0.5) * g.w, g.beachY + 30 * K + Math.random() * (g.h - g.beachY - 40 * K));
        sp.alpha = 1;
      }
    }
  }
}

export { gameText };
