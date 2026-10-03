import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { rGrad, starPoints, vGrad } from '../draw/paint';

/** Original golden championship cup. Origin at the base centre. */
export class Trophy extends Container {
  private shine: Sprite;
  private g = new Graphics();
  private t = 0;

  constructor(glow: Texture, size = 1) {
    super();
    this.shine = new Sprite(glow);
    this.shine.anchor.set(0.5);
    this.shine.tint = color.gold;
    this.shine.blendMode = 'add';
    this.shine.position.set(0, -80);
    this.shine.scale.set(2.2);
    const g = this.g;
    const gold = vGrad([[0, 0xfff1b8], [0.45, color.gold], [1, 0xb07a00]]);
    // base
    g.roundRect(-44, -26, 88, 26, 8).fill(0x5a3a10);
    g.roundRect(-36, -40, 72, 16, 6).fill(gold);
    g.roundRect(-10, -70, 20, 32, 6).fill(gold);
    // handles
    g.circle(-52, -118, 22).stroke({ width: 10, color: color.goldMid });
    g.circle(52, -118, 22).stroke({ width: 10, color: color.goldMid });
    // cup
    g.moveTo(-50, -150).lineTo(50, -150).quadraticCurveTo(48, -84, 0, -70).quadraticCurveTo(-48, -84, -50, -150).fill(gold);
    g.ellipse(0, -150, 50, 12).fill(0xffe28a).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
    g.poly(starPoints(16, 0.5).map((v, i) => (i % 2 ? v - 112 : v))).fill(color.blue).stroke({ width: 2, color: 0xffffff });
    g.ellipse(-24, -126, 8, 20).fill({ color: 0xffffff, alpha: 0.45 });
    g.circle(0, -150, 4).fill(rGrad([[0, 0xffffff], [1, 0xffffff, 0]]));
    this.addChild(this.shine, g);
    this.scale.set(size);
  }

  update(dt: number) {
    this.t += dt;
    this.shine.alpha = 0.6 + Math.sin(this.t * 3) * 0.25;
    this.shine.rotation += dt * 0.6;
  }
}
