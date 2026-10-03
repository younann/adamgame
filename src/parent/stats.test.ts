import { describe, expect, it } from 'vitest';
import { applyAttempt, emptyRecord } from '@/learning/mastery/MasteryEngine';
import type { SessionLog } from '@/storage/schema';
import { DAY_MS, dailyTotals, formatDuration, gateQuestion, playTimeLastDays, playTimeToday, skillName, skillRow, startOfDay, summarize } from './stats';

const NOW = new Date(2026, 9, 3, 15, 0, 0).getTime();
const sess = (start: number, activeMs: number): SessionLog => ({ start, end: start + activeMs, activeMs, stars: 0, attempts: 0, correct: 0 });

describe('parent stats', () => {
  it('play time today / last 7 days', () => {
    const s = [sess(NOW - 60_000 * 30, 600_000), sess(NOW - 2 * DAY_MS, 300_000), sess(NOW - 10 * DAY_MS, 900_000)];
    expect(playTimeToday(s, NOW)).toBe(600_000);
    expect(playTimeLastDays(s, 7, NOW)).toBe(900_000);
    const daily = dailyTotals(s, 7, NOW);
    expect(daily).toHaveLength(7);
    expect(daily[6].ms).toBe(600_000);
    expect(daily[6].day).toBe(startOfDay(NOW));
  });
  it('falls back to end-start when activeMs is 0', () => {
    expect(playTimeToday([{ ...sess(NOW - 1000, 0), end: NOW }], NOW)).toBe(1000);
  });
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0 د');
    expect(formatDuration(25 * 60_000)).toBe('25 د');
    expect(formatDuration(90 * 60_000)).toBe('1 س 30 د');
  });
  it('names skills from curriculum', () => {
    expect(skillName('english.colors.blue')).toMatchObject({ en: 'Blue', ar: 'أزرق', domain: 'english' });
    expect(skillName('math.count.1-3').domain).toBe('math');
  });
  it('summarizes mastered and review lists', () => {
    let r = emptyRecord('english.colors.blue', NOW);
    for (const ctx of ['heroPortal', 'heroPortal', 'football', 'treasureChest'] as const)
      r = applyAttempt(r, { skillId: r.skillId, correct: true, hintsUsed: 0, arabicHelpUsed: false, context: ctx, ts: NOW, firstTry: true });
    const sum = summarize({ [r.skillId]: r }, NOW);
    expect(sum.mastered.map((x) => x.skillId)).toEqual(['english.colors.blue']);
    expect(sum.newlyLearned).toHaveLength(1);
    expect(sum.needsReview).toHaveLength(0);
    expect(skillRow('english.colors.red', undefined, NOW).state).toBe('new');
  });
  it('gate question is 2-digit × 1-digit', () => {
    for (let i = 0; i < 50; i++) {
      const q = gateQuestion();
      expect(q.a).toBeGreaterThanOrEqual(10);
      expect(q.a).toBeLessThan(100);
      expect(q.b).toBeGreaterThanOrEqual(2);
      expect(q.b).toBeLessThan(10);
      expect(q.answer).toBe(q.a * q.b);
    }
  });
});
