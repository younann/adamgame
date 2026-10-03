import { ENGLISH } from '../curriculum/english';
import { MATH } from '../curriculum/math';
import type { ChallengeType, GameContext } from '../types';

/**
 * A world adapter declares which challenge types a world can turn into gameplay and in which
 * context. The *same* challenge (e.g. english.colors.blue) becomes portals in Hero City,
 * garages in Turbo Racing, balls in Goal Stadium and chests on Treasure Island.
 */
export interface WorldAdapter {
  world: WorldId;
  supports: ChallengeType[];
  contextFor(type: ChallengeType): GameContext;
  /** Token replacements for generic prompts ({thing}/{things}/{thingsAr}). */
  tokens: { thing: string; things: string; thingsAr: string };
  /** review mode prefers skills Adam has struggled with */
  mode: 'normal' | 'review';
  /** Domains this world teaches */
  domains: ('english' | 'math')[];
}

export type WorldId = 'football' | 'hero' | 'racing' | 'treasure';

export const ADAPTERS: Record<WorldId, WorldAdapter> = {
  football: {
    world: 'football',
    supports: ['countObjects', 'numberChoice', 'colorMatch', 'addition', 'compare'],
    contextFor: () => 'football',
    tokens: { thing: 'ball', things: 'balls', thingsAr: 'الطابات' },
    mode: 'normal',
    domains: ['math', 'english'],
  },
  hero: {
    world: 'hero',
    supports: ['colorMatch', 'imageVocabulary', 'shapeMatch', 'listenAndChoose'],
    contextFor: () => 'heroPortal',
    tokens: { thing: 'star', things: 'stars', thingsAr: 'النجوم' },
    mode: 'normal',
    domains: ['english', 'math'],
  },
  racing: {
    world: 'racing',
    supports: ['numberChoice', 'countObjects', 'addition', 'compare', 'order', 'colorMatch'],
    contextFor: (t) => (t === 'colorMatch' ? 'raceGarage' : 'raceTunnel'),
    tokens: { thing: 'star', things: 'stars', thingsAr: 'النجوم' },
    mode: 'normal',
    domains: ['math'],
  },
  treasure: {
    world: 'treasure',
    supports: ['countObjects', 'numberChoice', 'colorMatch', 'imageVocabulary', 'shapeMatch', 'addition', 'compare', 'order'],
    contextFor: () => 'treasureChest',
    tokens: { thing: 'coin', things: 'coins', thingsAr: 'الليرات' },
    mode: 'review',
    domains: ['english', 'math'],
  },
};

function englishType(category: string): ChallengeType {
  return category === 'colors' ? 'colorMatch' : 'imageVocabulary';
}

/** All skills a world can present. */
export function candidateSkills(world: WorldId, opts: { domain?: 'english' | 'math'; colorsOnly?: boolean } = {}): string[] {
  const a = ADAPTERS[world];
  const out: string[] = [];
  if (a.domains.includes('english') && opts.domain !== 'math') {
    for (const c of ENGLISH) {
      const t = englishType(c.category);
      if (!a.supports.includes(t)) continue;
      if (!c.contexts.includes(a.contextFor(t))) continue;
      if (opts.colorsOnly && c.category !== 'colors') continue;
      out.push(c.id);
    }
  }
  if (a.domains.includes('math') && opts.domain !== 'english') {
    for (const m of MATH) {
      if (!a.supports.includes(m.type)) continue;
      if (!m.contexts.includes(a.contextFor(m.type))) continue;
      out.push(m.id);
    }
  }
  return out;
}

export function skillType(skillId: string): ChallengeType {
  if (skillId.startsWith('english.')) return skillId.startsWith('english.colors.') ? 'colorMatch' : 'imageVocabulary';
  return MATH.find((m) => m.id === skillId)?.type ?? 'numberChoice';
}
