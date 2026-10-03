import type { Concept, GameContext } from '../types';

const ALL: GameContext[] = ['heroPortal', 'treasureChest'];

function c(
  category: string,
  key: string,
  english: string,
  arabic: string,
  difficulty: 1 | 2 | 3,
  kind: 'color' | 'icon' | 'shape' = 'icon',
  contexts: GameContext[] = ALL,
): Concept {
  return {
    id: `english.${category}.${key}`,
    domain: 'english',
    category,
    english,
    arabic,
    audioTarget: english,
    visual: { kind, key },
    difficulty,
    contexts,
  };
}

const COLOR_CONTEXTS: GameContext[] = ['heroPortal', 'raceGarage', 'football', 'treasureChest'];

/** ~50 V1 English concepts. Visual keys are drawn procedurally by conceptArt.ts. */
export const ENGLISH: Concept[] = [
  // colors (10)
  c('colors', 'red', 'Red', 'أحمر', 1, 'color', COLOR_CONTEXTS),
  c('colors', 'blue', 'Blue', 'أزرق', 1, 'color', COLOR_CONTEXTS),
  c('colors', 'yellow', 'Yellow', 'أصفر', 1, 'color', COLOR_CONTEXTS),
  c('colors', 'green', 'Green', 'أخضر', 1, 'color', COLOR_CONTEXTS),
  c('colors', 'orange', 'Orange', 'برتقالي', 2, 'color', COLOR_CONTEXTS),
  c('colors', 'purple', 'Purple', 'بنفسجي', 2, 'color', COLOR_CONTEXTS),
  c('colors', 'pink', 'Pink', 'زهري', 2, 'color', COLOR_CONTEXTS),
  c('colors', 'black', 'Black', 'أسود', 2, 'color', COLOR_CONTEXTS),
  c('colors', 'white', 'White', 'أبيض', 2, 'color', COLOR_CONTEXTS),
  c('colors', 'brown', 'Brown', 'بني', 3, 'color', COLOR_CONTEXTS),
  // animals (8)
  c('animals', 'cat', 'Cat', 'قطة', 1),
  c('animals', 'dog', 'Dog', 'كلب', 1),
  c('animals', 'fish', 'Fish', 'سمكة', 1),
  c('animals', 'bird', 'Bird', 'عصفور', 1),
  c('animals', 'lion', 'Lion', 'أسد', 2),
  c('animals', 'elephant', 'Elephant', 'فيل', 2),
  c('animals', 'cow', 'Cow', 'بقرة', 2),
  c('animals', 'duck', 'Duck', 'بطة', 2),
  // food (6)
  c('food', 'apple', 'Apple', 'تفاحة', 1),
  c('food', 'banana', 'Banana', 'موزة', 1),
  c('food', 'milk', 'Milk', 'حليب', 2),
  c('food', 'bread', 'Bread', 'خبز', 2),
  c('food', 'egg', 'Egg', 'بيضة', 2),
  c('food', 'cake', 'Cake', 'كعكة', 2),
  // family (4)
  c('family', 'mom', 'Mom', 'ماما', 1),
  c('family', 'dad', 'Dad', 'بابا', 1),
  c('family', 'baby', 'Baby', 'بيبي', 2),
  c('family', 'grandma', 'Grandma', 'تيتا', 3),
  // body parts (6)
  c('body', 'eye', 'Eye', 'عين', 1),
  c('body', 'nose', 'Nose', 'أنف', 1),
  c('body', 'hand', 'Hand', 'إيد', 1),
  c('body', 'foot', 'Foot', 'رجل', 2),
  c('body', 'ear', 'Ear', 'أذن', 2),
  c('body', 'mouth', 'Mouth', 'تم', 2),
  // toys (5)
  c('toys', 'ball', 'Ball', 'طابة', 1),
  c('toys', 'teddy', 'Teddy bear', 'دبدوب', 2),
  c('toys', 'kite', 'Kite', 'طيارة ورق', 3),
  c('toys', 'blocks', 'Blocks', 'مكعبات', 2),
  c('toys', 'balloon', 'Balloon', 'بالون', 1),
  // vehicles (5)
  c('vehicles', 'car', 'Car', 'سيارة', 1),
  c('vehicles', 'bus', 'Bus', 'باص', 1),
  c('vehicles', 'plane', 'Plane', 'طيارة', 1),
  c('vehicles', 'boat', 'Boat', 'قارب', 2),
  c('vehicles', 'train', 'Train', 'قطار', 2),
  // common objects (4)
  c('objects', 'sun', 'Sun', 'شمس', 1),
  c('objects', 'moon', 'Moon', 'قمر', 1),
  c('objects', 'star', 'Star', 'نجمة', 1),
  c('objects', 'tree', 'Tree', 'شجرة', 2),
  // actions (4) — shown as Adam poses
  c('actions', 'jump', 'Jump', 'نط', 2),
  c('actions', 'run', 'Run', 'اركض', 2),
  c('actions', 'kick', 'Kick', 'اشلط', 2),
  c('actions', 'clap', 'Clap', 'صفق', 3),
];

export const ENGLISH_BY_ID = new Map(ENGLISH.map((x) => [x.id, x]));

export function englishCategory(cat: string): Concept[] {
  return ENGLISH.filter((x) => x.category === cat);
}
