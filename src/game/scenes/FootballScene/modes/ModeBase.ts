import { Container, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge } from '@/learning/types';
import { Kid, type KidLook } from '../../../entities/Kid';
import { Ease } from '../../../engine/Tween';
import { gameText } from '../../../draw/paint';
import { drawConcept } from '../../../draw/conceptArt';
import type { Actor } from '../Actor';
import type FootballScene from '../index';
import type { FootballMode, ModeHandler } from './types';

/** Shared plumbing for football variations: spawned kids/actors, cleanup, juice helpers. */
export abstract class ModeBase implements ModeHandler {
  abstract readonly id: FootballMode;
  protected kids: Kid[] = [];
  protected spawned: Actor[] = [];
  protected extras: Container[] = [];

  constructor(protected readonly s: FootballScene) {}

  abstract present(ch: LearningChallenge, choices: ChallengeChoice[]): Promise<void>;
  abstract wrongFeedback(choiceId: string, ch: LearningChallenge): Promise<void>;
  abstract pulseAnswer(ch: LearningChallenge, strong: boolean): void;
  abstract succeed(choiceId: string, ch: LearningChallenge, stars: number): Promise<void>;

  tick(dt: number) {
    for (const k of this.kids) if (!k.destroyed) k.update(dt);
  }

  cleanup() {
    for (const a of this.spawned) this.s.removeActor(a);
    this.spawned = [];
    for (const c of this.extras) if (!c.destroyed) c.destroy({ children: true });
    this.extras = [];
    this.kids = [];
  }

  /** A character standing on the pitch. */
  protected addKid(look: KidLook, u: number, v: number, k = 1): { kid: Kid; a: Actor } {
    const kid = new Kid(look);
    const a = this.s.addActor(kid);
    a.u = u;
    a.v = v;
    a.k = k;
    this.kids.push(kid);
    this.spawned.push(a);
    return { kid, a };
  }

  protected addActorView(view: Container, u: number, v: number): Actor {
    const a = this.s.addActor(view);
    a.u = u;
    a.v = v;
    this.spawned.push(a);
    return a;
  }

  /** Visual for a choice: big number, colour orb, or English picture. */
  protected choiceArt(choice: ChallengeChoice, size: number): Container {
    if (choice.visual.kind === 'number') {
      const c = new Container();
      c.addChild(gameText(String(choice.value ?? choice.label), size * 0.85, { fillColor: 0xffffff }));
      return c;
    }
    return drawConcept(choice.visual, size);
  }

  protected glow(tint: number = color.gold, scale = 1.4): Sprite {
    const g = new Sprite(this.s.tex('glow'));
    g.anchor.set(0.5);
    g.tint = tint;
    g.blendMode = 'add';
    g.scale.set(scale);
    g.alpha = 0.3;
    return g;
  }

  protected pulseGlow(g: Sprite, strong: boolean) {
    g.alpha = 1;
    void this.s.tw.to(g, { alpha: 0.25 }, { duration: strong ? 2600 : 1600, ease: Ease.quadIn });
  }

  /** Make a world object a tappable answer for the runner. */
  protected answerTap(el: Container, choiceId: string) {
    this.s.tappable(el, () => this.s.interactive && this.s.runner.choose(choiceId), { sound: 'press', haptic: 'tiny' });
  }
}
