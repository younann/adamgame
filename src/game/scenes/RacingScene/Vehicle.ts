import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { gameText, hGrad, shade, vGrad } from '../../draw/paint';
import type { Kid } from '../../entities/Kid';

/**
 * Original chunky arcade race kart seen from behind/above. The driver (a Kid rig in back
 * view, 'drive' pose) sits inside; the body covers his lower half. Origin = ground centre.
 */
export class Vehicle extends Container {
  private shadow = new Graphics();
  private wheelL = new Graphics();
  private wheelR = new Graphics();
  private body = new Graphics();
  private wing = new Graphics();
  private flames: Sprite[] = [];
  private flameCores: Sprite[] = [];
  readonly chassis = new Container();
  private spin = 0;
  private t = Math.random() * 10;
  /** 0 = idle exhaust, 1 = full nitro */
  nitro = 0;

  constructor(
    glow: Texture,
    private main: number,
    private accent: number,
    number: string,
    readonly driver: Kid | null,
  ) {
    super();
    this.shadow.ellipse(0, 4, 92, 18).fill({ color: 0x000000, alpha: 0.45 });
    this.wheelL.position.set(-58, -22);
    this.wheelR.position.set(58, -22);
    this.drawBody(number);
    for (const x of [-20, 20]) {
      const f = new Sprite(glow);
      f.anchor.set(0.5, 0.2);
      f.position.set(x, -14);
      f.tint = 0xff8a1f;
      f.blendMode = 'add';
      const core = new Sprite(glow);
      core.anchor.set(0.5, 0.2);
      core.position.set(x, -14);
      core.tint = 0x9fd8ff;
      core.blendMode = 'add';
      this.flames.push(f);
      this.flameCores.push(core);
    }
    this.chassis.addChild(this.wheelL, this.wheelR);
    if (driver) {
      driver.setView('back');
      driver.setPose('drive');
      driver.scale.set(0.5);
      driver.position.set(0, -40);
      this.chassis.addChild(driver);
    }
    const plate = gameText(number, 18, { fillColor: shade(main, -0.3), strokeColor: 0xffffff });
    plate.position.set(0, -29);
    this.chassis.addChild(this.body, plate, this.wing, ...this.flames, ...this.flameCores);
    this.addChild(this.shadow, this.chassis);
  }

  private drawBody(number: string) {
    const b = this.body;
    const m = this.main;
    b.clear();
    // floor + side pods
    b.roundRect(-80, -46, 160, 34, 14).fill(shade(m, -0.45));
    b.roundRect(-74, -64, 148, 46, 18).fill(vGrad([[0, shade(m, 0.25)], [0.55, m], [1, shade(m, -0.35)]]));
    b.roundRect(-74, -64, 148, 46, 18).stroke({ width: 3, color: 0xffffff, alpha: 0.75 });
    // cockpit rim (driver sits behind this)
    b.roundRect(-36, -74, 72, 18, 9).fill(0x11162a).stroke({ width: 3, color: this.accent });
    // racing stripes
    b.rect(-10, -63, 8, 44).fill({ color: this.accent, alpha: 0.95 });
    b.rect(2, -63, 8, 44).fill({ color: this.accent, alpha: 0.95 });
    // number plate
    b.roundRect(-20, -40, 40, 22, 6).fill(0xffffff).stroke({ width: 2, color: shade(m, -0.4) });
    void number;
    // tail lights
    b.roundRect(-70, -30, 18, 8, 4).fill(color.red);
    b.roundRect(52, -30, 18, 8, 4).fill(color.red);
    // exhaust pipes
    b.circle(-20, -16, 7).fill(0x2a2f3d).stroke({ width: 2, color: 0x8c90a1 });
    b.circle(20, -16, 7).fill(0x2a2f3d).stroke({ width: 2, color: 0x8c90a1 });
    b.circle(-20, -16, 3.5).fill(0x05070d);
    b.circle(20, -16, 3.5).fill(0x05070d);
    // rear wing on struts
    const w = this.wing;
    w.clear();
    // low rear spoiler (keeps the driver's head and helmet visible)
    w.rect(-60, -70, 6, 12).fill(0x2a2f3d);
    w.rect(54, -70, 6, 12).fill(0x2a2f3d);
    for (const sx of [-1, 1]) {
      w.roundRect(sx < 0 ? -92 : 46, -80, 46, 14, 6).fill(hGrad([[0, shade(this.accent, -0.2)], [0.5, this.accent], [1, shade(this.accent, -0.2)]]));
      w.roundRect(sx < 0 ? -92 : 46, -80, 46, 14, 6).stroke({ width: 2.5, color: 0xffffff, alpha: 0.8 });
    }
  }

  private drawWheel(g: Graphics) {
    g.clear();
    g.roundRect(-20, -26, 40, 52, 12).fill(0x14161f);
    // tread bars scroll down to show spin
    for (let i = 0; i < 6; i++) {
      const y = -26 + ((i * 10 + this.spin) % 52);
      g.rect(-18, y, 36, 4).fill({ color: 0x3a3f52, alpha: 0.95 });
    }
    g.roundRect(-20, -26, 40, 52, 12).stroke({ width: 2, color: 0x000000 });
    g.roundRect(-6, -10, 12, 20, 4).fill(color.gold);
  }

  update(dt: number, speed: number, steer: number) {
    this.t += dt;
    this.spin = (this.spin + speed * dt * 4) % 520;
    this.drawWheel(this.wheelL);
    this.drawWheel(this.wheelR);
    // engine vibration + lean into steering
    const vib = Math.min(1, speed / 80) * 1.6;
    this.chassis.y = Math.sin(this.t * 40) * vib;
    this.chassis.rotation = steer * 0.12;
    const n = this.nitro;
    const flick = 0.8 + Math.sin(this.t * 55) * 0.2;
    this.flames.forEach((f, i) => {
      f.scale.set((0.28 + n * 0.45) * flick, (0.35 + n * 1.3) * (0.85 + Math.sin(this.t * 47 + i) * 0.15));
      f.alpha = 0.55 + n * 0.45;
    });
    this.flameCores.forEach((f) => {
      f.scale.set((0.12 + n * 0.22) * flick, (0.15 + n * 0.7) * flick);
      f.alpha = 0.4 + n * 0.6;
    });
    this.driver?.update(dt);
  }
}
