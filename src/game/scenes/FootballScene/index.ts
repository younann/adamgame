import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { color, conceptColor, font } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { numberWord } from '@/learning/engine/ChallengeGenerator';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease, bezier2, lerp } from '../../engine/Tween';
import { drawChunky, gameText, rGrad, shade } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Kid } from '../../entities/Kid';
import { Sparky } from '../../entities/Sparky';
import { Trophy } from '../../entities/Trophy';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { pulseHud } from '../../engine/hudBridge';
import { makePitch, type Pitch } from './Pitch';
import { Stadium } from './Stadium';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { Actor } from './Actor';
import { ADAM_V, BALL_V, BOARD_V, SPOT_V } from './consts';
import type { FootballMode, ModeHandler } from './modes/types';
import { MODE_SUPPORTS } from './modes/types';
import { planMatch, skillOptionsFor } from './modes/chooser';
import { FreeKickMode } from './modes/FreeKick';
import { DribbleMode } from './modes/Dribble';
import { PassingMode } from './modes/Passing';
import { KeeperMode } from './modes/Keeper';


const MINUTES = [60, 75, 90];
const STORY = {
  twoBehind: [{ text: 'يلا يا آدم! المنافسين معهم هدفين. بدنا نرجع!', lang: 'ar' }] as VoiceLine[],
  oneBehind: [{ text: 'هدف كمان ونتعادل!', lang: 'ar' }] as VoiceLine[],
  tiedLast: [{ text: 'آدم! بدنا هدف أخير!', lang: 'ar' }] as VoiceLine[],
  tied: [{ text: 'التعادل! يلا نسجل كمان!', lang: 'ar' }] as VoiceLine[],
};
/** Short mode intros (commentator) — spoken before the learning prompt. */
const MODE_INTRO: Partial<Record<FootballMode, VoiceLine[]>> = {
  freekick: [{ text: 'ضربة حرة!', lang: 'ar' }, { text: 'Free kick!', lang: 'en' }],
  dribble: [{ text: 'يلا نراوغ بين الأقماع!', lang: 'ar' }, { text: 'Dribble!', lang: 'en' }],
  passing: [{ text: 'مرّر الطابة لصاحبك!', lang: 'ar' }, { text: 'Pass!', lang: 'en' }],
  keeper: [{ text: 'ضربة جزاء للمنافسين! آدم الحارس! وقّفها!', lang: 'ar' }, { text: 'Save it!', lang: 'en' }],
};

/**
 * GOAL STADIUM — the production-quality vertical slice.
 * The field is the interface: learning objects live on the pitch, and a correct answer
 * physically powers Adam's shot.
 */
export default class FootballScene extends Scene implements ChallengePresenter {
  readonly id = 'football' as const;
  readonly music = 'football' as const;

  p!: Pitch;
  stadium!: Stadium;
  actorsLayer = new Container();
  targetsLayer = new Container();
  actors: Actor[] = [];
  adam!: Adam;
  adamA!: Actor;
  keeper!: Kid;
  keeperA!: Actor;
  sparky!: Sparky;
  sparkyA!: Actor;
  shotBall!: Actor;
  runner!: ChallengeRunner;
  power = new Container();
  powerG = new Graphics();
  powerLevel = 0;
  mode: FootballMode = 'count';
  /** active variation handler (free kick, dribble, passing, keeper); null = built-in modes */
  handler: ModeHandler | null = null;
  plan: FootballMode[] = [];
  /** where Adam waits between challenges */
  home = { u: -0.22, v: ADAM_V };
  balls: Actor[] = [];
  boards: { a: Actor; choice: ChallengeChoice; glow: Sprite }[] = [];
  targets: { c: Container; choice: ChallengeChoice; glow: Sprite; x: number; y: number }[] = [];
  counted = 0;
  interactive = false;
  score = { adam: 0, rivals: 2 };
  /** football uses its own ball-follow hook (dribbling) */
  ballFollow: (() => void) | null = null;
  challengeIndex = 0;
  keeperSway = true;
  trailOn = false;
  skillsPlayed: string[] = [];
  starsEarned = 0;
  trophy: Trophy | null = null;
  endChoices: Container[] = [];

  async load() {
    this.faceTex = await loadFaceTexture();
  }
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;

  build() {
    this.stadium = new Stadium(this.tex('glow'), () => this.reduced);
    this.actorsLayer.sortableChildren = true;
    this.world.addChild(this.stadium.back, this.stadium.ground, this.stadium.goalBack, this.stadium.goalFront, this.actorsLayer, this.targetsLayer, this.fx.view);

    // keeper — friendly rival in purple/orange
    this.keeper = new Kid({
      skin: 0xc98e62, hair: 0x1a1010, hairStyle: 'short', eyeColor: 0x2a1a10,
      shirt: 0x8b3dff, shirtAccent: 0xff8a1f, trim: 0xffffff, shorts: 0x2a1a55, socks: 0x8b3dff,
      shoes: 0x222222, shoeAccent: 0xff8a1f, gloves: 0xff8a1f, bigGloves: true, headband: 0xff8a1f, number: '1', emblem: 'number',
    });
    this.keeper.setPose('ready');
    this.keeperA = this.addActor(this.keeper);
    this.keeperA.v = -0.02;

    this.adam = new Adam(this.faceTex);
    this.adam.setView('back');
    this.adamA = this.addActor(this.adam);
    this.adamA.u = -0.22;
    this.adamA.v = ADAM_V;

    this.sparky = new Sparky(this.tex('glow'));
    this.sparkyA = this.addActor(this.sparky);
    this.sparkyA.u = 0.3;
    this.sparkyA.v = 0.64;
    this.sparkyA.lift = 150;
    this.sparkyA.k = 0.6;

    const ballSprite = new Sprite(this.tex('football'));
    ballSprite.anchor.set(0.5);
    ballSprite.scale.set(0.28);
    this.shotBall = this.addActor(this.ballView(ballSprite));
    this.shotBall.v = SPOT_V;

    this.power.addChild(this.powerG);
    this.power.alpha = 0;
    this.overlay.addChild(this.power);

    this.runner = new ChallengeRunner(this, 'football', this);
    useGame.getState().setLastVisited('football');
  }

  addActor(view: Container): Actor {
    const c = new Container();
    const a = new Actor(c);
    a.inner.addChild(view);
    this.actorsLayer.addChild(c);
    this.actors.push(a);
    return a;
  }

  ballView(sprite: Container): Container {
    const c = new Container();
    const shadow = new Graphics().ellipse(0, 4, 20, 6).fill({ color: 0x000000, alpha: 0.35 });
    shadow.label = 'shadow';
    sprite.y = -17;
    c.addChild(shadow, sprite);
    return c;
  }

  layout(w: number, h: number) {
    this.p = makePitch(w, h, this.safe.top, this.safe.bottom);
    this.stadium.layout(this.p);
    if (this.p.landscape) {
      if (this.adamA.u === this.home.u && this.adamA.v === this.home.v) this.adamA.u = -0.12;
      this.home.u = -0.12;
      this.sparkyA.u = 0.18;
    }
    this.handler?.layout?.();
    // re-place targets if any
    for (const t of this.targets) this.placeTarget(t);
    this.drawPower();
    this.power.position.set(w / 2, h - this.safe.bottom - 34);
    this.placeAll();
  }

  place(a: Actor) {
    const p = this.p;
    if (a.free) {
      a.view.position.set(a.x, a.y);
      a.view.scale.set(a.k);
    } else {
      const s = p.s(a.v);
      a.view.position.set(p.x(a.u, a.v), p.y(a.v) - (a.lift + a.hop.h) * s);
      a.view.scale.set(s * a.k);
    }
    a.view.zIndex = a.free ? 5000 : Math.round(a.v * 1000) + (a === this.sparkyA ? 2000 : 0);
  }

  placeAll() {
    for (const a of this.actors) this.place(a);
  }

  enter() {
    void this.matchIntro();
  }

  tick(dt: number) {
    this.stadium.update(dt);
    this.adam.update(dt);
    this.keeper.update(dt);
    this.sparky.update(dt);
    this.trophy?.update(dt);
    this.runner.tick(dt);
    this.handler?.tick?.(dt);
    this.ballFollow?.();
    if (this.keeperSway && this.p) {
      this.keeperA.u = Math.sin(this.time * 1.4) * 0.08;
    }
    // board bob
    for (const [i, b] of this.boards.entries()) b.a.lift = 34 + Math.sin(this.time * 2.2 + i) * 6;
    for (const [i, t] of this.targets.entries()) t.c.scale.set(1 + Math.sin(this.time * 3 + i) * 0.04);
    if (this.trailOn) {
      const s = this.shotBall.view;
      const trail = this.adam.trail;
      const tints = trail && trail.id !== 'trail.none' ? [trail.colors.main, trail.colors.accent] : [0xffffff, color.primary];
      this.fx.burst(s.x, s.y - 17 * s.scale.y, { texture: this.tex(trail?.id === 'trail.stars' ? 'star' : 'glow'), count: 2, tints, speed: [10, 50], life: [0.25, 0.45], scale: [0.15, 0.3], additive: true });
    }
    this.placeAll();
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'commentator') this.sparky.setTalking(on);
  }

  // ------------------------------------------------------------------ match flow
  async matchIntro() {
    const store = useGame.getState();
    this.plan = planMatch(typeof this.data.mode === 'string' ? this.data.mode : undefined);
    // the comeback story always ends in a win: every goal mode scores once, a save scores none
    this.score.rivals = Math.max(0, this.plan.filter((m) => m !== 'keeper').length - 1);
    store.setHud({ kind: 'football', adam: this.score.adam, rivals: this.score.rivals, minute: MINUTES[0] });
    this.engine.audio.startCrowd(0.3);
    // sweeping establishing shot: goal → Adam
    const p = this.p;
    this.camera.snap(p.cx, p.goalY - p.goalH * 0.4, this.reduced ? 1 : 1.35);
    await this.wait(250);
    this.sfx('whistle');
    void this.camera.panTo(this.width / 2, this.height / 2, 1, 1600, Ease.cubicInOut);
    this.sparky.setMood('excited');
    void this.sparky.hop();
    await this.say([{ text: 'أهلا فيك بالملعب يا آدم!', lang: 'ar' }, { text: 'Goal Stadium!', lang: 'en' }], 'commentator');
    this.sparky.setMood('idle');
    await this.playChallenges();
  }

  async playChallenges() {
    while (this.challengeIndex < MINUTES.length) {
      const i = this.challengeIndex;
      const mode = this.plan[i] ?? 'count';
      useGame.getState().patchHud({ minute: MINUTES[i] });
      this.mode = mode;
      const last = i === MINUTES.length - 1;
      const diff = this.score.rivals - this.score.adam;
      const story = mode === 'keeper' ? [] : diff >= 2 ? STORY.twoBehind : diff === 1 ? STORY.oneBehind : last ? STORY.tiedLast : STORY.tied;
      const result = await this.runner.run({ intro: [...story, ...(MODE_INTRO[mode] ?? [])], speaker: 'commentator', ...skillOptionsFor(mode) });
      this.skillsPlayed.push(result.skillId);
      this.starsEarned += result.stars;
      this.challengeIndex++;
      await this.wait(300);
    }
    await this.finalWhistle();
  }

  async finalWhistle() {
    const store = useGame.getState();
    this.sfx('whistle');
    await this.wait(300);
    this.sfx('fanfare');
    this.engine.audio.cheer(1);
    this.stadium.goal();
    this.stadium.setLedMessage('🏆 ADAM WINS!  ★  آدم البطل!  ★  CHAMPION  ★');
    // trophy rises at the centre spot in a spotlight
    const p = this.p;
    const trophy = new Trophy(this.tex('glow'), p.s(0.45) * 0.9);
    trophy.position.set(p.cx, p.y(0.45) + 60);
    trophy.alpha = 0;
    this.trophy = trophy;
    this.actorsLayer.addChild(trophy);
    trophy.zIndex = 4000;
    await this.adam.turnTo('front');
    void this.camera.focus(p.cx, p.y(0.5) - 80, 1.15, 800);
    await this.tw.to(trophy, { alpha: 1, y: p.y(0.45) - 30 }, { duration: 900, ease: Ease.backOut });
    this.celebrate(trophy.x, trophy.y - 90 * trophy.scale.y, 1.4);
    this.haptic('celebrate');
    void this.adam.celebrate('celebration.flex', 1600);
    await this.say([{ text: 'فزت بالكأس يا آدم! أنت البطل!', lang: 'ar' }, { text: 'Champion!', lang: 'en' }], 'commentator');
    // trophy flies into the HUD
    const target = this.screenToWorld(this.width - 70, this.safe.top + 40);
    this.sfx('whoosh');
    await this.tw.to(trophy, { x: target.x, y: target.y }, { duration: 700, ease: Ease.cubicIn, onUpdate: (t) => trophy.scale.set(lerp(p.s(0.45) * 0.9, 0.12, t)) });
    trophy.destroy();
    this.trophy = null;
    store.addTrophy();
    pulseHud('stars');
    this.sfx('unlock');
    store.completeMission('football', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
    await this.flyStarsToHud(p.cx, p.y(0.4), MISSION_BONUS);
    await this.camera.reset(500);
    await revealUnlocks(this);
    if (this.engine.shouldWrapUp()) {
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
      void this.engine.endSession();
      return;
    }
    await this.offerNext();
  }

  /** Play again (glowing ball) or go home (world portal) — both are world objects. */
  async offerNext() {
    const p = this.p;
    const mk = (u: number, kind: 'again' | 'home') => {
      const c = new Container();
      const glow = new Sprite(this.tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = kind === 'again' ? color.mint : color.gold;
      glow.blendMode = 'add';
      glow.scale.set(1.6);
      const g = new Graphics();
      drawChunky(g, { w: 130, h: 130, radius: 34, top: kind === 'again' ? 0x35d38f : 0x3a7bff, bottom: kind === 'again' ? color.mintDeep : color.blueDeep, depth: kind === 'again' ? color.mintShadow : color.blueShadow });
      c.addChild(glow, g);
      if (kind === 'again') {
        const b = new Sprite(this.tex('football'));
        b.anchor.set(0.5);
        b.scale.set(0.62);
        c.addChild(b);
      } else {
        const h = new Graphics();
        h.poly([0, -42, 44, -4, 32, -4, 32, 36, -32, 36, -32, -4, -44, -4]).fill(0xffffff);
        h.roundRect(-10, 8, 20, 28, 4).fill(color.blue);
        c.addChild(h);
      }
      c.position.set(p.x(u, 0.45), p.y(0.45) - 40);
      c.scale.set(0);
      this.overlayWorld(c);
      return c;
    };
    const again = mk(-0.3, 'again');
    const home = mk(0.3, 'home');
    this.endChoices = [again, home];
    for (const c of this.endChoices) void this.tw.to(c.scale, { x: 1, y: 1 }, { duration: 500, ease: Ease.backOut });
    await this.say([{ text: 'بدك تلعب مباراة كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    await this.guard(
      new Promise<void>((resolve) => {
        this.tappable(again, () => {
          resolve();
          this.engine.speech.cancel();
          void this.goto('football');
        }, { sound: 'pop', haptic: 'tiny' });
        this.tappable(home, () => {
          resolve();
          this.engine.speech.cancel();
          void this.goto('world', { from: 'football' });
        }, { sound: 'pop', haptic: 'tiny' });
        this.setA11yChoices([{ id: 'again', label: 'Play again' }, { id: 'home', label: 'Back to world' }], (id) => {
          resolve();
          void this.goto(id === 'again' ? 'football' : 'world', { from: 'football' });
        });
      }),
    );
  }

  overlayWorld(c: Container) {
    this.actorsLayer.addChild(c);
    c.zIndex = 6000;
  }

  screenToWorld(sx: number, sy: number) {
    const cam = this.camera;
    return { x: (sx - this.width / 2) / cam.zoom + cam.x, y: (sy - this.height / 2) / cam.zoom + cam.y };
  }

  // ------------------------------------------------------------------ presenter
  async present(ch: LearningChallenge, choices: ChallengeChoice[]) {
    // use the planned mode when it can present this challenge type, else the classic mapping
    if (!MODE_SUPPORTS[this.mode]?.includes(ch.type)) {
      this.mode = ch.type === 'colorMatch' ? 'color' : ch.type === 'countObjects' || ch.type === 'addition' ? 'count' : 'target';
    }
    this.handler = this.makeHandler(this.mode);
    if (this.handler) {
      this.adam.setExpression('happy');
      this.adam.setPose('idle');
      await this.handler.present(ch, choices);
      return;
    }
    this.counted = 0;
    this.adam.setExpression('happy');
    this.adam.setPose('idle');
    if (this.mode === 'color') {
      await this.rollInBalls(choices.length, choices);
    } else if (this.mode === 'count') {
      await this.rollInBalls(ch.assets.count ?? 3, null, ch.assets.addends);
      this.spawnBoards(choices);
    } else {
      if (ch.type === 'order') {
        const next = ch.answer.value ?? 4;
        await this.rollInBalls(3, null, undefined, [next - 3, next - 2, next - 1]);
      } else if (ch.type === 'numberChoice' && (ch.assets.count ?? 0) <= 10) {
        await this.rollInBalls(ch.assets.count ?? 0, null);
      }
      this.spawnTargets(choices);
    }
  }

  /** Balls roll onto the pitch and bounce to rest. */
  async rollInBalls(n: number, colorChoices: ChallengeChoice[] | null, addends?: [number, number], labels?: number[]) {
    const rows = n > 5 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const promises: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const countInRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
      let spread = this.p.landscape ? 0.26 : 0.38;
      if (colorChoices) spread = this.p.landscape ? 0.28 : 0.4;
      let u = countInRow === 1 ? 0 : -spread + (2 * spread * col) / (countInRow - 1);
      if (addends && rows === 1) u += i < addends[0] ? -0.06 : 0.06; // visible gap between groups
      const v = BALL_V - row * 0.07;
      let view: Container;
      if (colorChoices) {
        const key = colorChoices[i].visual.key;
        view = this.ballView(this.colorBall(conceptColor[key] ?? 0xffffff));
      } else {
        const s = new Sprite(this.tex('football'));
        s.anchor.set(0.5);
        s.scale.set(0.28);
        view = this.ballView(s);
      }
      const a = this.addActor(view);
      const fromLeft = i % 2 === 0;
      a.u = fromLeft ? -1.4 : 1.4;
      a.v = v;
      a.lift = 0;
      this.balls.push(a);
      const choice = colorChoices?.[i];
      a.choiceId = choice?.id;
      if (labels) this.attachLabel(a, String(labels[i]), true);
      const hit = new Graphics().circle(0, -17, 46).fill({ color: 0xffffff, alpha: 0.001 });
      a.inner.addChild(hit);
      this.tappable(a.inner, () => this.onBallTap(a), { sound: null, haptic: 'tiny' });
      promises.push(
        (async () => {
          await this.wait(i * 140);
          this.sfx('whoosh', { volume: 0.4 });
          const spin = a.inner.children[0].children?.[1];
          await this.tw.to(a, { u }, {
            duration: 650,
            ease: Ease.cubicOut,
            onUpdate: (t) => {
              if (spin) spin.rotation = (fromLeft ? 1 : -1) * t * 10;
              a.lift = Math.abs(Math.sin(t * Math.PI * 3)) * 26 * (1 - t);
            },
          });
          this.sfx('bounce', { volume: 0.5, pitch: i });
        })(),
      );
    }
    await Promise.all(promises);
    if (colorChoices) {
      this.setA11yChoices(colorChoices.map((c) => ({ id: c.id, label: c.ariaLabel })), (id) => this.runner.choose(id));
    }
  }

  colorBall(c: number) {
    const g = new Graphics();
    g.circle(0, 0, 18).fill(rGrad([[0, shade(c, 0.45)], [0.65, c], [1, shade(c, -0.35)]], 0.38, 0.32));
    g.moveTo(-18, 0).quadraticCurveTo(0, 9, 18, 0).stroke({ width: 2.5, color: 0xffffff, alpha: 0.75 });
    g.circle(0, 0, 18).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
    g.ellipse(-6, -8, 6, 3).fill({ color: 0xffffff, alpha: 0.7 });
    return g;
  }

  attachLabel(a: Actor, text: string, persistent: boolean) {
    const old = a.inner.getChildByLabel('label');
    old?.destroy();
    const t = gameText(text, 40, { fillColor: color.gold });
    t.label = 'label';
    t.y = -70;
    t.scale.set(0.2);
    a.inner.addChild(t);
    void this.tw.to(t.scale, { x: 1, y: 1 }, { duration: 380, ease: Ease.backOut });
    if (!persistent) {
      void this.tw.to(t, { alpha: 0.85 }, { duration: 1 });
    }
    return t;
  }

  async bounceBall(a: Actor) {
    // bounce a separate offset: never kill the actor's own (roll-in / move) tweens
    this.tw.kill(a.hop);
    await this.tw.to(a.hop, { h: 40 }, { duration: 170, ease: Ease.quadOut });
    await this.tw.to(a.hop, { h: 0 }, { duration: 260, ease: Ease.bounceOut });
  }

  onBallTap(a: Actor) {
    const ext = a;
    if (this.mode === 'color') {
      if (!this.interactive || !ext.choiceId) return;
      this.sfx('pop');
      void this.bounceBall(a);
      this.runner.choose(ext.choiceId);
      return;
    }
    // counting: each ball gets the next number when first tapped
    void this.bounceBall(a);
    if (ext.num === undefined) {
      ext.num = ++this.counted;
    }
    this.sfx('pop', { pitch: (ext.num - 1) * 2 });
    this.attachLabel(a, String(ext.num), true);
    this.engine.speech.say([{ text: numberWord(ext.num), lang: 'en' }], 'commentator');
    if (this.counted === this.balls.length && this.mode === 'count') {
      for (const b of this.boards) void this.pop(b.a.inner, 1.08);
    }
  }

  spawnBoards(choices: ChallengeChoice[]) {
    const n = choices.length;
    const spread = this.p.landscape ? 0.38 : 0.52;
    choices.forEach((ch, i) => {
      const c = new Container();
      const glow = new Sprite(this.tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = color.gold;
      glow.blendMode = 'add';
      glow.scale.set(1.5);
      glow.alpha = 0;
      const g = new Graphics();
      drawChunky(g, { w: 118, h: 112, radius: 26, top: 0x3a4766, bottom: 0x1f2840, depth: 0x0d1220, depthPx: 12 });
      const num = gameText(String(ch.value), 64, { fillColor: 0xffffff });
      num.y = -10;
      const dots = new Graphics();
      const v = ch.value ?? 0;
      const per = Math.min(v, 5);
      for (let k = 0; k < v; k++) {
        const row = Math.floor(k / 5);
        const col = k % 5;
        const rowCount = row === 0 ? per : v - 5;
        dots.circle((col - (rowCount - 1) / 2) * 14, 30 + row * 12, 4.5).fill(color.goldLight);
      }
      c.addChild(glow, g, num, dots);
      const a = this.addActor(c);
      a.u = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1);
      a.v = BOARD_V;
      a.lift = -40;
      a.inner.scale.set(0);
      this.boards.push({ a, choice: ch, glow });
      this.tappable(a.inner, () => this.interactive && this.runner.choose(ch.id), { sound: 'press', haptic: 'tiny' });
      void this.tw.to(a.inner.scale, { x: 1, y: 1 }, { duration: 520, delay: 200 + i * 120, ease: Ease.elasticOut });
      void this.tw.to(a, { lift: 34 }, { duration: 520, delay: 200 + i * 120, ease: Ease.backOut });
    });
    this.sfx('magic', { delay: 0.2 });
  }

  spawnTargets(choices: ChallengeChoice[]) {
    const n = choices.length;
    choices.forEach((ch, i) => {
      const c = new Container();
      const glow = new Sprite(this.tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = color.mint;
      glow.blendMode = 'add';
      glow.scale.set(1.2);
      glow.alpha = 0.4;
      const g = new Graphics();
      g.circle(0, 0, 46).fill({ color: 0x0d1322, alpha: 0.75 });
      g.circle(0, 0, 46).stroke({ width: 7, color: color.gold });
      g.circle(0, 0, 34).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
      g.circle(0, 0, 22).stroke({ width: 3, color: color.mint, alpha: 0.8 });
      const num = gameText(String(ch.value), 48, { fillColor: 0xffffff });
      c.addChild(glow, g, num);
      const entry = { c, choice: ch, glow, x: 0, y: 0, i, n };
      this.targets.push(entry);
      this.placeTarget(entry);
      c.scale.set(0);
      this.targetsLayer.addChild(c);
      this.tappable(c, () => this.interactive && this.runner.choose(ch.id), { sound: 'press', haptic: 'tiny', squash: false });
      void this.tw.to(c.scale, { x: 1, y: 1 }, { duration: 500, delay: 200 + i * 140, ease: Ease.elasticOut });
    });
    this.sfx('magic', { delay: 0.2 });
  }

  placeTarget(t: { c: Container; x: number; y: number } & { i?: number; n?: number }) {
    const p = this.p;
    const n = (t as { n: number }).n;
    const i = (t as { i: number }).i;
    const f = n === 1 ? 0 : -1 + (2 * i) / (n - 1);
    t.x = p.cx + f * p.goalHalf * 0.64;
    t.y = p.goalY - p.goalH * 0.55;
    t.c.position.set(t.x, t.y);
    const k = (p.goalH / 2.2) / 46;
    t.c.children.forEach((ch) => ch.scale.set(ch === t.c.children[0] ? 1.2 * k : k));
  }

  /** crowd eruption (engine is not reachable from mode handlers) */
  engine_cheer() {
    this.engine.audio.cheer(1);
  }

  engine_music(intensity: number) {
    this.engine.audio.setMusicIntensity(intensity);
  }

  /** fire-and-forget commentator line (counting words, cheers) */
  speak(lines: VoiceLine[]) {
    void this.engine.speech.say(lines, 'commentator');
  }

  /** scene time in seconds (for mode animations) */
  get clock() {
    return this.time;
  }

  makeHandler(mode: FootballMode): ModeHandler | null {
    switch (mode) {
      case 'freekick':
        return new FreeKickMode(this);
      case 'dribble':
        return new DribbleMode(this);
      case 'passing':
        return new PassingMode(this);
      case 'keeper':
        return new KeeperMode(this);
      default:
        return null;
    }
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  async wrongFeedback(choiceId: string, ch?: LearningChallenge) {
    if (this.handler && ch) return this.handler.wrongFeedback(choiceId, ch);
    this.sfx('softBump');
    this.haptic('tiny');
    const board = this.boards.find((b) => b.choice.id === choiceId);
    const target = this.targets.find((t) => t.choice.id === choiceId);
    const ball = this.balls.find((b) => b.choiceId === choiceId);
    const el = board?.a.inner ?? target?.c ?? ball?.inner;
    void this.adam.encouraged();
    if (el) await this.wiggle(el);
  }

  async wiggle(el: Container) {
    const x0 = el.x;
    for (const dx of [-12, 12, -6, 6, 0]) await this.tw.to(el, { x: x0 + dx }, { duration: 55 });
  }

  async countTogether(ch: LearningChallenge) {
    this.adam.setPose('point');
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      a.num = i + 1;
      this.attachLabel(a, String(i + 1), true);
      void this.bounceBall(a);
      this.sfx('pop', { pitch: i * 2 });
      this.fx.burst(a.view.x, a.view.y - 20 * a.view.scale.y, { texture: this.tex('glow'), count: 6, tints: [color.gold], speed: [20, 80], life: [0.3, 0.5], scale: [0.2, 0.35], additive: true });
      await this.say([{ text: numberWord(i + 1).replace(/^./, (c) => c.toUpperCase()), lang: 'en' }], 'commentator');
    }
    this.counted = balls.length;
    this.adam.setPose('idle');
    if (ch.assets.count) this.pulseAnswer(ch, false);
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    if (this.handler) return this.handler.pulseAnswer(ch, strong);
    const id = ch.answer.id;
    const board = this.boards.find((b) => b.choice.id === id);
    const target = this.targets.find((t) => t.choice.id === id);
    const ball = this.balls.find((b) => b.choiceId === id);
    const glow = board?.glow ?? target?.glow;
    if (glow) {
      glow.alpha = 0.9;
      void this.tw.to(glow, { alpha: 0.15 }, { duration: strong ? 2600 : 1600, ease: Ease.quadIn });
    }
    const el = board?.a.inner ?? target?.c ?? ball?.inner;
    if (el) void this.pop(el, strong ? 1.18 : 1.1);
    if (ball) this.fx.burst(ball.view.x, ball.view.y - 20, { texture: this.tex('glow'), count: 10, tints: [color.gold, 0xffffff], speed: [20, 90], life: [0.4, 0.8], scale: [0.2, 0.4], additive: true });
  }

  async pop(el: Container, k: number) {
    const sx = el.scale.x;
    const sy = el.scale.y;
    await this.tw.to(el.scale, { x: sx * k, y: sy * k }, { duration: 140, ease: Ease.quadOut });
    await this.tw.to(el.scale, { x: sx, y: sy }, { duration: 420, ease: Ease.elasticOut });
  }

  /** THE GOAL SEQUENCE — a correct answer physically powers Adam's shot. */
  async succeed(choiceId: string, ch: LearningChallenge, stars: number) {
    if (this.handler) return this.handler.succeed(choiceId, ch, stars);
    const p = this.p;
    this.interactive = false;
    this.engine.audio.setMusicIntensity(0.4);

    // 1–2. disable others, chosen answer transforms into energy
    let src = { x: p.cx, y: p.y(BOARD_V) - 40 };
    let aimX = p.cx + (Math.random() < 0.5 ? -1 : 1) * p.goalHalf * 0.62;
    let aimY = p.goalY - p.goalH * (0.5 + Math.random() * 0.22);
    const board = this.boards.find((b) => b.choice.id === choiceId);
    const target = this.targets.find((t) => t.choice.id === choiceId);
    const ball = this.balls.find((b) => b.choiceId === choiceId);
    for (const b of this.boards) if (b !== board) void this.tw.to(b.a.inner, { alpha: 0 }, { duration: 300 });
    for (const t of this.targets) if (t !== target) void this.tw.to(t.c, { alpha: 0.15 }, { duration: 300 });
    if (board) {
      src = { x: board.a.view.x, y: board.a.view.y - 10 };
      board.glow.alpha = 1;
      void this.pop(board.a.inner, 1.25);
      this.sfx('magic');
      await this.wait(260);
      void this.tw.to(board.a.inner, { alpha: 0 }, { duration: 260 });
      void this.tw.to(board.a.inner.scale, { x: 1.6, y: 1.6 }, { duration: 260 });
    } else if (target) {
      src = { x: target.x, y: target.y };
      aimX = target.x;
      aimY = target.y;
      target.glow.alpha = 1;
      target.glow.tint = color.gold;
      void this.pop(target.c, 1.2);
      this.sfx('magic');
      await this.wait(260);
    } else if (ball) {
      src = { x: ball.view.x, y: ball.view.y - 20 };
      this.sfx('magic');
      // chosen colour ball rolls to the penalty spot and becomes the shot ball
      for (const b of this.balls) if (b !== ball) void this.tw.to(b.inner, { alpha: 0 }, { duration: 300 });
      await this.tw.to(ball, { u: 0, v: SPOT_V }, { duration: 500, ease: Ease.cubicInOut });
      this.removeActor(this.shotBall);
      this.shotBall = ball;
      this.actors = this.actors.filter((a) => a !== ball).concat(ball);
      this.balls = this.balls.filter((b) => b !== ball);
    }
    // other counting balls fuse into the shot ball
    for (const b of this.balls) void this.tw.to(b, { u: this.shotBall.u, v: this.shotBall.v, lift: 0 }, { duration: 600, ease: Ease.cubicIn }).then(() => (b.inner.alpha = 0));
    await this.chargeAdam(src);
    await this.shootAt(aimX, aimY);
    if (target) {
      this.fx.burst(target.x, target.y, { texture: this.tex('ring'), count: 3, tints: [color.gold], speed: [10, 30], life: [0.4, 0.6], scale: [0.4, 1.2], scaleEnd: 3, additive: true });
      void this.tw.to(target.c, { alpha: 0 }, { duration: 400 });
    }
    await this.goalScored(aimX, aimY);
    await this.celebrateAndReset(stars);
  }

  /** Steps 3–5: the answer becomes energy that flies into Adam; the kick-power bar fills. */
  async chargeAdam(src: { x: number; y: number }) {
    this.interactive = false;
    this.engine.audio.setMusicIntensity(0.4);
    this.fx.burst(src.x, src.y, { texture: this.tex('glow'), count: 18, tints: [color.mint, color.gold, color.blue], speed: [60, 220], life: [0.4, 0.8], scale: [0.25, 0.5], additive: true });
    const adamChest = { x: this.adamA.view.x, y: this.adamA.view.y - 120 * this.adamA.view.scale.y };
    const orbs: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      const orb = new Sprite(this.tex('glow'));
      orb.anchor.set(0.5);
      orb.blendMode = 'add';
      orb.tint = i % 2 ? color.mint : color.gold;
      orb.scale.set(0.45);
      orb.position.set(src.x, src.y);
      this.world.addChild(orb);
      const cx = lerp(src.x, adamChest.x, 0.5) + (i - 2) * 50;
      const cy = Math.min(src.y, adamChest.y) - 60;
      orbs.push(
        this.tw
          .progress({
            duration: 520,
            delay: i * 70,
            ease: Ease.cubicIn,
            onUpdate: (t) => {
              orb.x = bezier2(src.x, cx, adamChest.x, t);
              orb.y = bezier2(src.y, cy, adamChest.y, t);
            },
          })
          .then(() => orb.destroy()),
      );
    }
    this.sfx('power');
    await this.guard(Promise.all(orbs).then(() => undefined));
    this.adam.setAura(1);
    this.adam.setExpression('determined');
    this.haptic('tiny');
    this.engine.audio.setMusicIntensity(1);
    void this.tw.to(this.power, { alpha: 1 }, { duration: 200 });
    await this.tw.progress({ duration: 700, ease: Ease.cubicOut, onUpdate: (t) => this.setPower(t) });
    this.sfx('sparkle');
  }

  /**
   * Steps 6–11: camera push, run-up to wherever the shot ball is, kick, curved flight into
   * the goal while the keeper dives. `curve` bends the ball (free kicks curl harder),
   * `arc` lifts it (over the wall), `onFlight` lets modes react mid-flight (wall jumps).
   */
  async shootAt(aimX: number, aimY: number, o: { curve?: number; arc?: number; diveDir?: number; runUp?: boolean; onFlight?: (t: number) => void } = {}) {
    const p = this.p;
    await this.camera.focus(this.adamA.view.x, this.adamA.view.y - 110 * this.adamA.view.scale.y, 1.28, 450);
    this.keeperSway = true;
    const ballA = this.shotBall;
    if (o.runUp !== false) {
      this.adam.setPose('run');
      void this.camera.panTo(p.cx, p.y(Math.min(0.62, ballA.v + 0.07)) - 60, 1.12, 750);
      await this.tw.to(this.adamA, { u: ballA.u - 0.08, v: ballA.v + 0.07 }, { duration: 750, ease: Ease.quadIn });
    }
    this.keeperSway = false;
    this.adam.setPose('idle');
    const diveDir = o.diveDir ?? (Math.random() < 0.6 ? -Math.sign(aimX - p.cx || 1) : Math.sign(aimX - p.cx || 1));
    await this.adam.kick(() => {
      this.sfx('kick');
      this.haptic('medium');
      this.camera.shake(6, 200);
      this.fx.burst(ballA.view.x, ballA.view.y, { texture: this.tex('smoke'), count: 8, tints: [0xffffff], speed: [40, 120], angle: [Math.PI, Math.PI * 2], life: [0.3, 0.6], scale: [0.4, 0.8] });
    });
    this.adam.setAura(0);
    void this.tw.to(this.power, { alpha: 0 }, { duration: 300 });
    this.ballFollow = null;
    const start = { x: ballA.view.x, y: ballA.view.y - 17 * ballA.view.scale.y, s: ballA.view.scale.x };
    ballA.free = true;
    ballA.k = start.s;
    ballA.x = start.x;
    ballA.y = start.y;
    const shadow = (ballA.inner.children[0] as Container).getChildByLabel('shadow');
    if (shadow) shadow.visible = false;
    const sprite = (ballA.inner.children[0] as Container).children[1];
    sprite.y = 0;
    const side = aimX < p.cx ? -1 : 1;
    const ctrlX = (start.x + aimX) / 2 + side * p.U * (o.curve ?? 0.22);
    const ctrlY = Math.min(start.y, aimY) - p.U * (o.arc ?? 0.25);
    const endS = p.s(0) * 0.7;
    this.trailOn = true;
    this.sfx('whoosh');
    void this.camera.panTo(p.cx, p.goalY - p.goalH * 0.45, 1.3, 650, Ease.cubicOut);
    setTimeout(() => this.alive && void this.keeperDive(diveDir), 140);
    await this.tw.progress({
      duration: 650,
      ease: Ease.quadOut,
      onUpdate: (t) => {
        ballA.x = bezier2(start.x, ctrlX, aimX, t);
        ballA.y = bezier2(start.y, ctrlY, aimY, t);
        ballA.k = lerp(start.s, endS, t);
        sprite.rotation += 0.35;
        o.onFlight?.(t);
      },
    });
    this.trailOn = false;
  }

  /** Steps 12–18: net bulges, shake, crowd erupts, scoreboard, GOOOOAL, stars burst. */
  async goalScored(aimX: number, aimY: number) {
    const p = this.p;
    const ballA = this.shotBall;
    this.stadium.hitNet(aimX, aimY);
    this.sfx('net');
    this.sfx('goalHorn', { delay: 0.1 });
    this.haptic('celebrate');
    this.camera.shake(14, 500);
    this.engine.audio.cheer(1);
    this.stadium.goal();
    void this.tw.to(ballA, { y: aimY + p.goalH * 0.3, x: aimX + (aimX - p.cx) * 0.05 }, { duration: 500, ease: Ease.bounceOut });
    this.score.adam += 1;
    useGame.getState().patchHud({ adam: this.score.adam });
    this.stadium.setLedMessage('⚽ GOOOOAL!  ★  هدددف!  ★  ADAM ⚽  ★  GOAL!  ★');
    this.celebrate(aimX, aimY, 1.3);
    this.fx.burst(aimX, aimY, { texture: this.tex('goldStar'), count: 14, speed: [180, 380], gravity: 300, life: [0.8, 1.4], scale: [0.2, 0.4] });
    void this.bigText('GOOOOAL!', { y: this.height * 0.3 });
    this.engine.speech.say([{ text: 'Goal!', lang: 'en' }, { text: 'هدددف!', lang: 'ar' }], 'commentator');
    await this.wait(900);
  }

  /** Steps 19–20 + reset: Adam turns and celebrates, stars fly to the HUD, back to his mark. */
  async celebrateAndReset(stars: number) {
    void this.camera.focus(this.adamA.view.x, this.adamA.view.y - 100 * this.adamA.view.scale.y, 1.35, 600);
    if (this.adam.view !== 'front') await this.adam.turnTo('front');
    const celebrate = this.adam.celebrate(this.adam.celebrationStyle, 1500);
    await this.wait(400);
    await this.flyStarsToHud(this.adamA.view.x, this.adamA.view.y - 150 * this.adamA.view.scale.y, stars);
    await this.guard(celebrate);
    this.engine.audio.setMusicIntensity(0);
    await this.camera.reset(600);
    this.stadium.setLedMessage('⚽ ADAM  ★  GOAL STADIUM  ★  آدم بطل الملعب  ★');
    await this.adam.turnTo('back');
    this.adam.setPose('walk');
    void this.keeperGetUp();
    await this.tw.to(this.adamA, { u: this.home.u, v: this.home.v }, { duration: 700, ease: Ease.quadInOut });
    this.adam.setPose('idle');
    this.adam.setExpression('happy');
    this.resetShotBall();
  }

  async keeperDive(dir: number) {
    const kA = this.keeperA;
    this.keeper.setPose('victory');
    this.sfx('swoosh', { volume: 0.6 });
    void this.tw.to(this.keeper, { rotation: dir * 1.25 }, { duration: 380, ease: Ease.quadOut });
    await this.tw.to(kA, { u: dir * 0.32, lift: 40 }, { duration: 300, ease: Ease.quadOut });
    await this.tw.to(kA, { lift: 0 }, { duration: 260, ease: Ease.quadIn });
    this.sfx('thud', { volume: 0.5 });
    this.keeper.setPose('sad');
  }

  async keeperGetUp() {
    await this.tw.to(this.keeper, { rotation: 0 }, { duration: 400, ease: Ease.backOut });
    this.keeper.setPose('ready');
    await this.tw.to(this.keeperA, { u: 0, lift: 0 }, { duration: 500 });
    this.keeperSway = true;
  }

  setPower(v: number) {
    this.powerLevel = v;
    this.drawPower();
  }

  drawPower() {
    const g = this.powerG;
    const w = Math.min(this.width * 0.62, 340);
    const h = 22;
    g.clear();
    g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, h).fill({ color: 0x000000, alpha: 0.7 }).stroke({ width: 2, color: color.primary, alpha: 0.4 });
    const fw = Math.max(h, w * this.powerLevel);
    if (this.powerLevel > 0.01) {
      g.roundRect(-w / 2, -h / 2, fw, h, h / 2).fill(rGrad([[0, color.gold], [1, color.mint]], 0.9, 0.5));
      g.roundRect(-w / 2, -h / 2, fw, h, h / 2).fill({ color: color.mint, alpha: 0.35 });
      g.roundRect(-w / 2 + 4, -h / 2 + 3, fw - 8, h * 0.3, h * 0.15).fill({ color: 0xffffff, alpha: 0.35 });
    }
    // bolt icon
    g.poly([-w / 2 - 34, -12, -w / 2 - 20, -12, -w / 2 - 26, -1, -w / 2 - 16, -1, -w / 2 - 34, 16, -w / 2 - 29, 3, -w / 2 - 38, 3]).fill(color.gold);
  }

  resetShotBall() {
    // remove spent actors, create a fresh ball on the spot
    this.handler?.cleanup();
    this.handler = null;
    this.ballFollow = null;
    for (const b of this.balls) this.removeActor(b);
    this.balls = [];
    for (const b of this.boards) this.removeActor(b.a);
    this.boards = [];
    for (const t of this.targets) t.c.destroy({ children: true });
    this.targets = [];
    if (this.actors.includes(this.shotBall)) this.removeActor(this.shotBall);
    const s = new Sprite(this.tex('football'));
    s.anchor.set(0.5);
    s.scale.set(0.28);
    this.shotBall = this.addActor(this.ballView(s));
    this.shotBall.v = SPOT_V;
    this.shotBall.inner.alpha = 0;
    void this.tw.to(this.shotBall.inner, { alpha: 1 }, { duration: 300 });
  }

  removeActor(a: Actor) {
    if (a.view.destroyed) return;
    this.actors = this.actors.filter((x) => x !== a);
    this.tw.drop(a);
    this.tw.drop(a.hop);
    a.view.destroy({ children: true });
  }

  clear() {
    /* objects are cleaned up in resetShotBall after the celebration */
  }

  exit() {
    this.engine.audio.stopCrowd();
    this.engine.audio.setMusicIntensity(0);
  }
}

export { Text, font };
