import { Container, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { MusicTheme } from '@/audio/music';
import type { SfxName, SfxOpts } from '@/audio/sfx';
import type { Speaker } from '@/audio/SpeechManager';
import type { VoiceLine } from '@/learning/types';
import { useGame, type SceneId } from '@/state/gameStore';
import { color } from '@/design-system/tokens';
import { ParticleSystem, type BurstOptions } from '../effects/ParticleSystem';
import { gameText } from '../draw/paint';
import { Camera } from './Camera';
import type { GameEngine } from './GameEngine';
import { hudAnchorPosition, pulseHud } from './hudBridge';
import { Ease, Tweener, bezier2 } from './Tween';
import type { TexKey } from './Textures';

export type Haptic = 'tiny' | 'medium' | 'celebrate';

export interface TapOptions {
  sound?: SfxName | null;
  haptic?: Haptic | null;
  /** squash/stretch press feedback */
  squash?: boolean;
  /** visual to squash (defaults to the object) */
  visual?: Container;
}

/**
 * Base class for every game scene. Layering (back → front):
 *   root
 *    ├─ world      (camera-transformed: backgrounds, actors, interactive props)
 *    │    └─ fx    (particles that live in the world)
 *    └─ overlay    (screen-space Pixi: big text, flying rewards)
 * The React HUD sits above the canvas in the DOM.
 */
export abstract class Scene {
  abstract readonly id: SceneId;
  abstract readonly music: MusicTheme;

  readonly root = new Container();
  readonly world = new Container();
  readonly overlay = new Container();
  readonly tw = new Tweener();
  readonly camera: Camera;
  readonly fx = new ParticleSystem();
  readonly screenFx = new ParticleSystem(300);
  alive = true;
  width = 1;
  height = 1;
  protected time = 0;

  constructor(
    protected readonly engine: GameEngine,
    protected readonly data: Record<string, unknown> = {},
  ) {
    this.camera = new Camera(this.world, this.tw, () => engine.reducedMotion);
    this.root.addChild(this.world, this.overlay);
    this.overlay.addChild(this.screenFx.view);
    this.fx.density = engine.reducedMotion ? 0.5 : 1;
    this.screenFx.density = this.fx.density;
  }

  /** Preload anything async (runs while the transition covers the screen). */
  async load(): Promise<void> {}
  /** Create display objects. */
  abstract build(): void;
  /** Called after the reveal transition — start gameplay sequences here. */
  enter(): void {}
  /** Lay out for a new viewport size (phone portrait / tablet landscape...). */
  layout(_w: number, _h: number): void {}
  /** Per-frame update; dt in seconds. */
  tick(_dt: number): void {}
  /** Narration speaking state, for character mouth animation. */
  onSpeaking(_speaking: boolean, _speaker: Speaker): void {}
  /** Leaving the scene (before destroy). */
  exit(): void {}

  // ---- engine-facing ----
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.camera.resize(w, h);
    this.layout(w, h);
    this.camera.apply(0);
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.time += dt;
    this.tw.update(dtMs);
    this.tick(dt);
    this.fx.update(dt);
    this.screenFx.update(dt);
    this.camera.apply(dtMs);
  }

  destroy() {
    this.alive = false;
    this.tw.clear();
    useGame.getState().setA11yChoices([], null);
    this.fx.destroy();
    this.screenFx.destroy();
    this.root.destroy({ children: true });
  }

  // ---- helpers shared by all scenes ----
  get isPortrait() {
    return this.height >= this.width;
  }
  get isTablet() {
    return Math.min(this.width, this.height) >= 600;
  }
  get safe() {
    return this.engine.safe;
  }
  get reduced() {
    return this.engine.reducedMotion;
  }

  /** Never resolves once the scene is gone, so async sequences just stop. */
  guard<T>(p: Promise<T>): Promise<T> {
    return p.then((v) => (this.alive ? v : new Promise<T>(() => {})));
  }

  wait(ms: number) {
    return this.guard(this.tw.wait(ms));
  }

  say(lines: VoiceLine[], speaker: Speaker = 'sparky') {
    return this.guard(this.engine.speech.say(lines, speaker));
  }

  /** Stop narration now (e.g. Adam answered before the prompt finished). */
  stopSpeech() {
    this.engine.speech.cancel();
  }

  sfx(name: SfxName, opts?: SfxOpts) {
    this.engine.audio.sfx(name, opts);
  }

  haptic(kind: Haptic) {
    this.engine.haptic(kind);
  }

  tex(key: TexKey) {
    return this.engine.textures.get(key);
  }

  burst(x: number, y: number, o: Partial<BurstOptions> & { texture?: BurstOptions['texture'] }) {
    this.fx.burst(x, y, { texture: this.tex('star'), ...o });
  }

  /** Celebration burst in world space using design-system colours. */
  celebrate(x: number, y: number, scale = 1) {
    this.fx.burst(x, y, { texture: this.tex('star'), count: 22 * scale, tints: [color.gold, color.mint, color.blue, 0xffffff], speed: [160, 420], gravity: 380, life: [0.7, 1.3], scale: [0.25, 0.55], additive: false });
    this.fx.burst(x, y, { texture: this.tex('glow'), count: 10 * scale, tints: [color.gold, color.mint], speed: [40, 160], life: [0.4, 0.8], scale: [0.4, 0.9], additive: true });
    this.fx.burst(x, y, { texture: this.tex('confetti'), count: 26 * scale, tints: [color.gold, color.mint, color.blue, color.red, 0xffffff], speed: [200, 520], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 520, life: [1.2, 2], scale: [0.5, 0.8], scaleEnd: 1, spin: [-8, 8] });
  }

  /**
   * Make a display object a tactile game button: squash on press, bounce on release,
   * sound + haptic, then `onTap`.
   */
  tappable(obj: Container, onTap: (e: FederatedPointerEvent) => void, o: TapOptions = {}) {
    const vis = o.visual ?? obj;
    obj.eventMode = 'static';
    obj.cursor = 'pointer';
    let down = false;
    // The resting scale is captured at press time (never at registration — many objects are
    // registered at scale 0 and pop in). While an intro/other animation is running on the
    // scale we don't squash at all, so we never fight it or freeze it at a bad size.
    let base: { x: number; y: number } | null = null;
    let ours = false; // the squash/release tween currently on vis.scale is ours
    let pressed = false;
    obj.on('pointerdown', () => {
      down = true;
      if (o.squash !== false && (ours || !this.tw.isTweening(vis.scale))) {
        if (!ours) base = { x: vis.scale.x, y: vis.scale.y };
        if (base && Math.abs(base.x) > 0.01 && Math.abs(base.y) > 0.01) {
          ours = true;
          pressed = true;
          this.tw.kill(vis.scale);
          void this.tw.to(vis.scale, { x: base.x * 1.08, y: base.y * 0.88 }, { duration: 80 });
        }
      }
      if (o.sound !== null) this.sfx(o.sound ?? 'press');
      if (o.haptic !== null) this.haptic(o.haptic ?? 'tiny');
    });
    const release = () => {
      if (!down) return;
      down = false;
      if (pressed && base) {
        pressed = false;
        this.tw.kill(vis.scale);
        const b = base;
        void this.tw.to(vis.scale, { x: b.x, y: b.y }, { duration: 380, ease: Ease.elasticOut }).then(() => {
          if (!pressed) ours = false;
        });
      }
    };
    obj.on('pointerup', release);
    obj.on('pointerupoutside', release);
    obj.on('pointertap', (e) => onTap(e));
  }

  /** Big pop-in arcade text (e.g. "GOOOOAL!") in screen space. */
  async bigText(text: string, opts: { size?: number; fill?: number; stroke?: number; y?: number; hold?: number } = {}) {
    const size = opts.size ?? Math.min(this.width * 0.16, 110);
    const t = gameText(text, size, { fillColor: opts.fill ?? color.gold, strokeColor: opts.stroke ?? color.blueDeepest });
    t.position.set(this.width / 2, opts.y ?? this.height * 0.38);
    t.scale.set(0.2);
    t.rotation = -0.15;
    this.overlay.addChild(t);
    await this.tw.to(t.scale, { x: 1, y: 1 }, { duration: 520, ease: Ease.elasticOut });
    void this.tw.to(t, { rotation: 0.04 }, { duration: 300 });
    await this.tw.wait(opts.hold ?? 700);
    await this.tw.to(t, { alpha: 0, y: t.y - 40 }, { duration: 260, ease: Ease.quadIn });
    t.destroy();
  }

  /**
   * Stars burst from a world point and fly into the HUD star counter; each landing
   * increments the saved star total (so the HUD counts up as they arrive).
   */
  async flyStarsToHud(worldX: number, worldY: number, count: number, opts: { credit?: boolean } = {}) {
    const credit = opts.credit !== false;
    const from = this.camera.toScreen(worldX, worldY);
    const target = hudAnchorPosition('stars', this.engine.host) ?? { x: this.width - 60, y: this.safe.top + 34 };
    const store = useGame.getState();
    const flights: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      const s = new Sprite(this.tex('goldStar'));
      s.anchor.set(0.5);
      s.scale.set(0.05);
      s.position.set(from.x, from.y);
      this.overlay.addChild(s);
      const spreadX = from.x + (Math.random() - 0.5) * 220;
      const spreadY = from.y - 80 - Math.random() * 120;
      const flight = (async () => {
        await this.tw.to(s.scale, { x: 0.7, y: 0.7 }, { duration: 260, ease: Ease.backOut, delay: i * 110 });
        await this.tw.to(s, { x: spreadX, y: spreadY }, { duration: 260, ease: Ease.quadOut });
        const sx = s.x, sy = s.y;
        const cx = (sx + target.x) / 2 + (Math.random() - 0.5) * 120;
        const cy = Math.min(sy, target.y) - 120;
        await this.tw.progress({
          duration: 620,
          ease: Ease.cubicIn,
          onUpdate: (t) => {
            s.x = bezier2(sx, cx, target.x, t);
            s.y = bezier2(sy, cy, target.y, t);
            s.rotation = t * 6;
            s.scale.set(0.7 - t * 0.35);
          },
        });
        this.screenFx.burst(target.x, target.y, { texture: this.tex('glow'), count: 6, tints: [color.gold], speed: [30, 120], life: [0.3, 0.5], scale: [0.2, 0.4], additive: true });
        s.destroy();
        this.sfx('starLand', { pitch: Math.min(i, 8) });
        if (credit) store.addStars(1);
        pulseHud('stars');
      })();
      flights.push(flight);
    }
    await this.guard(Promise.all(flights).then(() => undefined));
  }

  /** Register current interactive choices for keyboard / screen-reader users. */
  setA11yChoices(choices: { id: string; label: string }[], onChoose: ((id: string) => void) | null) {
    useGame.getState().setA11yChoices(choices, onChoose);
  }

  /** Convenience for scene changes. */
  goto(id: SceneId, data?: Record<string, unknown>) {
    return this.engine.scenes.goto(id, { data });
  }
}
