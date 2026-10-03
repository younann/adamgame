import type { ChallengeType, GameContext } from '../types';

/**
 * Math skills. Unlike English concepts (vocabulary), each math skill describes a *kind* of
 * reasoning plus a range; the generator produces fresh numbers each time.
 */
export interface MathSkill {
  id: string;
  domain: 'math';
  category: 'counting' | 'recognition' | 'compare' | 'addition' | 'shapes' | 'order' | 'patterns';
  title: string; // parent-facing
  titleAr: string;
  type: ChallengeType;
  min: number;
  max: number;
  difficulty: 1 | 2 | 3;
  contexts: GameContext[];
  /** skill ids that should be familiar before this unlocks */
  requires: string[];
}

const SPORTY: GameContext[] = ['football', 'raceTunnel', 'treasureChest'];

export const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
export const NUMBER_WORDS_AR = [
  'صفر', 'واحد', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
];

export const MATH: MathSkill[] = [
  { id: 'math.count.1-3', domain: 'math', category: 'counting', title: 'Count 1–3', titleAr: 'العد ١–٣', type: 'countObjects', min: 1, max: 3, difficulty: 1, contexts: SPORTY, requires: [] },
  { id: 'math.count.1-5', domain: 'math', category: 'counting', title: 'Count 1–5', titleAr: 'العد ١–٥', type: 'countObjects', min: 2, max: 5, difficulty: 1, contexts: SPORTY, requires: ['math.count.1-3'] },
  { id: 'math.count.1-10', domain: 'math', category: 'counting', title: 'Count 1–10', titleAr: 'العد ١–١٠', type: 'countObjects', min: 4, max: 10, difficulty: 2, contexts: SPORTY, requires: ['math.count.1-5'] },
  { id: 'math.recognize.1-5', domain: 'math', category: 'recognition', title: 'Numbers 1–5', titleAr: 'الأرقام ١–٥', type: 'numberChoice', min: 1, max: 5, difficulty: 1, contexts: SPORTY, requires: [] },
  { id: 'math.recognize.1-10', domain: 'math', category: 'recognition', title: 'Numbers 1–10', titleAr: 'الأرقام ١–١٠', type: 'numberChoice', min: 1, max: 10, difficulty: 2, contexts: SPORTY, requires: ['math.recognize.1-5'] },
  { id: 'math.compare.bigger', domain: 'math', category: 'compare', title: 'Bigger number', titleAr: 'الرقم الأكبر', type: 'compare', min: 1, max: 9, difficulty: 2, contexts: SPORTY, requires: ['math.recognize.1-5'] },
  { id: 'math.order.next', domain: 'math', category: 'order', title: 'What comes next', titleAr: 'الرقم التالي', type: 'order', min: 1, max: 9, difficulty: 2, contexts: SPORTY, requires: ['math.count.1-5'] },
  { id: 'math.shapes.basic', domain: 'math', category: 'shapes', title: 'Shapes', titleAr: 'الأشكال', type: 'shapeMatch', min: 0, max: 0, difficulty: 1, contexts: ['heroPortal', 'treasureChest', 'raceTunnel'], requires: [] },
  { id: 'math.add.within5', domain: 'math', category: 'addition', title: 'Addition within 5', titleAr: 'الجمع حتى ٥', type: 'addition', min: 1, max: 5, difficulty: 3, contexts: SPORTY, requires: ['math.count.1-5', 'math.recognize.1-5'] },
];

export const MATH_BY_ID = new Map(MATH.map((m) => [m.id, m]));

export const SHAPES = [
  { key: 'circle', english: 'Circle', arabic: 'دائرة' },
  { key: 'square', english: 'Square', arabic: 'مربع' },
  { key: 'triangle', english: 'Triangle', arabic: 'مثلث' },
  { key: 'star', english: 'Star', arabic: 'نجمة' },
  { key: 'heart', english: 'Heart', arabic: 'قلب' },
];
