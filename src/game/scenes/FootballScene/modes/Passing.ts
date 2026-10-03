import { Container, Graphics } from 'pixi.js';
import { color, conceptColor } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge } from '@/learning/types';
import { Ease } from '../../../engine/Tween';
import type { Kid } from '../../../entities/Kid';
import type { Actor } from '../Actor';
import { conceptCard, teammateLook } from '../looks';
import { SPOT_V } from '../consts';
import { ModeBase } from './ModeBase';

interface Mate {
  kid: Kid;
  a: Actor;
  card: Container;
  glow: ReturnType<ModeBase['glow']>;
  choice: ChallengeChoice;
}

/**
 * PASSING — teammates spread across the pitch, each holding up a card (a colour, a picture
 * word, a number). "Find blue!" → Adam passes to that teammate, gets a one-two back, and shoots.
 */
export class PassingMode extends ModeBase {
  readonly id = 'passing' as const;
  private mates: Mate[] = [];

  async present(_ch: LearningChallenge, choices: ChallengeChoice[]) {
    const s = this.s;
    const L = s.p.landscape;
    const pos: [number, number][] =
      choices.length === 2 ? [[-0.38, 0.34], [0.38, 0.34]] : [[-0.42, 0.38], [0, 0.26], [0.42, 0.38]];
    choices.forEach((choice, i) => {
      const shirt = choice.visual.kind === 'color' ? (conceptColor[choice.visual.key] ?? color.blue) : color.blue;
      const [u0, v] = pos[i];
      const u = u0 * (L ? 0.62 : 1);
      const { kid, a } = this.addKid(teammateLook(i, shirt), u < 0 ? -1.5 : 1.5, v, 0.92);
      kid.setPose('run');
      // the card floats above the teammate's head
      const art = this.choiceArt(choice, 58);
      const { view: card, glow } = conceptCard(art, s.tex('glow'));
      card.y = -270;
      card.scale.set(0);
      card.label = 'card';
      a.inner.addChild(card);
      const hit = new Graphics().roundRect(-70, -360, 140, 360, 30).fill({ color: 0xffffff, alpha: 0.001 });
      a.inner.addChildAt(hit, 0);
      this.answerTap(a.inner, choice.id);
      this.mates.push({ kid, a, card, glow, choice });
      void s.tw.to(a, { u }, { duration: 750, delay: i * 140, ease: Ease.cubicOut }).then(() => {
        kid.setPose('point');
        kid.setExpression('excited');
        void s.tw.to(card.scale, { x: 1.35, y: 1.35 }, { duration: 480, ease: Ease.elasticOut });
        s.sfx('pop', { pitch: i * 2 });
      });
    });
    s.setA11yChoices(choices.map((c) => ({ id: c.id, label: c.ariaLabel })), (id) => s.runner.choose(id));
    await s.wait(1100);
  }

  tick(dt: number) {
    super.tick(dt);
    const t = this.s.clock;
    for (const [i, m] of this.mates.entries()) if (!m.card.destroyed) m.card.y = -290 + Math.sin(t * 2.4 + i) * 8;
  }

  /** Ball rolls along the grass between two pitch points. */
  private async roll(toU: number, toV: number, ms: number) {
    const s = this.s;
    const b = s.shotBall;
    const sprite = (b.inner.children[0] as Container | undefined)?.children[1];
    await s.tw.to(b, { u: toU, v: toV, lift: 0 }, { duration: ms, ease: Ease.quadOut, onUpdate: () => sprite && (sprite.rotation += 0.25) });
  }

  async wrongFeedback(choiceId: string) {
    const s = this.s;
    const m = this.mates.find((x) => x.choice.id === choiceId);
    s.haptic('tiny');
    if (!m) return;
    // a soft pass that drifts wide; the teammate shrugs kindly and sends it back
    s.adam.setPose('idle');
    s.sfx('kick', { volume: 0.4 });
    await this.roll(s.shotBall.u + (m.a.u - s.shotBall.u) * 0.55 + 0.12, s.shotBall.v + (m.a.v - s.shotBall.v) * 0.55, 600);
    s.sfx('softBump');
    m.kid.setExpression('thinking');
    void m.kid.encouraged();
    void s.adam.encouraged();
    await s.wiggle(m.card);
    await this.roll(0, SPOT_V, 500);
    m.kid.setExpression('happy');
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const m = this.mates.find((x) => x.choice.id === ch.answer.id);
    if (!m) return;
    this.pulseGlow(m.glow, strong);
    void this.s.pop(m.card, strong ? 1.2 : 1.1);
    void m.kid.jump(30);
  }

  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    const s = this.s;
    const m = this.mates.find((x) => x.choice.id === choiceId) ?? this.mates[0];
    for (const o of this.mates) if (o !== m) void s.tw.to(o.card, { alpha: 0.25 }, { duration: 300 });
    this.pulseGlow(m.glow, true);
    void s.pop(m.card, 1.25);
    s.sfx('magic');
    // Adam steps up and plays the pass along the ground
    s.adam.setPose('run');
    await s.tw.to(s.adamA, { u: s.shotBall.u - 0.08, v: s.shotBall.v + 0.07 }, { duration: 550, ease: Ease.quadIn });
    s.adam.setPose('idle');
    await s.adam.kick(() => {
      s.sfx('kick', { volume: 0.7 });
      s.haptic('tiny');
    });
    s.speak([{ text: 'Pass!', lang: 'en' }]);
    void s.camera.focus(s.p.x(m.a.u, m.a.v), s.p.y(m.a.v) - 80, 1.15, 600);
    await this.roll(m.a.u - 0.03, m.a.v + 0.03, 650);
    // teammate traps it and cheers; the card bursts into energy for Adam
    s.sfx('bounce', { volume: 0.5 });
    m.kid.setPose('cheer');
    void m.kid.jump(40);
    const cardPos = { x: m.a.view.x, y: m.a.view.y - 270 * m.a.view.scale.y };
    void s.tw.to(m.card.scale, { x: 0, y: 0 }, { duration: 300, ease: Ease.backIn });
    await s.camera.reset(400);
    await s.chargeAdam(cardPos);
    // one-two: the ball comes back into Adam's path
    m.kid.setPose('idle');
    await m.kid.kick(() => s.sfx('kick', { volume: 0.5 }));
    const backU = m.a.u * 0.3;
    await this.roll(backU, 0.44, 600);
    const p = s.p;
    const side = backU <= 0 ? 1 : -1; // shoot across goal
    const aimX = p.cx + side * p.goalHalf * 0.6;
    const aimY = p.goalY - p.goalH * 0.55;
    await s.shootAt(aimX, aimY);
    for (const o of this.mates) o.kid.setPose('cheer');
    await s.goalScored(aimX, aimY);
    for (const [i, o] of this.mates.entries()) {
      void s.tw.to(o.a, { u: o.a.u < 0 ? -1.6 : 1.6 }, { duration: 1300, delay: 600 + i * 100 });
      o.kid.setPose('run');
    }
    await s.celebrateAndReset(stars);
  }

  cleanup() {
    this.mates = [];
    super.cleanup();
  }
}
