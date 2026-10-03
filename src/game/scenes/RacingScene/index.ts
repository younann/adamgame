import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { numberWord } from '@/learning/engine/ChallengeGenerator';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease, bezier2, lerp } from '../../engine/Tween';
import { hudAnchorPosition, pulseHud } from '../../engine/hudBridge';
import { drawChunky, gameText, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Kid } from '../../entities/Kid';
import { Sparky } from '../../entities/Sparky';
import { Trophy } from '../../entities/Trophy';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { D0, Road } from './Road';
import { StarToken, Tunnel } from './Tunnels';
import { Vehicle } from './Vehicle';

const CAR_D = D0 * 1.14;
const HOLD_D = 40;
const SPEED_NORMAL = 70;
const SPEED_CRUISE = 30;
const SPEED_NITRO = 155;
const LAPS = 3;
const KMH = 1.6;

const LAP_INTRO: VoiceLine[][] = [
  [{ text: 'يلا يا آدم! السباق بلّش!', lang: 'ar' }],
  [{ text: 'المنافس رجع! يلا نسرّع!', lang: 'ar' }],
  [{ text: 'آخر دورة يا بطل!', lang: 'ar' }],
];

/**
 * TURBO RACING — a continuously moving neon circuit. Answers are race events: pick the
 * right tunnel → steer in → NITRO → overtake the rival.
 */
export default class RacingScene extends Scene implements ChallengePresenter {
  readonly id = 'racing' as const;
  readonly music = 'racing' as const;
  runner!: ChallengeRunner;

  private road!: Road;
  private car!: Vehicle;
  private adam!: Adam;
  private rival!: Vehicle;
  private sparky!: Sparky;
  private speedLines = new Graphics();
  private flash = new Graphics();
  private lights = new Container();
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;

  private speed = 0;
  private targetSpeed = 0;
  private carU = 0;
  private steer = 0;
  private nitroFuel = 0;
  private boosting = 0;
  private rivalAhead = 14;
  private rivalU = 0.45;
  private lap = 1;
  private position = 2;
  private hudTimer = 0;
  private engineSnd: { setSpeed: (v: number) => void; stop: () => void } | null = null;

  private tunnels: Tunnel[] = [];
  private stars: StarToken[] = [];
  private counted = 0;
  private interactive = false;
  private finish: Container | null = null;
  private finishD = 0;
  private trophy: Trophy | null = null;
  private skillsPlayed: string[] = [];
  private starsEarned = 0;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    this.road = new Road(this.tex('glow'));
    this.adam = new Adam(this.faceTex);
    this.car = new Vehicle(this.tex('glow'), 0x1e6bff, color.gold, '4', this.adam);
    const rivalKid = new Kid({
      skin: 0xc98e62, hair: 0x1a1010, hairStyle: 'spiky', eyeColor: 0x2a1a10,
      shirt: 0x8b3dff, shirtAccent: 0xff8a1f, trim: 0xffffff, shorts: 0x2a1a55, socks: 0x8b3dff,
      shoes: 0x222222, shoeAccent: 0xff8a1f, helmet: { main: 0x8b3dff, accent: 0xff8a1f, trim: 0xffffff },
    });
    this.rival = new Vehicle(this.tex('glow'), 0x8b3dff, 0xff8a1f, '7', rivalKid);
    this.sparky = new Sparky(this.tex('glow'));
    this.road.props.addChild(this.rival, this.car);
    this.world.addChild(this.road.back, this.road.props, this.fx.view);
    this.overlay.addChildAt(this.speedLines, 0);
    this.overlay.addChild(this.sparky, this.lights, this.flash);
    this.runner = new ChallengeRunner(this, 'racing', this);
    useGame.getState().setLastVisited('racing');
    useGame.getState().setHud({ kind: 'racing', speed: 0, nitro: 0, lap: 1, laps: LAPS, position: 2 });
  }

  layout(w: number, h: number) {
    this.road.layout(w, h);
    const K = Math.min(w, h) / 400;
    const land = w > h * 1.1;
    this.sparky.position.set(land ? w * 0.1 : w * 0.16, this.safe.top + (land ? 150 : 140) * K);
    this.sparky.scale.set(0.5 * K);
    this.lights.position.set(w / 2, h * 0.42);
    this.lights.scale.set(K);
  }

  enter() {
    this.engineSnd = this.engine.audio.startEngine();
    this.engine.audio.startCrowd(0.12);
    void this.race();
  }

  exit() {
    this.engineSnd?.stop();
    this.engineSnd = null;
    this.engine.audio.stopCrowd();
    this.engine.audio.setMusicIntensity(0);
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'commentator') this.sparky.setTalking(on);
  }

  // ------------------------------------------------------------------ frame
  tick(dt: number) {
    const r = this.road;
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * (this.targetSpeed > this.speed ? 1.8 : 2.6));
    const prevU = this.carU;
    r.update(dt, this.speed, this.carU);
    // car — fixed depth, slides across lanes
    const idleSway = Math.sin(this.time * 1.3) * 0.03 * Math.min(1, this.speed / 60);
    this.steer += ((this.carU - prevU) / Math.max(dt, 0.001) * 0.08 + idleSway - this.steer) * Math.min(1, dt * 8);
    // lanes converge toward the horizon, so the car only needs a fraction of the tunnel's u
    this.car.position.set(r.x((this.carU + idleSway) * 0.5, CAR_D), r.y(CAR_D));
    this.car.scale.set(r.s(CAR_D));
    this.car.zIndex = 20000;
    this.car.nitro += ((this.boosting ? 1 : 0) - this.car.nitro) * Math.min(1, dt * 6);
    this.car.update(dt, this.speed, this.steer);
    // rival car
    const rd = CAR_D + this.rivalAhead;
    this.rival.visible = rd > D0 * 0.7;
    if (this.rival.visible) {
      this.rivalU = 0.42 + Math.sin(this.time * 0.7) * 0.08;
      this.rival.position.set(r.x(this.rivalU, rd), r.y(rd));
      this.rival.scale.set(r.s(rd));
      this.rival.zIndex = Math.round(10000 - rd * 10);
      this.rival.update(dt, this.speed, Math.sin(this.time) * 0.2);
    }
    // tunnels and finish arch
    for (const t of this.tunnels) {
      if (t.rushing) t.d -= this.speed * dt;
      t.position.set(r.x(t.u, t.d), r.y(t.d));
      t.scale.set(r.s(t.d));
      t.zIndex = Math.round(10000 - t.d * 10);
      t.visible = t.d > D0 * 0.6;
      t.glow.alpha = Math.max(t.glow.alpha * 0.98, 0.3 + Math.sin(this.time * 3 + t.u) * 0.08);
    }
    if (this.finish) {
      this.finishD -= this.speed * dt;
      this.finish.position.set(r.cx, r.y(this.finishD));
      this.finish.scale.set(r.s(this.finishD));
      this.finish.zIndex = Math.round(10000 - this.finishD * 10);
      this.finish.visible = this.finishD > D0 * 0.7;
    }
    for (const s of this.stars) {
      const sc = r.s(s.d);
      s.position.set(r.x(s.u, s.d), r.y(s.d) - (s.lift + Math.sin(this.time * 3 + s.bob) * 8) * sc);
      s.scale.set(sc * 0.75);
      s.zIndex = Math.round(10000 - s.d * 10) + 5;
    }
    // speed lines + sparks at high speed
    const sl = this.speedLines.clear();
    const fast = Math.max(0, (this.speed - 85) / 70);
    if (fast > 0 && !this.reduced) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = Math.min(this.width, this.height) * (0.35 + Math.random() * 0.3);
        const len = 60 + Math.random() * 120 * fast;
        sl.moveTo(r.cx + Math.cos(a) * r0, r.hy + Math.sin(a) * r0)
          .lineTo(r.cx + Math.cos(a) * (r0 + len), r.hy + Math.sin(a) * (r0 + len))
          .stroke({ width: 2 + Math.random() * 2, color: i % 3 ? 0xffffff : color.mint, alpha: 0.35 * fast });
      }
      if (Math.random() < 0.5) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.fx.burst(this.car.x + side * 58 * this.car.scale.x, this.car.y - 4, { texture: this.tex('spark'), count: 2, tints: [color.gold, 0xff8a1f], speed: [120, 260], angle: [Math.PI * 0.15, Math.PI * 0.85], gravity: 400, life: [0.2, 0.4], scale: [0.4, 0.7], stretch: true, additive: true });
      }
    }
    if (this.boosting) {
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 0.35);
    }
    this.engineSnd?.setSpeed(Math.min(1, this.speed / SPEED_NITRO));
    this.sparky.update(dt);
    this.trophy?.update(dt);
    this.runner.tick(dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.125;
      useGame.getState().patchHud({ speed: this.speed * KMH, nitro: this.nitroFuel, lap: this.lap, position: this.position });
    }
  }

  // ------------------------------------------------------------------ race flow
  private async race() {
    this.adam.setExpression('determined');
    await this.countdown();
    this.targetSpeed = SPEED_NORMAL;
    this.sfx('go');
    this.haptic('medium');
    this.camera.shake(5, 300);
    for (let i = 0; i < LAPS; i++) {
      this.lap = i + 1;
      if (i > 0) {
        // the rival comes back so every lap has an overtake
        void this.tw.to(this, { rivalAhead: 14 }, { duration: 2200, ease: Ease.quadOut });
        this.position = 2;
      }
      await this.wait(i === 0 ? 1200 : 1800);
      const res = await this.runner.run({ intro: LAP_INTRO[i], speaker: 'sparky' });
      this.skillsPlayed.push(res.skillId);
      this.starsEarned += res.stars;
    }
    await this.finishLine();
  }

  private async countdown() {
    this.sparky.setMood('excited');
    void this.say([{ text: 'جاهز يا آدم؟', lang: 'ar' }, { text: 'Ready… set… GO!', lang: 'en' }], 'sparky');
    const g = new Graphics();
    this.lights.addChild(g);
    const draw = (lit: number, go: boolean) => {
      g.clear();
      g.roundRect(-110, -45, 220, 90, 30).fill(0x0d1322).stroke({ width: 4, color: 0x3a4a80 });
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 68;
        g.circle(x, 0, 28).fill(0x1a1a24).stroke({ width: 3, color: 0x333344 });
        if (go) g.circle(x, 0, 24).fill(color.mint);
        else if (i < lit) g.circle(x, 0, 24).fill(color.red);
      }
    };
    for (let lit = 1; lit <= 3; lit++) {
      draw(lit, false);
      this.sfx('beep');
      this.engineSnd?.setSpeed(0.25 + lit * 0.12);
      await this.wait(650);
    }
    draw(3, true);
    this.sparky.setMood('idle');
    void this.bigText('GO!', { fill: color.mint, y: this.height * 0.3, hold: 300 });
    void this.tw.to(this.lights, { alpha: 0 }, { duration: 500, delay: 300 }).then(() => g.destroy());
  }

  private async finishLine() {
    // checkered arch approaches
    const f = new Container();
    const g = new Graphics();
    const W = 340;
    g.rect(-W / 2 - 14, -260, 18, 260).fill(0xdddddd);
    g.rect(W / 2 - 4, -260, 18, 260).fill(0xdddddd);
    for (let i = 0; i < 18; i++) for (let j = 0; j < 3; j++) g.rect(-W / 2 + i * (W / 18), -280 + j * 14, W / 18, 14).fill((i + j) % 2 ? 0xffffff : 0x111111);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) g.rect(-W / 2 + i * (W / 12), -6 + j * 3, W / 12, 3).fill((i + j) % 2 ? 0xffffff : 0x111111);
    const t = gameText('FINISH', 34, { fillColor: color.gold });
    t.y = -305;
    f.addChild(g, t);
    this.finish = f;
    this.finishD = 260;
    this.road.props.addChild(f);
    this.targetSpeed = 95;
    void this.say([{ text: 'خط النهاية! يلا يا آدم!', lang: 'ar' }], 'sparky');
    await this.guard(new Promise<void>((resolve) => {
      const check = () => (this.finishD <= CAR_D ? resolve() : void this.tw.wait(50).then(check));
      check();
    }));
    // crossing!
    this.position = 1;
    this.sfx('fanfare');
    this.engine.audio.cheer(1);
    this.haptic('celebrate');
    this.camera.shake(8, 400);
    this.celebrate(this.car.x, this.car.y - 120, 1.6);
    this.fx.burst(this.width / 2, this.height * 0.3, { texture: this.tex('confetti'), count: 50, tints: [0xffffff, 0x111111, color.gold, color.mint], speed: [200, 500], gravity: 500, life: [1.2, 2], scale: [0.5, 0.9], spin: [-8, 8] });
    this.targetSpeed = 35;
    this.adam.setPose('victory');
    this.adam.setExpression('excited');
    void this.bigText('1st!', { fill: color.gold, y: this.height * 0.28 });
    await this.say([{ text: 'أنت الأول يا آدم! فزت بالسباق!', lang: 'ar' }, { text: 'First place!', lang: 'en' }], 'sparky');

    // trophy rises in the spotlight, then flies into the HUD
    const store = useGame.getState();
    const K = Math.min(this.width, this.height) / 400;
    const trophy = new Trophy(this.tex('glow'), 0.9 * K);
    trophy.position.set(this.width / 2, this.height * 0.62);
    trophy.alpha = 0;
    this.trophy = trophy;
    this.overlay.addChild(trophy);
    await this.tw.to(trophy, { alpha: 1, y: this.height * 0.52 }, { duration: 800, ease: Ease.backOut });
    this.celebrate(this.width / 2, this.height * 0.4, 1.2);
    await this.wait(600);
    const target = hudAnchorPosition('stars', this.engine.host) ?? { x: this.width - 60, y: this.safe.top + 34 };
    this.sfx('whoosh');
    const s0 = trophy.scale.x;
    await this.tw.to(trophy, { x: target.x, y: target.y }, { duration: 700, ease: Ease.cubicIn, onUpdate: (p) => trophy.scale.set(lerp(s0, 0.1, p)) });
    trophy.destroy();
    this.trophy = null;
    store.addTrophy();
    pulseHud('stars');
    this.sfx('unlock');
    store.completeMission('racing', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
    await this.flyStarsToHud(this.car.x, this.car.y - 100, MISSION_BONUS);
    this.adam.setPose('drive');
    await revealUnlocks(this);
    if (this.engine.shouldWrapUp()) {
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
      void this.engine.endSession();
      return;
    }
    await this.offerNext();
  }

  private async offerNext() {
    const K = Math.min(this.width, this.height) / 400;
    const mk = (fx: number, kind: 'again' | 'home') => {
      const c = new Container();
      const glow = new Sprite(this.tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = kind === 'again' ? color.mint : color.gold;
      glow.blendMode = 'add';
      glow.scale.set(1.6);
      const g = new Graphics();
      drawChunky(g, { w: 130, h: 130, radius: 34, top: kind === 'again' ? 0x35d38f : 0x3a7bff, bottom: kind === 'again' ? color.mintDeep : color.blueDeep, depth: kind === 'again' ? color.mintShadow : color.blueShadow });
      const icon = new Graphics();
      if (kind === 'again') {
        // checkered flag
        icon.rect(-34, -40, 6, 80).fill(0xffffff);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) icon.rect(-28 + i * 14, -40 + j * 14, 14, 14).fill((i + j) % 2 ? 0xffffff : 0x111111);
      } else {
        icon.poly([0, -42, 44, -4, 32, -4, 32, 36, -32, 36, -32, -4, -44, -4]).fill(0xffffff);
        icon.roundRect(-10, 8, 20, 28, 4).fill(color.blue);
      }
      c.addChild(glow, g, icon);
      c.position.set(this.width * fx, this.height * 0.48);
      c.scale.set(0);
      this.overlay.addChild(c);
      void this.tw.to(c.scale, { x: K * 0.9, y: K * 0.9 }, { duration: 500, ease: Ease.backOut });
      return c;
    };
    const again = mk(0.3, 'again');
    const home = mk(0.7, 'home');
    await this.say([{ text: 'بدك تسابق كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    await this.guard(
      new Promise<void>((resolve) => {
        const go = (id: string) => {
          resolve();
          this.engine.speech.cancel();
          void (id === 'again' ? this.goto('racing') : this.goto('world', { from: 'racing' }));
        };
        this.tappable(again, () => go('again'), { sound: 'pop', haptic: 'tiny' });
        this.tappable(home, () => go('home'), { sound: 'pop', haptic: 'tiny' });
        this.setA11yChoices([{ id: 'again', label: 'Race again' }, { id: 'home', label: 'Back to world' }], go);
      }),
    );
  }

  // ------------------------------------------------------------------ presenter
  async present(ch: LearningChallenge, choices: ChallengeChoice[]) {
    this.counted = 0;
    this.targetSpeed = SPEED_CRUISE;
    this.adam.setExpression('happy');
    const n = choices.length;
    const spread = n === 2 ? 0.45 : 0.66;
    choices.forEach((c, i) => {
      const t = new Tunnel(this.tex('glow'), c, i);
      t.u = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1);
      t.d = 260;
      this.tunnels.push(t);
      this.road.props.addChild(t);
      this.tappable(t, () => this.interactive && this.runner.choose(c.id), { sound: 'press', haptic: 'tiny', visual: t.sign });
      void this.tw.to(t, { d: HOLD_D + i * 0.01 }, { duration: 1700, ease: Ease.cubicOut });
    });
    this.sfx('whoosh', { volume: 0.5 });
    // star tokens physically on the track
    let count = 0;
    let labels: number[] | null = null;
    if (ch.type === 'order') {
      const next = ch.answer.value ?? 4;
      labels = [next - 3, next - 2, next - 1];
      count = 3;
    } else if (ch.type !== 'compare' && ch.type !== 'colorMatch' && (ch.assets.count ?? 0) <= 10) {
      count = ch.assets.count ?? 0;
    }
    const rows = count > 5 ? 2 : 1;
    const perRow = Math.ceil(count / rows);
    const addends = ch.assets.addends;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = row === rows - 1 ? count - perRow * (rows - 1) : perRow;
      const s = new StarToken(this.tex('glow'));
      let u = inRow === 1 ? 0 : -0.62 + (1.24 * col) / (inRow - 1);
      if (addends && rows === 1) u += i < addends[0] ? -0.08 : 0.08;
      s.u = u;
      s.d = 27 + row * 6;
      s.lift = 900;
      if (labels) s.setNumber(labels[i]);
      this.stars.push(s);
      this.road.props.addChild(s);
      this.tappable(s, () => this.onStarTap(s), { sound: null, haptic: 'tiny' });
      void this.tw.to(s, { lift: 150 + row * 10 }, { duration: 600, delay: 500 + i * 120, ease: Ease.bounceOut }).then(() => this.sfx('pop', { pitch: i, volume: 0.6 }));
    }
    await this.wait(1200);
  }

  private onStarTap(s: StarToken) {
    void this.bounce(s);
    if (s.num === null) s.setNumber(++this.counted);
    this.sfx('pop', { pitch: ((s.num ?? 1) - 1) * 2 });
    this.engine.speech.say([{ text: numberWord(s.num ?? 1), lang: 'en' }], 'sparky');
    if (this.counted === this.stars.length) for (const t of this.tunnels) void this.pop(t.sign, 1.1);
  }

  private async bounce(s: StarToken) {
    const base = s.lift;
    this.tw.kill(s);
    await this.tw.to(s, { lift: base + 50 }, { duration: 160, ease: Ease.quadOut });
    await this.tw.to(s, { lift: base }, { duration: 300, ease: Ease.bounceOut });
  }

  private async pop(el: Container, k: number) {
    const sx = el.scale.x;
    const sy = el.scale.y;
    await this.tw.to(el.scale, { x: sx * k, y: sy * k }, { duration: 140 });
    await this.tw.to(el.scale, { x: sx, y: sy }, { duration: 420, ease: Ease.elasticOut });
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  async wrongFeedback(choiceId: string) {
    const t = this.tunnels.find((x) => x.choice.id === choiceId);
    this.sfx('softBump');
    this.haptic('tiny');
    // gentle slow-down bump — never a crash
    this.targetSpeed = 14;
    this.camera.shake(4, 250);
    this.fx.burst(this.car.x, this.car.y - 10, { texture: this.tex('smoke'), count: 8, tints: [0xffffff], speed: [30, 90], angle: [Math.PI, Math.PI * 2], life: [0.4, 0.7], scale: [0.4, 0.8] });
    this.adam.setExpression('thinking');
    this.sparky.setMood('hint');
    if (t) {
      const x0 = t.sign.x;
      for (const dx of [-14, 14, -7, 7, 0]) await this.tw.to(t.sign, { x: x0 + dx }, { duration: 55 });
    }
    await this.wait(500);
    this.targetSpeed = SPEED_CRUISE;
    this.adam.setExpression('determined');
    this.sparky.setMood('idle');
  }

  async countTogether(ch: LearningChallenge) {
    this.sparky.setMood('hint');
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (ch.type !== 'order') s.setNumber(i + 1);
      void this.bounce(s);
      this.sfx('pop', { pitch: i * 2 });
      this.fx.burst(s.x, s.y, { texture: this.tex('glow'), count: 6, tints: [color.gold], speed: [20, 80], life: [0.3, 0.5], scale: [0.2, 0.35], additive: true });
      await this.say([{ text: numberWord(i + 1).replace(/^./, (c) => c.toUpperCase()), lang: 'en' }], 'sparky');
    }
    this.counted = this.stars.length;
    this.sparky.setMood('idle');
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const t = this.tunnels.find((x) => x.choice.id === ch.answer.id);
    if (!t) return;
    t.glow.alpha = 1;
    void this.pop(t.sign, strong ? 1.2 : 1.1);
    this.fx.burst(t.x, t.y - 250 * t.scale.y, { texture: this.tex('star'), count: 10, tints: [color.gold, 0xffffff], speed: [40, 140], life: [0.4, 0.8], scale: [0.15, 0.3] });
  }

  /** Correct: steer into the tunnel, NITRO, overtake. */
  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    this.interactive = false;
    const t = this.tunnels.find((x) => x.choice.id === choiceId) ?? this.tunnels[0];
    this.engine.audio.setMusicIntensity(0.5);
    // chosen sign flashes, others dim
    t.glow.alpha = 1;
    t.glow.tint = color.gold;
    void this.pop(t.sign, 1.3);
    this.sfx('magic');
    for (const o of this.tunnels) if (o !== t) void this.tw.to(o, { alpha: 0.35 }, { duration: 300 });

    // counted stars fly into the car's nitro tank
    const flights = this.stars.map((s, i) =>
      (async () => {
        const sx = s.x, sy = s.y;
        const box = { p: 0 };
        this.stars = this.stars.filter((x) => x !== s);
        await this.tw.to(box, { p: 1 }, {
          duration: 450, delay: i * 90, ease: Ease.cubicIn,
          onUpdate: () => {
            s.x = bezier2(sx, (sx + this.car.x) / 2, this.car.x, box.p);
            s.y = bezier2(sy, Math.min(sy, this.car.y) - 80, this.car.y - 60 * this.car.scale.y, box.p);
            s.scale.set(lerp(s.scale.x, 0.15, box.p * 0.3));
          },
        });
        this.sfx('starLand', { pitch: i });
        s.destroy({ children: true });
      })(),
    );
    void this.tw.to(this, { nitroFuel: 1 }, { duration: 700 });
    await this.guard(Promise.all(flights).then(() => undefined));
    this.sfx('power');
    await this.wait(250);

    // steer into the lane
    this.adam.setExpression('excited');
    await this.tw.to(this, { carU: t.u }, { duration: 550, ease: Ease.cubicInOut });

    // NITRO!
    this.boosting = 1;
    this.targetSpeed = SPEED_NITRO;
    this.sfx('nitro');
    this.haptic('medium');
    this.engine.audio.setMusicIntensity(1);
    this.camera.shake(7, 900);
    void this.camera.panTo(this.width / 2, this.height / 2, this.reduced ? 1 : 0.9, 500);
    for (const o of this.tunnels) o.rushing = true;
    // overtake the rival
    this.sfx('whoosh', { delay: 0.5 });
    void this.tw.to(this, { rivalAhead: -40 }, { duration: 1500, ease: Ease.quadIn }).then(() => {
      this.position = 1;
    });
    await this.guard(new Promise<void>((resolve) => {
      const check = () => (t.d <= CAR_D + 2 ? resolve() : void this.tw.wait(30).then(check));
      check();
    }));
    // through the tunnel: a whoosh of darkness and light
    this.flash.clear().rect(0, 0, this.width, this.height).fill(0x020309);
    this.flash.alpha = 0.8;
    this.sfx('swoosh');
    void this.tw.to(this.flash, { alpha: 0 }, { duration: 420 });
    this.celebrate(this.car.x, this.car.y - 120 * this.car.scale.y, 1.1);
    void this.bigText('TURBO!', { fill: color.gold, y: this.height * 0.3 });
    await this.wait(700);
    await this.flyStarsToHud(this.car.x, this.car.y - 140 * this.car.scale.y, stars);

    // settle back to race pace
    this.boosting = 0;
    this.targetSpeed = SPEED_NORMAL;
    this.engine.audio.setMusicIntensity(0);
    void this.camera.reset(700);
    await this.tw.to(this, { carU: 0 }, { duration: 700, ease: Ease.quadInOut });
    this.adam.setExpression('determined');
  }

  clear() {
    for (const t of this.tunnels) {
      this.tw.drop(t);
      t.destroy({ children: true });
    }
    this.tunnels = [];
    for (const s of this.stars) s.destroy({ children: true });
    this.stars = [];
    this.flash.clear();
  }
}

export { vGrad };
