import { Container, Graphics } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { rGrad, shade } from '../../draw/paint';

export interface CreatureKind {
  key: string;
  ar: string;
  en: string;
  fur: number;
  belly: number;
  ears: 'cat' | 'round' | 'mane';
}

/** Original cute rescue friends (procedural). */
export const CREATURES: CreatureKind[] = [
  { key: 'kitten', ar: 'القطة الصغيرة', en: 'Kitten', fur: 0xffa94d, belly: 0xffe2b8, ears: 'cat' },
  { key: 'cub', ar: 'الشبل الصغير', en: 'Lion cub', fur: 0xf2b84b, belly: 0xffeac2, ears: 'mane' },
  { key: 'puppy', ar: 'الجرو الصغير', en: 'Puppy', fur: 0xc98e62, belly: 0xf3d9bf, ears: 'round' },
  { key: 'bunny', ar: 'الأرنب الصغير', en: 'Bunny', fur: 0xe9e3ff, belly: 0xffffff, ears: 'cat' },
];

/**
 * A small trapped friend. Origin at the feet. `trapped` shows an energy bubble cage;
 * `happy` makes it hop and wave its tail.
 */
export class Creature extends Container {
  private bodyC = new Container();
  private tail = new Graphics();
  private g = new Graphics();
  private face = new Graphics();
  private bubble = new Graphics();
  private t = Math.random() * 5;
  trapped = true;
  happy = false;

  constructor(readonly kind: CreatureKind) {
    super();
    this.draw();
    this.bodyC.addChild(this.tail, this.g, this.face);
    this.addChild(this.bodyC, this.bubble);
    this.drawFace();
  }

  private draw() {
    const k = this.kind;
    const g = this.g.clear();
    g.ellipse(0, 2, 26, 7).fill({ color: 0x000000, alpha: 0.3 });
    // body
    g.ellipse(0, -22, 22, 20).fill(rGrad([[0, shade(k.fur, 0.2)], [1, k.fur]], 0.4, 0.3));
    g.ellipse(0, -18, 12, 12).fill(k.belly);
    // paws
    g.ellipse(-12, -3, 8, 5).fill(shade(k.fur, -0.1));
    g.ellipse(12, -3, 8, 5).fill(shade(k.fur, -0.1));
    // head
    if (k.ears === 'mane') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.circle(Math.cos(a) * 26, -58 + Math.sin(a) * 24, 11).fill(0xc2410c);
      }
    }
    if (k.ears === 'cat') {
      const tall = k.key === 'bunny' ? 2.2 : 1;
      g.poly([-22, -66, -18, -66 - 22 * tall, -6, -74]).fill(k.fur);
      g.poly([22, -66, 18, -66 - 22 * tall, 6, -74]).fill(k.fur);
      g.poly([-18, -68, -16, -64 - 18 * tall, -9, -72]).fill(0xff9ec7);
      g.poly([18, -68, 16, -64 - 18 * tall, 9, -72]).fill(0xff9ec7);
    }
    if (k.ears === 'round') {
      g.ellipse(-24, -60, 9, 16).fill(shade(k.fur, -0.3));
      g.ellipse(24, -60, 9, 16).fill(shade(k.fur, -0.3));
    }
    g.circle(0, -56, 24).fill(rGrad([[0, shade(k.fur, 0.25)], [1, k.fur]], 0.4, 0.3));
    g.ellipse(0, -48, 11, 8).fill(k.belly);
  }

  private drawFace() {
    const f = this.face.clear();
    const happy = this.happy || !this.trapped;
    for (const sx of [-9, 9]) {
      if (happy) f.arc(sx, -58, 5, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 3, color: 0x1b1f2a, cap: 'round' });
      else {
        f.circle(sx, -58, 5).fill(0x1b1f2a);
        f.circle(sx + 1.5, -60, 1.8).fill(0xffffff);
      }
    }
    f.poly([-3, -51, 3, -51, 0, -48]).fill(0xff6f91);
    if (happy) f.arc(0, -47, 6, 0.2, Math.PI - 0.2).stroke({ width: 2.5, color: 0x6b1b24, cap: 'round' });
    else f.arc(0, -42, 4, Math.PI * 1.2, Math.PI * 1.8).stroke({ width: 2.5, color: 0x6b1b24, cap: 'round' });
    f.circle(-15, -50, 4).fill({ color: 0xff7a8a, alpha: 0.45 });
    f.circle(15, -50, 4).fill({ color: 0xff7a8a, alpha: 0.45 });
  }

  setHappy(on: boolean) {
    this.happy = on;
    this.drawFace();
  }

  free() {
    this.trapped = false;
    this.drawFace();
  }

  update(dt: number) {
    this.t += dt;
    const tl = this.tail.clear();
    const wag = Math.sin(this.t * (this.happy ? 14 : 3)) * (this.happy ? 0.6 : 0.2);
    tl.moveTo(16, -14).quadraticCurveTo(38, -18 + wag * 20, 34 + wag * 8, -40).stroke({ width: 7, color: shade(this.kind.fur, -0.1), cap: 'round' });
    if (this.happy) this.bodyC.y = -Math.abs(Math.sin(this.t * 7)) * 14;
    else this.bodyC.y = Math.sin(this.t * 2) * 1.5;
    this.bodyC.rotation = this.trapped ? Math.sin(this.t * 1.5) * 0.06 : 0;
    const b = this.bubble.clear();
    if (this.trapped) {
      const r = 48 + Math.sin(this.t * 3) * 2;
      b.circle(0, -38, r).fill({ color: color.primary, alpha: 0.12 });
      b.circle(0, -38, r).stroke({ width: 3, color: color.primary, alpha: 0.75 });
      for (let i = 0; i < 6; i++) {
        const a = this.t * 1.2 + (i / 6) * Math.PI * 2;
        b.moveTo(Math.cos(a) * r, -38 + Math.sin(a) * r).lineTo(Math.cos(a + 0.5) * r * 0.6, -38 + Math.sin(a + 0.5) * r * 0.6).stroke({ width: 2, color: 0xdff6ff, alpha: 0.5 });
      }
      b.ellipse(-18, -64, 10, 5).fill({ color: 0xffffff, alpha: 0.4 });
    }
  }
}
