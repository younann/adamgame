import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { hGrad, rGrad, shade, starPoints, vGrad } from '../../draw/paint';
import { Ease, type Tweener } from '../../engine/Tween';

export interface LocationArt {
  view: Container;
  update(dt: number, time: number): void;
  setLocked(on: boolean): void;
  wiggle?(tw: Tweener): Promise<void>;
}

/** Miniature, animated landmark art for each place on Adam's world map. */
export function drawLocation(id: string, glow: Texture): LocationArt {
  switch (id) {
    case 'football':
      return stadium(glow);
    case 'hero':
      return heroCity(glow);
    case 'racing':
      return raceTrack(glow);
    case 'treasure':
      return treasure(glow);
    case 'stickers':
      return stickerBook(glow);
    default:
      return closet(glow);
  }
}

function base(): { view: Container; lock: Container; setLocked(on: boolean): void; wiggle(tw: Tweener): Promise<void> } {
  const view = new Container();
  const lock = new Container();
  const fog = new Graphics();
  for (let i = 0; i < 6; i++) fog.circle(-50 + i * 20, -10 + Math.sin(i * 2) * 12, 30).fill({ color: 0x1a2240, alpha: 0.75 });
  const pad = new Graphics();
  pad.roundRect(-16, -12, 32, 26, 6).fill(color.gold).stroke({ width: 3, color: 0xffffff });
  pad.arc(0, -12, 11, Math.PI, 0).stroke({ width: 6, color: 0xc8ccd8 });
  pad.circle(0, 0, 4).fill(0x5a3a10);
  lock.addChild(fog, pad);
  lock.visible = false;
  return {
    view,
    lock,
    setLocked(on: boolean) {
      lock.visible = on;
      view.alpha = 1;
    },
    async wiggle(tw: Tweener) {
      for (const r of [-0.15, 0.15, -0.08, 0]) await tw.to(lock, { rotation: r }, { duration: 70 });
    },
  };
}

function stadium(glow: Texture): LocationArt {
  const b = base();
  const g = new Graphics();
  g.ellipse(0, 10, 78, 46).fill(0x1d2a52);
  g.ellipse(0, 4, 78, 46).fill(vGrad([[0, 0x3a4a80], [1, 0x1d2a52]]));
  g.ellipse(0, 4, 78, 46).stroke({ width: 3, color: color.blue });
  // crowd dots ring
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    g.circle(Math.cos(a) * 66, 4 + Math.sin(a) * 36, 3).fill([color.gold, 0xffffff, color.blue, color.mint][i % 4]);
  }
  g.ellipse(0, 6, 54, 28).fill(0x2c9a5a);
  for (let i = -2; i <= 2; i++) g.rect(i * 21 - 5, -20, 10, 52).fill({ color: 0x35ad66, alpha: 0.8 });
  g.ellipse(0, 6, 54, 28).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  g.moveTo(0, -22).lineTo(0, 34).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  g.circle(0, 6, 10).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  const lights: Sprite[] = [];
  const poles = new Graphics();
  for (const [x, y] of [[-74, -30], [74, -30], [-60, 44], [60, 44]]) {
    poles.rect(x - 2, y, 4, 22).fill(0x8c90a1);
    poles.roundRect(x - 9, y - 8, 18, 10, 3).fill(0xf8fbff);
    const s = new Sprite(glow);
    s.anchor.set(0.5);
    s.position.set(x, y - 3);
    s.scale.set(0.5);
    s.blendMode = 'add';
    lights.push(s);
  }
  const ball = new Graphics().circle(0, 0, 7).fill(0xffffff).stroke({ width: 2, color: 0x1b1f2a });
  b.view.addChild(g, poles, ...lights, ball, b.lock);
  return {
    view: b.view,
    setLocked: b.setLocked,
    wiggle: b.wiggle,
    update(_dt, t) {
      lights.forEach((l, i) => (l.alpha = 0.55 + (Math.sin(t * 6 + i * 1.7) > 0.7 ? 0.45 : 0) + Math.sin(t * 2 + i) * 0.1));
      ball.position.set(Math.sin(t * 1.3) * 34, 6 + Math.sin(t * 2.6) * 14);
    },
  };
}

function heroCity(glow: Texture): LocationArt {
  const b = base();
  const g = new Graphics();
  const towers: [number, number, number, number][] = [
    [-58, 26, 22, 70], [-32, 34, 26, 100], [-4, 40, 30, 140], [28, 30, 24, 96], [54, 26, 20, 64],
  ];
  g.ellipse(0, 30, 80, 18).fill({ color: 0x000000, alpha: 0.3 });
  for (const [x, w2, w, h] of towers) {
    void w2;
    g.roundRect(x - w / 2, 30 - h, w, h, 4).fill(vGrad([[0, 0x2a4fb0], [1, 0x101d48]]));
    g.roundRect(x - w / 2, 30 - h, w, h, 4).stroke({ width: 2, color: color.blue, alpha: 0.9 });
    for (let yy = 30 - h + 8; yy < 24; yy += 11) for (let xx = x - w / 2 + 5; xx < x + w / 2 - 4; xx += 8) g.rect(xx, yy, 4, 5).fill({ color: Math.random() < 0.7 ? 0xfff3a3 : 0x67e8f9, alpha: 0.85 });
  }
  // spire
  g.poly([-8, -100, 0, -130, 8, -100]).fill(color.primary);
  const orb = new Sprite(glow);
  orb.anchor.set(0.5);
  orb.position.set(0, -132);
  orb.scale.set(0.7);
  orb.tint = color.blue;
  orb.blendMode = 'add';
  const ring = new Graphics();
  b.view.addChild(g, orb, ring, b.lock);
  return {
    view: b.view,
    setLocked: b.setLocked,
    wiggle: b.wiggle,
    update(_dt, t) {
      orb.scale.set(0.6 + Math.sin(t * 5) * 0.15);
      ring.clear();
      const r = 12 + ((t * 30) % 40);
      ring.circle(0, -132, r).stroke({ width: 3, color: color.mint, alpha: Math.max(0, 1 - r / 52) });
    },
  };
}

function raceTrack(_glow: Texture): LocationArt {
  const b = base();
  const g = new Graphics();
  g.ellipse(0, 6, 84, 50).fill(0x2a2f3d);
  g.ellipse(0, 6, 84, 50).stroke({ width: 4, color: 0xffffff, alpha: 0.85 });
  g.ellipse(0, 6, 56, 26).fill(0x2c9a5a);
  g.ellipse(0, 6, 56, 26).stroke({ width: 4, color: color.red });
  // dashed centre line
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.circle(Math.cos(a) * 70, 6 + Math.sin(a) * 38, 2).fill(color.gold);
  }
  // checkered start line
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.rect(68 + j * 6 - 6, -6 + i * 6, 6, 6).fill((i + j) % 2 ? 0xffffff : 0x111111);
  // neon speed arrows
  g.poly([-14, -54, 0, -44, -14, -34]).fill({ color: 0x67e8f9, alpha: 0.9 });
  g.poly([2, -54, 16, -44, 2, -34]).fill({ color: 0x67e8f9, alpha: 0.9 });
  const cars: Graphics[] = [color.red, color.blue, color.gold].map((c) => {
    const car = new Graphics();
    car.roundRect(-11, -6, 22, 12, 4).fill(c).stroke({ width: 1.5, color: 0xffffff });
    car.rect(-3, -5, 6, 10).fill({ color: 0xffffff, alpha: 0.7 });
    return car;
  });
  const flag = new Graphics();
  b.view.addChild(g, ...cars, flag, b.lock);
  return {
    view: b.view,
    setLocked: b.setLocked,
    wiggle: b.wiggle,
    update(_dt, t) {
      cars.forEach((car, i) => {
        const a = t * (1.1 + i * 0.25) + i * 2;
        const x = Math.cos(a) * 70;
        const y = 6 + Math.sin(a) * 38;
        car.position.set(x, y);
        car.rotation = Math.atan2(Math.cos(a) * 38, -Math.sin(a) * 70);
      });
      flag.clear();
      flag.rect(-88, -60, 3, 40).fill(0xdddddd);
      const w = Math.sin(t * 6) * 3;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) flag.rect(-85 + i * 7, -60 + j * 7 + w * (i / 3), 7, 7).fill((i + j) % 2 ? 0xffffff : 0x111111);
    },
  };
}

function treasure(glow: Texture): LocationArt {
  const b = base();
  const g = new Graphics();
  // palm
  g.moveTo(-26, 12).quadraticCurveTo(-34, -30, -20, -62).stroke({ width: 7, color: 0x8a5a33 });
  for (const a of [-2.6, -2.0, -1.2, -0.5, 0.2]) {
    g.moveTo(-20, -62).quadraticCurveTo(-20 + Math.cos(a) * 30, -62 + Math.sin(a) * 30 - 10, -20 + Math.cos(a) * 46, -62 + Math.sin(a) * 46 + 8).stroke({ width: 8, color: 0x2fd27a, cap: 'round' });
  }
  // chest
  const chest = new Graphics();
  chest.roundRect(-4, -14, 46, 30, 6).fill(vGrad([[0, 0xb06a2c], [1, 0x7a4518]])).stroke({ width: 3, color: 0x4a2a10 });
  chest.roundRect(-4, -26, 46, 16, 8).fill(0xc27a35).stroke({ width: 3, color: 0x4a2a10 });
  chest.rect(15, -18, 8, 12).fill(color.gold);
  chest.rect(-4, -10, 46, 4).fill(color.gold);
  const shine = new Sprite(glow);
  shine.anchor.set(0.5);
  shine.position.set(19, -22);
  shine.tint = color.gold;
  shine.blendMode = 'add';
  // X marks the spot
  const x = new Graphics();
  x.moveTo(-6, 22).lineTo(6, 32).moveTo(6, 22).lineTo(-6, 32).stroke({ width: 4, color: 0xd0302a });
  b.view.addChild(g, x, shine, chest, b.lock);
  return {
    view: b.view,
    setLocked(on) {
      b.setLocked(on);
      shine.visible = !on;
    },
    wiggle: b.wiggle,
    update(_dt, t) {
      shine.alpha = 0.5 + Math.sin(t * 3) * 0.4;
      shine.scale.set(0.7 + Math.sin(t * 3) * 0.2);
      chest.y = Math.sin(t * 2) * 1.5;
    },
  };
}

function closet(glow: Texture): LocationArt {
  const b = base();
  const g = new Graphics();
  // hero HQ: rounded building with a big star door
  g.ellipse(0, 28, 56, 12).fill({ color: 0x000000, alpha: 0.3 });
  g.roundRect(-46, -40, 92, 70, 18).fill(vGrad([[0, 0xff6fb5], [1, 0xb0306f]])).stroke({ width: 3, color: 0xffffff });
  g.poly([-56, -36, 0, -76, 56, -36]).fill(hGrad([[0, color.blue], [1, color.blueDeep]])).stroke({ width: 3, color: 0xffffff, join: 'round' });
  g.roundRect(-18, -10, 36, 40, 14).fill(0x2a1040).stroke({ width: 3, color: color.gold });
  g.poly(starPoints(10, 0.5).map((v, i) => (i % 2 ? v + 8 : v))).fill(color.gold);
  // hanging cape on the side
  g.poly([30, -30, 44, -30, 50, 4, 24, 4]).fill(color.red);
  const door = new Sprite(glow);
  door.anchor.set(0.5);
  door.position.set(0, 8);
  door.tint = 0xff6fb5;
  door.blendMode = 'add';
  door.scale.set(0.8);
  b.view.addChild(door, g, b.lock);
  return {
    view: b.view,
    setLocked: b.setLocked,
    wiggle: b.wiggle,
    update(_dt, t) {
      door.alpha = 0.4 + Math.sin(t * 2.5) * 0.3;
    },
  };
}

function stickerBook(glow: Texture): LocationArt {
  const b = base();
  const halo = new Sprite(glow);
  halo.anchor.set(0.5);
  halo.tint = color.gold;
  halo.blendMode = 'add';
  halo.scale.set(1.3);
  const g = new Graphics();
  // open album on a little stand
  g.ellipse(0, 30, 58, 12).fill({ color: 0x000000, alpha: 0.3 });
  g.poly([-62, -26, 0, -16, 0, 30, -62, 20]).fill(0x8a3c1e);
  g.poly([62, -26, 0, -16, 0, 30, 62, 20]).fill(0x6a2c14);
  g.poly([-56, -30, -2, -20, -2, 24, -56, 14]).fill(vGrad([[0, 0xfff3d6], [1, 0xf5dfae]])).stroke({ width: 2, color: color.gold });
  g.poly([56, -30, 2, -20, 2, 24, 56, 14]).fill(vGrad([[0, 0xfff3d6], [1, 0xf0d39a]])).stroke({ width: 2, color: color.gold });
  // stickers on the pages
  const stickers: [number, number, number][] = [[-40, -12, 0xff4b4b], [-20, -8, 0x2f7bff], [-40, 6, 0xffd21f], [22, -8, 0x2fd27a], [40, -12, 0xa45bff]];
  for (const [x, y, c] of stickers) {
    g.roundRect(x - 8, y - 8, 16, 16, 4).fill(0xffffff);
    g.circle(x, y, 5.5).fill(c);
  }
  g.poly(starPoints(9, 0.5).map((v, i) => (i % 2 ? v + 8 : v + 30))).fill(color.gold).stroke({ width: 1.5, color: 0xffffff });
  const sparkle = new Graphics();
  b.view.addChild(halo, g, sparkle, b.lock);
  return {
    view: b.view,
    setLocked: b.setLocked,
    wiggle: b.wiggle,
    update(_dt, t) {
      halo.alpha = 0.35 + Math.sin(t * 2.2) * 0.15;
      sparkle.clear();
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        sparkle.poly(starPoints(4 + 3 * (1 - k), 0.45).map((v, j) => (j % 2 ? v - 30 - k * 40 : v + (i - 1) * 26))).fill({ color: color.gold, alpha: 1 - k });
      }
    },
  };
}

export { Ease, rGrad, shade };
