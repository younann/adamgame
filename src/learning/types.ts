/**
 * Learning domain types. These are presentation-independent: a challenge knows nothing
 * about portals, footballs or tunnels — world adapters decide how it becomes gameplay.
 */

export type Domain = 'english' | 'math';

export type ChallengeType =
  | 'objectSelection'
  | 'numberChoice'
  | 'countObjects'
  | 'listenAndChoose'
  | 'colorMatch'
  | 'shapeMatch'
  | 'compare'
  | 'order'
  | 'addition'
  | 'imageVocabulary'
  | 'audioVocabulary'
  | 'speechRepeat';

/** Where a challenge was presented — used for "mastered across multiple contexts". */
export type GameContext =
  | 'football'
  | 'heroPortal'
  | 'raceTunnel'
  | 'raceGarage'
  | 'treasureChest'
  | 'closet';

export type MasteryState = 'new' | 'learning' | 'familiar' | 'mastered' | 'needsReview';

/** Arabic → English scaffolding stage. A: Arabic-led, B: English-led with hint, C: English only. */
export type LanguageStage = 'A' | 'B' | 'C';

export type Lang = 'ar' | 'en';

export interface VoiceLine {
  text: string;
  lang: Lang;
  /** Optional pre-recorded clip; TTS is used when absent or unavailable offline. */
  audio?: string;
  /** Emphasis words speak a little slower. */
  slow?: boolean;
}

/** Visual identity of a concept — rendered procedurally by the game (no external images). */
export interface ConceptVisual {
  kind: 'color' | 'number' | 'shape' | 'icon';
  /** colour key, shape key or icon key understood by src/game/draw/conceptArt.ts */
  key: string;
  /** For numbers */
  value?: number;
}

export interface Concept {
  id: string; // e.g. english.colors.blue
  domain: Domain;
  category: string;
  english: string;
  arabic: string;
  /** Text spoken for the English target (often same as english). */
  audioTarget: string;
  visual: ConceptVisual;
  difficulty: 1 | 2 | 3;
  /** Game contexts that can present this concept. */
  contexts: GameContext[];
}

export interface ChallengeChoice {
  id: string;
  /** concept the choice represents (for colors/vocab) */
  conceptId?: string;
  /** numeric value for math */
  value?: number;
  label: string; // short visual label (e.g. "3" or "BLUE")
  visual: ConceptVisual;
  /** accessible label for screen readers / parent */
  ariaLabel: string;
}

export interface HintStep {
  kind: 'repeatPrompt' | 'arabicHelp' | 'pulseAnswer' | 'countTogether' | 'narrowChoices';
  lines?: VoiceLine[];
}

export interface LearningChallenge {
  id: string;
  skillId: string;
  type: ChallengeType;
  /** Spoken prompt for each language stage. */
  prompt: Record<LanguageStage, VoiceLine[]>;
  /** Arabic help, spoken only when needed (stage B/C) or up-front (stage A). */
  arabicHelp: VoiceLine[];
  answer: ChallengeChoice;
  distractors: ChallengeChoice[];
  difficulty: 1 | 2 | 3;
  /** Objects to physically show in the world (e.g. count = 3 balls). */
  assets: { count?: number; addends?: [number, number]; colorKey?: string };
  /** Short English word/number spoken on success ("Three!", "Blue!"). */
  audio: VoiceLine[];
  hintSequence: HintStep[];
}

export interface AttemptRecord {
  skillId: string;
  correct: boolean;
  /** hints shown before this answer within the challenge */
  hintsUsed: number;
  arabicHelpUsed: boolean;
  context: GameContext;
  ts: number;
  /** first answer of the challenge, no hints — counts as an independent success */
  firstTry: boolean;
}

export interface SkillRecord {
  skillId: string;
  attempts: number;
  correct: number;
  /** last 10 attempts, newest last: true = correct */
  recent: boolean[];
  independentSuccesses: number;
  hintUses: number;
  arabicHelpUses: number;
  lastPracticed: number;
  firstSeen: number;
  contexts: GameContext[];
  /** contexts where an independent success happened */
  successContexts: GameContext[];
  state: MasteryState;
  /** parent override */
  forcedState?: MasteryState;
}
