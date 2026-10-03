import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent, type Texture } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { drawChunky } from '../draw/paint';

export interface ControlsHandlers {
  /** quick tap (not a drag) at screen point */
  onTap(x: number, y: number): void;
  onKick(): void;
}

/**
 * Touch controls for a 4-year-old:
 *  - drag ANYWHERE (except the kick button) → a floating joystick appears under the thumb
 *  - a quick tap → tap-to-run / tap objects
 *  - a big glowing KICK button bottom-right (pulses when a super-shot is ready)
 * Output: `move` vector in screen space (x right, y down), length 0..1.
 */
export class Controls {
  readonly view = new Container();
  readonly move = { x: 0, y: 0 };
  private catcher = new Graphics();
  private base = new Graphics();
  private knob = new Graphics();
  private kick = new Container();
  private kickG = new Graphics();
  private kickGlow: Sprite;
  private ball: Sprite;
  private activeId: number | null = null;
  private start = { x: 0, y: 0, t: 0 };
  private dragging = false;
  private R = 60;
  private w = 1;
  private h = 1;
  ready = false; // ball near / kick available
  super = false; // super-shot armed
  enabled = true;

  constructor(
    glow: Texture,
    ballTex: Texture,
    private readonly h0: ControlsHandlers,
    private readonly haptic: () => void,
    /** false → no kick button (e.g. just walking around the world map) */
    private readonly withKick = true,
  ) {
    this.catcher.eventMode = 'static';
    this.base.alpha = 0;
    this.knob.alpha = 0;
    this.kickGlow = new Sprite(glow);
    this.kickGlow.anchor.set(0.5);
    this.kickGlow.blendMode = 'add';
    this.kickGlow.tint = color.gold;
    this.ball = new Sprite(ballTex);
    this.ball.anchor.set(0.5);
    this.kick.addChild(this.kickGlow, this.kickG, this.ball);
    this.kick.eventMode = 'static';
    this.kick.cursor = 'pointer';
    this.view.addChild(this.catcher, this.base, this.knob, this.kick);
    this.kick.visible = withKick;

    this.catcher.on('pointerdown', (e) => this.down(e));
    this.catcher.on('globalpointermove', (e) => this.moveEv(e));
    this.catcher.on('pointerup', (e) => this.up(e));
    this.catcher.on('pointerupoutside', (e) => this.up(e));
    this.kick.on('pointerdown', () => {
      if (!this.enabled) return;
      this.haptic();
      this.kick.scale.set(0.9);
      this.h0.onKick();
    });
    const rel = () => this.kick.scale.set(1);
    this.kick.on('pointerup', rel);
    this.kick.on('pointerupoutside', rel);
  }

  layout(w: number, h: number, safeBottom: number, safeRight: number) {
    this.w = w;
    this.h = h;
    this.R = Math.max(50, Math.min(w, h) * 0.13);
    this.catcher.clear().rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0.001 });
    this.catcher.hitArea = new Rectangle(0, 0, w, h);
    const k = Math.max(96, Math.min(w, h) * 0.26);
    this.kick.position.set(w - safeRight - k * 0.62 - 10, h - safeBottom - k * 0.62 - 16);
    drawChunky(this.kickG, { w: k, h: k, radius: k / 2, top: 0x3dffb4, bottom: color.mintDeep, depth: color.mintShadow, depthPx: 10 });
    this.ball.width = this.ball.height = k * 0.52;
    this.kickGlow.scale.set((k / 128) * 2.2);
    this.base.clear().circle(0, 0, this.R).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    this.knob.clear().circle(0, 0, this.R * 0.45).fill({ color: color.blue, alpha: 0.85 }).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
  }

  private down(e: FederatedPointerEvent) {
    if (!this.enabled || this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.start = { x: e.global.x, y: e.global.y, t: performance.now() };
    this.dragging = false;
    this.base.position.set(e.global.x, e.global.y);
    this.knob.position.set(e.global.x, e.global.y);
  }

  private moveEv(e: FederatedPointerEvent) {
    if (e.pointerId !== this.activeId) return;
    const dx = e.global.x - this.start.x;
    const dy = e.global.y - this.start.y;
    const d = Math.hypot(dx, dy);
    if (!this.dragging && d > 12) {
      this.dragging = true;
      this.base.alpha = 1;
      this.knob.alpha = 1;
    }
    if (!this.dragging) return;
    const k = Math.min(1, d / this.R);
    const nx = d > 0 ? dx / d : 0;
    const ny = d > 0 ? dy / d : 0;
    this.move.x = nx * k;
    this.move.y = ny * k;
    this.knob.position.set(this.start.x + nx * Math.min(d, this.R), this.start.y + ny * Math.min(d, this.R));
  }

  private up(e: FederatedPointerEvent) {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    if (!this.dragging && performance.now() - this.start.t < 350) this.h0.onTap(e.global.x, e.global.y);
    this.dragging = false;
    this.move.x = 0;
    this.move.y = 0;
    this.base.alpha = 0;
    this.knob.alpha = 0;
  }

  update(t: number) {
    const pulse = this.super ? 1 + Math.sin(t * 9) * 0.1 : this.ready ? 1 + Math.sin(t * 5) * 0.04 : 1;
    this.kickG.scale.set(pulse);
    this.ball.rotation = this.super ? t * 6 : this.ball.rotation * 0.9;
    this.kickGlow.alpha = this.super ? 0.9 : this.ready ? 0.45 : 0.15;
    this.kickGlow.tint = this.super ? color.gold : color.mint;
    this.kick.alpha = this.enabled ? 1 : 0.4;
  }

  /** Hide/show everything (cutscenes). */
  setVisible(on: boolean) {
    this.view.visible = on;
    if (!on) {
      this.activeId = null;
      this.move.x = 0;
      this.move.y = 0;
    }
  }

  get width() {
    return this.w;
  }
  get height() {
    return this.h;
  }
}
