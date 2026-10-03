import { describe, expect, it } from 'vitest';
import { pickNextSkill, isUnlocked } from './AdaptiveQueue';
import { candidateSkills } from '../adapters';
import { applyAttempt, emptyRecord } from '../mastery/MasteryEngine';
import { seeded } from '../engine/rng';
import type { GameContext, SkillRecord } from '../types';

const NOW = 1_700_000_000_000;
function recWith(id: string, results: boolean[], context: GameContext = 'heroPortal'): SkillRecord {
  return results.reduce(
    (r, correct) => applyAttempt(r, { skillId: id, correct, hintsUsed: 0, arabicHelpUsed: false, context, ts: NOW, firstTry: true }),
    emptyRecord(id, NOW),
  );
}
function counts(fn: (i: number) => string | null, n = 400) {
  const m: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const id = fn(i) ?? 'null';
    m[id] = (m[id] ?? 0) + 1;
  }
  return m;
}

describe('AdaptiveQueue', () => {
  it('each world adapter has candidates', () => {
    for (const w of ['football', 'hero', 'racing', 'treasure'] as const) expect(candidateSkills(w).length).toBeGreaterThan(0);
    expect(candidateSkills('hero')).toContain('english.colors.blue');
    expect(candidateSkills('football')).toContain('math.count.1-3');
    expect(candidateSkills('racing').every((s) => s.startsWith('math.'))).toBe(true);
  });

  it('gates locked math skills behind prerequisites', () => {
    expect(isUnlocked('math.add.within5', {}, NOW)).toBe(false);
    expect(isUnlocked('math.count.1-3', {}, NOW)).toBe(true);
    const records = {
      'math.count.1-5': recWith('math.count.1-5', [true, true, true]),
      'math.recognize.1-5': recWith('math.recognize.1-5', [true, true, true]),
    };
    expect(isUnlocked('math.add.within5', records, NOW)).toBe(true);
  });

  it('gates harder English concepts until easier ones are familiar', () => {
    expect(isUnlocked('english.colors.purple', {}, NOW)).toBe(false);
    const records: Record<string, SkillRecord> = {};
    for (const c of ['red', 'blue', 'yellow']) records[`english.colors.${c}`] = recWith(`english.colors.${c}`, [true, true]);
    expect(isUnlocked('english.colors.purple', records, NOW)).toBe(true);
  });

  it('prefers struggling skills over mastered ones', () => {
    const records = {
      'english.colors.blue': recWith('english.colors.blue', [false, false, true, false]),
      'english.colors.red': recWith('english.colors.red', [true, true, true, true], 'heroPortal'),
    };
    records['english.colors.red'] = applyAttempt(records['english.colors.red'], { skillId: 'english.colors.red', correct: true, hintsUsed: 0, arabicHelpUsed: false, context: 'football', ts: NOW, firstTry: true });
    const rng = seeded(7);
    const c = counts(() => pickNextSkill({ candidates: ['english.colors.blue', 'english.colors.red'], records, context: 'heroPortal', now: NOW, rng }));
    expect(c['english.colors.blue']).toBeGreaterThan(c['english.colors.red'] * 3);
  });

  it('avoids repeating the immediately previous skill', () => {
    const rng = seeded(11);
    const cands = ['english.colors.blue', 'english.colors.red', 'english.colors.yellow'];
    const c = counts(() => pickNextSkill({ candidates: cands, records: {}, context: 'heroPortal', now: NOW, rng, recent: ['english.colors.blue'] }));
    expect(c['english.colors.blue'] ?? 0).toBeLessThan(40);
  });

  it('limits how many new skills are introduced at once', () => {
    const records: Record<string, SkillRecord> = {
      'english.colors.red': recWith('english.colors.red', [false]),
      'english.colors.blue': recWith('english.colors.blue', [false]),
      'english.colors.yellow': recWith('english.colors.yellow', [false]),
    };
    const rng = seeded(3);
    const c = counts(() => pickNextSkill({ candidates: ['english.colors.red', 'english.colors.blue', 'english.colors.yellow', 'english.colors.green'], records, context: 'heroPortal', now: NOW, rng }));
    expect(c['english.colors.green']).toBeUndefined();
  });

  it('review mode only revisits seen skills, weakest first', () => {
    const records = {
      'english.colors.blue': recWith('english.colors.blue', [false, false, true]),
      'english.colors.red': recWith('english.colors.red', [true, true, true]),
    };
    const rng = seeded(5);
    const cands = candidateSkills('treasure');
    const c = counts(() => pickNextSkill({ candidates: cands, records, context: 'treasureChest', now: NOW, rng, mode: 'review' }));
    expect(Object.keys(c).sort()).toEqual(['english.colors.blue', 'english.colors.red']);
    expect(c['english.colors.blue']).toBeGreaterThan(c['english.colors.red']);
  });

  it('review mode falls back to normal when nothing has been played', () => {
    const id = pickNextSkill({ candidates: candidateSkills('treasure'), records: {}, context: 'treasureChest', now: NOW, rng: seeded(1), mode: 'review' });
    expect(id).not.toBeNull();
  });
});
