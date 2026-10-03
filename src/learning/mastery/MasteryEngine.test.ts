import { describe, expect, it } from 'vitest';
import { applyAttempt, computeState, effectiveState, emptyRecord, languageStage, REVIEW_AFTER_MS } from './MasteryEngine';
import type { AttemptRecord, GameContext, SkillRecord } from '../types';

const T0 = 1_700_000_000_000;
const att = (correct: boolean, context: GameContext = 'heroPortal', extra: Partial<AttemptRecord> = {}): AttemptRecord => ({
  skillId: 'english.colors.blue', correct, hintsUsed: 0, arabicHelpUsed: false, context, ts: T0, firstTry: true, ...extra,
});
const run = (attempts: AttemptRecord[], rec: SkillRecord = emptyRecord('english.colors.blue', T0)) => attempts.reduce(applyAttempt, rec);

describe('MasteryEngine', () => {
  it('starts new and moves to learning after an attempt', () => {
    expect(emptyRecord('x').state).toBe('new');
    expect(run([att(false)]).state).toBe('learning');
  });

  it('tracks counters, hints, arabic help and contexts', () => {
    const r = run([att(true), att(false, 'football', { hintsUsed: 2, arabicHelpUsed: true, firstTry: false }), att(true, 'football', { firstTry: false })]);
    expect(r.attempts).toBe(3);
    expect(r.correct).toBe(2);
    expect(r.hintUses).toBe(1);
    expect(r.arabicHelpUses).toBe(1);
    expect(r.independentSuccesses).toBe(1);
    expect(r.contexts).toEqual(['heroPortal', 'football']);
    expect(r.successContexts).toEqual(['heroPortal']);
  });

  it('does not master a concept from a single context', () => {
    const r = run(Array.from({ length: 8 }, () => att(true, 'heroPortal')));
    expect(r.state).toBe('familiar');
  });

  it('masters only after independent success across multiple contexts', () => {
    const r = run([att(true, 'heroPortal'), att(true, 'heroPortal'), att(true, 'football'), att(true, 'treasureChest')]);
    expect(r.state).toBe('mastered');
  });

  it('hinted successes do not count as independent', () => {
    const r = run(Array.from({ length: 6 }, (_, i) => att(true, i % 2 ? 'football' : 'heroPortal', { hintsUsed: 1 })));
    expect(r.independentSuccesses).toBe(0);
    expect(r.state).toBe('learning');
  });

  it('a slipping mastered skill becomes needsReview', () => {
    let r = run([att(true, 'heroPortal'), att(true, 'heroPortal'), att(true, 'football'), att(true, 'treasureChest')]);
    expect(r.state).toBe('mastered');
    r = run([att(false), att(false), att(false)], r);
    expect(r.state).toBe('needsReview');
  });

  it('time decay marks strong skills for review', () => {
    const r = run([att(true, 'heroPortal'), att(true, 'heroPortal'), att(true, 'football'), att(true, 'treasureChest')]);
    expect(effectiveState(r, T0 + 1000)).toBe('mastered');
    expect(effectiveState(r, T0 + REVIEW_AFTER_MS + 1)).toBe('needsReview');
  });

  it('parent override wins', () => {
    const r = { ...emptyRecord('x'), forcedState: 'mastered' as const };
    expect(effectiveState(r)).toBe('mastered');
  });

  it('computeState is new with zero attempts', () => {
    expect(computeState(emptyRecord('x'))).toBe('new');
  });
});

describe('Arabic → English scaffolding stages', () => {
  it('A for new skills', () => {
    expect(languageStage(undefined)).toBe('A');
    expect(languageStage(run([att(true)]), T0)).toBe('A');
  });
  it('B once two independent successes exist', () => {
    expect(languageStage(run([att(true), att(true)]), T0)).toBe('B');
  });
  it('C when mastered with high recent accuracy', () => {
    const r = run([att(true, 'heroPortal'), att(true, 'heroPortal'), att(true, 'football'), att(true, 'treasureChest')]);
    expect(languageStage(r, T0)).toBe('C');
  });
  it('falls back to B when a skill needs review', () => {
    let r = run([att(true, 'heroPortal'), att(true, 'heroPortal'), att(true, 'football'), att(true, 'treasureChest')]);
    r = run([att(false), att(false), att(false)], r);
    expect(languageStage(r, T0)).toBe('B');
  });
});
