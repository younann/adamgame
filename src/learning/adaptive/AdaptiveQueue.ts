import { ENGLISH_BY_ID } from '../curriculum/english';
import { MATH_BY_ID } from '../curriculum/math';
import { effectiveState, recentAccuracy } from '../mastery/MasteryEngine';
import type { GameContext, MasteryState, SkillRecord } from '../types';
import { defaultRng, type Rng } from '../engine/rng';

export interface PickOptions {
  candidates: string[];
  records: Record<string, SkillRecord>;
  context: GameContext;
  now?: number;
  rng?: Rng;
  /** 'review' = Treasure Island: only revisit skills Adam has seen, weakest first. */
  mode?: 'normal' | 'review';
  /** Most recent skill ids picked (newest last) — avoid drilling the same screen. */
  recent?: string[];
  /** Max skills allowed in "learning" before new ones stop being introduced. */
  maxLearning?: number;
}

const WEIGHTS: Record<'normal' | 'review', Record<MasteryState, number>> = {
  normal: { needsReview: 6, learning: 5, familiar: 3, new: 2.5, mastered: 0.7 },
  review: { needsReview: 8, learning: 6, familiar: 3, new: 0, mastered: 1 },
};

const isStrong = (s: MasteryState) => s === 'familiar' || s === 'mastered';

/** Is a skill unlocked given prerequisites and difficulty gating? */
export function isUnlocked(skillId: string, records: Record<string, SkillRecord>, now: number): boolean {
  const math = MATH_BY_ID.get(skillId);
  if (math) return math.requires.every((r) => isStrong(effectiveState(records[r], now)) || effectiveState(records[r], now) === 'needsReview');
  const concept = ENGLISH_BY_ID.get(skillId);
  if (!concept) return false;
  if (concept.difficulty === 1) return true;
  // difficulty 2 opens once 3 concepts are familiar; difficulty 3 once 8 are.
  const strong = Object.values(records).filter((r) => r.skillId.startsWith('english.') && isStrong(effectiveState(r, now))).length;
  return strong >= (concept.difficulty === 2 ? 3 : 8);
}

/** Weighted pick of the next skill to practise in a given world context. */
export function pickNextSkill(o: PickOptions): string | null {
  const now = o.now ?? Date.now();
  const rng = o.rng ?? defaultRng;
  const mode = o.mode ?? 'normal';
  const recent = o.recent ?? [];
  const maxLearning = o.maxLearning ?? 3;

  const learningCount = Object.values(o.records).filter((r) => effectiveState(r, now) === 'learning').length;
  const allowNew = learningCount < maxLearning;

  const scored: { id: string; w: number }[] = [];
  for (const id of o.candidates) {
    const rec = o.records[id];
    const state = effectiveState(rec, now);
    if (mode === 'review' && (!rec || rec.attempts === 0)) continue;
    if (state === 'new' && (!allowNew || !isUnlocked(id, o.records, now))) continue;
    if (state !== 'new' && !isUnlocked(id, o.records, now) && mode === 'normal') continue;

    let w = WEIGHTS[mode][state];
    if (rec && rec.attempts > 0) {
      // weaker recent accuracy → more practice
      w *= 1 + (1 - recentAccuracy(rec, 5));
      // spaced reuse: prefer contexts where Adam hasn't yet succeeded on his own
      if (!rec.successContexts.includes(o.context)) w *= 1.5;
    }
    const lastIdx = recent.lastIndexOf(id);
    if (lastIdx >= 0) w *= lastIdx === recent.length - 1 ? 0.05 : 0.3;
    if (w > 0) scored.push({ id, w });
  }

  if (scored.length === 0) {
    if (mode === 'review') return pickNextSkill({ ...o, mode: 'normal' });
    // everything gated: fall back to the easiest unlocked candidate
    const open = o.candidates.filter((id) => isUnlocked(id, o.records, now));
    return open[0] ?? o.candidates[0] ?? null;
  }

  const total = scored.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const s of scored) {
    r -= s.w;
    if (r <= 0) return s.id;
  }
  return scored[scored.length - 1].id;
}
