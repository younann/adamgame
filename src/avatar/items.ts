/**
 * Avatar customisation catalogue. Everything is earned by playing — there are no prices,
 * currencies or purchases anywhere in the game.
 */

export type AvatarSlot = 'outfit' | 'cape' | 'shoes' | 'helmet' | 'mask' | 'gloves' | 'trail' | 'celebration';

export interface AvatarState {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'curly' | 'spiky';
  eyes: number;
  outfit: string;
  cape: string;
  shoes: string;
  helmet: string;
  mask: string;
  gloves: string;
  trail: string;
  celebration: string;
  /** Use the parent-provided photo as Adam's face (architecture for photo likeness). */
  usePhotoFace: boolean;
}

export type UnlockRule =
  | { kind: 'default' }
  | { kind: 'stars'; amount: number }
  | { kind: 'trophies'; amount: number }
  | { kind: 'missions'; world: 'football' | 'hero' | 'racing' | 'treasure'; count: number };

export interface AvatarItem {
  id: string;
  slot: AvatarSlot;
  nameEn: string;
  nameAr: string;
  /** main colours used by the procedural renderer */
  colors: { main: number; accent: number; trim?: number };
  unlock: UnlockRule;
}

export const AVATAR_ITEMS: AvatarItem[] = [
  // outfits
  { id: 'outfit.hero-blue', slot: 'outfit', nameEn: 'Hero Suit', nameAr: 'بدلة البطل', colors: { main: 0x1e6bff, accent: 0xfeb700, trim: 0xffffff }, unlock: { kind: 'default' } },
  { id: 'outfit.kit-home', slot: 'outfit', nameEn: 'Football Kit', nameAr: 'طقم الملعب', colors: { main: 0x1e6bff, accent: 0xffffff, trim: 0xfeb700 }, unlock: { kind: 'default' } },
  { id: 'outfit.kit-gold', slot: 'outfit', nameEn: 'Golden Kit', nameAr: 'الطقم الذهبي', colors: { main: 0xfeb700, accent: 0x0d1322, trim: 0xffffff }, unlock: { kind: 'missions', world: 'football', count: 2 } },
  { id: 'outfit.race-suit', slot: 'outfit', nameEn: 'Racing Suit', nameAr: 'بدلة السباق', colors: { main: 0xff4b4b, accent: 0xffffff, trim: 0x1e6bff }, unlock: { kind: 'missions', world: 'racing', count: 1 } },
  { id: 'outfit.mint-hero', slot: 'outfit', nameEn: 'Energy Suit', nameAr: 'بدلة الطاقة', colors: { main: 0x00875d, accent: 0x4edea3, trim: 0xffffff }, unlock: { kind: 'missions', world: 'hero', count: 2 } },
  // capes
  { id: 'cape.none', slot: 'cape', nameEn: 'No Cape', nameAr: 'بدون', colors: { main: 0, accent: 0 }, unlock: { kind: 'default' } },
  { id: 'cape.red', slot: 'cape', nameEn: 'Red Cape', nameAr: 'العباءة الحمراء', colors: { main: 0xff4b4b, accent: 0xb3121f }, unlock: { kind: 'default' } },
  { id: 'cape.blue', slot: 'cape', nameEn: 'Lightning Cape', nameAr: 'عباءة البرق', colors: { main: 0x2f7bff, accent: 0x003fa5 }, unlock: { kind: 'missions', world: 'hero', count: 1 } },
  { id: 'cape.gold', slot: 'cape', nameEn: 'Champion Cape', nameAr: 'عباءة البطل', colors: { main: 0xfeb700, accent: 0xb07a00 }, unlock: { kind: 'stars', amount: 60 } },
  // shoes
  { id: 'shoes.sneakers', slot: 'shoes', nameEn: 'Sneakers', nameAr: 'كوتشي', colors: { main: 0xffffff, accent: 0x1e6bff }, unlock: { kind: 'default' } },
  { id: 'shoes.gold-boots', slot: 'shoes', nameEn: 'Golden Boots', nameAr: 'الحذاء الذهبي', colors: { main: 0xfeb700, accent: 0xffffff }, unlock: { kind: 'missions', world: 'football', count: 1 } },
  { id: 'shoes.speed', slot: 'shoes', nameEn: 'Speed Boots', nameAr: 'حذاء السرعة', colors: { main: 0x4edea3, accent: 0x0d1322 }, unlock: { kind: 'stars', amount: 30 } },
  // helmet
  { id: 'helmet.none', slot: 'helmet', nameEn: 'No Helmet', nameAr: 'بدون', colors: { main: 0, accent: 0 }, unlock: { kind: 'default' } },
  { id: 'helmet.racing', slot: 'helmet', nameEn: 'Racing Helmet', nameAr: 'خوذة السباق', colors: { main: 0xff4b4b, accent: 0xffffff, trim: 0x1e6bff }, unlock: { kind: 'missions', world: 'racing', count: 1 } },
  { id: 'helmet.star', slot: 'helmet', nameEn: 'Star Helmet', nameAr: 'خوذة النجوم', colors: { main: 0x1e6bff, accent: 0xfeb700, trim: 0xffffff }, unlock: { kind: 'missions', world: 'racing', count: 3 } },
  // mask
  { id: 'mask.none', slot: 'mask', nameEn: 'No Mask', nameAr: 'بدون', colors: { main: 0, accent: 0 }, unlock: { kind: 'default' } },
  { id: 'mask.hero', slot: 'mask', nameEn: 'Hero Mask', nameAr: 'قناع البطل', colors: { main: 0xff4b4b, accent: 0x0d1322 }, unlock: { kind: 'missions', world: 'hero', count: 1 } },
  { id: 'mask.blue', slot: 'mask', nameEn: 'Blue Mask', nameAr: 'القناع الأزرق', colors: { main: 0x1e6bff, accent: 0x0d1322 }, unlock: { kind: 'stars', amount: 45 } },
  // gloves
  { id: 'gloves.none', slot: 'gloves', nameEn: 'No Gloves', nameAr: 'بدون', colors: { main: 0, accent: 0 }, unlock: { kind: 'default' } },
  { id: 'gloves.power', slot: 'gloves', nameEn: 'Power Gloves', nameAr: 'قفازات القوة', colors: { main: 0x4edea3, accent: 0xffffff }, unlock: { kind: 'missions', world: 'treasure', count: 1 } },
  // trails
  { id: 'trail.none', slot: 'trail', nameEn: 'No Trail', nameAr: 'بدون', colors: { main: 0, accent: 0 }, unlock: { kind: 'default' } },
  { id: 'trail.stars', slot: 'trail', nameEn: 'Star Trail', nameAr: 'ذيل النجوم', colors: { main: 0xfeb700, accent: 0xffffff }, unlock: { kind: 'stars', amount: 20 } },
  { id: 'trail.lightning', slot: 'trail', nameEn: 'Lightning Trail', nameAr: 'ذيل البرق', colors: { main: 0x4edea3, accent: 0x1e6bff }, unlock: { kind: 'trophies', amount: 2 } },
  // celebrations
  { id: 'celebration.jump', slot: 'celebration', nameEn: 'Super Jump', nameAr: 'القفزة الخارقة', colors: { main: 0xfeb700, accent: 0 }, unlock: { kind: 'default' } },
  { id: 'celebration.spin', slot: 'celebration', nameEn: 'Tornado Spin', nameAr: 'دوران الإعصار', colors: { main: 0x4edea3, accent: 0 }, unlock: { kind: 'stars', amount: 40 } },
  { id: 'celebration.flex', slot: 'celebration', nameEn: 'Champion Pose', nameAr: 'وقفة البطل', colors: { main: 0x1e6bff, accent: 0 }, unlock: { kind: 'trophies', amount: 1 } },
];

export const ITEM_BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));

export const SKIN_TONES = [0xf6cfa8, 0xe9b48a, 0xc98e62, 0x9c6a43, 0x6e4a2e];
export const HAIR_COLORS = [0x2a1a10, 0x4a2c17, 0x111111, 0x7a4a22, 0xc9902e];

export const DEFAULT_AVATAR: AvatarState = {
  skin: 1,
  hair: 0,
  hairStyle: 'curly',
  eyes: 0,
  outfit: 'outfit.kit-home',
  cape: 'cape.none',
  shoes: 'shoes.sneakers',
  helmet: 'helmet.none',
  mask: 'mask.none',
  gloves: 'gloves.none',
  trail: 'trail.none',
  celebration: 'celebration.jump',
  usePhotoFace: false,
};

/** Human-friendly description of what unlocks a locked item (spoken in the closet). */
export function unlockHint(rule: UnlockRule): { ar: string; en: string; world?: string } {
  switch (rule.kind) {
    case 'default':
      return { ar: '', en: '' };
    case 'stars':
      return { ar: `اجمع ${rule.amount} نجمة لتفتحها!`, en: `Collect ${rule.amount} stars!` };
    case 'trophies':
      return { ar: 'اربح كأس لتفتحها!', en: 'Win a trophy!' };
    case 'missions': {
      const w = { football: 'الملعب', hero: 'مدينة الأبطال', racing: 'السباق', treasure: 'جزيرة الكنز' }[rule.world];
      return { ar: `العب في ${w} لتفتحها!`, en: `Play in ${rule.world}!`, world: rule.world };
    }
  }
}
