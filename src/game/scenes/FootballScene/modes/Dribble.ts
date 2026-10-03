import type { Container, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge } from '@/learning/types';
import { numberWord } from '@/learning/engine/ChallengeGenerator';
import { Ease } from '../../../engine/Tween';
import type { Actor } from '../Actor';
import { drawCone } from '../looks';
import { ModeBase } from './ModeBase';

interface Cone {
  a: Actor;
  glow: Sprite;
  label: number | null;
  choice?: ChallengeChoice;
  visited: boolean;
}

/**
 * DRIBBLING — Adam weaves through a slalom of cones. For "what comes next?" the slalom cones
 * show the sequence (tap them in order for free counting practice: Adam dribbles round each),
 * then the gate cones hold the choices. The right cone sends Adam through for a shot.
 */
export class DribbleMode extends ModeBase {
  readonly id = 'dribble' as const;
  private path: Cone[] = [];
  private gate: Cone[] = [];
  private next = 0;
  private dribbling = false;
  private touchT = 0;

  async present(ch: LearningChallenge, choices: ChallengeChoice[]) {
    const s = this.s;
    const L = s.p.landscape;
    const ans = ch.answer.value ?? 0;
    const seq = ch.type === 'order' ? [ans - 3, ans - 2, ans - 1] : [null, null, null];
    const pathPos: [number, number][] = L
      ? [[-0.02, 0.64], [-0.2, 0.55], [0.02, 0.46]]
      : [[-0.02, 0.64], [-0.3, 0.55], [0.0, 0.46]];
    // ball to Adam's feet
    this.attachBall();
    seq.forEach((n, i) => {
      const { view, glow } = drawCone(n === null ? null : String(n), s.tex('glow'));
      const a = this.addActorView(view, i % 2 ? 1.4 : -1.4, pathPos[i][1]);
      const cone: Cone = { a, glow, label: n, visited: false };
      this.path.push(cone);
      void s.tw.to(a, { u: pathPos[i][0] }, { duration: 600, delay: i * 120, ease: Ease.backOut });
      if (n !== null) s.tappable(a.inner, () => this.onPathTap(cone), { sound: null, haptic: 'tiny' });
    });
    const spread = L ? 0.3 : 0.4;
    choices.forEach((choice, i) => {
      const { view, glow } = drawCone(String(choice.value ?? choice.label), s.tex('glow'));
      const u = choices.length === 1 ? 0 : -spread + (2 * spread * i) / (choices.length - 1);
      const a = this.addActorView(view, u, 0.33);
      a.inner.scale.set(0);
      a.choiceId = choice.id;
      this.gate.push({ a, glow, label: choice.value ?? null, choice, visited: false });
      this.answerTap(a.inner, choice.id);
      void s.tw.to(a.inner.scale, { x: 1, y: 1 }, { duration: 520, delay: 500 + i * 140, ease: Ease.elasticOut });
    });
    s.sfx('magic', { delay: 0.5 });
    s.setA11yChoices(choices.map((c) => ({ id: c.id, label: c.ariaLabel })), (id) => s.runner.choose(id));
    await s.wait(900);
    if (seq[0] !== null) this.pulseGlowStrongless(this.path[0]);
  }

  private attachBall() {
    const s = this.s;
    s.ballFollow = () => {
      const b = s.shotBall;
      const a = s.adamA;
      b.u = a.u + 0.05;
      b.v = a.v - 0.035;
      b.lift = this.dribbling ? Math.abs(Math.sin(s.clock * 14)) * 9 : 0;
    };
  }

  private pulseGlowStrongless(c: Cone) {
    this.pulseGlow(c.glow, false);
    void this.s.pop(c.a.inner, 1.1);
  }

  tick(dt: number) {
    super.tick(dt);
    if (this.dribbling) {
      this.touchT -= dt;
      const sprite = (this.s.shotBall.inner.children[0] as Container | undefined)?.children[1];
      if (sprite) sprite.rotation += dt * 9;
      if (this.touchT <= 0) {
        this.touchT = 0.28;
        this.s.sfx('tap', { volume: 0.5, pitch: -6 });
      }
    }
  }

  /** Free counting practice: tap the slalom cones in order and Adam dribbles round each. */
  private async onPathTap(c: Cone) {
    const s = this.s;
    if (this.dribbling) return;
    const expected = this.path[this.next];
    if (c !== expected) {
      s.sfx('softBump', { volume: 0.6 });
      void s.wiggle(c.a.inner);
      if (expected) this.pulseGlowStrongless(expected);
      return;
    }
    this.next++;
    c.visited = true;
    s.sfx('pop', { pitch: this.next * 2 });
    this.pulseGlow(c.glow, false);
    if (c.label !== null) s.speak([{ text: cap(numberWord(c.label)), lang: 'en' }]);
    await this.dribbleRound(c);
    if (this.next >= this.path.length) {
      for (const g of this.gate) void s.pop(g.a.inner, 1.1);
    } else this.pulseGlowStrongless(this.path[this.next]);
  }

  /** Adam dribbles to the side of a cone, ball at his feet with little touches. */
  private async dribbleRound(c: Cone) {
    const s = this.s;
    this.dribbling = true;
    s.adam.setPose('run');
    s.camera.follow(s.adamA.view, 0.06);
    const side = c.a.u <= s.adamA.u ? 1 : -1;
    await s.tw.to(s.adamA, { u: c.a.u + side * 0.12, v: c.a.v + 0.04 }, { duration: 650, ease: Ease.sineInOut });
    this.dribbling = false;
    s.adam.setPose('idle');
  }

  async wrongFeedback(choiceId: string) {
    const s = this.s;
    s.sfx('softBump');
    s.haptic('tiny');
    const g = this.gate.find((x) => x.choice?.id === choiceId);
    void s.adam.encouraged();
    if (g) await s.wiggle(g.a.inner);
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const g = this.gate.find((x) => x.choice?.id === ch.answer.id);
    if (!g) return;
    this.pulseGlow(g.glow, strong);
    void this.s.pop(g.a.inner, strong ? 1.2 : 1.1);
  }

  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    const s = this.s;
    const g = this.gate.find((x) => x.choice?.id === choiceId) ?? this.gate[0];
    for (const o of this.gate) if (o !== g) void s.tw.to(o.a.inner, { alpha: 0.2 }, { duration: 300 });
    g.glow.tint = color.mint;
    this.pulseGlow(g.glow, true);
    void s.pop(g.a.inner, 1.2);
    s.sfx('magic');
    // weave through any cones not yet visited, then round the chosen cone
    s.speak([{ text: 'راوغ يا آدم!', lang: 'ar' }]);
    for (const c of this.path) if (!c.visited) {
      c.visited = true;
      this.pulseGlow(c.glow, false);
      await this.dribbleRound(c);
    }
    await this.dribbleRound(g);
    s.camera.follow(null);
    await s.chargeAdam({ x: g.a.view.x, y: g.a.view.y - 90 * g.a.view.scale.y });
    const p = s.p;
    const side = Math.random() < 0.5 ? -1 : 1;
    s.ballFollow = null;
    await s.shootAt(p.cx + side * p.goalHalf * 0.6, p.goalY - p.goalH * 0.55, { runUp: true });
    await s.goalScored(p.cx + side * p.goalHalf * 0.6, p.goalY - p.goalH * 0.55);
    await s.celebrateAndReset(stars);
  }

  cleanup() {
    this.s.ballFollow = null;
    this.s.camera.follow(null);
    this.path = [];
    this.gate = [];
    super.cleanup();
  }
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
