import { Container, Graphics } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge } from '@/learning/types';
import { Ease } from '../../../engine/Tween';
import type { Kid } from '../../../entities/Kid';
import type { Actor } from '../Actor';
import { rivalLook } from '../looks';
import { ModeBase } from './ModeBase';

interface DirTarget {
  c: Container;
  choice: ChallengeChoice;
  glow: ReturnType<ModeBase['glow']>;
  slot: 'left' | 'over' | 'right';
  x: number;
  y: number;
}

/**
 * FREE KICK — a defensive wall stands between the ball and the goal. The answer chooses the
 * shot direction: curl it around the left, the right, or loft it over the wall.
 */
export class FreeKickMode extends ModeBase {
  readonly id = 'freekick' as const;
  private wall: { kid: Kid; a: Actor }[] = [];
  private targets: DirTarget[] = [];
  private paths = new Graphics();
  private side = Math.random() < 0.5 ? -1 : 1;
  private ballU = 0;
  private ballV = 0.62;

  async present(_ch: LearningChallenge, choices: ChallengeChoice[]) {
    const s = this.s;
    // ball moves to an off-centre free-kick spot
    this.ballU = this.side * (s.p.landscape ? 0.16 : 0.22);
    this.ballV = 0.6;
    await s.tw.to(s.shotBall, { u: this.ballU, v: this.ballV }, { duration: 500, ease: Ease.cubicInOut });
    s.home = { u: this.ballU - 0.12, v: this.ballV + 0.12 };
    s.adam.setPose('walk');
    await s.tw.to(s.adamA, { u: s.home.u, v: s.home.v }, { duration: 450 });
    s.adam.setPose('idle');

    // the wall runs in and lines up between ball and goal
    s.sfx('whistle', { volume: 0.6 });
    const wallU = this.ballU * 0.45;
    for (let i = 0; i < 4; i++) {
      const w = this.addKid(rivalLook(i), (i % 2 ? 1.5 : -1.5), 0.36, 0.95);
      w.kid.setPose('run');
      this.wall.push(w);
      void s.tw.to(w.a, { u: wallU + (i - 1.5) * (s.p.landscape ? 0.12 : 0.14) }, { duration: 700, delay: i * 90, ease: Ease.cubicOut }).then(() => {
        w.kid.setPose('ready');
        w.kid.setExpression('determined');
      });
    }
    this.paths.alpha = 0;
    s.targetsLayer.addChild(this.paths);
    this.extras.push(this.paths);

    // direction targets in the goal mouth
    const slots: DirTarget['slot'][] = choices.length === 2 ? ['left', 'right'] : ['left', 'over', 'right'];
    choices.forEach((choice, i) => {
      const c = new Container();
      const glow = this.glow(color.mint, 1.3);
      const g = new Graphics();
      g.circle(0, 0, 46).fill({ color: 0x0d1322, alpha: 0.8 }).stroke({ width: 7, color: color.gold });
      g.circle(0, 0, 36).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
      const art = this.choiceArt(choice, 56);
      c.addChild(glow, g, art);
      const t: DirTarget = { c, choice, glow, slot: slots[i], x: 0, y: 0 };
      this.targets.push(t);
      c.scale.set(0);
      s.targetsLayer.addChild(c);
      this.extras.push(c);
      this.answerTap(c, choice.id);
      void s.tw.to(c.scale, { x: this.targetScale(), y: this.targetScale() }, { duration: 520, delay: 400 + i * 150, ease: Ease.elasticOut });
    });
    this.layout();
    void s.tw.to(this.paths, { alpha: 1 }, { duration: 500, delay: 600 });
    s.sfx('magic', { delay: 0.4 });
    s.setA11yChoices(choices.map((c) => ({ id: c.id, label: c.ariaLabel })), (id) => s.runner.choose(id));
    await s.wait(900);
  }

  private targetScale() {
    return (this.s.p.goalH / 3.4) / 46;
  }

  layout() {
    const p = this.s.p;
    for (const t of this.targets) {
      const top = p.goalY - p.goalH;
      if (t.slot === 'left') {
        t.x = p.cx - p.goalHalf * 0.68;
        t.y = top + p.goalH * 0.52;
      } else if (t.slot === 'right') {
        t.x = p.cx + p.goalHalf * 0.68;
        t.y = top + p.goalH * 0.52;
      } else {
        t.x = p.cx;
        t.y = top + p.goalH * 0.2;
      }
      t.c.position.set(t.x, t.y);
    }
    this.drawPaths();
  }

  /** Faint dotted flight paths from the ball to each target: "choose your direction". */
  private drawPaths(highlight?: string) {
    const s = this.s;
    const p = s.p;
    const g = this.paths.clear();
    const bx = p.x(this.ballU, this.ballV);
    const by = p.y(this.ballV) - 17 * p.s(this.ballV);
    for (const t of this.targets) {
      const { cx, cy } = this.ctrl(t);
      const on = t.choice.id === highlight;
      for (let i = 1; i < 18; i++) {
        const k = i / 18;
        const x = (1 - k) * (1 - k) * bx + 2 * (1 - k) * k * cx + k * k * t.x;
        const y = (1 - k) * (1 - k) * by + 2 * (1 - k) * k * cy + k * k * t.y;
        g.circle(x, y, (on ? 5 : 3.2) * p.s(lerpV(this.ballV, 0, k))).fill({ color: on ? color.gold : 0xffffff, alpha: on ? 0.95 : 0.4 });
      }
    }
  }

  private ctrl(t: DirTarget) {
    const p = this.s.p;
    const bx = p.x(this.ballU, this.ballV);
    const by = p.y(this.ballV);
    if (t.slot === 'over') return { cx: (bx + t.x) / 2, cy: Math.min(by, t.y) - p.U * 0.5 };
    const dir = t.slot === 'left' ? -1 : 1;
    return { cx: (bx + t.x) / 2 + dir * p.U * 0.42, cy: Math.min(by, t.y) - p.U * 0.12 };
  }

  async wrongFeedback(choiceId: string) {
    const s = this.s;
    s.sfx('softBump');
    s.haptic('tiny');
    const t = this.targets.find((x) => x.choice.id === choiceId);
    void s.adam.encouraged();
    // the wall players shake their heads kindly ("not that way!")
    for (const w of this.wall) void w.kid.jump(20);
    if (t) await s.wiggle(t.c);
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const t = this.targets.find((x) => x.choice.id === ch.answer.id);
    if (!t) return;
    this.pulseGlow(t.glow, strong);
    void this.s.pop(t.c, strong ? 1.18 : 1.1);
    this.drawPaths(t.choice.id);
    setTimeout(() => this.s.alive && !this.paths.destroyed && this.drawPaths(), strong ? 2600 : 1600);
  }

  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    const s = this.s;
    const t = this.targets.find((x) => x.choice.id === choiceId) ?? this.targets[0];
    for (const o of this.targets) if (o !== t) void s.tw.to(o.c, { alpha: 0.15 }, { duration: 300 });
    t.glow.tint = color.gold;
    this.pulseGlow(t.glow, true);
    this.drawPaths(t.choice.id);
    void s.pop(t.c, 1.2);
    s.sfx('magic');
    await s.wait(300);
    await s.chargeAdam({ x: t.x, y: t.y });
    const p = s.p;
    let jumped = false;
    const over = t.slot === 'over';
    await s.shootAt(t.x, t.y, {
      curve: over ? 0 : 0.42,
      arc: over ? 0.5 : 0.12,
      diveDir: t.x < p.cx ? 1 : -1, // keeper guesses the other way
      onFlight: (k) => {
        if (!jumped && k > 0.2) {
          jumped = true;
          for (const [i, w] of this.wall.entries()) {
            w.kid.setPose('victory');
            void s.tw.to(w.a, { lift: 55 }, { duration: 220, delay: i * 30, ease: Ease.quadOut }).then(() => s.tw.to(w.a, { lift: 0 }, { duration: 260, ease: Ease.quadIn }));
          }
          s.sfx('swoosh', { volume: 0.4 });
        }
      },
    });
    this.paths.clear();
    s.fx.burst(t.x, t.y, { texture: s.tex('ring'), count: 3, tints: [color.gold], speed: [10, 30], life: [0.4, 0.6], scale: [0.4, 1.2], scaleEnd: 3, additive: true });
    void s.tw.to(t.c, { alpha: 0 }, { duration: 400 });
    for (const w of this.wall) {
      w.kid.setPose('sad');
      w.kid.setExpression('surprised');
    }
    await s.goalScored(t.x, t.y);
    // wall trots away while Adam celebrates
    for (const [i, w] of this.wall.entries()) {
      w.kid.setPose('run');
      void s.tw.to(w.a, { u: i % 2 ? 1.6 : -1.6 }, { duration: 1200, delay: 300 + i * 80 });
    }
    s.home = { u: s.p.landscape ? -0.12 : -0.22, v: 0.74 };
    await s.celebrateAndReset(stars);
  }

  cleanup() {
    this.wall = [];
    this.targets = [];
    super.cleanup();
    this.paths = new Graphics();
  }
}

function lerpV(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
