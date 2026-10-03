import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { starPoints, vGrad } from '../../draw/paint';

export type ClosetCategory = 'outfit' | 'cape' | 'shoes' | 'helmet' | 'mask' | 'gloves' | 'trail' | 'celebration' | 'hair';

/** Bold procedural icon for a closet category pedestal (radius ~26). */
export function categoryIcon(cat: ClosetCategory): Graphics {
  const g = new Graphics();
  const w = { width: 3, color: 0xffffff, join: 'round' as const, cap: 'round' as const };
  switch (cat) {
    case 'outfit':
      g.poly([-12, -18, -24, -10, -18, 0, -12, -4, -12, 20, 12, 20, 12, -4, 18, 0, 24, -10, 12, -18, 6, -14, -6, -14]).fill(color.blue).stroke(w);
      g.star(0, 4, 5, 6, 3).fill(color.gold);
      break;
    case 'cape':
      g.poly([-10, -18, 10, -18, 22, 20, 0, 24, -22, 20]).fill(vGrad([[0, 0xff6b6b], [1, 0xb3121f]])).stroke(w);
      break;
    case 'shoes':
      g.poly([-18, -16, -6, -16, -6, 2, 20, 6, 22, 16, -18, 16]).fill(color.gold).stroke(w);
      g.rect(-18, 12, 40, 4).fill(0x6b4b00);
      break;
    case 'helmet':
      g.arc(0, 8, 22, Math.PI, 0).fill(color.red).stroke(w);
      g.rect(-24, 6, 48, 8).fill(0xff4b4b).stroke(w);
      g.roundRect(-4, -14, 8, 22, 4).fill(0xffffff);
      break;
    case 'mask':
      g.roundRect(-24, -10, 48, 20, 10).fill(color.red).stroke(w);
      g.ellipse(-10, 0, 7, 5).fill(0xffffff);
      g.ellipse(10, 0, 7, 5).fill(0xffffff);
      break;
    case 'gloves':
      g.roundRect(-14, -6, 28, 26, 8).fill(color.mint).stroke(w);
      for (let i = 0; i < 3; i++) g.roundRect(-13 + i * 9, -22, 8, 20, 4).fill(color.mint).stroke(w);
      g.roundRect(12, -2, 12, 8, 4).fill(color.mint).stroke(w);
      break;
    case 'trail':
      for (let i = 0; i < 4; i++) g.poly(starPoints(9 - i * 1.5, 0.45).map((v, k) => v + (k % 2 ? -12 + i * 8 : -16 + i * 11))).fill(i % 2 ? color.mint : color.gold);
      g.moveTo(-22, 16).quadraticCurveTo(0, 4, 22, -14).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
      break;
    case 'celebration':
      g.poly(starPoints(22, 0.42)).fill(color.gold).stroke(w);
      g.circle(0, 2, 5).fill(0xffffff);
      break;
    case 'hair':
      for (const [x, y, r] of [[-12, -4, 10], [0, -10, 11], [12, -4, 10], [-16, 8, 8], [16, 8, 8]] as const) g.circle(x, y, r).fill(0x4a2c17);
      g.circle(0, 8, 12).fill(0xe9b48a);
      break;
  }
  return g;
}

/** Small icon of the world/mission that unlocks an item (shown next to its padlock). */
export function unlockWorldIcon(kind: string, football: Texture): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  switch (kind) {
    case 'football': {
      const s = new Sprite(football);
      s.anchor.set(0.5);
      s.scale.set(0.3);
      c.addChild(s);
      break;
    }
    case 'racing':
      g.roundRect(-18, -4, 36, 12, 5).fill(color.red).stroke({ width: 2, color: 0xffffff });
      g.roundRect(-9, -12, 18, 10, 4).fill(color.red);
      g.circle(-10, 9, 5).fill(0x111111);
      g.circle(10, 9, 5).fill(0x111111);
      break;
    case 'hero':
      g.poly([2, -16, -10, 2, -1, 2, -4, 16, 10, -3, 1, -3]).fill(color.gold).stroke({ width: 2, color: 0xffffff });
      break;
    case 'treasure':
      g.roundRect(-14, -6, 28, 18, 4).fill(0xb06a2c).stroke({ width: 2, color: 0x4a2a10 });
      g.roundRect(-14, -14, 28, 10, 5).fill(0xc27a35).stroke({ width: 2, color: 0x4a2a10 });
      g.rect(-3, -8, 6, 8).fill(color.gold);
      break;
    case 'trophies':
      g.moveTo(-12, -14).lineTo(12, -14).quadraticCurveTo(12, 4, 0, 6).quadraticCurveTo(-12, 4, -12, -14).fill(color.gold);
      g.rect(-3, 6, 6, 6).fill(color.gold);
      g.roundRect(-9, 12, 18, 5, 2).fill(0x6b4b00);
      break;
    default:
      g.poly(starPoints(15, 0.48)).fill(color.gold).stroke({ width: 2, color: 0xffffff });
  }
  return c;
}

export function padlock(): Graphics {
  const g = new Graphics();
  g.arc(0, -8, 9, Math.PI, 0).stroke({ width: 5, color: 0xc8ccd8 });
  g.roundRect(-13, -8, 26, 20, 5).fill(color.gold).stroke({ width: 2.5, color: 0xffffff });
  g.circle(0, 1, 3.5).fill(0x5a3a10);
  return g;
}
