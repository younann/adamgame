import { HAIR_COLORS, SKIN_TONES } from '@/avatar/items';
import type { useGame } from '@/state/gameStore';
import type { HeroLook } from './Hero3D';

type Avatar = ReturnType<typeof useGame.getState>['save']['avatar'];

const CAPE_COLOR: Record<string, number> = { 'cape.red': 0xff4b4b, 'cape.blue': 0x2f7bff, 'cape.gold': 0xfeb700 };

/** Adam's 3D look from his saved avatar (skin, hair, cape) in his blue #4 kit. */
export function adamLook(avatar: Avatar): HeroLook {
  return {
    skin: SKIN_TONES[avatar.skin] ?? 0xd9a06f,
    hair: HAIR_COLORS[avatar.hair] ?? 0x2a1a10,
    hairStyle: avatar.hairStyle,
    eyes: 0x5a3820,
    shirt: 0x1e6bff, shirtTrim: 0xffffff, shorts: 0xffffff, socks: 0x1e6bff, shoes: 0xffffff, shoeStripe: 0x1e6bff,
    number: '4', name: 'ADAM',
    cape: CAPE_COLOR[avatar.cape] ?? null,
  };
}
