import { ENGLISH } from '@/learning/curriculum/english';
import { MATH } from '@/learning/curriculum/math';
import type { ConceptVisual, SkillRecord } from '@/learning/types';

/**
 * Sticker book catalogue. Pure data + rules (unit-tested).
 * - One sticker per English concept and per math skill: earned on the FIRST independent
 *   success (correct, first try, no hints, no Arabic help) — learning *is* the collection.
 * - Special stickers for milestones (first goal, first race win, trophies...).
 * No randomness for purchase, no streaks, nothing that can be lost.
 */
export type StickerCategory =
  | 'colors' | 'animals' | 'food' | 'family' | 'body' | 'toys' | 'vehicles' | 'objects' | 'actions'
  | 'numbers' | 'shapes' | 'special';

export interface Sticker {
  id: string;
  category: StickerCategory;
  english: string;
  arabic: string;
  /** concept/skill art; special keys (trophy, badge…) are drawn by stickerArt.ts */
  visual: ConceptVisual;
  skillId?: string;
}

export const STICKER_CATEGORIES: { id: StickerCategory; english: string; arabic: string }[] = [
  { id: 'colors', english: 'Colours', arabic: 'الألوان' },
  { id: 'animals', english: 'Animals', arabic: 'الحيوانات' },
  { id: 'food', english: 'Food', arabic: 'الأكل' },
  { id: 'family', english: 'Family', arabic: 'العيلة' },
  { id: 'body', english: 'Body', arabic: 'الجسم' },
  { id: 'toys', english: 'Toys', arabic: 'الألعاب' },
  { id: 'vehicles', english: 'Vehicles', arabic: 'المركبات' },
  { id: 'objects', english: 'Things', arabic: 'أشياء' },
  { id: 'actions', english: 'Actions', arabic: 'حركات' },
  { id: 'numbers', english: 'Numbers', arabic: 'الأرقام' },
  { id: 'shapes', english: 'Shapes', arabic: 'الأشكال' },
  { id: 'special', english: 'Special', arabic: 'مميزة' },
];

/** Math skills → a friendly sticker word + picture. */
const MATH_STICKERS: Record<string, { english: string; arabic: string; visual: ConceptVisual; category: StickerCategory }> = {
  'math.count.1-3': { english: 'Three', arabic: 'ثلاثة', visual: { kind: 'number', key: '3', value: 3 }, category: 'numbers' },
  'math.count.1-5': { english: 'Five', arabic: 'خمسة', visual: { kind: 'number', key: '5', value: 5 }, category: 'numbers' },
  'math.count.1-10': { english: 'Ten', arabic: 'عشرة', visual: { kind: 'number', key: '10', value: 10 }, category: 'numbers' },
  'math.recognize.1-5': { english: 'Four', arabic: 'أربعة', visual: { kind: 'number', key: '4', value: 4 }, category: 'numbers' },
  'math.recognize.1-10': { english: 'Seven', arabic: 'سبعة', visual: { kind: 'number', key: '7', value: 7 }, category: 'numbers' },
  'math.compare.bigger': { english: 'Bigger', arabic: 'أكبر', visual: { kind: 'number', key: '9', value: 9 }, category: 'numbers' },
  'math.order.next': { english: 'Next', arabic: 'اللي بعده', visual: { kind: 'number', key: '6', value: 6 }, category: 'numbers' },
  'math.add.within5': { english: 'Plus', arabic: 'زائد', visual: { kind: 'number', key: '2+3' }, category: 'numbers' },
  'math.shapes.basic': { english: 'Circle', arabic: 'دائرة', visual: { kind: 'shape', key: 'circle' }, category: 'shapes' },
};

export const SPECIAL_STICKERS: Sticker[] = [
  { id: 'special.first-goal', category: 'special', english: 'Goal!', arabic: 'هدف!', visual: { kind: 'icon', key: 'special:football' } },
  { id: 'special.first-race', category: 'special', english: 'Race winner!', arabic: 'بطل السباق!', visual: { kind: 'icon', key: 'special:flag' } },
  { id: 'special.first-rescue', category: 'special', english: 'Hero!', arabic: 'بطل!', visual: { kind: 'icon', key: 'special:badge' } },
  { id: 'special.first-treasure', category: 'special', english: 'Treasure!', arabic: 'كنز!', visual: { kind: 'icon', key: 'special:gem' } },
  { id: 'special.trophy-1', category: 'special', english: 'Trophy!', arabic: 'كأس!', visual: { kind: 'icon', key: 'special:trophy' } },
  { id: 'special.trophy-3', category: 'special', english: 'Three trophies!', arabic: 'ثلاث كؤوس!', visual: { kind: 'icon', key: 'special:trophies' } },
  { id: 'special.hero-badge', category: 'special', english: 'Super hero!', arabic: 'بطل خارق!', visual: { kind: 'icon', key: 'special:lightning' } },
  { id: 'special.rainbow', category: 'special', english: 'Rainbow!', arabic: 'قوس قزح!', visual: { kind: 'icon', key: 'special:rainbow' } },
];

const conceptCategory = (c: string): StickerCategory =>
  (['colors', 'animals', 'food', 'family', 'body', 'toys', 'vehicles', 'objects', 'actions'] as const).find((x) => x === c) ?? 'objects';

export const STICKERS: Sticker[] = [
  ...ENGLISH.map((c) => ({
    id: `sticker.${c.id}`,
    category: conceptCategory(c.category),
    english: c.english,
    arabic: c.arabic,
    visual: c.visual,
    skillId: c.id,
  })),
  ...MATH.filter((m) => MATH_STICKERS[m.id]).map((m) => ({ id: `sticker.${m.id}`, skillId: m.id, ...MATH_STICKERS[m.id] })),
  ...SPECIAL_STICKERS,
];

export const STICKER_BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export function stickerIdForSkill(skillId: string): string | null {
  const id = `sticker.${skillId}`;
  return STICKER_BY_ID.has(id) ? id : null;
}

export function stickersInCategory(cat: StickerCategory): Sticker[] {
  return STICKERS.filter((s) => s.category === cat);
}

/** Sticker earned by an attempt: the first independent success for that skill. */
export function stickerForProgress(skillId: string, before: SkillRecord | undefined, after: SkillRecord): string | null {
  const prev = before?.independentSuccesses ?? 0;
  if (after.independentSuccesses >= 1 && prev < 1) return stickerIdForSkill(skillId);
  return null;
}

/** Milestone stickers when a mission is completed (`countAfter` = missions done in that world). */
export function specialsForMission(world: string, countAfter: number): string[] {
  const out: string[] = [];
  if (countAfter === 1) {
    const first: Record<string, string> = {
      football: 'special.first-goal',
      racing: 'special.first-race',
      hero: 'special.first-rescue',
      treasure: 'special.first-treasure',
    };
    if (first[world]) out.push(first[world]);
  }
  if (world === 'hero' && countAfter === 3) out.push('special.hero-badge');
  return out;
}

/**
 * Stickers a save has already earned under the current rules but doesn't own (e.g. progress
 * made before stickers existed). Applied silently on load — no reveal flood.
 */
export function backfillStickers(save: {
  stickers: string[];
  skills: Record<string, SkillRecord>;
  trophies: number;
  worlds: { missionsCompleted: Record<string, number> };
}): string[] {
  const has = new Set(save.stickers);
  const out: string[] = [];
  const add = (id: string | null) => {
    if (id && !has.has(id) && STICKER_BY_ID.has(id)) {
      has.add(id);
      out.push(id);
    }
  };
  for (const [skillId, rec] of Object.entries(save.skills)) if (rec.independentSuccesses >= 1) add(stickerIdForSkill(skillId));
  for (const [world, n] of Object.entries(save.worlds.missionsCompleted)) for (let c = 1; c <= n; c++) specialsForMission(world, c).forEach(add);
  for (let t = 1; t <= save.trophies; t++) specialsForTrophies(t).forEach(add);
  return out;
}

export function specialsForTrophies(countAfter: number): string[] {
  if (countAfter === 1) return ['special.trophy-1'];
  if (countAfter === 3) return ['special.trophy-3'];
  return [];
}

/**
 * Daily surprise sticker: prefer a concept Adam has practised but doesn't own yet (reinforces
 * something he's learning), then an easy new word, then the rainbow. null = he has them all.
 */
export function dailyGiftSticker(owned: string[], skills: Record<string, SkillRecord>, rng: () => number = Math.random): string | null {
  const has = new Set(owned);
  const practised = STICKERS.filter((s) => s.skillId && !has.has(s.id) && (skills[s.skillId]?.attempts ?? 0) > 0);
  if (practised.length) return practised[Math.floor(rng() * practised.length)].id;
  const easy = STICKERS.filter((s) => s.skillId?.startsWith('english.') && !has.has(s.id) && ENGLISH.find((c) => c.id === s.skillId)?.difficulty === 1);
  if (easy.length) return easy[Math.floor(rng() * easy.length)].id;
  if (!has.has('special.rainbow')) return 'special.rainbow';
  const rest = STICKERS.filter((s) => !has.has(s.id) && s.category !== 'special');
  return rest.length ? rest[Math.floor(rng() * rest.length)].id : null;
}

/** Local calendar day, YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function giftAvailable(lastGiftDay: string | undefined, today: string = localDay()): boolean {
  return lastGiftDay !== today;
}
