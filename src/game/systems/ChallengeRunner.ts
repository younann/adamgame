import { ADAPTERS, candidateSkills, type WorldId } from '@/learning/adapters';
import { pickNextSkill } from '@/learning/adaptive/AdaptiveQueue';
import { generateChallenge, localizeLines, validateChallenge } from '@/learning/engine/ChallengeGenerator';
import { languageStage } from '@/learning/mastery/MasteryEngine';
import type { ChallengeChoice, LanguageStage, LearningChallenge, VoiceLine } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import type { Scene } from '../engine/Scene';
import { logError } from '../engine/errorLog';
import { starsForAnswer } from './RewardEngine';
import { maybePlayPraise } from '@/audio/ParentVoice';

/**
 * What a world must implement to turn a LearningChallenge into gameplay.
 * The runner owns timing, hints, Arabic scaffolding and mastery recording;
 * the presenter owns everything Adam sees and touches.
 */
export interface ChallengePresenter {
  /** Build world objects for the challenge (balls on the pitch, portals, tunnels…). */
  present(ch: LearningChallenge, choices: ChallengeChoice[]): Promise<void>;
  /** Allow/deny taps on choice objects. */
  setInteractive(on: boolean): void;
  /** Gentle "not quite" on the chosen object (bump/shake) — never a red X. */
  wrongFeedback(choiceId: string, ch: LearningChallenge): Promise<void>;
  /** Count objects together one by one (counting/addition hint). */
  countTogether?(ch: LearningChallenge): Promise<void>;
  /** Make the right answer gently glow/pulse. */
  pulseAnswer(ch: LearningChallenge, strong: boolean): void;
  /** The gameplay consequence: kick, beam, nitro, chest… Return when the moment is done. */
  succeed(choiceId: string, ch: LearningChallenge, stars: number): Promise<void>;
  /** Clean up challenge objects after success. */
  clear(): void;
}

export interface RunOptions {
  /** force a specific skill (debug / scripted missions) */
  skillId?: string;
  /** limit which skills this mission can pick */
  filter?: (skillId: string) => boolean;
  /** lines spoken before the prompt (commentator / story) */
  intro?: VoiceLine[];
  speaker?: Speaker;
  /** 2 or 3 choices */
  choices?: number;
}

export interface RunResult {
  skillId: string;
  correctFirstTry: boolean;
  attempts: number;
  stars: number;
}

const ENCOURAGE: VoiceLine[][] = [
  [{ text: 'قريب! جرّب كمان مرة', lang: 'ar' }],
  [{ text: 'ولا يهمك يا بطل! يلا مرة ثانية', lang: 'ar' }],
  [{ text: 'Almost! Try again!', lang: 'en' }],
];

export class ChallengeRunner {
  private pending: ((id: string) => void) | null = null;
  private hintIdx = 0;
  private hintsUsed = 0;
  private arabicUsed = false;
  private idleTimer = 0;
  private active = false;
  private busy = false;
  current: LearningChallenge | null = null;
  stage: LanguageStage = 'A';
  private prompt: VoiceLine[] = [];
  private speaker: Speaker = 'sparky';
  /** seconds without input before the next hint */
  idleHintAfter = 7;

  constructor(
    private readonly scene: Scene,
    private readonly world: WorldId,
    private readonly presenter: ChallengePresenter,
  ) {}

  /** Called by the scene's tick so idle hints follow game time (pauses with the game). */
  tick(dt: number) {
    if (!this.active || this.busy || !this.current) return;
    this.idleTimer += dt;
    if (this.idleTimer >= this.idleHintAfter) {
      this.idleTimer = 0;
      void this.nextHint();
    }
  }

  /** The presenter calls this when Adam taps a choice object. */
  choose(id: string) {
    if (!this.active) return;
    // 4-year-olds tap while Sparky is still talking: accept it and cut the prompt short.
    if (this.prompting) {
      this.queued = id;
      this.scene.stopSpeech();
      return;
    }
    if (this.busy) return;
    this.idleTimer = 0;
    this.pending?.(id);
  }

  private prompting = false;
  private queued: string | null = null;

  pickSkill(opts: RunOptions = {}): string {
    const store = useGame.getState();
    const adapter = ADAPTERS[this.world];
    let cands = candidateSkills(this.world);
    if (opts.filter) {
      const f = cands.filter(opts.filter);
      if (f.length) cands = f;
    }
    return (
      opts.skillId ??
      pickNextSkill({
        candidates: cands,
        records: store.save.skills,
        context: adapter.contextFor('countObjects'),
        recent: store.save.recentSkills,
        mode: adapter.mode,
      }) ??
      cands[0]
    );
  }

  async run(opts: RunOptions = {}): Promise<RunResult> {
    const store = useGame.getState();
    const adapter = ADAPTERS[this.world];
    const skillId = this.pickSkill(opts);
    const rec = store.save.skills[skillId];
    this.stage = languageStage(rec);
    let ch = generateChallenge(skillId, { stage: this.stage, choices: opts.choices ?? 3 });
    const errs = validateChallenge(ch);
    if (errs.length) {
      logError('challenge-invalid', errs.join(','));
      ch = generateChallenge(skillId, { stage: this.stage, choices: opts.choices ?? 3 });
    }
    const tok = adapter.tokens;
    const L = (lines: VoiceLine[]) => localizeLines(lines, tok);
    ch = {
      ...ch,
      prompt: { A: L(ch.prompt.A), B: L(ch.prompt.B), C: L(ch.prompt.C) },
      arabicHelp: L(ch.arabicHelp),
      audio: L(ch.audio),
      hintSequence: ch.hintSequence.map((h) => ({ ...h, lines: h.lines ? L(h.lines) : undefined })),
    };
    this.current = ch;
    this.hintIdx = 0;
    this.hintsUsed = 0;
    // Stage-A Arabic is the instruction itself, not help — only hints/wrong answers count.
    this.arabicUsed = false;
    this.idleTimer = 0;
    this.speaker = opts.speaker ?? 'sparky';
    this.prompt = ch.prompt[this.stage];
    store.rememberSkill(skillId);

    const choices = shuffleChoices([ch.answer, ...ch.distractors]);
    this.busy = true;
    await this.presenter.present(ch, choices);
    this.presenter.setInteractive(true);
    this.scene.setA11yChoices(
      choices.map((c) => ({ id: c.id, label: c.ariaLabel })),
      (id) => this.choose(id),
    );
    this.active = true;
    this.prompting = true;
    this.queued = null;
    await this.scene.say([...(opts.intro ?? []), ...this.prompt], this.speaker);
    this.prompting = false;
    this.busy = false;
    this.idleTimer = 0;

    let attempts = 0;
    for (;;) {
      const queued = this.queued;
      this.queued = null;
      const picked = queued ?? (await this.scene.guard(new Promise<string>((res) => (this.pending = res))));
      this.pending = null;
      attempts++;
      if (picked === ch.answer.id) break;
      this.busy = true;
      this.presenter.setInteractive(false);
      await this.onWrong(picked, attempts);
      this.presenter.setInteractive(true);
      this.busy = false;
      this.idleTimer = 0;
    }

    this.active = false;
    this.presenter.setInteractive(false);
    this.scene.setA11yChoices([], null);
    const correctFirstTry = attempts === 1;
    store.recordAttempt({
      skillId,
      correct: correctFirstTry,
      hintsUsed: this.hintsUsed,
      arabicHelpUsed: this.arabicUsed,
      context: adapter.contextFor(ch.type),
      ts: Date.now(),
      firstTry: correctFirstTry,
    });
    const stars = starsForAnswer(attempts, this.hintsUsed);
    // success line, then (sometimes) the parent's own recorded praise — never blocks gameplay
    // (only if the line finished — a cancelled line means newer speech/the next prompt owns the voice)
    void this.scene.say(ch.audio, this.speaker).then((completed) => (completed ? maybePlayPraise() : false));
    await this.presenter.succeed(ch.answer.id, ch, stars);
    this.presenter.clear();
    this.current = null;
    return { skillId, correctFirstTry, attempts, stars };
  }

  private async onWrong(choiceId: string, attempt: number) {
    const ch = this.current!;
    this.hintsUsed++;
    const enc = ENCOURAGE[(attempt - 1) % ENCOURAGE.length];
    const counting = ch.type === 'countObjects' || ch.type === 'addition';
    if (counting && this.presenter.countTogether) {
      await Promise.all([
        this.presenter.wrongFeedback(choiceId, ch),
        this.scene.say([{ text: 'قريب! خلينا نعدهم مع بعض.', lang: 'ar' }], this.speaker),
      ]);
      await this.presenter.countTogether(ch);
      await this.scene.say(ch.prompt[this.stage === 'A' ? 'A' : 'B'].slice(-1), this.speaker);
    } else {
      await Promise.all([this.presenter.wrongFeedback(choiceId, ch), this.scene.say(enc, this.speaker)]);
      // Arabic appears only after difficulty (stage B/C), always paired with the English word
      this.arabicUsed = true;
      await this.scene.say(ch.arabicHelp, this.speaker);
    }
    if (attempt >= 2) this.presenter.pulseAnswer(ch, true);
  }

  private async nextHint() {
    const ch = this.current;
    if (!ch) return;
    const step = ch.hintSequence[Math.min(this.hintIdx, ch.hintSequence.length - 1)];
    this.hintIdx++;
    this.busy = true;
    try {
      switch (step.kind) {
        case 'repeatPrompt':
          // re-asking is not a hint for mastery purposes
          await this.scene.say(step.lines ?? this.prompt, this.speaker);
          break;
        case 'arabicHelp':
          this.hintsUsed++;
          this.arabicUsed = true;
          await this.scene.say(step.lines ?? ch.arabicHelp, this.speaker);
          break;
        case 'countTogether':
          this.hintsUsed++;
          if (this.presenter.countTogether) await this.presenter.countTogether(ch);
          break;
        case 'pulseAnswer':
        case 'narrowChoices':
          this.hintsUsed++;
          this.presenter.pulseAnswer(ch, this.hintIdx > ch.hintSequence.length);
          await this.scene.say(this.prompt.slice(-1), this.speaker);
          break;
      }
    } finally {
      this.busy = false;
    }
  }
}

function shuffleChoices<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
