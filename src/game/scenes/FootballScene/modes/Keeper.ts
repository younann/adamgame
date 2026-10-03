import { Container, Graphics } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import { Ease, bezier2, lerp } from '../../../engine/Tween';
import { adamLook } from '../../../entities/Adam';
import type { Kid } from '../../../entities/Kid';
import type { Actor } from '../Actor';
import { rivalLook } from '../looks';
import { SPOT_V } from '../consts';
import { ModeBase } from './ModeBase';

interface Zone {
  c: Container;
  choice: ChallengeChoice;
  glow: ReturnType<ModeBase['glow']>;
  f: number; // -1 left, 0 middle, 1 right
  x: number;
  y: number;
}

/**
 * GOALKEEPER — the rivals get a penalty and Adam pulls on the gloves. The answer tells him
 * which way to dive: the right zone → SUPER SAVE (still a big celebration).
 */
export class KeeperMode extends ModeBase {
  readonly id = 'keeper' as const;
  private zones: Zone[] = [];
  private shooter!: { kid: Kid; a: Actor };

  async present(_ch: LearningChallenge, choices: ChallengeChoice[]) {
    const s = this.s;
    // the rival keeper jogs off; Adam runs into goal and gloves up
    s.keeperSway = false;
    s.keeper.setPose('run');
    void s.tw.to(s.keeperA, { u: 1.2 }, { duration: 900, ease: Ease.quadIn });
    s.adam.setPose('run');
    void s.camera.panTo(s.p.cx, s.p.y(0.25) - 60, 1.05, 900);
    await s.tw.to(s.adamA, { u: 0, v: -0.01 }, { duration: 1000, ease: Ease.quadInOut });
    s.keeperA.inner.alpha = 0;
    s.adam.setLook({ ...s.adam.look, gloves: color.mint, bigGloves: true });
    await s.adam.turnTo('front');
    s.adam.setPose('ready');
    s.adam.setExpression('determined');
    s.sfx('magic');
    s.fx.burst(s.adamA.view.x, s.adamA.view.y - 60, { texture: s.tex('star'), count: 14, tints: [color.mint, color.gold], speed: [60, 180], life: [0.4, 0.8], scale: [0.2, 0.35] });
    // rival penalty taker behind the ball
    this.shooter = this.addKid(rivalLook(1), 0.07, SPOT_V + 0.09, 1);
    this.shooter.kid.setView('back');
    // dive zones in the goal mouth
    const fs = choices.length === 2 ? [-1, 1] : [-1, 0, 1];
    choices.forEach((choice, i) => {
      const c = new Container();
      const glow = this.glow(color.mint, 1.2);
      const g = new Graphics();
      g.circle(0, 0, 44).fill({ color: 0x0d1322, alpha: 0.6 }).stroke({ width: 6, color: color.mint });
      g.circle(0, 0, 34).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
      c.addChild(glow, g, this.choiceArt(choice, 52));
      const z: Zone = { c, choice, glow, f: fs[i], x: 0, y: 0 };
      this.zones.push(z);
      c.scale.set(0);
      s.targetsLayer.addChild(c);
      this.extras.push(c);
      this.answerTap(c, choice.id);
      void s.tw.to(c.scale, { x: this.zoneScale(), y: this.zoneScale() }, { duration: 500, delay: 200 + i * 140, ease: Ease.elasticOut });
    });
    this.layout();
    s.setA11yChoices(choices.map((c) => ({ id: c.id, label: c.ariaLabel })), (id) => s.runner.choose(id));
    await s.wait(700);
  }

  private zoneScale() {
    return (this.s.p.goalH / 3.6) / 44;
  }

  layout() {
    const p = this.s.p;
    for (const z of this.zones) {
      z.x = p.cx + z.f * p.goalHalf * 0.72;
      z.y = p.goalY - p.goalH * (z.f === 0 ? 0.84 : 0.4);
      z.c.position.set(z.x, z.y);
    }
  }

  async wrongFeedback(choiceId: string) {
    const s = this.s;
    s.sfx('softBump');
    s.haptic('tiny');
    const z = this.zones.find((x) => x.choice.id === choiceId);
    void s.adam.jump(20);
    if (z) await s.wiggle(z.c);
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const z = this.zones.find((x) => x.choice.id === ch.answer.id);
    if (!z) return;
    this.pulseGlow(z.glow, strong);
    void this.s.pop(z.c, strong ? 1.2 : 1.1);
  }

  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    const s = this.s;
    const p = s.p;
    const z = this.zones.find((x) => x.choice.id === choiceId) ?? this.zones[0];
    for (const o of this.zones) if (o !== z) void s.tw.to(o.c, { alpha: 0.15 }, { duration: 300 });
    z.glow.tint = color.gold;
    this.pulseGlow(z.glow, true);
    void s.pop(z.c, 1.2);
    s.sfx('magic');
    await s.chargeAdam({ x: z.x, y: z.y });
    void s.tw.to(s.power, { alpha: 0 }, { duration: 300 });
    s.adam.setAura(1, color.mint);
    // the rival runs up and shoots toward the zone
    const sh = this.shooter;
    sh.kid.setPose('run');
    void s.camera.panTo(p.cx, p.goalY - p.goalH * 0.3, 1.25, 700);
    await s.tw.to(sh.a, { u: s.shotBall.u + 0.06, v: s.shotBall.v + 0.06 }, { duration: 600, ease: Ease.quadIn });
    sh.kid.setPose('idle');
    await sh.kid.kick(() => {
      s.sfx('kick');
      s.camera.shake(5, 180);
    });
    const ball = s.shotBall;
    const start = { x: ball.view.x, y: ball.view.y - 17 * ball.view.scale.y, k: ball.view.scale.x };
    ball.free = true;
    ball.x = start.x;
    ball.y = start.y;
    ball.k = start.k;
    const shadow = (ball.inner.children[0] as Container).getChildByLabel('shadow');
    if (shadow) shadow.visible = false;
    const sprite = (ball.inner.children[0] as Container).children[1];
    sprite.y = 0;
    s.trailOn = true;
    s.sfx('whoosh');
    // Adam dives the right way
    const dir = z.f;
    s.adam.setPose('victory');
    void s.tw.to(s.adam, { rotation: dir * 1.15 }, { duration: 360, ease: Ease.quadOut });
    void s.tw.to(s.adamA, { u: dir * 0.3, lift: dir === 0 ? 110 : 45 }, { duration: 360, ease: Ease.quadOut });
    const cX = (start.x + z.x) / 2;
    const cY = Math.min(start.y, z.y) - p.U * 0.15;
    const endK = p.s(0) * 0.75;
    await s.tw.progress({
      duration: 520,
      ease: Ease.quadOut,
      onUpdate: (t) => {
        ball.x = bezier2(start.x, cX, z.x, t);
        ball.y = bezier2(start.y, cY, z.y, t);
        ball.k = lerp(start.k, endK, t);
        sprite.rotation += 0.3;
      },
    });
    s.trailOn = false;
    // SAVE!
    s.sfx('thud');
    s.sfx('post', { delay: 0.05 });
    s.haptic('celebrate');
    s.camera.shake(10, 400);
    s.engine_cheer();
    s.stadium.goal();
    s.stadium.setLedMessage('🧤 SUPER SAVE!  ★  صدّة رائعة!  ★  ADAM  ★');
    s.celebrate(z.x, z.y, 1.2);
    void s.bigText('SUPER SAVE!', { y: s.height * 0.3, fill: color.mint });
    s.speak([{ text: 'Super save!', lang: 'en' }, { text: 'صدّة رائعة يا آدم!', lang: 'ar' }]);
    void s.tw.to(z.c, { alpha: 0 }, { duration: 300 });
    // Adam lands holding the ball
    await s.tw.to(s.adamA, { lift: 0 }, { duration: 280, ease: Ease.quadIn });
    void s.tw.to(ball, { x: s.adamA.view.x, y: s.adamA.view.y - 70 * s.adamA.view.scale.y }, { duration: 250 });
    sh.kid.setPose('sad');
    sh.kid.setExpression('surprised');
    await s.wait(700);
    await s.tw.to(s.adam, { rotation: 0 }, { duration: 300, ease: Ease.backOut });
    s.adam.setAura(0);
    void s.camera.focus(s.adamA.view.x, s.adamA.view.y - 100 * s.adamA.view.scale.y, 1.3, 600);
    const party = s.adam.celebrate(s.adam.celebrationStyle, 1500);
    await s.wait(300);
    await s.flyStarsToHud(s.adamA.view.x, s.adamA.view.y - 150 * s.adamA.view.scale.y, stars);
    await s.guard(party);
    s.engine_music(0);
    // back to the normal match: gloves off, keeper returns
    await s.camera.reset(600);
    s.stadium.setLedMessage('⚽ ADAM  ★  GOAL STADIUM  ★  آدم بطل الملعب  ★');
    s.adam.setLook(adamLook(useGame.getState().save.avatar));
    await s.adam.turnTo('back');
    s.adam.setPose('walk');
    sh.kid.setPose('run');
    void s.tw.to(sh.a, { u: 1.6 }, { duration: 1200 });
    s.keeperA.inner.alpha = 1;
    s.keeperA.u = -1.2;
    s.keeper.setPose('run');
    void s.tw.to(s.keeperA, { u: 0 }, { duration: 900 }).then(() => {
      s.keeper.setPose('ready');
      s.keeperSway = true;
    });
    await s.tw.to(s.adamA, { u: s.home.u, v: s.home.v }, { duration: 900, ease: Ease.quadInOut });
    s.adam.setPose('idle');
    s.adam.setExpression('happy');
    s.resetShotBall();
  }

  cleanup() {
    this.zones = [];
    super.cleanup();
  }
}
