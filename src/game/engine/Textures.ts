import { Container, Graphics, type Renderer, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { drawGoldStar, rGrad, starPoints } from '../draw/paint';

export type TexKey = 'glow' | 'dot' | 'star' | 'goldStar' | 'spark' | 'confetti' | 'ring' | 'smoke' | 'streak' | 'football' | 'coin';

/**
 * Procedurally baked, reusable textures (owned art, no external files). Baked once per
 * renderer and shared by particles and entities — far cheaper than redrawing Graphics.
 */
export class Textures {
  private cache = new Map<TexKey, Texture>();
  constructor(private readonly renderer: Renderer) {}

  get(key: TexKey): Texture {
    let t = this.cache.get(key);
    if (!t) {
      t = this.bake(key);
      this.cache.set(key, t);
    }
    return t;
  }

  private bake(key: TexKey): Texture {
    const g = new Graphics();
    switch (key) {
      case 'glow':
        g.circle(64, 64, 64).fill(rGrad([[0, 0xffffff, 1], [0.35, 0xffffff, 0.45], [1, 0xffffff, 0]]));
        break;
      case 'dot':
        g.circle(16, 16, 15).fill(0xffffff);
        break;
      case 'smoke':
        g.circle(32, 32, 32).fill(rGrad([[0, 0xffffff, 0.7], [1, 0xffffff, 0]]));
        break;
      case 'star':
        g.poly(starPoints(30, 0.45).map((v) => v + 32)).fill(0xffffff);
        break;
      case 'goldStar': {
        const s = new Graphics();
        drawGoldStar(s, 40);
        const c = new Container();
        c.addChild(s);
        const tex = this.renderer.generateTexture({ target: c, resolution: 2, antialias: true });
        c.destroy({ children: true });
        g.destroy();
        return tex;
      }
      case 'spark':
        g.ellipse(24, 8, 24, 6).fill(rGrad([[0, 0xffffff, 1], [1, 0xffffff, 0]]));
        break;
      case 'streak':
        g.roundRect(0, 0, 120, 6, 3).fill(0xffffff);
        break;
      case 'confetti':
        g.roundRect(0, 0, 14, 22, 3).fill(0xffffff);
        break;
      case 'ring':
        g.circle(64, 64, 58).stroke({ width: 8, color: 0xffffff });
        break;
      case 'coin':
        g.circle(32, 32, 30).fill(color.goldShadow);
        g.circle(32, 29, 28).fill(color.gold);
        g.circle(32, 29, 20).stroke({ width: 4, color: 0xffe28a });
        g.ellipse(24, 20, 8, 5).fill({ color: 0xffffff, alpha: 0.6 });
        break;
      case 'football':
        drawFootball(g, 64);
        break;
    }
    const tex = this.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
    g.destroy({ children: true });
    return tex;
  }

  destroy() {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}

/** Classic black-and-white ball drawn at (r, r) with radius r. */
export function drawFootball(g: Graphics, r: number) {
  const cx = r;
  const cy = r;
  g.circle(cx, cy, r).fill(rGrad([[0, 0xffffff], [0.7, 0xf1f3f8], [1, 0xc5cad8]], 0.38, 0.32));
  const pent = (x: number, y: number, s: number, rot = 0) => {
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = rot - Math.PI / 2 + (i * 2 * Math.PI) / 5;
      pts.push(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
    g.poly(pts).fill(0x1b1f2a);
  };
  pent(cx, cy, r * 0.3);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + Math.PI / 5;
    pent(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.2, a + Math.PI / 2);
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    g.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3)
      .lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62)
      .stroke({ width: r * 0.04, color: 0x8a90a0 });
  }
  g.circle(cx, cy, r).stroke({ width: r * 0.05, color: 0x1b1f2a, alpha: 0.6 });
  g.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.25, r * 0.13).fill({ color: 0xffffff, alpha: 0.85 });
}
