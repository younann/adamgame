import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color, conceptColor } from '@/design-system/tokens';
import type { ChallengeChoice } from '@/learning/types';
import { drawGoldStar, gameText, shade, vGrad } from '../../draw/paint';

const NEONS = [0x67e8f9, color.mint, 0xff6fb5];

/**
 * A neon tunnel (number answer) or a coloured garage gate (colour answer) spanning one
 * lane. Drawn at base size; the scene scales it by perspective. Origin = road level centre.
 */
export class Tunnel extends Container {
  readonly glow: Sprite;
  readonly sign = new Container();
  private arch = new Graphics();
  d = 240;
  u = 0;
  rushing = false;

  constructor(
    glowTex: Texture,
    readonly choice: ChallengeChoice,
    index: number,
  ) {
    super();
    const isColor = choice.visual.kind === 'color';
    const neon = isColor ? (conceptColor[choice.visual.key] ?? 0xffffff) : NEONS[index % NEONS.length];
    this.glow = new Sprite(glowTex);
    this.glow.anchor.set(0.5);
    this.glow.tint = neon;
    this.glow.blendMode = 'add';
    this.glow.position.set(0, -170);
    this.glow.scale.set(2.6);
    this.glow.alpha = 0.35;
    const a = this.arch;
    const W = 190;
    const H = 170;
    // mountain/rock block around the tunnel mouth
    a.roundRect(-W / 2 - 22, -H - 26, W + 44, H + 26, 40).fill(vGrad([[0, 0x3b2f6b], [1, 0x1d1640]]));
    a.roundRect(-W / 2 - 22, -H - 26, W + 44, H + 26, 40).stroke({ width: 4, color: shade(neon, -0.2), alpha: 0.8 });
    // tunnel mouth
    a.moveTo(-W / 2, 0).lineTo(-W / 2, -H + W / 2).arc(0, -H + W / 2, W / 2, Math.PI, 0).lineTo(W / 2, 0).closePath().fill(vGrad([[0, 0x020309], [1, 0x0a0f24]]));
    a.moveTo(-W / 2, 0).lineTo(-W / 2, -H + W / 2).arc(0, -H + W / 2, W / 2, Math.PI, 0).lineTo(W / 2, 0).stroke({ width: 9, color: neon });
    if (isColor) {
      // garage shutter stripes in the colour
      for (let i = 0; i < 5; i++) a.rect(-W / 2 + 8, -H + W / 2 - 10 + i * 22, W - 16, 10).fill({ color: neon, alpha: 0.35 });
    } else {
      // light at the end of the tunnel
      a.ellipse(0, -46, 34, 22).fill({ color: neon, alpha: 0.35 });
    }
    // big glowing sign above
    const sg = new Graphics();
    sg.roundRect(-78, -60, 156, 112, 26).fill(color.goldShadow);
    sg.roundRect(-78, -68, 156, 112, 26).fill(vGrad([[0, 0x3a4766], [1, 0x1a2036]]));
    sg.roundRect(-78, -68, 156, 112, 26).stroke({ width: 5, color: neon });
    this.sign.addChild(sg);
    if (isColor) {
      const sw = new Graphics();
      sw.circle(0, -12, 38).fill(neon).stroke({ width: 5, color: 0xffffff });
      sw.ellipse(-12, -26, 12, 6).fill({ color: 0xffffff, alpha: 0.5 });
      this.sign.addChild(sw);
    } else {
      const t = gameText(choice.label, 84, { fillColor: 0xffffff, strokeColor: color.blueDeepest });
      t.y = -12;
      this.sign.addChild(t);
    }
    this.sign.position.set(0, -H - 90);
    const hit = new Graphics().rect(-W / 2 - 22, -H - 160, W + 44, H + 160).fill({ color: 0xffffff, alpha: 0.001 });
    this.addChild(this.glow, this.arch, this.sign, hit);
  }
}

/** Floating gold star token on the track (countable). */
export class StarToken extends Container {
  readonly numLabel = new Container();
  num: number | null = null;
  u = 0;
  d = 30;
  lift = 120;
  bob = Math.random() * 6;
  constructor(glowTex: Texture) {
    super();
    const glow = new Sprite(glowTex);
    glow.anchor.set(0.5);
    glow.tint = color.gold;
    glow.blendMode = 'add';
    glow.scale.set(1.3);
    glow.alpha = 0.6;
    const g = new Graphics();
    drawGoldStar(g, 40);
    const hit = new Graphics().circle(0, 0, 62).fill({ color: 0xffffff, alpha: 0.001 });
    this.numLabel.y = -70;
    this.addChild(glow, g, this.numLabel, hit);
  }

  setNumber(n: number) {
    this.num = n;
    this.numLabel.removeChildren().forEach((c) => c.destroy());
    const t = gameText(String(n), 56, { fillColor: color.gold });
    this.numLabel.addChild(t);
  }
}
