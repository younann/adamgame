import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { color, font } from '@/design-system/tokens';
import { hGrad, shade, vGrad } from '../../draw/paint';
import type { Pitch } from './Pitch';

const SKIN = [0xf6cfa8, 0xe9b48a, 0xc98e62, 0x9c6a43, 0x6e4a2e];
const FAN_ADAM = [color.blue, color.gold, 0xffffff, color.blue, 0x2f7bff, color.mint];
const FAN_RIVAL = [0x8b3dff, 0xff8a1f];

/**
 * Night stadium environment: sky, tiered crowd, floodlights with light cones, waving flags,
 * scrolling LED boards, striped perspective pitch, and the goal (frame + bulging net).
 * Everything ambient animates so the world always feels alive.
 */
export class Stadium {
  readonly back = new Container(); // sky + stands + lights (behind the goal)
  readonly ground = new Container(); // pitch + lines
  readonly goalBack = new Container(); // net (behind keeper)
  readonly goalFront = new Container(); // posts (in front of the net, behind keeper's front)
  private sky = new Graphics();
  private stars = new Graphics();
  private stands = new Graphics();
  private crowd: Graphics[] = [new Graphics(), new Graphics(), new Graphics()];
  private flags = new Graphics();
  private towers = new Graphics();
  private lamps: Sprite[] = [];
  private cones: Sprite[] = [];
  private flashes: Sprite[] = [];
  private led = new Container();
  private ledMask = new Graphics();
  private ledBg = new Graphics();
  private ledTexts: Text[] = [];
  private pitchG = new Graphics();
  private linesG = new Graphics();
  private netG = new Graphics();
  private postsG = new Graphics();
  private p!: Pitch;
  private t = 0;
  private hype = 0;
  private flash = 0;
  private netBulge = { x: 0, y: 0, amp: 0, vel: 0 };
  private flagPoles: { x: number; y: number; c: number; s: number }[] = [];
  private starField: { x: number; y: number; r: number; ph: number }[] = [];
  ledMessage = '⚽ ADAM  ★  GOAL STADIUM  ★  آدم بطل الملعب  ★';

  constructor(private readonly glow: Texture, private readonly reduced: () => boolean) {
    this.back.addChild(this.sky, this.stars, this.towers);
    for (let i = 0; i < 4; i++) {
      const cone = new Sprite(glow);
      cone.anchor.set(0.5, 0.05);
      cone.blendMode = 'add';
      cone.tint = 0xdff6ff;
      this.cones.push(cone);
      const lamp = new Sprite(glow);
      lamp.anchor.set(0.5);
      lamp.blendMode = 'add';
      lamp.tint = 0xffffff;
      this.lamps.push(lamp);
    }
    this.back.addChild(...this.cones, this.stands, ...this.crowd, this.flags, ...this.lamps);
    for (let i = 0; i < 8; i++) {
      const f = new Sprite(glow);
      f.anchor.set(0.5);
      f.blendMode = 'add';
      f.scale.set(0.12);
      f.alpha = 0;
      this.flashes.push(f);
      this.back.addChild(f);
    }
    this.led.addChild(this.ledBg);
    this.ledMask.eventMode = 'none';
    this.back.addChild(this.led, this.ledMask);
    this.led.mask = this.ledMask;
    this.ground.addChild(this.pitchG, this.linesG);
    this.goalBack.addChild(this.netG);
    this.goalFront.addChild(this.postsG);
  }

  layout(p: Pitch) {
    this.p = p;
    const { w, h, cx } = p;
    // --- sky
    this.sky.clear().rect(-w, -h, w * 3, p.pitchTop + h + 4).fill(vGrad([[0, 0x050a18], [0.55, 0x0d1a3f], [1, 0x1a2a66]]));
    this.starField = Array.from({ length: Math.round(w / 9) }, () => ({ x: Math.random() * w * 1.4 - w * 0.2, y: Math.random() * (p.horizonY + 30), r: 0.6 + Math.random() * 1.6, ph: Math.random() * 6 }));

    // --- stands (tiered bowl)
    const top = p.horizonY;
    const bottom = p.pitchTop;
    const g = this.stands.clear();
    g.rect(-w, top, w * 3, bottom - top + 2).fill(vGrad([[0, 0x111a33], [1, 0x1d2a52]]));
    const tiers = 6;
    for (let i = 0; i <= tiers; i++) {
      const y = top + ((bottom - top) * i) / tiers;
      g.rect(-w, y, w * 3, 2).fill({ color: 0x2f3d6e, alpha: 0.8 });
    }
    // roof rim with neon edge (design: electric blue glow line)
    g.rect(-w, top - 10, w * 3, 12).fill(0x0a1024);
    g.rect(-w, top + 1, w * 3, 3).fill({ color: color.blue, alpha: 0.95 });
    g.rect(-w, top - 1, w * 3, 7).fill({ color: color.blue, alpha: 0.25 });

    // --- crowd: three phase groups of fans (head + shirt)
    for (const c of this.crowd) c.clear();
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = top + ((bottom - top) * (r + 0.7)) / (rows + 0.4);
      const size = 3.2 + r * 0.55;
      const step = size * 2.5;
      const grp = this.crowd[r % 3];
      for (let x = -w * 0.3; x < w * 1.3; x += step * (0.85 + Math.random() * 0.3)) {
        const rival = x > w * 0.78 && x < w * 0.98;
        const shirt = (rival ? FAN_RIVAL : FAN_ADAM)[Math.floor(Math.random() * (rival ? 2 : 6))];
        grp.roundRect(x - size, y - size * 0.2, size * 2, size * 1.8, size * 0.6).fill(shade(shirt, -0.15));
        grp.circle(x, y - size * 0.9, size * 0.8).fill(SKIN[Math.floor(Math.random() * SKIN.length)]);
        if (Math.random() < 0.08) grp.rect(x + size * 0.6, y - size * 3.2, size * 0.5, size * 2.6).fill(color.gold); // raised scarf/arm
      }
    }

    // --- floodlight towers
    const t = this.towers.clear();
    const towerXs = p.landscape ? [w * 0.04, w * 0.27, w * 0.73, w * 0.96] : [w * 0.06, w * 0.94];
    this.flagPoles = [];
    towerXs.forEach((x, i) => {
      const topY = Math.max(6, top - p.U * 0.32);
      t.rect(x - 3, topY + 20, 6, top - topY).fill(0x2a3350);
      t.roundRect(x - 24, topY, 48, 26, 5).fill(0x1b2240).stroke({ width: 2, color: 0x3a4a80 });
      for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) t.circle(x - 16 + a * 10.6, topY + 7 + b * 11, 3.6).fill(0xf8fbff);
      const lamp = this.lamps[i];
      lamp.visible = true;
      lamp.position.set(x, topY + 13);
      lamp.scale.set(p.U / 360);
      const cone = this.cones[i];
      cone.visible = true;
      cone.position.set(x, topY + 13);
      const dx = cx - x;
      const dy = p.goalY - topY;
      cone.rotation = Math.atan2(dx, dy) * -1;
      cone.scale.set(p.U / 200, Math.hypot(dx, dy) / 64);
      cone.alpha = 0.1;
    });
    for (let i = towerXs.length; i < 4; i++) {
      this.lamps[i].visible = false;
      this.cones[i].visible = false;
    }
    const nFlags = p.landscape ? 8 : 5;
    for (let i = 0; i < nFlags; i++) {
      this.flagPoles.push({ x: w * (0.14 + (0.72 * i) / (nFlags - 1)), y: top - 8, c: [color.blue, color.gold, color.mint][i % 3], s: p.U / 390 });
    }

    // --- LED advertising boards behind the goal line
    const ledY = p.pitchTop - p.U * 0.06;
    const ledH = p.U * 0.055;
    this.ledBg.clear().rect(-w, ledY, w * 3, ledH).fill(0x05070f).rect(-w, ledY, w * 3, 2).fill({ color: color.mint, alpha: 0.7 });
    this.ledMask.clear().rect(0, ledY, w, ledH).fill(0xffffff);
    for (const tx of this.ledTexts) tx.destroy();
    this.ledTexts = [];
    for (let i = 0; i < 3; i++) {
      const tx = new Text({ text: this.ledMessage, style: { fontFamily: font.display, fontWeight: '900', fontSize: ledH * 0.72, fill: i % 2 ? color.mint : color.gold } });
      tx.anchor.set(0, 0.5);
      tx.y = ledY + ledH / 2;
      this.led.addChild(tx);
      this.ledTexts.push(tx);
    }
    this.layoutLedTexts();

    // --- pitch stripes
    const pg = this.pitchG.clear();
    const bands = 10;
    const vTop = (p.pitchTop - p.goalY) / (p.nearY - p.goalY);
    for (let i = 0; i < bands; i++) {
      const v0 = vTop + ((1.4 - vTop) * i) / bands;
      const v1 = vTop + ((1.4 - vTop) * (i + 1)) / bands;
      const c = i % 2 ? 0x2c9a5a : 0x35ad66;
      pg.poly([p.x(-1.6, v0), p.y(v0), p.x(1.6, v0), p.y(v0), p.x(1.6, v1), p.y(v1), p.x(-1.6, v1), p.y(v1)]).fill(c);
    }
    // mint rim light + vignette
    pg.rect(-w, p.y(1.0), w * 3, h).fill({ color: 0x0a1f14, alpha: 0.25 });
    pg.poly([p.x(-1.6, vTop), p.y(vTop), p.x(1.6, vTop), p.y(vTop), p.x(1.6, vTop + 0.12), p.y(vTop + 0.12), p.x(-1.6, vTop + 0.12), p.y(vTop + 0.12)]).fill({ color: 0x000000, alpha: 0.18 });

    // --- lines
    const lg = this.linesG.clear();
    const line = { width: Math.max(2, p.U * 0.008), color: 0xffffff, alpha: 0.85 };
    const L = (pts: [number, number][]) => {
      lg.moveTo(p.x(pts[0][0], pts[0][1]), p.y(pts[0][1]));
      for (const [u, v] of pts.slice(1)) lg.lineTo(p.x(u, v), p.y(v));
      lg.stroke(line);
    };
    L([[-1.6, 0], [1.6, 0]]); // goal line
    const boxU = 0.78;
    L([[-boxU, 0], [-boxU, 0.5], [boxU, 0.5], [boxU, 0]]); // penalty box
    L([[-0.42, 0], [-0.42, 0.18], [0.42, 0.18], [0.42, 0]]); // goal area
    // penalty arc
    lg.moveTo(p.x(-0.28, 0.5), p.y(0.5));
    lg.quadraticCurveTo(p.cx, p.y(0.62), p.x(0.28, 0.5), p.y(0.5));
    lg.stroke(line);
    lg.ellipse(p.cx, p.y(0.42), 6 * p.s(0.42), 3.5 * p.s(0.42)).fill(0xffffff);

    this.drawGoal();
  }

  private layoutLedTexts() {
    const w0 = this.ledTexts[0]?.width ?? 300;
    this.ledTexts.forEach((tx, i) => (tx.x = i * (w0 + 30)));
  }

  setLedMessage(msg: string) {
    this.ledMessage = msg;
    for (const tx of this.ledTexts) tx.text = msg;
    this.layoutLedTexts();
  }

  /** Goal frame + net. Net bulges at the impact point. */
  drawGoal() {
    const p = this.p;
    const gx0 = p.cx - p.goalHalf;
    const gx1 = p.cx + p.goalHalf;
    const gy = p.goalY;
    const top = gy - p.goalH;
    const depth = p.goalH * 0.3;
    const bx0 = gx0 + p.goalHalf * 0.12;
    const bx1 = gx1 - p.goalHalf * 0.12;
    const bTop = top - depth * 0.55;
    const bBot = gy - depth;
    const b = this.netBulge;
    const n = this.netG.clear();
    // back panel shadow
    n.poly([bx0, bTop, bx1, bTop, bx1, bBot, bx0, bBot]).fill({ color: 0x0b1530, alpha: 0.35 });
    const disp = (x: number, y: number) => {
      if (Math.abs(b.amp) <= 0.01) return [x, y];
      const d = Math.hypot(x - b.x, (y - b.y) * 1.3);
      const k = Math.max(0, 1 - d / (p.goalHalf * 0.7));
      const push = b.amp * k * k;
      return [x, y - push * p.goalH * 0.22];
    };
    const net = { width: Math.max(1, p.U * 0.0035), color: 0xffffff, alpha: 0.55 };
    const cols = 14;
    const rows = 8;
    for (let i = 0; i <= cols; i++) {
      const x = bx0 + ((bx1 - bx0) * i) / cols;
      n.moveTo(...(disp(x, bTop) as [number, number]));
      for (let j = 1; j <= rows; j++) n.lineTo(...(disp(x, bTop + ((bBot - bTop) * j) / rows) as [number, number]));
      n.stroke(net);
      // floor connection to goal line
      const fx = gx0 + ((gx1 - gx0) * i) / cols;
      n.moveTo(x, bBot).lineTo(fx, gy).stroke({ ...net, alpha: 0.3 });
    }
    for (let j = 0; j <= rows; j++) {
      const y = bTop + ((bBot - bTop) * j) / rows;
      n.moveTo(...(disp(bx0, y) as [number, number]));
      for (let i = 1; i <= cols; i++) n.lineTo(...(disp(bx0 + ((bx1 - bx0) * i) / cols, y) as [number, number]));
      n.stroke(net);
    }
    // side + roof panels
    for (const [fx, bx] of [[gx0, bx0], [gx1, bx1]]) {
      for (let j = 0; j <= 5; j++) {
        const k = j / 5;
        n.moveTo(fx, top + (gy - top) * k).lineTo(bx, bTop + (bBot - bTop) * k).stroke({ ...net, alpha: 0.35 });
      }
    }
    for (let i = 0; i <= cols; i += 2) {
      const fx = gx0 + ((gx1 - gx0) * i) / cols;
      const bx = bx0 + ((bx1 - bx0) * i) / cols;
      n.moveTo(fx, top).lineTo(bx, bTop).stroke({ ...net, alpha: 0.35 });
    }

    // posts + crossbar (white with golden glow, as in the design)
    const pg = this.postsG.clear();
    const pw = Math.max(5, p.U * 0.024);
    pg.roundRect(gx0 - pw * 1.6, top - pw * 1.6, gx1 - gx0 + pw * 3.2, pw * 3.2, pw).fill({ color: color.gold, alpha: 0.18 });
    pg.roundRect(gx0 - pw / 2, top - pw / 2, pw, gy - top + pw / 2, pw / 2).fill(hGrad([[0, 0xd9dde8], [0.5, 0xffffff], [1, 0xc8ccd8]]));
    pg.roundRect(gx1 - pw / 2, top - pw / 2, pw, gy - top + pw / 2, pw / 2).fill(hGrad([[0, 0xd9dde8], [0.5, 0xffffff], [1, 0xc8ccd8]]));
    pg.roundRect(gx0 - pw / 2, top - pw / 2, gx1 - gx0 + pw, pw, pw / 2).fill(vGrad([[0, 0xffffff], [1, 0xc8ccd8]]));
    pg.roundRect(gx0 - pw / 2, top - pw / 2, gx1 - gx0 + pw, pw, pw / 2).stroke({ width: 2, color: color.gold, alpha: 0.6 });
  }

  /** Ball hits the net at (x, y). */
  hitNet(x: number, y: number) {
    this.netBulge.x = x;
    this.netBulge.y = y;
    this.netBulge.amp = 1;
    this.netBulge.vel = 0;
  }

  goal() {
    this.hype = 3;
    this.flash = 1;
  }

  update(dt: number) {
    this.t += dt;
    const p = this.p;
    if (!p) return;
    const reduced = this.reduced();
    // stars twinkle
    const sg = this.stars.clear();
    for (const s of this.starField) sg.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.35 + Math.sin(this.t * 2 + s.ph) * 0.3 });
    // crowd bob (bigger when hyped)
    this.hype = Math.max(0, this.hype - dt);
    const amp = (reduced ? 0.5 : 1) * (1.2 + this.hype * 2.6);
    const sp = 3 + this.hype * 4;
    this.crowd.forEach((c, i) => (c.y = -Math.abs(Math.sin(this.t * sp + i * 1.9)) * amp));
    // flags
    const fg = this.flags.clear();
    for (const f of this.flagPoles) {
      const s = f.s;
      fg.rect(f.x - 1, f.y - 34 * s, 2, 34 * s).fill(0xb3c5ff);
      const wv = Math.sin(this.t * 5 + f.x * 0.05);
      fg.poly([f.x, f.y - 34 * s, f.x + 22 * s, f.y - 30 * s + wv * 3 * s, f.x + 26 * s + wv * 2, f.y - 24 * s + wv * 4 * s, f.x, f.y - 22 * s]).fill(f.c);
    }
    // light flicker + goal flash
    this.flash = Math.max(0, this.flash - dt * 0.8);
    for (const c of this.cones) c.alpha = 0.09 + Math.sin(this.t * 1.7 + c.x) * 0.015 + this.flash * 0.25;
    for (const l of this.lamps) l.alpha = 0.85 + Math.sin(this.t * 13 + l.x) * 0.05 + this.flash * 0.3;
    // camera flashes in the stands (more on goal)
    for (const f of this.flashes) {
      if (f.alpha > 0) f.alpha = Math.max(0, f.alpha - dt * 5);
      else if (Math.random() < (this.hype > 0 ? 0.15 : 0.006)) {
        f.position.set(Math.random() * p.w, p.horizonY + Math.random() * (p.pitchTop - p.horizonY));
        f.alpha = 1;
      }
    }
    // LED scroll
    const w0 = (this.ledTexts[0]?.width ?? 300) + 30;
    for (const tx of this.ledTexts) {
      tx.x -= dt * (60 + this.hype * 120);
      if (tx.x < -w0) tx.x += w0 * this.ledTexts.length;
    }
    // net spring
    const b = this.netBulge;
    if (Math.abs(b.amp) > 0.01 || Math.abs(b.vel) > 0.01) {
      b.vel += (-b.amp * 60 - b.vel * 6) * dt;
      b.amp += b.vel * dt;
      if (Math.abs(b.amp) < 0.01 && Math.abs(b.vel) < 0.05) {
        b.amp = 0;
        b.vel = 0;
      }
      this.drawGoal();
    }
  }
}
