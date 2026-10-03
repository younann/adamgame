import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { useGame } from '@/state/gameStore';
import { Scene } from '../../engine/Scene';
import { Ease } from '../../engine/Tween';
import { drawChunky, gameText, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Sparky } from '../../entities/Sparky';
import type { Speaker } from '@/audio/SpeechManager';
import { hasParentClip, playParentClip } from '@/audio/ParentVoice';

/**
 * Title / boot: Adam stands heroically under the stars with a giant pulsing PLAY button.
 * The first tap unlocks audio + speech (autoplay rules) and flies Adam into his world.
 */
export default class BootScene extends Scene {
  readonly id = 'boot' as const;
  readonly music = 'title' as const;
  private bg = new Graphics();
  private starsG = new Graphics();
  private rays = new Graphics();
  private adam!: Adam;
  private sparky!: Sparky;
  private play = new Container();
  private playGlow!: Sprite;
  private title = new Container();
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private started = false;
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    this.adam = new Adam(this.faceTex);
    this.adam.setPose('heroPose');
    this.sparky = new Sparky(this.tex('glow'));
    this.playGlow = new Sprite(this.tex('glow'));
    this.playGlow.anchor.set(0.5);
    this.playGlow.tint = color.mint;
    this.playGlow.blendMode = 'add';
    const pg = new Graphics();
    drawChunky(pg, { w: 170, h: 170, radius: 85, top: 0x3dffb4, bottom: color.mintDeep, depth: color.mintShadow, depthPx: 14 });
    pg.poly([-22, -38, 44, 0, -22, 38]).fill(0xffffff).stroke({ width: 4, color: color.mintShadow, join: 'round' });
    this.play.addChild(this.playGlow, pg);
    this.world.addChild(this.bg, this.rays, this.starsG, this.title, this.adam, this.sparky, this.play, this.fx.view);
    this.tappable(this.play, () => this.start(), { sound: null, haptic: 'medium' });
    // tapping anywhere also starts (4-year-olds tap everything)
    this.world.eventMode = 'static';
    this.world.on('pointertap', () => this.start());
    this.setA11yChoices([{ id: 'play', label: 'Play / العب' }], () => this.start());
    useGame.getState().setHud({ kind: 'none' });
  }

  layout(w: number, h: number) {
    const k = Math.min(w, h) / 400;
    this.bg.clear().rect(0, 0, w, h).fill(vGrad([[0, 0x050a18], [0.5, 0x0d1a3f], [1, 0x1e3a8a]]));
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random() * w, y: Math.random() * h * 0.7, r: 0.6 + Math.random() * 2, p: Math.random() * 6 }));
    this.title.removeChildren().forEach((c) => c.destroy());
    const t1 = gameText('مغامرة آدم', 54 * k, { fillColor: color.gold, strokeColor: color.blueDeepest });
    const t2 = gameText("ADAM'S ADVENTURE", 26 * k, { fillColor: 0xffffff, strokeColor: color.blueDeepest, letterSpacing: 2 });
    t2.y = 50 * k;
    this.title.addChild(t1, t2);
    const landscape = w > h;
    this.title.position.set(w / 2, this.safe.top + (landscape ? 70 : 110) * k);
    this.adam.position.set(landscape ? w * 0.36 : w * 0.5, landscape ? h * 0.86 : h * 0.66);
    this.adam.scale.set(1.25 * k);
    this.sparky.position.set(landscape ? w * 0.22 : w * 0.2, landscape ? h * 0.45 : h * 0.4);
    this.sparky.scale.set(0.8 * k);
    this.play.position.set(landscape ? w * 0.7 : w * 0.5, landscape ? h * 0.62 : h * 0.84 - this.safe.bottom);
    this.play.scale.set(Math.min(1.1, 0.95 * k));
    this.playGlow.scale.set(3);
  }

  enter() {
    void (async () => {
      this.adam.setExpression('happy');
      await this.wait(500);
      this.sparky.setMood('excited');
      void this.sparky.hop();
    })();
  }

  tick(dt: number) {
    this.adam.update(dt);
    this.sparky.update(dt);
    const g = this.starsG.clear();
    for (const s of this.stars) g.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.4 + Math.sin(this.time * 2 + s.p) * 0.35 });
    const r = this.rays.clear();
    const cx = this.adam.x;
    const cy = this.adam.y - 130 * this.adam.scale.y;
    for (let i = 0; i < 12; i++) {
      const a = this.time * 0.25 + (i * Math.PI * 2) / 12;
      r.poly([cx, cy, cx + Math.cos(a) * 900, cy + Math.sin(a) * 900, cx + Math.cos(a + 0.12) * 900, cy + Math.sin(a + 0.12) * 900]).fill({ color: i % 2 ? color.blue : color.gold, alpha: 0.07 });
    }
    const pulse = 1 + Math.sin(this.time * 4) * 0.06;
    this.play.children[1].scale.set(pulse);
    this.playGlow.alpha = 0.5 + Math.sin(this.time * 4) * 0.25;
    if (Math.random() < 0.08) {
      this.fx.burst(this.play.x + (Math.random() - 0.5) * 140, this.play.y + (Math.random() - 0.5) * 140, { texture: this.tex('star'), count: 1, tints: [color.gold, color.mint], speed: [10, 40], life: [0.6, 1], scale: [0.15, 0.3] });
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky') this.sparky.setTalking(on);
  }

  private async start() {
    if (this.started) return;
    this.started = true;
    this.engine.unlockAudio();
    this.engine.audio.playMusic('title');
    this.sfx('fanfare');
    this.haptic('medium');
    this.celebrate(this.play.x, this.play.y, 1);
    void this.tw.to(this.play.scale, { x: 0, y: 0 }, { duration: 350, ease: Ease.backIn });
    this.adam.setPose('victory');
    void this.adam.jump(110);
    // never make Adam wait on speech: the line plays while we fly into the world
    // the parent's own welcome/name clip (if recorded) replaces Sparky's greeting
    const greeting = (async () => {
      const own = (await hasParentClip('welcome')) ? 'welcome' : (await hasParentClip('name')) ? 'name' : null;
      if (own && (await playParentClip(own))) return;
      void this.say([{ text: 'يلا يا آدم! مغامرتك بلشت!', lang: 'ar' }], 'sparky');
    })();
    await this.wait(1300);
    // a parent clip is narration and the scene change would cut it, so let it finish (clips ≤ 15 s)
    await this.guard(Promise.race([greeting, new Promise<void>((r) => setTimeout(r, 16000))]));
    void this.goto('world');
  }
}
