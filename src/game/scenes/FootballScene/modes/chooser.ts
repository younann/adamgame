import { candidateSkills } from '@/learning/adapters';
import { isUnlocked, pickNextSkill } from '@/learning/adaptive/AdaptiveQueue';
import { useGame } from '@/state/gameStore';
import type { RunOptions } from '../../../systems/ChallengeRunner';
import type { FootballMode } from './types';

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Plan a 3-challenge match with variety: a counting/dribbling opener, a passing/colour/keeper
 * middle, and a big finish (free kick, target shot or the classic penalty count).
 * The three slots draw from different pools, so a match always has ≥ 2 distinct modes.
 */
export function planMatch(forced?: string): FootballMode[] {
  const all: FootballMode[] = ['count', 'target', 'color', 'freekick', 'dribble', 'passing', 'keeper'];
  if (forced && (all as string[]).includes(forced)) {
    // a save scores no goal, so a forced keeper match still needs one scoring mode to end in a win
    return forced === 'keeper' ? ['keeper', 'keeper', 'freekick'] : [forced as FootballMode, forced as FootballMode, forced as FootballMode];
  }
  return [pick(['count', 'dribble'] as const), pick(['passing', 'color', 'keeper'] as const), pick(['freekick', 'target', 'count'] as const)];
}

const isMath = (prefix: string[]) => (id: string) => prefix.some((p) => id.startsWith(p));

/** Runner options (filter or explicit skill) that suit a mode. */
export function skillOptionsFor(mode: FootballMode): Pick<RunOptions, 'filter' | 'skillId'> {
  const store = useGame.getState();
  const records = store.save.skills;
  const now = Date.now();
  switch (mode) {
    case 'count':
      return { filter: isMath(['math.count.', 'math.add.']) };
    case 'target':
    case 'freekick':
      return { filter: isMath(['math.recognize.', 'math.compare.']) };
    case 'dribble':
      // "what comes next?" when the order skill is open; otherwise find-the-number cones
      if (isUnlocked('math.order.next', records, now) && Math.random() < 0.6) return { skillId: 'math.order.next' };
      return { filter: isMath(['math.recognize.']) };
    case 'color':
      return { filter: (id) => id.startsWith('english.colors.') };
    case 'keeper':
      return { filter: (id) => id.startsWith('math.recognize.') || id.startsWith('english.colors.') };
    case 'passing': {
      // colours or English vocabulary on the teammates' cards
      const cands = [
        ...candidateSkills('football').filter((id) => id.startsWith('english.colors.')),
        ...candidateSkills('hero').filter((id) => id.startsWith('english.') && !id.startsWith('english.colors.') && !id.startsWith('english.actions.')),
      ];
      const skillId = pickNextSkill({ candidates: cands, records, context: 'football', recent: store.save.recentSkills, now });
      return skillId ? { skillId } : { filter: (id) => id.startsWith('english.colors.') };
    }
  }
}
