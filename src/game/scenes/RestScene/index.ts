import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { gameText, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Sparky } from '../../entities/Sparky';
import { playParentClip } from '@/audio/ParentVoice';

/**
 * Session over: Adam is back at his hero base under the moon, gets a session reward and
 * rests. No new missions start here. A parent can extend play from the Parent Zone; the
 * game notices the extension and returns to the world.
 */
export default class RestScene extends Scene {
  readonly id = 'rest' as const;
  readonly music = 'rest' as const;
  private sky = new Graphics();
  private starsG = new Graphics();
  private moon!: Sprite;
  private ground = new Graphics();
  private tent = new Graphics();
  private adam!: Adam;
  private sparky!: Sparky;
  private zzz = new Container();
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;
  private checkIn = 1;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    this.moon = new Sprite(this.tex('glow'));
    this.moon.anchor.set(0.5);
    this.moon.tint = 0xfff3bf;
    this.adam = new Adam(this.faceTex);
    this.adam.setPose('sad');
    this.adam.setExpression('sleepy');
    this.sparky = new Sparky(this.tex('glow'));
    this.world.addChild(this.sky, this.starsG, this.moon, this.ground, this.tent, this.adam, this.sparky, this.zzz, this.fx.view);
    useGame.getState().setHud({ kind: 'world' });
  }

  layout(w: number, h: number) {
    const K = Math.min(w, h) / 400;
    this.sky.clear().rect(0, 0, w, h).fill(vGrad([[0, 0x030714], [1, 0x14224f]]));
    this.stars = Array.from({ length: 120 }, () => ({ x: Math.random() * w, y: Math.random() * h * 0.6, r: 0.5 + Math.random() * 1.8, p: Math.random() * 6 }));
    this.moon.position.set(w * 0.78, h * 0.18);
    this.moon.scale.set(1.4 * K);
    const gy = h * 0.74;
    this.ground.clear().ellipse(w / 2, gy + h * 0.3, w * 0.9, h * 0.34).fill(vGrad([[0, 0x1d5e3a], [1, 0x0d2a1a]]));
    const t = this.tent.clear();
    const tx = w * 0.5;
    t.poly([tx - 120 * K, gy, tx, gy - 150 * K, tx + 120 * K, gy]).fill(vGrad([[0, color.blue], [1, color.blueDeep]])).stroke({ width: 4 * K, color: 0xffffff, alpha: 0.7 });
    t.poly([tx - 40 * K, gy, tx, gy - 90 * K, tx + 40 * K, gy]).fill(0x0a1430);
    t.star(tx, gy - 115 * K, 5, 12 * K, 5 * K).fill(color.gold);
    this.adam.position.set(w * 0.5, gy + 6 * K);
    this.adam.scale.set(0.8 * K);
    this.sparky.position.set(w * 0.24, gy - 120 * K);
    this.sparky.scale.set(0.55 * K);
  }

  enter() {
    void (async () => {
      const reward = Number(this.data.reward ?? 0);
      this.sparky.setMood('excited');
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }, { text: 'Great job, Adam!', lang: 'en' }], 'sparky');
      if (reward > 0) await this.flyStarsToHud(this.width / 2, this.height * 0.4, reward);
      this.sparky.setMood('idle');
      await this.say([{ text: 'يلا نرتاح. بنكمل بكرة!', lang: 'ar' }], 'sparky');
      await this.guard(playParentClip('goodbye'));
      this.engine.audio.setMusicIntensity(0);
    })();
  }

  tick(dt: number) {
    this.adam.update(dt);
    this.sparky.update(dt);
    const g = this.starsG.clear();
    for (const s of this.stars) g.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.35 + Math.sin(this.time * 1.5 + s.p) * 0.3 });
    if (Math.random() < 0.012) {
      const z = gameText('z', 22 + Math.random() * 14, { fillColor: color.primary });
      z.position.set(this.adam.x + 30, this.adam.y - 170 * this.adam.scale.y);
      this.zzz.addChild(z);
    }
    for (const z of [...this.zzz.children]) {
      z.y -= dt * 22;
      z.x += Math.sin(this.time * 2 + z.y * 0.05) * 0.4;
      z.alpha -= dt * 0.3;
      if (z.alpha <= 0) z.destroy();
    }
    // a parent extended play in the Parent Zone → back to the world
    this.checkIn -= dt;
    if (this.checkIn <= 0) {
      this.checkIn = 1;
      this.engine.applyParentExtension();
      if (!this.engine.session.isExpired()) {
        this.checkIn = 9999;
        this.engine.resumeAfterRest(0);
      }
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky') this.sparky.setTalking(on);
  }
}
