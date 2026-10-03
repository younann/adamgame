import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { GameEngine } from './GameEngine';
import { Ease, Tweener } from './Tween';

/**
 * Themed scene transitions — never a generic spinner. Each one covers the screen while the
 * next scene loads, then reveals it:
 *   tunnel  (Goal Stadium)   — walk out of the players' tunnel toward the light
 *   engine  (Turbo Racing)   — start lights + speed lines
 *   portal  (Hero City)      — charging energy portal iris
 *   map     (Treasure Island)— parchment map unfolds
 *   closet  (Hero Closet)    — curtain/door slide
 *   iris    (default/world)  — golden star iris
 */
export type TransitionKind = 'tunnel' | 'engine' | 'portal' | 'map' | 'closet' | 'iris' | 'cut';

export class Transitions {
  readonly view = new Container();
  private g = new Graphics();
  private deco = new Graphics();
  private glow: Sprite;
  private tw = new Tweener();
  private kind: TransitionKind = 'iris';
  private radius = 0;
  private t = 0;
  private covered = false;
  private w = 1;
  private h = 1;
  /** world-space point the iris centres on (e.g. the tapped location) */
  private cx = 0;
  private cy = 0;

  constructor(private readonly engine: GameEngine) {
    this.glow = new Sprite(engine.textures.get('glow'));
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.visible = false;
    this.view.addChild(this.g, this.glow, this.deco);
    this.view.eventMode = 'none';
    this.view.visible = false;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (this.covered) this.draw();
  }

  update(dtMs: number) {
    this.tw.update(dtMs);
    if (this.view.visible) {
      this.t += dtMs / 1000;
      this.draw();
    }
  }

  get maxR() {
    return Math.hypot(Math.max(this.cx, this.w - this.cx), Math.max(this.cy, this.h - this.cy)) + 20;
  }

  async cover(kind: TransitionKind, at?: { x: number; y: number }) {
    this.kind = kind;
    this.cx = at?.x ?? this.w / 2;
    this.cy = at?.y ?? this.h / 2;
    this.view.visible = true;
    this.view.eventMode = 'static'; // block taps while transitioning
    this.t = 0;
    if (kind === 'cut') {
      this.radius = 0;
      this.covered = true;
      this.draw();
      return;
    }
    this.radius = this.maxR;
    const ms = this.engine.reducedMotion ? 300 : 650;
    await this.tw.to(this as Transitions, { radius: 0 }, { duration: ms, ease: Ease.cubicIn });
    this.covered = true;
    // Short themed "loading" beat that also hides chunk/asset loading.
    await this.tw.wait(this.engine.reducedMotion ? 120 : 380);
  }

  async reveal() {
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.covered = false;
    const ms = this.engine.reducedMotion ? 300 : 700;
    await this.tw.to(this as Transitions, { radius: this.maxR }, { duration: ms, ease: Ease.cubicOut });
    this.view.visible = false;
    this.view.eventMode = 'none';
    this.g.clear();
    this.deco.clear();
    this.glow.visible = false;
  }

  private bg(): number {
    switch (this.kind) {
      case 'tunnel':
        return 0x05070d;
      case 'engine':
        return 0x0a0612;
      case 'portal':
        return 0x020a24;
      case 'map':
        return 0x2a1a08;
      case 'closet':
        return 0x140a24;
      default:
        return color.surfaceLowest;
    }
  }

  private draw() {
    const { g, deco, w, h } = this;
    const r = Math.max(0, this.radius);
    g.clear();
    deco.clear();
    g.rect(0, 0, w, h).fill(this.bg());
    if (r > 0) g.circle(this.cx, this.cy, r).cut();

    const ring = (c: number, width: number, alpha = 1) => {
      if (r > 2) deco.circle(this.cx, this.cy, r).stroke({ width, color: c, alpha });
    };
    const covered = r <= 1;
    const cx = w / 2, cy = h / 2, m = Math.min(w, h);
    this.glow.visible = covered;
    switch (this.kind) {
      case 'tunnel': {
        ring(color.mint, 10, 0.9);
        if (covered) {
          // receding tunnel arches with lights rushing past
          for (let i = 0; i < 7; i++) {
            const k = ((i / 7 + this.t * 0.6) % 1);
            const s = 0.1 + k * k * 1.6;
            const aw = m * 0.7 * s, ah = m * 0.9 * s;
            deco.roundRect(cx - aw / 2, cy - ah / 2, aw, ah, aw * 0.45).stroke({ width: 3 + 6 * k, color: 0x3a4566, alpha: 0.5 + k * 0.5 });
            deco.circle(cx - aw / 2 + 6, cy - ah * 0.2, 4 + 8 * k).fill({ color: 0xfff3c4, alpha: k });
            deco.circle(cx + aw / 2 - 6, cy - ah * 0.2, 4 + 8 * k).fill({ color: 0xfff3c4, alpha: k });
          }
          this.glow.position.set(cx, cy);
          this.glow.scale.set(1.2 + Math.sin(this.t * 6) * 0.1);
          this.glow.tint = 0xd9fff0;
        }
        break;
      }
      case 'engine': {
        ring(color.gold, 12);
        // speed lines
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const k = (this.t * 2.2 + i * 0.137) % 1;
          const r0 = m * 0.1 + k * m * 0.9;
          deco.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
            .lineTo(cx + Math.cos(a) * (r0 + m * 0.18), cy + Math.sin(a) * (r0 + m * 0.18))
            .stroke({ width: 3, color: i % 3 ? 0x67e8f9 : color.gold, alpha: 0.7 * (1 - k) });
        }
        if (covered) {
          const lit = Math.min(3, Math.floor(this.t * 6));
          for (let i = 0; i < 3; i++) {
            const x = cx + (i - 1) * m * 0.16;
            deco.circle(x, cy, m * 0.06).fill(0x1a1a24).stroke({ width: 4, color: 0x333344 });
            if (i < lit) deco.circle(x, cy, m * 0.05).fill(i === 2 ? color.mint : color.red);
          }
        }
        break;
      }
      case 'portal': {
        ring(color.blue, 16, 0.9);
        ring(color.mint, 5);
        const spin = this.t * 4;
        for (let i = 0; i < 3; i++) {
          const rr = (covered ? m * 0.22 : r) + i * 14;
          deco.arc(cx, cy, rr, spin + i * 2, spin + i * 2 + 1.6).stroke({ width: 6, color: i === 1 ? color.mint : color.primary, alpha: 0.9 });
        }
        if (covered) {
          this.glow.position.set(cx, cy);
          this.glow.scale.set(2.2 + Math.sin(this.t * 8) * 0.3);
          this.glow.tint = color.blue;
        }
        break;
      }
      case 'map': {
        ring(0xc8a25a, 14);
        if (covered) {
          const k = Math.min(1, this.t * 2.5);
          const pw = m * 0.8 * k, ph = m * 0.6;
          deco.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 18).fill(0xf1d9a4).stroke({ width: 6, color: 0x8a5a20 });
          for (let i = 1; i < 4; i++) deco.moveTo(cx - pw / 2 + (pw * i) / 4, cy - ph / 2).lineTo(cx - pw / 2 + (pw * i) / 4, cy + ph / 2).stroke({ width: 2, color: 0xc8a25a, alpha: 0.7 });
          if (k >= 1) {
            // dotted path + X
            for (let i = 0; i < 8; i++) deco.circle(cx - pw * 0.32 + i * pw * 0.07, cy + Math.sin(i * 0.9) * ph * 0.18, 4).fill(0x8a3a20);
            const xx = cx + pw * 0.3, yy = cy - ph * 0.05, s = m * 0.04;
            deco.moveTo(xx - s, yy - s).lineTo(xx + s, yy + s).moveTo(xx + s, yy - s).lineTo(xx - s, yy + s).stroke({ width: 8, color: 0xd0302a });
          }
        }
        break;
      }
      case 'closet': {
        ring(0xff6fb5, 10);
        ring(color.gold, 4);
        break;
      }
      default: {
        ring(color.gold, 12);
        ring(color.blue, 4);
        if (covered) {
          this.glow.position.set(cx, cy);
          this.glow.scale.set(1 + Math.sin(this.t * 7) * 0.15);
          this.glow.tint = color.gold;
        }
      }
    }
  }
}
