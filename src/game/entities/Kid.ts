import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { font } from '@/design-system/tokens';
import { rGrad, shade, vGrad } from '../draw/paint';
import { Ease, Tweener } from '../engine/Tween';

export interface KidLook {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'curly' | 'spiky';
  eyeColor: number;
  shirt: number;
  shirtAccent: number;
  trim: number;
  shorts: number;
  socks: number;
  shoes: number;
  shoeAccent: number;
  gloves?: number | null;
  bigGloves?: boolean;
  cape?: { main: number; accent: number } | null;
  helmet?: { main: number; accent: number; trim?: number } | null;
  mask?: { main: number } | null;
  headband?: number | null;
  number?: string;
  name?: string;
  emblem?: 'star' | 'bolt' | 'number' | null;
  fullSuit?: boolean;
}

export type KidPose = 'idle' | 'run' | 'walk' | 'think' | 'sad' | 'drive' | 'victory' | 'heroPose' | 'powerUp' | 'ready' | 'cheer' | 'point';
export type KidView = 'front' | 'back';
export type Expression = 'happy' | 'excited' | 'determined' | 'thinking' | 'surprised' | 'sad' | 'sleepy';

const HEAD_R = 44;
const HIP_Y = -58;
const LEG_LEN = 54;
const SHOULDER_Y = -102;
const ARM_LEN = 46;

interface Joints {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  legLs: number;
  legRs: number;
  bodyY: number;
  bodyRot: number;
  headRot: number;
  headY: number;
  squashX: number;
  squashY: number;
}

const zero = (): Joints => ({ legL: 0, legR: 0, armL: 0, armR: 0, legLs: 1, legRs: 1, bodyY: 0, bodyRot: 0, headRot: 0, headY: 0, squashX: 1, squashY: 1 });

/**
 * Procedural chibi kid rig (original character art). Used for Adam and other characters.
 * Origin = point between the feet on the ground. ~210px tall at scale 1.
 */
export class Kid extends Container {
  readonly body = new Container(); // everything except shadow (for squash/jump)
  private shadow = new Graphics();
  private capeG = new Graphics();
  private legL = new Container();
  private legR = new Container();
  private legLG = new Graphics();
  private legRG = new Graphics();
  private torso = new Container();
  private torsoG = new Graphics();
  private torsoText: Text | null = null;
  private armL = new Container();
  private armR = new Container();
  private armLG = new Graphics();
  private armRG = new Graphics();
  readonly head = new Container();
  private faceG = new Graphics();
  private eyes = new Container();
  private eyesG = new Graphics();
  private mouth = new Graphics();
  private accessories = new Graphics();
  private photo: Sprite | null = null;
  private photoMask: Graphics | null = null;
  readonly aura = new Graphics();

  pose: KidPose = 'idle';
  view: KidView = 'front';
  expression: Expression = 'happy';
  talking = false;
  /** additive offsets driven by one-shot actions */
  readonly act: Joints = { ...zero(), legLs: 0, legRs: 0, squashX: 0, squashY: 0 };
  private t = Math.random() * 10;
  private blinkIn = 2;
  private blink = 0;
  private tw = new Tweener();
  private capeWave = 0;
  private mouthPhase = 0;
  speed = 1;

  constructor(
    public look: KidLook,
    private faceTexture: Texture | null = null,
  ) {
    super();
    this.legL.position.set(-13, HIP_Y);
    this.legR.position.set(13, HIP_Y);
    this.legL.addChild(this.legLG);
    this.legR.addChild(this.legRG);
    this.armL.position.set(-26, SHOULDER_Y);
    this.armR.position.set(26, SHOULDER_Y);
    this.armL.addChild(this.armLG);
    this.armR.addChild(this.armRG);
    this.torso.addChild(this.torsoG);
    this.head.position.set(0, -106);
    this.eyes.addChild(this.eyesG);
    this.eyes.position.set(0, -50);
    this.head.addChild(this.faceG, this.eyes, this.mouth, this.accessories);
    this.capeG.position.set(0, SHOULDER_Y + 2);
    this.addChild(this.shadow, this.aura, this.body);
    this.redraw();
  }

  setLook(look: KidLook, faceTexture: Texture | null = this.faceTexture) {
    this.look = look;
    this.faceTexture = faceTexture;
    this.redraw();
  }

  setView(view: KidView) {
    if (this.view === view) return;
    this.view = view;
    this.redraw();
  }

  setExpression(e: Expression) {
    this.expression = e;
    this.drawMouth();
    this.drawEyes();
  }

  // ---------------------------------------------------------------- drawing
  redraw() {
    const L = this.look;
    this.body.removeChildren();
    if (this.view === 'front') {
      this.body.addChild(this.capeG, this.legL, this.legR, this.torso, this.armL, this.armR, this.head);
    } else {
      this.body.addChild(this.legL, this.legR, this.torso, this.armL, this.armR, this.head, this.capeG);
    }
    this.shadow.clear().ellipse(0, 2, 42, 11).fill({ color: 0x000000, alpha: 0.32 });
    this.drawLeg(this.legLG, L);
    this.drawLeg(this.legRG, L);
    this.drawTorso(L);
    this.drawArm(this.armLG, L);
    this.drawArm(this.armRG, L);
    this.drawHead(L);
    this.drawCape();
  }

  private drawLeg(g: Graphics, L: KidLook) {
    g.clear();
    const w = 18;
    if (L.fullSuit) {
      g.roundRect(-w / 2, -4, w, LEG_LEN - 6, 8).fill(vGrad([[0, L.shirt], [1, shade(L.shirt, -0.25)]]));
    } else {
      g.roundRect(-w / 2 + 1, -4, w - 2, LEG_LEN * 0.55, 7).fill(vGrad([[0, L.skin], [1, shade(L.skin, -0.12)]]));
      g.roundRect(-w / 2, LEG_LEN * 0.42, w, LEG_LEN * 0.5, 6).fill(vGrad([[0, L.socks], [1, shade(L.socks, -0.2)]]));
      g.rect(-w / 2, LEG_LEN * 0.42, w, 4).fill({ color: L.trim, alpha: 0.9 });
    }
    // shoe
    const sy = LEG_LEN - 6;
    g.roundRect(-13, sy - 4, 28, 14, 7).fill(vGrad([[0, L.shoes], [1, shade(L.shoes, -0.3)]]));
    g.roundRect(-13, sy + 6, 28, 4, 2).fill(shade(L.shoes, -0.5));
    g.rect(-6, sy - 2, 14, 3).fill({ color: L.shoeAccent, alpha: 0.95 });
  }

  private drawTorso(L: KidLook) {
    const g = this.torsoG;
    g.clear();
    for (const c of this.torso.removeChildren()) if (c !== g) c.destroy();
    this.torso.addChild(g);
    this.torsoText = null;
    // shorts
    g.roundRect(-27, HIP_Y - 14, 54, 26, 10).fill(vGrad([[0, L.shorts], [1, shade(L.shorts, -0.3)]]));
    // shirt
    g.roundRect(-30, -112, 60, 60, 20).fill(vGrad([[0, shade(L.shirt, 0.12)], [0.6, L.shirt], [1, shade(L.shirt, -0.25)]]));
    // side stripes
    g.roundRect(-30, -96, 8, 40, 4).fill({ color: L.shirtAccent, alpha: 0.85 });
    g.roundRect(22, -96, 8, 40, 4).fill({ color: L.shirtAccent, alpha: 0.85 });
    if (this.view === 'front') {
      // collar
      g.moveTo(-12, -112).lineTo(0, -100).lineTo(12, -112).stroke({ width: 5, color: L.trim, cap: 'round', join: 'round' });
      if (L.emblem === 'star') {
        g.star(0, -80, 5, 11, 5).fill(L.shirtAccent).stroke({ width: 2, color: 0xffffff });
      } else if (L.emblem === 'bolt') {
        g.poly([-4, -94, 8, -94, 2, -82, 10, -82, -6, -64, -1, -77, -8, -77]).fill(L.shirtAccent).stroke({ width: 2, color: 0xffffff });
      } else if (L.number) {
        this.torsoText = this.numberText(L.number, 22, L.shirtAccent);
        this.torsoText.position.set(0, -80);
      }
    } else {
      // back of the jersey: name + big number
      if (L.name) {
        const n = new Text({ text: L.name, style: { fontFamily: font.display, fontWeight: '900', fontSize: 12, fill: L.shirtAccent, letterSpacing: 1 } });
        n.anchor.set(0.5);
        n.position.set(0, -101);
        this.torso.addChild(n);
      }
      this.torsoText = this.numberText(L.number ?? '4', 30, L.shirtAccent);
      this.torsoText.position.set(0, -76);
    }
    if (this.torsoText) this.torso.addChild(this.torsoText);
    // gloss
    g.ellipse(-12, -102, 12, 6).fill({ color: 0xffffff, alpha: 0.18 });
  }

  private numberText(s: string, size: number, fill: number) {
    const t = new Text({ text: s, style: { fontFamily: font.display, fontWeight: '900', fontSize: size, fill, stroke: { color: 0xffffff, width: 2 } } });
    t.anchor.set(0.5);
    return t;
  }

  private drawArm(g: Graphics, L: KidLook) {
    g.clear();
    const w = 15;
    g.roundRect(-w / 2, -6, w, ARM_LEN * 0.5, 7).fill(vGrad([[0, L.shirt], [1, shade(L.shirt, -0.2)]]));
    if (!L.fullSuit) g.roundRect(-w / 2 + 1, ARM_LEN * 0.38, w - 2, ARM_LEN * 0.5, 6).fill(L.skin);
    else g.roundRect(-w / 2 + 1, ARM_LEN * 0.38, w - 2, ARM_LEN * 0.5, 6).fill(shade(L.shirt, -0.1));
    const handR = L.bigGloves ? 15 : 9;
    const handC = L.gloves ?? L.skin;
    g.circle(0, ARM_LEN, handR).fill(rGrad([[0, shade(handC, 0.25)], [1, handC]], 0.4, 0.35));
    if (L.gloves) g.circle(0, ARM_LEN, handR).stroke({ width: 2, color: shade(handC, -0.35) });
  }

  private drawHead(L: KidLook) {
    const g = this.faceG;
    const acc = this.accessories;
    g.clear();
    acc.clear();
    const cy = -HEAD_R;
    // neck
    g.roundRect(-9, -8, 18, 14, 5).fill(shade(L.skin, -0.12));
    if (this.photo) {
      this.photo.destroy();
      this.photo = null;
      this.photoMask?.destroy();
      this.photoMask = null;
    }
    if (this.view === 'back') {
      this.eyes.visible = false;
      this.mouth.visible = false;
      g.circle(-HEAD_R + 2, cy + 4, 9).fill(L.skin);
      g.circle(HEAD_R - 2, cy + 4, 9).fill(L.skin);
      g.circle(0, cy, HEAD_R).fill(rGrad([[0, shade(L.hair, 0.25)], [1, L.hair]], 0.45, 0.35));
      this.drawHair(g, L, true);
      if (L.headband) g.roundRect(-HEAD_R, cy - 8, HEAD_R * 2, 12, 6).fill(L.headband);
      this.drawHeadwear(acc, L, true);
      return;
    }
    this.eyes.visible = true;
    this.mouth.visible = true;
    // ears
    g.circle(-HEAD_R + 1, cy + 4, 10).fill(L.skin);
    g.circle(HEAD_R - 1, cy + 4, 10).fill(L.skin);
    g.circle(-HEAD_R + 1, cy + 4, 5).fill(shade(L.skin, -0.15));
    g.circle(HEAD_R - 1, cy + 4, 5).fill(shade(L.skin, -0.15));
    // face
    g.circle(0, cy, HEAD_R).fill(rGrad([[0, shade(L.skin, 0.18)], [0.75, L.skin], [1, shade(L.skin, -0.12)]], 0.42, 0.38));
    if (this.faceTexture) {
      // Parent-provided photo likeness, masked to the face circle.
      const s = new Sprite(this.faceTexture);
      s.anchor.set(0.5);
      const k = (HEAD_R * 2) / Math.min(this.faceTexture.width, this.faceTexture.height);
      s.scale.set(k);
      s.position.set(0, cy);
      const m = new Graphics().circle(0, cy, HEAD_R - 1).fill(0xffffff);
      s.mask = m;
      this.head.addChildAt(m, 1);
      this.head.addChildAt(s, 1);
      this.photo = s;
      this.photoMask = m;
      this.eyes.visible = false;
      this.mouth.visible = false;
      g.circle(0, cy, HEAD_R).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    } else {
      // cheeks
      g.circle(-24, cy + 14, 7).fill({ color: 0xff7a8a, alpha: 0.35 });
      g.circle(24, cy + 14, 7).fill({ color: 0xff7a8a, alpha: 0.35 });
      // nose
      g.ellipse(0, cy + 8, 4, 3).fill(shade(L.skin, -0.15));
      this.drawHair(g, L, false);
      if (L.headband) g.roundRect(-HEAD_R + 2, cy - 26, HEAD_R * 2 - 4, 10, 5).fill(L.headband);
    }
    this.drawHeadwear(acc, L, false);
    this.drawEyes();
    this.drawMouth();
  }

  private drawHair(g: Graphics, L: KidLook, back: boolean) {
    const cy = -HEAD_R;
    const c = L.hair;
    const hi = shade(c, 0.25);
    if (L.helmet) return; // helmet covers hair
    if (L.hairStyle === 'curly') {
      const puffs: [number, number, number][] = back
        ? [[-30, -18, 16], [-12, -26, 17], [8, -27, 17], [26, -20, 16], [-36, 0, 13], [36, 0, 13], [-22, 8, 15], [22, 8, 15], [0, 4, 18]]
        : [[-30, -18, 15], [-12, -28, 16], [8, -29, 16], [26, -22, 15], [-38, -4, 11], [38, -4, 11]];
      for (const [x, y, r] of puffs) g.circle(x, cy + y, r).fill(c);
      for (const [x, y, r] of puffs.slice(0, 4)) g.circle(x - r * 0.25, cy + y - r * 0.3, r * 0.35).fill({ color: hi, alpha: 0.6 });
    } else if (L.hairStyle === 'spiky') {
      const pts = [-40, -6, -36, -40, -22, -28, -14, -50, 0, -32, 12, -52, 22, -30, 36, -44, 40, -6];
      g.poly(pts.map((v, i) => (i % 2 ? cy + v : v))).fill(c);
      if (!back) g.ellipse(0, cy - 30, HEAD_R * 0.9, 16).fill(c);
      else g.circle(0, cy - 2, HEAD_R + 1).fill(c);
    } else {
      if (back) g.circle(0, cy - 2, HEAD_R + 1).fill(c);
      else {
        g.ellipse(0, cy - 30, HEAD_R * 0.92, 18).fill(c);
        g.ellipse(-HEAD_R * 0.72, cy - 18, 11, 16).fill(c);
        g.ellipse(HEAD_R * 0.72, cy - 18, 11, 16).fill(c);
      }
      g.ellipse(-8, cy - 36, 26, 12).fill(c);
      g.ellipse(-14, cy - 34, 10, 4).fill({ color: hi, alpha: 0.5 });
    }
  }

  private drawHeadwear(acc: Graphics, L: KidLook, back: boolean) {
    const cy = -HEAD_R;
    if (L.helmet) {
      const h = L.helmet;
      acc.arc(0, cy + 2, HEAD_R + 6, Math.PI, 0).fill(vGrad([[0, shade(h.main, 0.2)], [1, h.main]]));
      acc.rect(-HEAD_R - 6, cy, (HEAD_R + 6) * 2, 10).fill(h.main);
      acc.roundRect(-6, cy - HEAD_R - 4, 12, HEAD_R + 6, 6).fill(h.accent);
      if (!back) {
        acc.roundRect(-HEAD_R + 4, cy - 4, (HEAD_R - 4) * 2, 18, 9).fill({ color: 0x9fd8ff, alpha: 0.45 }).stroke({ width: 3, color: h.trim ?? 0xffffff });
      }
      acc.ellipse(-18, cy - 30, 12, 6).fill({ color: 0xffffff, alpha: 0.35 });
    }
    if (L.mask && !back) {
      acc.roundRect(-HEAD_R + 6, cy - 16, (HEAD_R - 6) * 2, 22, 11).fill(L.mask.main);
      acc.ellipse(-15, cy - 6, 11, 8).fill(0xffffff);
      acc.ellipse(15, cy - 6, 11, 8).fill(0xffffff);
      acc.moveTo(HEAD_R - 6, cy - 8).lineTo(HEAD_R + 14, cy - 2).lineTo(HEAD_R + 8, cy + 6).fill(L.mask.main);
    }
  }

  private drawEyes() {
    const g = this.eyesG;
    g.clear();
    if (this.view === 'back' || this.faceTexture) return;
    const L = this.look;
    const masked = !!L.mask;
    const e = this.expression;
    const r = e === 'surprised' || e === 'excited' ? 11 : 10;
    for (const sx of [-15, 15]) {
      if (e === 'sleepy') {
        g.arc(sx, 4, 8, 0.2, Math.PI - 0.2).stroke({ width: 3.5, color: 0x2a1a10, cap: 'round' });
        continue;
      }
      if (!masked) g.ellipse(sx, 4, r * 0.85, r).fill(0xffffff);
      g.circle(sx + 1, 6, r * 0.62).fill(L.eyeColor);
      g.circle(sx + 1, 6, r * 0.32).fill(0x0b0b12);
      g.circle(sx + 4, 2, r * 0.26).fill(0xffffff);
      g.circle(sx - 2, 9, r * 0.12).fill({ color: 0xffffff, alpha: 0.8 });
    }
    // brows
    if (!masked && !L.helmet) {
      const lift = e === 'surprised' ? -6 : e === 'excited' ? -3 : 0;
      const tilt = e === 'determined' ? 4 : e === 'sad' ? -4 : e === 'thinking' ? 2 : 0;
      g.moveTo(-23, -10 + lift - tilt).quadraticCurveTo(-15, -15 + lift, -7, -10 + lift + tilt).stroke({ width: 4, color: shade(L.hair, 0.1), cap: 'round' });
      g.moveTo(7, -10 + lift + (e === 'thinking' ? -4 : tilt)).quadraticCurveTo(15, -15 + lift, 23, -10 + lift - tilt).stroke({ width: 4, color: shade(L.hair, 0.1), cap: 'round' });
    }
  }

  private drawMouth() {
    const g = this.mouth;
    g.clear();
    if (this.view === 'back' || this.faceTexture) return;
    const cy = -HEAD_R + 20;
    const e = this.expression;
    const open = this.talking ? 0.35 + Math.abs(Math.sin(this.mouthPhase)) * 0.65 : 0;
    if (open > 0 || e === 'excited' || e === 'surprised') {
      const h = e === 'surprised' ? 10 : e === 'excited' ? 12 : 4 + open * 8;
      const w = e === 'surprised' ? 9 : 15;
      g.ellipse(0, cy + 2, w, h).fill(0x6b1b24);
      g.ellipse(0, cy + 2 + h * 0.45, w * 0.6, h * 0.4).fill(0xff7a8a);
      if (e === 'excited') g.rect(-w * 0.7, cy + 2 - h + 1, w * 1.4, 4).fill(0xffffff);
    } else if (e === 'sad') {
      g.arc(0, cy + 10, 9, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 4, color: 0x6b1b24, cap: 'round' });
    } else if (e === 'thinking') {
      g.moveTo(-7, cy + 3).lineTo(7, cy).stroke({ width: 4, color: 0x6b1b24, cap: 'round' });
    } else if (e === 'determined') {
      g.arc(0, cy - 2, 10, 0.35, Math.PI - 0.35).stroke({ width: 4, color: 0x6b1b24, cap: 'round' });
    } else if (e === 'sleepy') {
      g.ellipse(0, cy + 3, 5, 4).fill(0x6b1b24);
    } else {
      g.arc(0, cy - 4, 13, 0.25, Math.PI - 0.25).fill(0x6b1b24);
      g.arc(0, cy - 4, 13, 0.25, Math.PI - 0.25).stroke({ width: 3, color: 0x6b1b24, cap: 'round' });
    }
  }

  private drawCape() {
    const g = this.capeG;
    g.clear();
    const c = this.look.cape;
    if (!c) return;
    const wv = this.capeWave;
    const len = 108;
    const flare = 46 + Math.sin(wv) * 6;
    if (this.view === 'back') {
      g.poly([-26, 0, 26, 0, flare + Math.sin(wv * 1.3) * 8, len, 0, len + 8 + Math.sin(wv) * 4, -flare + Math.sin(wv * 1.1) * 8, len]).fill(vGrad([[0, c.main], [1, c.accent]]));
      g.poly([-26, 0, 26, 0, 20, 10, -20, 10]).fill(shade(c.main, 0.2));
    } else {
      g.poly([-30, -2, 30, -2, flare + 6 + Math.sin(wv * 1.3) * 8, len - 8, -flare - 6 + Math.sin(wv * 1.1) * 8, len - 8]).fill(vGrad([[0, c.accent], [1, shade(c.accent, -0.3)]]));
    }
  }

  // ---------------------------------------------------------------- animation
  setPose(p: KidPose) {
    this.pose = p;
  }

  update(dt: number) {
    this.t += dt * this.speed;
    this.tw.update(dt * 1000);
    const j = zero();
    const t = this.t;
    switch (this.pose) {
      case 'idle':
        j.bodyY = Math.sin(t * 2.4) * 2;
        j.armL = 0.12 + Math.sin(t * 2.4) * 0.05;
        j.armR = -0.12 - Math.sin(t * 2.4) * 0.05;
        j.headRot = Math.sin(t * 1.2) * 0.04;
        break;
      case 'ready':
        j.bodyY = 6 + Math.sin(t * 3) * 2;
        j.legL = 0.18;
        j.legR = -0.18;
        j.legLs = 0.9;
        j.legRs = 0.9;
        j.armL = 0.9 + Math.sin(t * 3) * 0.08;
        j.armR = -0.9 - Math.sin(t * 3) * 0.08;
        break;
      case 'walk':
      case 'run': {
        const f = this.pose === 'run' ? 11 : 6;
        const a = this.pose === 'run' ? 0.75 : 0.4;
        j.legL = Math.sin(t * f) * a;
        j.legR = -Math.sin(t * f) * a;
        j.armL = -Math.sin(t * f) * a * 0.9 + 0.1;
        j.armR = Math.sin(t * f) * a * 0.9 - 0.1;
        j.bodyY = -Math.abs(Math.sin(t * f)) * (this.pose === 'run' ? 7 : 3);
        j.bodyRot = this.pose === 'run' ? 0.05 : 0;
        break;
      }
      case 'think':
        j.armR = -2.5;
        j.armL = 0.15;
        j.headRot = 0.12 + Math.sin(t * 1.5) * 0.04;
        j.bodyY = Math.sin(t * 2) * 1.5;
        break;
      case 'sad':
        j.armL = 0.05;
        j.armR = -0.05;
        j.headRot = -0.08;
        j.headY = 4;
        j.bodyY = 2;
        break;
      case 'drive':
        j.legL = -1.45;
        j.legR = -1.45;
        j.legLs = 0.7;
        j.legRs = 0.7;
        j.armL = -1.2 + Math.sin(t * 3) * 0.06;
        j.armR = 1.2 - Math.sin(t * 3) * 0.06;
        j.bodyY = Math.sin(t * 9) * 1.2;
        break;
      case 'victory':
        j.armL = 2.6 + Math.sin(t * 8) * 0.12;
        j.armR = -2.6 - Math.sin(t * 8) * 0.12;
        j.bodyY = -Math.abs(Math.sin(t * 5)) * 10;
        break;
      case 'cheer':
        j.armL = 2.4 + Math.sin(t * 10) * 0.35;
        j.armR = -2.4 + Math.sin(t * 10) * 0.35;
        j.bodyY = -Math.abs(Math.sin(t * 6)) * 14;
        j.headRot = Math.sin(t * 6) * 0.08;
        break;
      case 'heroPose':
        j.armL = 0.55;
        j.armR = -0.55;
        j.legL = 0.16;
        j.legR = -0.16;
        j.bodyY = Math.sin(t * 2) * 1.5;
        j.headRot = -0.05;
        break;
      case 'powerUp':
        j.armL = 1.4 + Math.sin(t * 14) * 0.1;
        j.armR = -1.4 - Math.sin(t * 14) * 0.1;
        j.legL = 0.2;
        j.legR = -0.2;
        j.bodyY = Math.sin(t * 20) * 1.5;
        break;
      case 'point':
        j.armR = -2.0;
        j.armL = 0.15;
        j.bodyY = Math.sin(t * 2.4) * 2;
        break;
    }
    const a = this.act;
    this.legL.rotation = j.legL + a.legL;
    this.legR.rotation = j.legR + a.legR;
    this.legL.scale.y = j.legLs + a.legLs;
    this.legR.scale.y = j.legRs + a.legRs;
    this.armL.rotation = j.armL + a.armL;
    this.armR.rotation = j.armR + a.armR;
    this.body.y = j.bodyY + a.bodyY;
    this.body.rotation = j.bodyRot + a.bodyRot;
    this.body.scale.set(j.squashX + a.squashX, j.squashY + a.squashY);
    this.head.rotation = j.headRot + a.headRot;
    this.head.y = -106 + j.headY + a.headY;
    // shadow shrinks when airborne
    const air = Math.max(0, -(this.body.y));
    this.shadow.scale.set(Math.max(0.4, 1 - air / 160));
    this.shadow.alpha = Math.max(0.3, 1 - air / 200);

    // blink
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.14;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    if (this.blink > 0) {
      this.blink -= dt;
      this.eyes.scale.y = this.blink > 0 ? 0.12 : 1;
    }
    if (this.talking) {
      this.mouthPhase += dt * 16;
      this.drawMouth();
    }
    if (this.look.cape) {
      const speed = this.pose === 'run' || this.pose === 'powerUp' ? 9 : 3;
      this.capeWave += dt * speed;
      this.drawCape();
    }
  }

  setTalking(on: boolean) {
    if (this.talking === on) return;
    this.talking = on;
    this.mouthPhase = 0;
    this.drawMouth();
  }

  // ---------------------------------------------------------------- one-shots
  private animate(props: Partial<Joints>, ms: number, ease = Ease.quadOut) {
    return this.tw.to(this.act, props, { duration: ms, ease });
  }

  async jump(height = 90) {
    await this.animate({ squashX: 0.12, squashY: -0.14, bodyY: 6 }, 110);
    await this.animate({ squashX: -0.08, squashY: 0.12, bodyY: -height, armL: 2.2, armR: -2.2 }, 280, Ease.cubicOut);
    await this.animate({ squashX: 0, squashY: 0, bodyY: 0, armL: 0, armR: 0 }, 280, Ease.quadIn);
    await this.animate({ squashX: 0.12, squashY: -0.1 }, 70);
    await this.animate({ squashX: 0, squashY: 0 }, 160, Ease.backOut);
  }

  /** Kick with the right leg. `onContact` fires at the moment of contact. */
  async kick(onContact?: () => void) {
    this.setExpression('determined');
    if (this.view === 'back') {
      // seen from behind: wind-up lifts the foot back, then snaps through
      await this.animate({ legR: 0.5, legRs: -0.45, armL: 0.9, armR: -0.4, bodyRot: 0.08 }, 220);
      await this.animate({ legR: -0.35, legRs: -0.25, armL: -0.3, armR: 1.0, bodyRot: -0.08, bodyY: -6 }, 90, Ease.quadIn);
    } else {
      await this.animate({ legR: 0.9, armL: -0.8, armR: 0.7, bodyRot: -0.1 }, 220);
      await this.animate({ legR: -1.5, armL: 0.9, armR: -0.9, bodyRot: 0.12, bodyY: -6 }, 90, Ease.quadIn);
    }
    onContact?.();
    await this.tw.wait(160);
    await this.animate({ legR: 0, legRs: 0, armL: 0, armR: 0, bodyRot: 0, bodyY: 0 }, 260, Ease.backOut);
  }

  async celebrate(style: string = 'celebration.jump', ms = 1800) {
    this.setExpression('excited');
    const end = performance.now() + ms;
    if (style === 'celebration.spin') {
      this.setPose('victory');
      while (performance.now() < end) {
        await this.tw.to(this.scale, { x: -Math.abs(this.scale.x) }, { duration: 160 });
        await this.tw.to(this.scale, { x: Math.abs(this.scale.x) }, { duration: 160 });
      }
    } else if (style === 'celebration.flex') {
      this.setPose('heroPose');
      await this.animate({ armL: 2.0, armR: -2.0, bodyY: -10 }, 250, Ease.backOut);
      await this.tw.wait(Math.max(300, ms - 500));
      await this.animate({ armL: 0, armR: 0, bodyY: 0 }, 250);
    } else {
      this.setPose('cheer');
      while (performance.now() < end) await this.jump(70);
    }
    this.setPose('idle');
  }

  /** Small encouraging "oops, it's ok" reaction — never a punishment. */
  async encouraged() {
    this.setExpression('thinking');
    this.setPose('think');
    await this.tw.wait(700);
    this.setExpression('determined');
    this.setPose('idle');
    await this.animate({ armR: -2.4 }, 200, Ease.backOut); // thumbs-up
    await this.tw.wait(350);
    await this.animate({ armR: 0 }, 220);
    this.setExpression('happy');
  }

  /** Quick turn-around (flip) between back and front view. */
  async turnTo(view: KidView) {
    const sx = this.scale.x;
    await this.tw.to(this.scale, { x: 0.05 * Math.sign(sx || 1) }, { duration: 110, ease: Ease.quadIn });
    this.setView(view);
    await this.tw.to(this.scale, { x: sx }, { duration: 140, ease: Ease.backOut });
  }

  /** Power aura (behind body) — used when an answer charges Adam. */
  setAura(strength: number, tint = 0x4edea3) {
    const g = this.aura;
    g.clear();
    if (strength <= 0) return;
    g.ellipse(0, -110, 70 + strength * 20, 120 + strength * 20).fill({ color: tint, alpha: 0.15 * strength });
    g.ellipse(0, -110, 55 + strength * 10, 100 + strength * 10).fill({ color: tint, alpha: 0.2 * strength });
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.tw.clear();
    super.destroy(options ?? { children: true });
  }
}
