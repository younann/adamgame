import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color, conceptColor } from '@/design-system/tokens';
import type { ChallengeChoice } from '@/learning/types';
import { drawConcept } from '../../draw/conceptArt';
import { rGrad, shade } from '../../draw/paint';

/**
 * An energy portal/door floating in the skyline — the learning choice as a world object.
 * Colour choices glow in that colour; vocabulary/shape choices float their picture inside.
 */
export class Portal extends Container {
  readonly glow: Sprite;
  readonly body = new Container();
  private ring = new Graphics();
  private swirl = new Graphics();
  private reticle = new Graphics();
  private flash: Sprite;
  private art: Container | null = null;
  readonly hue: number;
  private t = Math.random() * 6;
  private opened = 0;
  reticleOn = false;
  private reticleK = 0;

  constructor(
    readonly choice: ChallengeChoice,
    glow: Texture,
    readonly R: number,
  ) {
    super();
    const isColor = choice.visual.kind === 'color';
    this.hue = isColor ? (conceptColor[choice.visual.key] ?? color.blue) : color.blue;
    this.glow = new Sprite(glow);
    this.glow.anchor.set(0.5);
    this.glow.tint = this.hue === conceptColor.black ? 0x8890ff : this.hue;
    this.glow.blendMode = 'add';
    this.glow.scale.set((R * 3) / 128);
    this.glow.alpha = 0.55;
    this.flash = new Sprite(glow);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.flash.scale.set((R * 4) / 128);
    this.body.addChild(this.swirl, this.ring);
    if (!isColor) {
      const disc = new Graphics().circle(0, 0, R * 0.62).fill(rGrad([[0, 0xffffff], [1, 0xc9d6ff]], 0.4, 0.35));
      this.art = drawConcept(choice.visual, R * 0.95);
      this.body.addChild(disc, this.art);
    }
    this.addChild(this.glow, this.body, this.reticle, this.flash);
    this.drawRing();
  }

  private drawRing() {
    const R = this.R;
    const c = this.hue;
    const g = this.ring.clear();
    // chunky frame with depth (design-system tile language, but round)
    g.circle(0, R * 0.08, R * 1.02).fill({ color: 0x000000, alpha: 0.35 });
    g.circle(0, 0, R).stroke({ width: R * 0.2, color: shade(c, -0.45) });
    g.circle(0, -R * 0.03, R).stroke({ width: R * 0.15, color: c });
    g.circle(0, -R * 0.03, R * 1.07).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    g.circle(0, -R * 0.03, R * 0.92).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    // bolts around the frame
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      g.circle(Math.cos(a) * R, Math.sin(a) * R - R * 0.03, R * 0.06).fill(color.gold).stroke({ width: 1.5, color: 0xffffff });
    }
    g.arc(0, -R * 0.03, R, Math.PI * 1.15, Math.PI * 1.45).stroke({ width: R * 0.06, color: 0xffffff, alpha: 0.55 });
  }

  update(dt: number) {
    this.t += dt;
    const R = this.R;
    const c = this.hue;
    const s = this.swirl.clear();
    const inner = R * 0.86;
    s.circle(0, 0, inner).fill(rGrad([[0, shade(c, 0.55)], [0.6, c], [1, shade(c, -0.55)]]));
    for (let i = 0; i < 4; i++) {
      const a0 = this.t * (2 + this.opened * 6) + (i * Math.PI) / 2;
      s.arc(0, 0, inner * (0.35 + i * 0.15), a0, a0 + 1.6).stroke({ width: 4, color: 0xffffff, alpha: 0.35 + this.opened * 0.4 });
    }
    if (this.opened > 0) s.circle(0, 0, inner * this.opened).fill({ color: 0xffffff, alpha: 0.5 * this.opened });
    if (this.art) this.art.y = Math.sin(this.t * 2.2) * R * 0.05;
    // targeting reticle
    const r = this.reticle.clear();
    this.reticleK += ((this.reticleOn ? 1 : 0) - this.reticleK) * Math.min(1, dt * 8);
    if (this.reticleK > 0.02) {
      const rr = R * (1.25 + (1 - this.reticleK) * 1.2);
      const rot = this.t * 3;
      for (let i = 0; i < 12; i++) {
        const a = rot + (i / 12) * Math.PI * 2;
        r.arc(0, 0, rr, a, a + 0.28).stroke({ width: 4, color: color.gold, alpha: this.reticleK });
      }
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const ca = a - rot * 0.5;
        r.moveTo(Math.cos(ca) * (rr + 6), Math.sin(ca) * (rr + 6))
          .lineTo(Math.cos(ca) * (rr - 14), Math.sin(ca) * (rr - 14))
          .stroke({ width: 4, color: color.mint, alpha: this.reticleK });
      }
    }
    this.flash.alpha = Math.max(0, this.flash.alpha - dt * 2);
  }

  setOpened(v: number) {
    this.opened = v;
  }

  doFlash() {
    this.flash.alpha = 1;
  }
}
