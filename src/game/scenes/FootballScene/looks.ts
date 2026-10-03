import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { KidLook } from '../../entities/Kid';
import { gameText, rGrad, shade, vGrad } from '../../draw/paint';

const SKINS = [0xf6cfa8, 0xe9b48a, 0xc98e62, 0x9c6a43];
const HAIRS = [0x2a1a10, 0x111111, 0x7a4a22, 0x4a2c17];

/** Friendly rival players (purple/orange) — original characters. */
export function rivalLook(i: number): KidLook {
  return {
    skin: SKINS[i % SKINS.length], hair: HAIRS[(i + 1) % HAIRS.length], hairStyle: i % 2 ? 'spiky' : 'short', eyeColor: 0x2a1a10,
    shirt: 0x8b3dff, shirtAccent: 0xff8a1f, trim: 0xffffff, shorts: 0x2a1a55, socks: 0x8b3dff,
    shoes: 0x222222, shoeAccent: 0xff8a1f, number: String(5 + i), emblem: 'number', headband: i === 2 ? 0xff8a1f : null,
  };
}

/** Adam's teammates — same team, each in a distinguishing shirt colour. */
export function teammateLook(i: number, shirt: number = color.blue): KidLook {
  const light = shirt === 0xf4f6ff || shirt === 0xffd21f;
  return {
    skin: SKINS[(i + 2) % SKINS.length], hair: HAIRS[i % HAIRS.length], hairStyle: (['curly', 'short', 'spiky'] as const)[i % 3], eyeColor: 0x3a2414,
    shirt, shirtAccent: light ? color.blueDeep : 0xffffff, trim: color.gold, shorts: 0xffffff, socks: shirt,
    shoes: 0xffffff, shoeAccent: color.blue, number: String(7 + i * 3), emblem: 'number',
  };
}

/** Bright training cone with an optional number sign floating above it. */
export function drawCone(label: string | null, glowTex: Texture): { view: Container; glow: Sprite } {
  const view = new Container();
  const glow = new Sprite(glowTex);
  glow.anchor.set(0.5);
  glow.tint = color.gold;
  glow.blendMode = 'add';
  glow.scale.set(1.3);
  glow.alpha = 0;
  glow.y = -30;
  const g = new Graphics();
  g.ellipse(0, 2, 26, 8).fill({ color: 0x000000, alpha: 0.3 });
  g.roundRect(-24, -6, 48, 10, 4).fill(0xd9580f);
  g.poly([-17, -4, 17, -4, 5, -58, -5, -58]).fill(vGrad([[0, 0xffa94d], [1, 0xff6a00]]));
  g.poly([-13, -20, 13, -20, 10, -32, -10, -32]).fill(0xffffff);
  g.poly([-8, -42, 8, -42, 6, -50, -6, -50]).fill(0xffffff);
  g.ellipse(-4, -40, 2.5, 12).fill({ color: 0xffffff, alpha: 0.35 });
  view.addChild(glow, g);
  if (label !== null) {
    const sign = new Container();
    const b = new Graphics();
    b.circle(0, 0, 30).fill(rGrad([[0, 0x3a4766], [1, 0x1f2840]], 0.4, 0.35)).stroke({ width: 5, color: color.gold });
    const t = gameText(label, 40, { fillColor: 0xffffff });
    sign.addChild(b, t);
    sign.y = -96;
    sign.label = 'sign';
    view.addChild(sign);
  }
  return { view, glow };
}

/** Glowing concept card a teammate holds up (colour, word picture, number…). */
export function conceptCard(inner: Container, glowTex: Texture, tint: number = color.gold): { view: Container; glow: Sprite } {
  const view = new Container();
  const glow = new Sprite(glowTex);
  glow.anchor.set(0.5);
  glow.tint = tint;
  glow.blendMode = 'add';
  glow.scale.set(1.5);
  glow.alpha = 0.25;
  const g = new Graphics();
  g.roundRect(-40, -36, 80, 80, 18).fill(shade(0x0d1322, 0.1)).stroke({ width: 0 });
  g.roundRect(-40, -40, 80, 80, 18).fill(vGrad([[0, 0xffffff], [1, 0xdfe6ff]])).stroke({ width: 4, color: color.gold });
  view.addChild(glow, g, inner);
  return { view, glow };
}
