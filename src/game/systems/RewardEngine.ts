import { AVATAR_ITEMS, type UnlockRule } from '@/avatar/items';

export interface RewardProgress {
  stars: number;
  trophies: number;
  missionsCompleted: Record<string, number>;
  unlocked: string[];
}

/** Stars for a solved challenge — always positive; independence earns more. */
export function starsForAnswer(attemptNo: number, hintsUsed: number): number {
  if (attemptNo <= 1 && hintsUsed === 0) return 3;
  if (attemptNo <= 2) return 2;
  return 1;
}

export const MISSION_BONUS = 2;
export const SESSION_REWARD = 5;

export function ruleSatisfied(rule: UnlockRule, p: RewardProgress): boolean {
  switch (rule.kind) {
    case 'default':
      return true;
    case 'stars':
      return p.stars >= rule.amount;
    case 'trophies':
      return p.trophies >= rule.amount;
    case 'missions':
      return (p.missionsCompleted[rule.world] ?? 0) >= rule.count;
  }
}

/** Item ids that became unlocked given current progress (not already unlocked). */
export function newlyUnlocked(p: RewardProgress): string[] {
  return AVATAR_ITEMS.filter((i) => !p.unlocked.includes(i.id) && ruleSatisfied(i.unlock, p)).map((i) => i.id);
}

export function isItemUnlocked(id: string, p: RewardProgress): boolean {
  return p.unlocked.includes(id) || AVATAR_ITEMS.some((i) => i.id === id && i.unlock.kind === 'default');
}

/** Worlds open by progression. Treasure Island opens once there is something to review. */
export function worldsUnlocked(p: { missionsCompleted: Record<string, number>; totalAttempts: number; forced?: string[] }): string[] {
  const out = ['football', 'hero', 'racing', 'closet'];
  const played = Object.values(p.missionsCompleted).filter((n) => n > 0).length;
  if (played >= 2 || p.totalAttempts >= 8) out.push('treasure');
  for (const f of p.forced ?? []) if (!out.includes(f)) out.push(f);
  return out;
}
