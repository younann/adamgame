import { Container, Graphics } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { Sticker } from '../../systems/stickers';
import { drawConcept } from '../../draw/conceptArt';
import { drawFootball } from '../../engine/Textures';
import { gameText, rGrad, shade, starPoints, vGrad } from '../../draw/paint';

/**
 * A die-cut sticker: white rounded border with a soft shadow and gloss, art in the middle.
 * Origin at the centre; `size` is the outer width.
 */
export function drawSticker(s: Sticker, size: number): Container {
  const c = new Container();
  const r = size * 0.22;
  const g = new Graphics();
  g.roundRect(-size / 2 + 3, -size / 2 + 6, size, size, r).fill({ color: 0x000000, alpha: 0.35 });
  g.roundRect(-size / 2, -size / 2, size, size, r).fill(0xffffff);
  g.roundRect(-size / 2 + size * 0.06, -size / 2 + size * 0.06, size * 0.88, size * 0.88, r * 0.8).fill(bgFor(s));
  c.addChild(g);
  const art = drawArt(s, size * 0.62);
  c.addChild(art);
  const gloss = new Graphics();
  gloss.roundRect(-size * 0.36, -size * 0.4, size * 0.72, size * 0.2, size * 0.1).fill({ color: 0xffffff, alpha: 0.22 });
  c.addChild(gloss);
  return c;
}

/** Empty slot: soft dashed silhouette with a "?" — never a lock or a price. */
export function drawEmptySlot(size: number): Container {
  const c = new Container();
  const g = new Graphics();
  const r = size * 0.22;
  g.roundRect(-size / 2, -size / 2, size, size, r).fill({ color: 0xffffff, alpha: 0.06 });
  const dash = 10;
  const per = size - r * 2;
  for (let i = 0; i < per; i += dash * 2) {
    const x0 = -size / 2 + r + i;
    g.moveTo(x0, -size / 2).lineTo(Math.min(x0 + dash, size / 2 - r), -size / 2);
    g.moveTo(x0, size / 2).lineTo(Math.min(x0 + dash, size / 2 - r), size / 2);
    g.moveTo(-size / 2, x0).lineTo(-size / 2, Math.min(x0 + dash, size / 2 - r));
    g.moveTo(size / 2, x0).lineTo(size / 2, Math.min(x0 + dash, size / 2 - r));
  }
  g.stroke({ width: 3, color: color.primary, alpha: 0.35 });
  c.addChild(g);
  const q = gameText('?', size * 0.42, { fillColor: color.primary, strokeColor: color.surfaceLowest });
  q.alpha = 0.45;
  c.addChild(q);
  return c;
}

function bgFor(s: Sticker) {
  switch (s.category) {
    case 'colors':
      return vGrad([[0, 0x22305a], [1, 0x141c38]]);
    case 'numbers':
      return vGrad([[0, 0x3a7bff], [1, color.blueDeep]]);
    case 'shapes':
      return vGrad([[0, 0x2a2060], [1, 0x150f38]]);
    case 'special':
      return vGrad([[0, 0x5a3cb0], [1, 0x2a1660]]);
    default:
      return vGrad([[0, 0xfff6dc], [1, 0xffe3a6]]);
  }
}

function drawArt(s: Sticker, size: number): Container {
  const key = s.visual.key;
  if (s.visual.kind === 'icon' && key.startsWith('special:')) return drawSpecial(key.slice(8), size);
  return drawConcept(s.visual, size);
}

function drawSpecial(key: string, size: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const r = size / 2;
  const gold = vGrad([[0, 0xfff1b8], [0.5, color.gold], [1, 0xb07a00]]);
  switch (key) {
    case 'football': {
      drawFootball(g, r);
      g.position.set(-r, -r);
      break;
    }
    case 'flag':
      g.rect(-r * 0.75, -r * 0.9, r * 0.12, r * 1.8).fill(0xdddddd);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.rect(-r * 0.63 + i * r * 0.36, -r * 0.9 + j * r * 0.36, r * 0.36, r * 0.36).fill((i + j) % 2 ? 0x111111 : 0xffffff);
      break;
    case 'badge':
    case 'lightning':
      g.moveTo(0, -r).lineTo(r * 0.85, -r * 0.6).lineTo(r * 0.85, r * 0.1).quadraticCurveTo(r * 0.6, r * 0.75, 0, r).quadraticCurveTo(-r * 0.6, r * 0.75, -r * 0.85, r * 0.1).lineTo(-r * 0.85, -r * 0.6).closePath()
        .fill(key === 'badge' ? vGrad([[0, 0x5d93ff], [1, color.blueDeep]]) : vGrad([[0, color.mintLight], [1, color.mintDeep]]))
        .stroke({ width: 4, color: 0xffffff });
      g.poly([-r * 0.1, -r * 0.6, r * 0.35, -r * 0.6, r * 0.05, -r * 0.05, r * 0.35, -r * 0.05, -r * 0.25, r * 0.65, -r * 0.05, r * 0.1, -r * 0.35, r * 0.1]).fill(color.gold);
      break;
    case 'gem':
      g.poly([-r * 0.8, -r * 0.2, -r * 0.4, -r * 0.75, r * 0.4, -r * 0.75, r * 0.8, -r * 0.2, 0, r * 0.85]).fill(rGrad([[0, 0x9ff3ff], [1, 0x1aa3c8]], 0.4, 0.3)).stroke({ width: 4, color: 0xffffff });
      g.moveTo(-r * 0.8, -r * 0.2).lineTo(r * 0.8, -r * 0.2).moveTo(-r * 0.4, -r * 0.75).lineTo(0, r * 0.85).lineTo(r * 0.4, -r * 0.75).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
      break;
    case 'trophy':
    case 'trophies': {
      const cup = (x: number, k: number) => {
        g.roundRect(x - r * 0.45 * k, r * 0.6 * k, r * 0.9 * k, r * 0.3 * k, 4).fill(0x5a3a10);
        g.rect(x - r * 0.12 * k, r * 0.25 * k, r * 0.24 * k, r * 0.4 * k).fill(gold);
        g.circle(x - r * 0.62 * k, -r * 0.35 * k, r * 0.25 * k).stroke({ width: 5 * k, color: color.goldMid });
        g.circle(x + r * 0.62 * k, -r * 0.35 * k, r * 0.25 * k).stroke({ width: 5 * k, color: color.goldMid });
        g.moveTo(x - r * 0.65 * k, -r * 0.75 * k).lineTo(x + r * 0.65 * k, -r * 0.75 * k).quadraticCurveTo(x + r * 0.6 * k, r * 0.25 * k, x, r * 0.3 * k).quadraticCurveTo(x - r * 0.6 * k, r * 0.25 * k, x - r * 0.65 * k, -r * 0.75 * k).fill(gold);
        g.poly(starPoints(r * 0.2 * k, 0.5).map((v, i) => (i % 2 ? v - r * 0.3 * k : v + x))).fill(color.blue);
      };
      if (key === 'trophy') cup(0, 1);
      else {
        cup(-r * 0.6, 0.55);
        cup(r * 0.6, 0.55);
        cup(0, 0.75);
      }
      break;
    }
    case 'rainbow': {
      const cols = [0xff4b4b, 0xff8a1f, 0xffd21f, 0x2fd27a, 0x2f7bff, 0xa45bff];
      cols.forEach((col, i) => g.arc(0, r * 0.35, r * (0.95 - i * 0.12), Math.PI, 0).stroke({ width: r * 0.12, color: col }));
      for (const x of [-r * 0.75, r * 0.75]) {
        g.circle(x, r * 0.4, r * 0.2).fill(0xffffff);
        g.circle(x + r * 0.15, r * 0.3, r * 0.18).fill(0xffffff);
      }
      break;
    }
    default:
      g.poly(starPoints(r, 0.5)).fill(gold).stroke({ width: 4, color: 0xffffff });
  }
  return c;
}

export { shade };
