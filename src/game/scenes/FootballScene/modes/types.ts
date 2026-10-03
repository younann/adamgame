import type { ChallengeChoice, ChallengeType, LearningChallenge } from '@/learning/types';

export type FootballMode = 'count' | 'target' | 'color' | 'freekick' | 'dribble' | 'passing' | 'keeper';

/**
 * A football variation. The scene's ChallengePresenter methods delegate to the active handler,
 * so every mode gets the runner's hints, Arabic help and mastery recording for free.
 */
export interface ModeHandler {
  readonly id: FootballMode;
  present(ch: LearningChallenge, choices: ChallengeChoice[]): Promise<void>;
  wrongFeedback(choiceId: string, ch: LearningChallenge): Promise<void>;
  pulseAnswer(ch: LearningChallenge, strong: boolean): void;
  succeed(choiceId: string, ch: LearningChallenge, stars: number): Promise<void>;
  tick?(dt: number): void;
  layout?(): void;
  /** remove all mode objects (called by the scene's reset) */
  cleanup(): void;
}

/** Challenge types each mode can present. */
export const MODE_SUPPORTS: Record<FootballMode, ChallengeType[]> = {
  count: ['countObjects', 'addition'],
  target: ['numberChoice', 'compare', 'order'],
  color: ['colorMatch'],
  freekick: ['numberChoice', 'compare', 'colorMatch', 'shapeMatch'],
  dribble: ['order', 'numberChoice', 'compare'],
  passing: ['colorMatch', 'imageVocabulary', 'shapeMatch', 'numberChoice'],
  keeper: ['numberChoice', 'compare', 'colorMatch', 'imageVocabulary', 'shapeMatch'],
};
