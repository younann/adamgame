import { describe, expect, it } from 'vitest';
import { ENGLISH } from '@/learning/curriculum/english';
import { applyAttempt, emptyRecord } from '@/learning/mastery/MasteryEngine';
import type { AttemptRecord } from '@/learning/types';
import {
  STICKERS, STICKER_BY_ID, STICKER_CATEGORIES, dailyGiftSticker, giftAvailable, localDay,
  specialsForMission, specialsForTrophies, stickerForProgress, stickerIdForSkill, stickersInCategory,
} from './stickers';

const att = (correct: boolean, extra: Partial<AttemptRecord> = {}): AttemptRecord => ({
  skillId: 'english.colors.blue', correct, hintsUsed: 0, arabicHelpUsed: false, context: 'heroPortal', ts: 1, firstTry: true, ...extra,
});

describe('sticker catalogue', () => {
  it('has a unique sticker for every English concept plus math and specials', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const c of ENGLISH) expect(STICKER_BY_ID.get(`sticker.${c.id}`)?.arabic).toBe(c.arabic);
    expect(stickerIdForSkill('math.count.1-3')).toBe('sticker.math.count.1-3');
    expect(stickerIdForSkill('nope')).toBeNull();
  });
  it('every category has stickers and every sticker has a category page', () => {
    for (const c of STICKER_CATEGORIES) expect(stickersInCategory(c.id).length).toBeGreaterThan(0);
    const cats = new Set(STICKER_CATEGORIES.map((c) => c.id));
    for (const s of STICKERS) expect(cats.has(s.category)).toBe(true);
  });
});

describe('sticker award rules', () => {
  it('awards on the first independent success only', () => {
    const r0 = emptyRecord('english.colors.blue');
    const r1 = applyAttempt(r0, att(true, { hintsUsed: 1 }));
    expect(stickerForProgress('english.colors.blue', r0, r1)).toBeNull();
    const r2 = applyAttempt(r1, att(true));
    expect(stickerForProgress('english.colors.blue', r1, r2)).toBe('sticker.english.colors.blue');
    const r3 = applyAttempt(r2, att(true));
    expect(stickerForProgress('english.colors.blue', r2, r3)).toBeNull();
  });
  it('milestone stickers', () => {
    expect(specialsForMission('football', 1)).toEqual(['special.first-goal']);
    expect(specialsForMission('football', 2)).toEqual([]);
    expect(specialsForMission('hero', 3)).toEqual(['special.hero-badge']);
    expect(specialsForTrophies(1)).toEqual(['special.trophy-1']);
    expect(specialsForTrophies(2)).toEqual([]);
    expect(specialsForTrophies(3)).toEqual(['special.trophy-3']);
  });
});

describe('daily surprise', () => {
  it('prefers practised-but-missing concepts', () => {
    const skills = { 'english.colors.red': { ...emptyRecord('english.colors.red'), attempts: 2 } };
    expect(dailyGiftSticker([], skills, () => 0)).toBe('sticker.english.colors.red');
  });
  it('falls back to easy new words, then the rainbow, then null when complete', () => {
    const first = dailyGiftSticker([], {}, () => 0)!;
    expect(STICKER_BY_ID.get(first)?.skillId?.startsWith('english.')).toBe(true);
    const allButSpecials = STICKERS.filter((s) => s.category !== 'special').map((s) => s.id);
    expect(dailyGiftSticker(allButSpecials, {})).toBe('special.rainbow');
    expect(dailyGiftSticker(STICKERS.map((s) => s.id), {})).toBeNull();
  });
  it('one gift per local day', () => {
    const d = new Date(2026, 9, 3, 23, 30);
    expect(localDay(d)).toBe('2026-10-03');
    expect(giftAvailable(undefined, '2026-10-03')).toBe(true);
    expect(giftAvailable('2026-10-03', '2026-10-03')).toBe(false);
    expect(giftAvailable('2026-10-02', '2026-10-03')).toBe(true);
  });
});

describe('backfillStickers', () => {
  it('awards stickers for progress made before stickers existed, without duplicates', async () => {
    const { backfillStickers } = await import('./stickers');
    const rec = (n: number) => ({ skillId: 'x', attempts: n, correct: n, recent: [], independentSuccesses: n, hintUses: 0, arabicHelpUses: 0, lastPracticed: 1, firstSeen: 1, contexts: [], successContexts: [], state: 'learning' as const });
    const save = {
      stickers: ['sticker.english.colors.blue'],
      skills: { 'english.colors.blue': rec(2), 'english.colors.red': rec(1), 'english.animals.cat': rec(0) },
      trophies: 3,
      worlds: { missionsCompleted: { football: 2, hero: 3 } },
    };
    const got = backfillStickers(save);
    expect(got).toContain('sticker.english.colors.red');
    expect(got).not.toContain('sticker.english.colors.blue');
    expect(got).not.toContain('sticker.english.animals.cat');
    expect(got).toEqual(expect.arrayContaining(['special.first-goal', 'special.first-rescue', 'special.hero-badge', 'special.trophy-1', 'special.trophy-3']));
    expect(new Set(got).size).toBe(got.length);
    expect(backfillStickers({ ...save, stickers: [...save.stickers, ...got] })).toEqual([]);
  });
});
