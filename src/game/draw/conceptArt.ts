import { Container, Graphics } from 'pixi.js';
import { color, conceptColor } from '@/design-system/tokens';
import type { ConceptVisual } from '@/learning/types';
import { gameText, rGrad, shade, starPoints } from './paint';

/**
 * Procedural pictures for learning concepts (colours, numbers, shapes, vocabulary icons).
 * Simple, bold, readable for a 4-year-old — no external images required, so it works offline.
 */
export function drawConcept(v: ConceptVisual, size: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const r = size / 2;
  switch (v.kind) {
    case 'color': {
      const col = conceptColor[v.key] ?? 0xffffff;
      g.circle(0, 0, r).fill(rGrad([[0, shade(col, 0.35)], [0.7, col], [1, shade(col, -0.25)]], 0.38, 0.35));
      g.circle(0, 0, r).stroke({ width: Math.max(3, r * 0.08), color: 0xffffff, alpha: 0.9 });
      g.ellipse(-r * 0.3, -r * 0.38, r * 0.3, r * 0.16).fill({ color: 0xffffff, alpha: 0.55 });
      break;
    }
    case 'number': {
      const t = gameText(String(v.value ?? v.key), size * 0.9, { fillColor: color.white, strokeColor: color.blueDeepest });
      c.addChild(t);
      break;
    }
    case 'shape':
      drawShape(g, v.key, r);
      break;
    case 'icon':
      drawIcon(g, v.key, r, c);
      break;
  }
  return c;
}

export function drawShape(g: Graphics, key: string, r: number, fill = color.gold) {
  const stroke = { width: Math.max(3, r * 0.1), color: 0xffffff };
  switch (key) {
    case 'circle':
      g.circle(0, 0, r * 0.85).fill(fill).stroke(stroke);
      break;
    case 'square':
      g.roundRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5, r * 0.12).fill(fill).stroke(stroke);
      break;
    case 'triangle':
      g.poly([0, -r * 0.9, r * 0.9, r * 0.7, -r * 0.9, r * 0.7]).fill(fill).stroke({ ...stroke, join: 'round' });
      break;
    case 'star':
      g.poly(starPoints(r * 0.95, 0.48)).fill(fill).stroke({ ...stroke, join: 'round' });
      break;
    case 'heart':
      g.moveTo(0, r * 0.8)
        .bezierCurveTo(-r * 1.2, 0, -r * 0.6, -r * 0.95, 0, -r * 0.35)
        .bezierCurveTo(r * 0.6, -r * 0.95, r * 1.2, 0, 0, r * 0.8)
        .fill(fill)
        .stroke(stroke);
      break;
  }
}

/** Bold icon drawings for English vocabulary. */
function drawIcon(g: Graphics, key: string, r: number, c: Container) {
  const s = r / 50; // design at radius 50
  const P = (pts: number[]) => pts.map((v) => v * s);
  const ink = { width: 3 * s, color: 0x1b1f2a, alpha: 0.85 };
  switch (key) {
    case 'cat':
      g.poly(P([-34, -10, -30, -44, -12, -26])).fill(0xffa94d);
      g.poly(P([34, -10, 30, -44, 12, -26])).fill(0xffa94d);
      g.circle(0, 0, 36 * s).fill(0xffa94d).stroke(ink);
      eyes(g, s, -13, -4, 13, -4);
      g.poly(P([-4, 8, 4, 8, 0, 13])).fill(0xff6f91);
      whiskers(g, s);
      break;
    case 'dog':
      g.ellipse(-30 * s, -6 * s, 12 * s, 26 * s).fill(0x8a5a33);
      g.ellipse(30 * s, -6 * s, 12 * s, 26 * s).fill(0x8a5a33);
      g.circle(0, 0, 34 * s).fill(0xd9a066).stroke(ink);
      eyes(g, s, -12, -6, 12, -6);
      g.ellipse(0, 12 * s, 9 * s, 7 * s).fill(0x2a1a10);
      g.ellipse(0, 26 * s, 7 * s, 8 * s).fill(0xff6f91);
      break;
    case 'fish':
      g.poly(P([24, 0, 46, -18, 46, 18])).fill(0x4dabf7);
      g.ellipse(-4 * s, 0, 32 * s, 22 * s).fill(0x74c0fc).stroke(ink);
      g.circle(-20 * s, -4 * s, 5 * s).fill(0x1b1f2a);
      break;
    case 'bird':
      g.circle(0, 0, 30 * s).fill(0xffd43b).stroke(ink);
      g.poly(P([28, -4, 44, 2, 28, 8])).fill(0xff922b);
      g.ellipse(-8 * s, 8 * s, 16 * s, 10 * s).fill(0xfab005);
      g.circle(10 * s, -8 * s, 5 * s).fill(0x1b1f2a);
      break;
    case 'lion':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.circle(Math.cos(a) * 34 * s, Math.sin(a) * 34 * s, 14 * s).fill(0xc2410c);
      }
      g.circle(0, 0, 32 * s).fill(0xfbbf24).stroke(ink);
      eyes(g, s, -11, -6, 11, -6);
      g.poly(P([-6, 8, 6, 8, 0, 15])).fill(0x5a2a10);
      break;
    case 'elephant':
      g.ellipse(-34 * s, -4 * s, 18 * s, 26 * s).fill(0x9ca3af);
      g.ellipse(34 * s, -4 * s, 18 * s, 26 * s).fill(0x9ca3af);
      g.circle(0, -6 * s, 30 * s).fill(0xb8c0cc).stroke(ink);
      g.roundRect(-7 * s, 6 * s, 14 * s, 40 * s, 7 * s).fill(0xb8c0cc).stroke(ink);
      eyes(g, s, -11, -12, 11, -12);
      break;
    case 'cow':
      g.circle(0, 0, 34 * s).fill(0xffffff).stroke(ink);
      g.circle(-14 * s, -14 * s, 10 * s).fill(0x1b1f2a);
      g.ellipse(0, 18 * s, 20 * s, 12 * s).fill(0xffb3c6);
      eyes(g, s, -12, -4, 12, -4);
      break;
    case 'duck':
      g.circle(0, 0, 32 * s).fill(0xfff3a3).stroke(ink);
      g.ellipse(0, 12 * s, 18 * s, 8 * s).fill(0xff922b);
      eyes(g, s, -11, -8, 11, -8);
      break;
    case 'apple':
      g.circle(0, 6 * s, 32 * s).fill(0xff3b3b).stroke(ink);
      g.roundRect(-3 * s, -36 * s, 6 * s, 16 * s, 3 * s).fill(0x6b3f1d);
      g.ellipse(14 * s, -28 * s, 14 * s, 7 * s).fill(0x2fd27a);
      g.ellipse(-12 * s, -6 * s, 8 * s, 12 * s).fill({ color: 0xffffff, alpha: 0.4 });
      break;
    case 'banana':
      g.moveTo(-38 * s, -10 * s).quadraticCurveTo(0, 50 * s, 38 * s, -18 * s).quadraticCurveTo(0, 26 * s, -38 * s, -10 * s).fill(0xffd43b).stroke(ink);
      break;
    case 'milk':
      g.roundRect(-20 * s, -30 * s, 40 * s, 62 * s, 6 * s).fill(0xffffff).stroke(ink);
      g.poly(P([-20, -30, 0, -46, 20, -30])).fill(0x74c0fc).stroke(ink);
      g.roundRect(-20 * s, -4 * s, 40 * s, 16 * s, 2 * s).fill(0x74c0fc);
      break;
    case 'bread':
      g.roundRect(-34 * s, -16 * s, 68 * s, 40 * s, 10 * s).fill(0xe8a85a).stroke(ink);
      g.ellipse(0, -16 * s, 34 * s, 18 * s).fill(0xe8a85a).stroke(ink);
      g.roundRect(-28 * s, -12 * s, 56 * s, 32 * s, 8 * s).fill(0xffe2b0);
      break;
    case 'egg':
      g.ellipse(0, 0, 28 * s, 36 * s).fill(0xfffaf0).stroke(ink);
      g.ellipse(-8 * s, -12 * s, 6 * s, 9 * s).fill({ color: 0xffffff, alpha: 0.9 });
      break;
    case 'cake':
      g.roundRect(-34 * s, -6 * s, 68 * s, 36 * s, 8 * s).fill(0xff9ec7).stroke(ink);
      g.roundRect(-34 * s, -6 * s, 68 * s, 10 * s, 5 * s).fill(0xffffff);
      g.roundRect(-3 * s, -30 * s, 6 * s, 22 * s, 3 * s).fill(0x74c0fc);
      g.ellipse(0, -34 * s, 5 * s, 8 * s).fill(0xffd43b);
      break;
    case 'mom':
    case 'dad':
    case 'baby':
    case 'grandma': {
      const hair = key === 'grandma' ? 0xdddddd : key === 'dad' ? 0x2a1a10 : 0x4a2c17;
      const sc = key === 'baby' ? 0.75 : 1;
      if (key === 'mom' || key === 'grandma') g.ellipse(0, 6 * s * sc, 38 * s * sc, 40 * s * sc).fill(hair);
      g.circle(0, 0, 30 * s * sc).fill(0xf0c39a).stroke(ink);
      if (key === 'dad') g.arc(0, -4 * s, 32 * s, Math.PI * 1.05, Math.PI * 1.95).fill(hair);
      if (key === 'baby') g.circle(0, -26 * s * sc, 5 * s).fill(hair);
      eyes(g, s * sc, -10, -2, 10, -2);
      g.arc(0, 8 * s * sc, 9 * s * sc, 0.2, Math.PI - 0.2).stroke({ width: 3 * s, color: 0x6b1b24 });
      if (key === 'dad') g.roundRect(-18 * s, 14 * s, 36 * s, 8 * s, 4 * s).fill({ color: hair, alpha: 0.7 });
      if (key === 'grandma') {
        g.circle(-10 * s, -2 * s, 8 * s).stroke({ width: 2 * s, color: 0x333333 });
        g.circle(10 * s, -2 * s, 8 * s).stroke({ width: 2 * s, color: 0x333333 });
      }
      break;
    }
    case 'eye':
      g.ellipse(0, 0, 40 * s, 24 * s).fill(0xffffff).stroke(ink);
      g.circle(0, 0, 16 * s).fill(0x4dabf7);
      g.circle(0, 0, 8 * s).fill(0x1b1f2a);
      g.circle(5 * s, -5 * s, 4 * s).fill(0xffffff);
      break;
    case 'nose':
      g.moveTo(0, -34 * s).quadraticCurveTo(26 * s, 20 * s, 10 * s, 26 * s).quadraticCurveTo(0, 30 * s, -10 * s, 26 * s).quadraticCurveTo(-26 * s, 20 * s, 0, -34 * s).fill(0xf0b48a).stroke(ink);
      break;
    case 'hand':
      g.roundRect(-22 * s, -6 * s, 44 * s, 40 * s, 14 * s).fill(0xf0c39a).stroke(ink);
      for (let i = 0; i < 4; i++) g.roundRect((-22 + i * 11.5) * s, -40 * s, 10 * s, 40 * s, 5 * s).fill(0xf0c39a).stroke(ink);
      g.roundRect(18 * s, 0, 24 * s, 10 * s, 5 * s).fill(0xf0c39a).stroke(ink);
      break;
    case 'foot':
      g.ellipse(0, 6 * s, 24 * s, 34 * s).fill(0xf0c39a).stroke(ink);
      for (let i = 0; i < 5; i++) g.circle((-16 + i * 8) * s, (-30 + Math.abs(i - 1) * 2) * s, (6 - i * 0.6) * s).fill(0xf0c39a).stroke(ink);
      break;
    case 'ear':
      g.ellipse(0, 0, 24 * s, 36 * s).fill(0xf0c39a).stroke(ink);
      g.ellipse(2 * s, 0, 12 * s, 22 * s).stroke({ width: 4 * s, color: 0xd99a70 });
      break;
    case 'mouth':
      g.ellipse(0, 0, 36 * s, 20 * s).fill(0xd6336c).stroke(ink);
      g.ellipse(0, 4 * s, 28 * s, 10 * s).fill(0x6b1b24);
      g.rect(-20 * s, -8 * s, 40 * s, 7 * s).fill(0xffffff);
      break;
    case 'ball':
      g.circle(0, 0, 34 * s).fill(0xff6b6b).stroke(ink);
      g.moveTo(-34 * s, 0).quadraticCurveTo(0, 18 * s, 34 * s, 0).stroke({ width: 6 * s, color: 0xffffff });
      g.moveTo(0, -34 * s).quadraticCurveTo(-14 * s, 0, 0, 34 * s).stroke({ width: 6 * s, color: 0xffd43b });
      break;
    case 'teddy':
      g.circle(-24 * s, -24 * s, 12 * s).fill(0xa16207);
      g.circle(24 * s, -24 * s, 12 * s).fill(0xa16207);
      g.circle(0, 0, 32 * s).fill(0xca8a04).stroke(ink);
      g.ellipse(0, 12 * s, 14 * s, 10 * s).fill(0xfde68a);
      eyes(g, s, -11, -6, 11, -6);
      g.circle(0, 8 * s, 4 * s).fill(0x1b1f2a);
      break;
    case 'kite':
      g.poly(P([0, -42, 30, 0, 0, 30, -30, 0])).fill(0xff6fb5).stroke(ink);
      g.moveTo(0, -42 * s).lineTo(0, 30 * s).moveTo(-30 * s, 0).lineTo(30 * s, 0).stroke({ width: 2 * s, color: 0xffffff });
      g.moveTo(0, 30 * s).quadraticCurveTo(14 * s, 42 * s, 0, 50 * s).stroke({ width: 2 * s, color: 0x1b1f2a });
      break;
    case 'blocks':
      g.roundRect(-36 * s, 0, 34 * s, 34 * s, 4 * s).fill(0xff4b4b).stroke(ink);
      g.roundRect(2 * s, 0, 34 * s, 34 * s, 4 * s).fill(0x2f7bff).stroke(ink);
      g.roundRect(-17 * s, -34 * s, 34 * s, 34 * s, 4 * s).fill(0xffd21f).stroke(ink);
      break;
    case 'balloon':
      g.ellipse(0, -8 * s, 28 * s, 34 * s).fill(0xff4b4b).stroke(ink);
      g.poly(P([-4, 26, 4, 26, 0, 32])).fill(0xff4b4b);
      g.moveTo(0, 32 * s).quadraticCurveTo(-10 * s, 42 * s, 0, 50 * s).stroke({ width: 2 * s, color: 0xffffff });
      g.ellipse(-10 * s, -20 * s, 7 * s, 11 * s).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    case 'car':
      g.roundRect(-40 * s, -6 * s, 80 * s, 26 * s, 10 * s).fill(0xff4b4b).stroke(ink);
      g.roundRect(-22 * s, -26 * s, 44 * s, 24 * s, 10 * s).fill(0xff4b4b).stroke(ink);
      g.roundRect(-16 * s, -22 * s, 32 * s, 14 * s, 5 * s).fill(0x9fd8ff);
      wheel(g, s, -22, 22);
      wheel(g, s, 22, 22);
      break;
    case 'bus':
      g.roundRect(-44 * s, -26 * s, 88 * s, 48 * s, 8 * s).fill(0xffd21f).stroke(ink);
      for (let i = 0; i < 4; i++) g.roundRect((-38 + i * 20) * s, -20 * s, 16 * s, 14 * s, 3 * s).fill(0x9fd8ff);
      wheel(g, s, -26, 24);
      wheel(g, s, 26, 24);
      break;
    case 'plane':
      g.roundRect(-44 * s, -8 * s, 88 * s, 18 * s, 9 * s).fill(0xffffff).stroke(ink);
      g.poly(P([-6, -4, 14, -38, 22, -38, 14, -4])).fill(0x2f7bff).stroke(ink);
      g.poly(P([-6, 8, 14, 38, 22, 38, 14, 8])).fill(0x2f7bff).stroke(ink);
      g.poly(P([-44, -6, -50, -26, -38, -26, -32, -6])).fill(0xff4b4b);
      break;
    case 'boat':
      g.poly(P([-44, 6, 44, 6, 30, 30, -30, 30])).fill(0x9a5b2e).stroke(ink);
      g.moveTo(0, 6 * s).lineTo(0, -42 * s).stroke({ width: 4 * s, color: 0x1b1f2a });
      g.poly(P([2, -40, 34, 0, 2, 0])).fill(0xffffff).stroke(ink);
      break;
    case 'train':
      g.roundRect(-44 * s, -18 * s, 56 * s, 36 * s, 6 * s).fill(0x2fd27a).stroke(ink);
      g.roundRect(12 * s, -34 * s, 32 * s, 52 * s, 6 * s).fill(0xff4b4b).stroke(ink);
      g.roundRect(18 * s, -28 * s, 20 * s, 14 * s, 3 * s).fill(0x9fd8ff);
      wheel(g, s, -30, 22);
      wheel(g, s, 0, 22);
      wheel(g, s, 28, 22);
      break;
    case 'sun':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.poly([Math.cos(a - 0.15) * 30 * s, Math.sin(a - 0.15) * 30 * s, Math.cos(a) * 46 * s, Math.sin(a) * 46 * s, Math.cos(a + 0.15) * 30 * s, Math.sin(a + 0.15) * 30 * s]).fill(0xffa94d);
      }
      g.circle(0, 0, 28 * s).fill(0xffd43b).stroke(ink);
      eyes(g, s, -9, -4, 9, -4);
      break;
    case 'moon':
      g.circle(0, 0, 34 * s).fill(0xfff3bf);
      g.circle(16 * s, -10 * s, 30 * s).cut();
      g.circle(0, 0, 34 * s).stroke({ width: 0 });
      break;
    case 'star':
      g.poly(starPoints(42 * s, 0.48)).fill(color.gold).stroke({ ...ink, join: 'round' });
      break;
    case 'tree':
      g.roundRect(-8 * s, 4 * s, 16 * s, 40 * s, 4 * s).fill(0x8a5a33).stroke(ink);
      g.circle(0, -14 * s, 28 * s).fill(0x2fd27a).stroke(ink);
      g.circle(-20 * s, 0, 18 * s).fill(0x2fd27a);
      g.circle(20 * s, 0, 18 * s).fill(0x2fd27a);
      break;
    default: {
      // actions are shown as bold text labels with an arrow motif
      const t = gameText(key.toUpperCase(), 22 * s, { fillColor: color.gold });
      c.addChild(t);
    }
  }
}

function eyes(g: Graphics, s: number, x1: number, y1: number, x2: number, y2: number) {
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    g.circle(x * s, y * s, 6 * s).fill(0x1b1f2a);
    g.circle((x + 2) * s, (y - 2) * s, 2 * s).fill(0xffffff);
  }
}
function whiskers(g: Graphics, s: number) {
  for (const sx of [-1, 1]) for (const dy of [-3, 3]) g.moveTo(sx * 10 * s, 10 * s).lineTo(sx * 30 * s, (10 + dy * 2) * s).stroke({ width: 2 * s, color: 0x1b1f2a });
}
function wheel(g: Graphics, s: number, x: number, y: number) {
  g.circle(x * s, y * s, 10 * s).fill(0x1b1f2a);
  g.circle(x * s, y * s, 4 * s).fill(0xdddddd);
}
