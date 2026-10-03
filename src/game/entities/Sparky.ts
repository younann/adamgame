import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { rGrad, shade, vGrad } from '../draw/paint';
import { Ease, Tweener } from '../engine/Tween';

export type SparkyMood = 'idle' | 'speaking' | 'excited' | 'hint' | 'worried';

/**
 * Sparky — Adam's floating robot companion (original design): a chunky blue capsule
 * with a glowing face screen, antenna bulb and little jet. Introduces missions, speaks
 * Arabic support, cheers and gives hints.
 */
export class Sparky extends Container {
  private bodyC = new Container();
  private shell = new Graphics();
  private screen = new Graphics();
  private face = new Graphics();
  private antenna = new Graphics();
  private armL = new Graphics();
  private armR = new Graphics();
  private jet: Sprite;
  private halo: Sprite;
  private tw = new Tweener();
  private t = Math.random() * 5;
  mood: SparkyMood = 'idle';
  talking = false;
  private blinkIn = 2;
  private blink = 0;

  constructor(glow: Texture) {
    super();
    this.halo = new Sprite(glow);
    this.halo.anchor.set(0.5);
    this.halo.tint = color.blue;
    this.halo.alpha = 0.55;
    this.halo.scale.set(1.6);
    this.halo.blendMode = 'add';
    this.jet = new Sprite(glow);
    this.jet.anchor.set(0.5, 0.2);
    this.jet.tint = color.mint;
    this.jet.blendMode = 'add';
    this.jet.position.set(0, 46);
    this.jet.scale.set(0.45, 0.8);
    this.drawShell();
    this.armL.position.set(-44, 10);
    this.armR.position.set(44, 10);
    for (const [a, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      a.roundRect(-6, -4, 12, 26, 6).fill(color.blueDeep);
      a.circle(0, 24, 9).fill(rGrad([[0, 0xffffff], [1, color.primary]], 0.4, 0.35));
      a.scale.x = s;
    }
    this.bodyC.addChild(this.armL, this.armR, this.antenna, this.shell, this.screen, this.face);
    this.addChild(this.halo, this.jet, this.bodyC);
    this.drawFace();
  }

  private drawShell() {
    const g = this.shell;
    g.clear();
    g.roundRect(-46, -42, 92, 86, 34).fill(color.blueShadow);
    g.roundRect(-46, -46, 92, 84, 34).fill(vGrad([[0, 0x5d93ff], [0.5, color.blue], [1, color.blueDeep]]));
    g.roundRect(-46, -46, 92, 84, 34).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
    g.ellipse(-16, -32, 20, 8).fill({ color: 0xffffff, alpha: 0.35 });
    // ear bolts
    g.circle(-47, 0, 8).fill(color.gold).stroke({ width: 2, color: 0xffffff });
    g.circle(47, 0, 8).fill(color.gold).stroke({ width: 2, color: 0xffffff });
    const s = this.screen;
    s.clear();
    s.roundRect(-34, -32, 68, 50, 18).fill(vGrad([[0, 0x07142e], [1, 0x0b1f45]]));
    s.roundRect(-34, -32, 68, 50, 18).stroke({ width: 2, color: color.mint, alpha: 0.7 });
    this.drawAntenna(0);
  }

  private drawAntenna(pulse: number) {
    const a = this.antenna;
    a.clear();
    a.moveTo(0, -44).lineTo(0, -64).stroke({ width: 4, color: color.primary });
    a.circle(0, -68, 8 + pulse * 2).fill(this.mood === 'hint' ? color.gold : color.mint);
    a.circle(0, -68, 14 + pulse * 6).fill({ color: this.mood === 'hint' ? color.gold : color.mint, alpha: 0.25 });
  }

  private drawFace() {
    const f = this.face;
    f.clear();
    const eyeH = this.blink > 0 ? 2 : this.mood === 'excited' ? 9 : 12;
    const c = this.mood === 'hint' ? color.gold : color.mint;
    if (this.mood === 'excited') {
      // happy ^ ^ eyes
      f.moveTo(-22, -6).lineTo(-14, -14).lineTo(-6, -6).stroke({ width: 5, color: c, cap: 'round', join: 'round' });
      f.moveTo(6, -6).lineTo(14, -14).lineTo(22, -6).stroke({ width: 5, color: c, cap: 'round', join: 'round' });
    } else {
      f.roundRect(-21, -10 - eyeH / 2, 12, eyeH, 5).fill(c);
      f.roundRect(9, -10 - eyeH / 2, 12, eyeH, 5).fill(c);
    }
    // mouth: equaliser bars while talking, smile otherwise
    if (this.talking) {
      for (let i = 0; i < 5; i++) {
        const h = 3 + Math.abs(Math.sin(this.t * 14 + i * 1.3)) * 9;
        f.roundRect(-14 + i * 6, 6 - h / 2, 4, h, 2).fill(c);
      }
    } else if (this.mood === 'worried') {
      f.moveTo(-8, 8).quadraticCurveTo(0, 2, 8, 8).stroke({ width: 3, color: c, cap: 'round' });
    } else {
      f.moveTo(-10, 4).quadraticCurveTo(0, 12, 10, 4).stroke({ width: 3, color: c, cap: 'round' });
    }
  }

  setMood(m: SparkyMood) {
    this.mood = m;
    this.drawFace();
  }

  setTalking(on: boolean) {
    this.talking = on;
    this.drawFace();
  }

  async hop() {
    await this.tw.to(this.bodyC, { y: -26 }, { duration: 180, ease: Ease.quadOut });
    await this.tw.to(this.bodyC, { y: 0 }, { duration: 260, ease: Ease.bounceOut });
  }

  async spin() {
    await this.tw.to(this.bodyC, { rotation: Math.PI * 2 }, { duration: 600, ease: Ease.cubicInOut });
    this.bodyC.rotation = 0;
  }

  /** Point an arm toward a direction (radians) for hints. */
  point(angle: number | null) {
    if (angle === null) {
      void this.tw.to(this.armR, { rotation: 0 }, { duration: 200 });
      return;
    }
    void this.tw.to(this.armR, { rotation: angle - Math.PI / 2 }, { duration: 260, ease: Ease.backOut });
  }

  update(dt: number) {
    this.t += dt;
    this.tw.update(dt * 1000);
    const bobSpeed = this.mood === 'excited' ? 6 : 2.2;
    this.bodyC.y += (Math.sin(this.t * bobSpeed) * 6 - this.bodyC.y) * 0.2;
    this.bodyC.rotation = this.mood === 'excited' ? Math.sin(this.t * 8) * 0.08 : Math.sin(this.t * 1.3) * 0.04;
    this.jet.scale.y = 0.7 + Math.sin(this.t * 30) * 0.12;
    this.jet.alpha = 0.7 + Math.sin(this.t * 25) * 0.2;
    this.halo.alpha = 0.4 + Math.sin(this.t * 2) * 0.12 + (this.talking ? 0.15 : 0);
    this.armL.rotation = Math.sin(this.t * 2.5) * 0.15 + (this.mood === 'excited' ? Math.sin(this.t * 12) * 0.5 - 0.8 : 0);
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.12;
      this.blinkIn = 2.5 + Math.random() * 3;
    }
    const wasBlink = this.blink > 0;
    if (this.blink > 0) this.blink -= dt;
    if (this.talking || wasBlink) this.drawFace();
    this.drawAntenna(this.talking ? Math.abs(Math.sin(this.t * 10)) : Math.abs(Math.sin(this.t * 2)) * 0.4);
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.tw.clear();
    super.destroy(options ?? { children: true });
  }
}

export { shade };
