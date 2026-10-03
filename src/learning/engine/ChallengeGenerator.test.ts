import { describe, expect, it } from 'vitest';
import { ENGLISH } from '../curriculum/english';
import { MATH } from '../curriculum/math';
import { generateChallenge, localizeLines, validateChallenge } from './ChallengeGenerator';
import { seeded } from './rng';

describe('ChallengeGenerator', () => {
  it('has ~50 English concepts with complete metadata', () => {
    expect(ENGLISH.length).toBeGreaterThanOrEqual(50);
    for (const c of ENGLISH) {
      expect(c.id).toMatch(/^english\.[a-z]+\.[a-z]+$/);
      expect(c.arabic.length).toBeGreaterThan(0);
      expect(c.contexts.length).toBeGreaterThan(0);
    }
    expect(new Set(ENGLISH.map((c) => c.id)).size).toBe(ENGLISH.length);
  });

  it('generates valid challenges for every skill, stage and many seeds', () => {
    const skills = [...ENGLISH.map((c) => c.id), ...MATH.map((m) => m.id)];
    for (const id of skills) {
      for (const stage of ['A', 'B', 'C'] as const) {
        for (let seed = 1; seed <= 15; seed++) {
          const ch = generateChallenge(id, { stage, rng: seeded(seed) });
          expect(validateChallenge(ch), `${id}/${stage}/${seed}`).toEqual([]);
        }
      }
    }
  });

  it('count challenges show exactly the answer number of objects', () => {
    for (let s = 1; s < 30; s++) {
      const ch = generateChallenge('math.count.1-3', { stage: 'A', rng: seeded(s) });
      expect(ch.assets.count).toBe(ch.answer.value);
      expect(ch.answer.value).toBeGreaterThanOrEqual(1);
      expect(ch.answer.value).toBeLessThanOrEqual(3);
    }
  });

  it('stage A colour prompt is Arabic-led with clear English target; C is English only', () => {
    const ch = generateChallenge('english.colors.blue', { stage: 'A', rng: seeded(3) });
    expect(ch.prompt.A[0].lang).toBe('ar');
    expect(ch.prompt.A.some((l) => l.lang === 'en' && l.text.includes('Blue'))).toBe(true);
    expect(ch.prompt.C.every((l) => l.lang === 'en')).toBe(true);
    expect(ch.arabicHelp.some((l) => l.lang === 'ar' && l.text.includes('أزرق'))).toBe(true);
  });

  it('stage C only offers Arabic help after an English repeat', () => {
    const ch = generateChallenge('english.colors.blue', { stage: 'C', rng: seeded(3) });
    expect(ch.hintSequence[0].kind).toBe('repeatPrompt');
    expect(ch.hintSequence[1].kind).toBe('arabicHelp');
    const b = generateChallenge('english.colors.blue', { stage: 'B', rng: seeded(3) });
    expect(b.hintSequence[0].kind).toBe('arabicHelp');
  });

  it('counting hints include counting together', () => {
    const ch = generateChallenge('math.count.1-5', { stage: 'B', rng: seeded(1) });
    expect(ch.hintSequence.some((h) => h.kind === 'countTogether')).toBe(true);
  });

  it('localizes presenter tokens', () => {
    const ch = generateChallenge('math.count.1-3', { stage: 'B', rng: seeded(2) });
    const lines = localizeLines(ch.prompt.B, { things: 'balls', thingsAr: 'الطابات', thing: 'ball' });
    expect(lines[0].text).toContain('balls');
  });

  it('validator rejects broken challenges', () => {
    const ch = generateChallenge('math.count.1-3', { stage: 'B', rng: seeded(2) });
    expect(validateChallenge({ ...ch, distractors: [ch.answer] }).length).toBeGreaterThan(0);
    expect(validateChallenge({ ...ch, assets: { count: 99 } })).toContain('count asset mismatch');
  });
});
