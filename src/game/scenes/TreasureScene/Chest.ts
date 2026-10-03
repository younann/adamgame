import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ConceptVisual } from '@/learning/types';
import { drawConcept } from '../../draw/conceptArt';
import { gameText, shade, vGrad } from '../../draw/paint';

const WOOD = 0x9a5b2e;

export interface ChestOptions {
  /** colour concept: the whole chest is painted this colour */
  paint?: number | null;
  /** number shown on the front plate */
  number?: number | null;
  /** picture shown on a floating badge above the chest */
  badge?: ConceptVisual | null;
  gold?: boolean;
}

/**
 * Treasure chest (original art). Origin = bottom centre. ~120×100 at scale 1.
 * The lid lifts and tilts back to reveal glowing coins inside.
 */
export class Chest extends Container {
  readonly body = new Container();
  readonly lid = new Container();
  readonly glint: Sprite;
  readonly beam: Sprite;
  readonly badge: Container | null = null;
  private inside = new Graphics();
  private t = Math.random() * 6;
  opened = false;

  constructor(glow: Texture, o: ChestOptions = {}) {
    super();
    const main = o.gold ? color.gold : (o.paint ?? WOOD);
    const band = o.gold ? 0xfff1b8 : o.paint ? 0xffffff : color.gold;

    this.glint = new Sprite(glow);
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.tint = color.gold;
    this.glint.position.set(0, -50);
    this.glint.scale.set(1.8);
    this.glint.alpha = 0;

    this.beam = new Sprite(glow);
    this.beam.anchor.set(0.5, 0.9);
    this.beam.blendMode = 'add';
    this.beam.tint = 0xffe28a;
    this.beam.position.set(0, -60);
    this.beam.scale.set(1.1, 0);

    const shadow = new Graphics().ellipse(0, 2, 70, 13).fill({ color: 0x000000, alpha: 0.28 });

    // interior (coins) — hidden by the lid until opened
    const ins = this.inside;
    ins.roundRect(-54, -70, 108, 14, 6).fill(0x2a1608);
    for (let i = 0; i < 7; i++) ins.circle(-42 + i * 14, -66 + (i % 2) * 3, 7).fill(color.gold).stroke({ width: 1.5, color: 0xb07a00 });

    const b = new Graphics();
    b.roundRect(-60, -62, 120, 62, 10).fill(vGrad([[0, shade(main, 0.15)], [1, shade(main, -0.3)]]));
    b.roundRect(-60, -62, 120, 62, 10).stroke({ width: 4, color: shade(main, -0.55) });
    if (!o.paint && !o.gold) for (let y = -48; y < -4; y += 14) b.moveTo(-56, y).lineTo(56, y).stroke({ width: 2, color: shade(main, -0.35), alpha: 0.6 });
    for (const x of [-42, 42]) b.roundRect(x - 6, -62, 12, 62, 3).fill(band).stroke({ width: 2, color: shade(band, -0.4) });
    // lock plate
    b.roundRect(-14, -60, 28, 26, 6).fill(color.gold).stroke({ width: 2.5, color: 0x8a5a10 });
    b.circle(0, -50, 4).fill(0x4a2a10);
    b.rect(-1.5, -50, 3, 8).fill(0x4a2a10);
    this.body.addChild(b);
    if (o.number !== null && o.number !== undefined) {
      const plate = new Graphics().circle(0, -22, 19).fill(0xfff6e0).stroke({ width: 3, color: shade(main, -0.5) });
      const n = gameText(String(o.number), 30, { fillColor: color.blueDeepest, strokeColor: 0xffffff });
      n.position.set(0, -22);
      this.body.addChild(plate, n);
    }

    // lid: drawn above the hinge line at y = -58
    const lg = new Graphics();
    lg.moveTo(-62, 4).lineTo(-62, -14).quadraticCurveTo(0, -48, 62, -14).lineTo(62, 4).closePath().fill(vGrad([[0, shade(main, 0.3)], [1, shade(main, -0.1)]]));
    lg.moveTo(-62, 4).lineTo(-62, -14).quadraticCurveTo(0, -48, 62, -14).lineTo(62, 4).closePath().stroke({ width: 4, color: shade(main, -0.55) });
    for (const x of [-42, 42]) lg.moveTo(x, 4).lineTo(x, -22 - (x === 0 ? 8 : 0)).stroke({ width: 10, color: band });
    lg.ellipse(-22, -22, 16, 5).fill({ color: 0xffffff, alpha: 0.3 });
    this.lid.addChild(lg);
    this.lid.position.set(0, -58);

    this.addChild(shadow, this.beam, this.glint, this.inside, this.body, this.lid);

    if (o.badge) {
      const badge = new Container();
      const disc = new Graphics().circle(0, 0, 44).fill(0xfff6e0).stroke({ width: 5, color: color.gold });
      const pic = drawConcept(o.badge, 66);
      badge.addChild(disc, pic);
      badge.position.set(0, -150);
      // little rope to the chest
      const rope = new Graphics().moveTo(0, -106).lineTo(0, -92).stroke({ width: 3, color: 0x8a5a20 });
      this.addChildAt(rope, 1);
      this.addChild(badge);
      this.badge = badge;
    }
  }

  update(dt: number) {
    this.t += dt;
    if (this.badge) this.badge.y = -150 + Math.sin(this.t * 2.2) * 5;
    if (this.opened) this.beam.alpha = 0.7 + Math.sin(this.t * 6) * 0.2;
  }
}

/** A small faceted gem lying on the sand (for counting). Origin = bottom centre. */
export function makeGem(tint: number) {
  const c = new Container();
  const g = new Graphics();
  g.ellipse(0, 2, 18, 5).fill({ color: 0x000000, alpha: 0.25 });
  g.poly([0, -40, 16, -26, 10, 0, -10, 0, -16, -26]).fill(tint).stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
  g.poly([0, -40, 6, -26, 0, 0, -6, -26]).fill({ color: 0xffffff, alpha: 0.3 });
  g.moveTo(-16, -26).lineTo(16, -26).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });
  const hit = new Graphics().circle(0, -20, 34).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChild(hit, g);
  return c;
}

/** Torn piece of the treasure map. */
export function makeFragment(index: number) {
  const g = new Graphics();
  const jag = (seed: number) => 4 * Math.sin(seed * 3.1);
  g.poly([-34, -26, 34, -26 + jag(index), 30 + jag(index + 1), 26, -34, 26 + jag(index + 2)]).fill(0xf1d9a4).stroke({ width: 3, color: 0x8a5a20 });
  for (let i = 0; i < 4; i++) g.circle(-22 + i * 12, Math.sin(i + index) * 8, 2.5).fill(0x8a3a20);
  if (index === 2) g.moveTo(14, -10).lineTo(26, 2).moveTo(26, -10).lineTo(14, 2).stroke({ width: 4, color: 0xd0302a });
  return g;
}
