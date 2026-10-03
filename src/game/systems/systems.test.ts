import { describe, expect, it } from 'vitest';
import { isItemUnlocked, newlyUnlocked, starsForAnswer, worldsUnlocked } from './RewardEngine';
import { SessionTimer } from './SessionTimer';

describe('RewardEngine', () => {
  it('always rewards, more for independence', () => {
    expect(starsForAnswer(1, 0)).toBe(3);
    expect(starsForAnswer(1, 1)).toBe(2);
    expect(starsForAnswer(2, 0)).toBe(2);
    expect(starsForAnswer(5, 3)).toBe(1);
  });
  it('unlocks default items immediately and earned items by progress', () => {
    const base = { stars: 0, trophies: 0, missionsCompleted: {}, unlocked: [] as string[] };
    const d = newlyUnlocked(base);
    expect(d).toContain('outfit.kit-home');
    expect(d).not.toContain('shoes.gold-boots');
    const after = newlyUnlocked({ ...base, unlocked: d, missionsCompleted: { football: 1 } });
    expect(after).toEqual(['shoes.gold-boots']);
    expect(newlyUnlocked({ ...base, unlocked: d, stars: 20 })).toContain('trail.stars');
    expect(isItemUnlocked('cape.none', base)).toBe(true);
  });
  it('opens Treasure Island once there is something to review', () => {
    expect(worldsUnlocked({ missionsCompleted: {}, totalAttempts: 0 })).not.toContain('treasure');
    expect(worldsUnlocked({ missionsCompleted: { football: 1, hero: 1 }, totalAttempts: 3 })).toContain('treasure');
    expect(worldsUnlocked({ missionsCompleted: {}, totalAttempts: 0, forced: ['treasure'] })).toContain('treasure');
  });
});

describe('SessionTimer', () => {
  it('counts only active time and expires at the limit', () => {
    const t = new SessionTimer(10);
    for (let i = 0; i < 9 * 60; i++) t.tick(1000);
    expect(t.isExpired()).toBe(false);
    for (let i = 0; i < 60; i++) t.tick(1000);
    expect(t.isExpired()).toBe(true);
    expect(t.shouldWrapUp()).toBe(true);
  });
  it('ignores huge resume spikes', () => {
    const t = new SessionTimer(10);
    t.tick(3_600_000);
    expect(t.activeMs).toBe(0);
  });
  it('unlimited never expires; parent can extend', () => {
    const u = new SessionTimer(0);
    for (let i = 0; i < 1000; i++) u.tick(4000);
    expect(u.isExpired()).toBe(false);
    const t = new SessionTimer(10);
    for (let i = 0; i < 150; i++) t.tick(4000);
    expect(t.isExpired()).toBe(true);
    t.extend(5);
    expect(t.isExpired()).toBe(false);
    expect(t.remainingMs).toBe(5 * 60_000);
  });
});
