import type { AttemptRecord, LanguageStage, MasteryState, SkillRecord } from '../types';

export const RECENT_WINDOW = 10;
export const DAY = 24 * 60 * 60 * 1000;
/** A familiar/mastered skill not practised for this long needs review. */
export const REVIEW_AFTER_MS = 4 * DAY;

export function emptyRecord(skillId: string, now = Date.now()): SkillRecord {
  return {
    skillId,
    attempts: 0,
    correct: 0,
    recent: [],
    independentSuccesses: 0,
    hintUses: 0,
    arabicHelpUses: 0,
    lastPracticed: 0,
    firstSeen: now,
    contexts: [],
    successContexts: [],
    state: 'new',
  };
}

export function recentAccuracy(rec: SkillRecord, n = 5): number {
  const slice = rec.recent.slice(-n);
  if (slice.length === 0) return 0;
  return slice.filter(Boolean).length / slice.length;
}

export function accuracy(rec: SkillRecord): number {
  return rec.attempts === 0 ? 0 : rec.correct / rec.attempts;
}

/**
 * Pure state computation from counters (no time decay).
 * mastered requires success across >= 2 different game contexts — a concept is not
 * "known" until Adam recognises it as a portal AND a football AND a chest, etc.
 */
export function computeState(rec: SkillRecord, previous: MasteryState = rec.state): MasteryState {
  if (rec.attempts === 0) return 'new';
  const acc5 = recentAccuracy(rec, 5);
  const wasStrong = previous === 'mastered' || previous === 'familiar' || previous === 'needsReview';

  if (rec.independentSuccesses >= 3 && rec.successContexts.length >= 2 && acc5 >= 0.8 && rec.attempts >= 4) {
    return 'mastered';
  }
  // A strong skill whose recent answers slipped needs review rather than dropping to "learning".
  if (wasStrong && rec.recent.length >= 3 && recentAccuracy(rec, 3) < 0.5) return 'needsReview';
  if (rec.independentSuccesses >= 2 && acc5 >= 0.6) return 'familiar';
  if (previous === 'needsReview' && acc5 < 0.6) return 'needsReview';
  return 'learning';
}

/** State as of `now`, including time-based review decay and parent overrides. */
export function effectiveState(rec: SkillRecord | undefined, now = Date.now()): MasteryState {
  if (!rec) return 'new';
  if (rec.forcedState) return rec.forcedState;
  if ((rec.state === 'mastered' || rec.state === 'familiar') && rec.lastPracticed > 0 && now - rec.lastPracticed > REVIEW_AFTER_MS) {
    return 'needsReview';
  }
  return rec.state;
}

/** Applies one attempt, returning a new record (immutable). */
export function applyAttempt(rec: SkillRecord, a: AttemptRecord): SkillRecord {
  const previous = effectiveState(rec, a.ts);
  const next: SkillRecord = {
    ...rec,
    attempts: rec.attempts + 1,
    correct: rec.correct + (a.correct ? 1 : 0),
    recent: [...rec.recent, a.correct].slice(-RECENT_WINDOW),
    hintUses: rec.hintUses + (a.hintsUsed > 0 ? 1 : 0),
    arabicHelpUses: rec.arabicHelpUses + (a.arabicHelpUsed ? 1 : 0),
    lastPracticed: a.ts,
    contexts: rec.contexts.includes(a.context) ? rec.contexts : [...rec.contexts, a.context],
    forcedState: undefined,
  };
  const independent = a.correct && a.firstTry && a.hintsUsed === 0 && !a.arabicHelpUsed;
  if (independent) {
    next.independentSuccesses = rec.independentSuccesses + 1;
    if (!rec.successContexts.includes(a.context)) next.successContexts = [...rec.successContexts, a.context];
  }
  next.state = computeState(next, previous);
  return next;
}

/**
 * Arabic → English scaffolding stage for a skill.
 * A: Arabic instruction + clear English target + Arabic translation.
 * B: English instruction, Arabic hint offered on hesitation.
 * C: English only; Arabic only after difficulty.
 */
export function languageStage(rec: SkillRecord | undefined, now = Date.now()): LanguageStage {
  if (!rec || rec.attempts === 0 || rec.independentSuccesses < 2) return 'A';
  const st = effectiveState(rec, now);
  if (st === 'mastered' && recentAccuracy(rec, 5) >= 0.8) return 'C';
  if (rec.independentSuccesses >= 4 && recentAccuracy(rec, 5) >= 0.8 && st !== 'needsReview') return 'C';
  return 'B';
}

/** Share of attempts that leaned on hints / Arabic — parent-facing dependence signals. */
export function dependence(rec: SkillRecord): { hint: number; arabic: number } {
  if (rec.attempts === 0) return { hint: 0, arabic: 0 };
  return { hint: rec.hintUses / rec.attempts, arabic: rec.arabicHelpUses / rec.attempts };
}
