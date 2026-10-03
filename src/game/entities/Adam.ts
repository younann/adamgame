import { Texture } from 'pixi.js';
import { HAIR_COLORS, ITEM_BY_ID, SKIN_TONES, type AvatarState } from '@/avatar/items';
import { useGame } from '@/state/gameStore';
import { Kid, type KidLook } from './Kid';

/** Map the saved avatar (layers: skin, hair, outfit, shoes, cape, helmet, mask, gloves…) to a rig look. */
export function adamLook(a: AvatarState): KidLook {
  const outfit = ITEM_BY_ID.get(a.outfit);
  const shoes = ITEM_BY_ID.get(a.shoes);
  const cape = ITEM_BY_ID.get(a.cape);
  const helmet = ITEM_BY_ID.get(a.helmet);
  const mask = ITEM_BY_ID.get(a.mask);
  const gloves = ITEM_BY_ID.get(a.gloves);
  const main = outfit?.colors.main ?? 0x1e6bff;
  const accent = outfit?.colors.accent ?? 0xffffff;
  const trim = outfit?.colors.trim ?? 0xfeb700;
  const isHero = a.outfit === 'outfit.hero-blue' || a.outfit === 'outfit.mint-hero';
  return {
    skin: SKIN_TONES[a.skin] ?? SKIN_TONES[1],
    hair: HAIR_COLORS[a.hair] ?? HAIR_COLORS[0],
    hairStyle: a.hairStyle,
    eyeColor: 0x5a3820,
    shirt: main,
    shirtAccent: isHero ? trim : accent,
    trim,
    shorts: isHero ? main : a.outfit === 'outfit.kit-gold' ? 0x0d1322 : 0xffffff,
    socks: isHero ? main : main,
    shoes: shoes?.colors.main ?? 0xffffff,
    shoeAccent: shoes?.colors.accent ?? 0x1e6bff,
    gloves: gloves && gloves.id !== 'gloves.none' ? gloves.colors.main : null,
    cape: cape && cape.id !== 'cape.none' ? { main: cape.colors.main, accent: cape.colors.accent } : null,
    helmet: helmet && helmet.id !== 'helmet.none' ? { main: helmet.colors.main, accent: helmet.colors.accent, trim: helmet.colors.trim } : null,
    mask: mask && mask.id !== 'mask.none' ? { main: mask.colors.main } : null,
    number: '4',
    name: 'ADAM',
    emblem: isHero ? (a.outfit === 'outfit.mint-hero' ? 'bolt' : 'star') : 'number',
    fullSuit: isHero,
  };
}

let faceTexCache: { src: string; tex: Texture } | null = null;

/** Texture from the parent-uploaded photo (data URL), cached. */
export async function loadFaceTexture(): Promise<Texture | null> {
  const s = useGame.getState().save;
  const src = s.profile.faceImage;
  if (!src || !s.avatar.usePhotoFace) return null;
  if (faceTexCache?.src === src) return faceTexCache.tex;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const tex = Texture.from(img);
    faceTexCache = { src, tex };
    return tex;
  } catch {
    return null;
  }
}

/** Adam — the hero of every world. Reads his saved avatar and stays in sync with it. */
export class Adam extends Kid {
  private unsub: (() => void) | null = null;

  constructor(face: Texture | null = null, avatar?: AvatarState) {
    super(adamLook(avatar ?? useGame.getState().save.avatar), face);
    if (!avatar) {
      let last = useGame.getState().save.avatar;
      this.unsub = useGame.subscribe((st) => {
        if (st.save.avatar !== last) {
          last = st.save.avatar;
          void loadFaceTexture().then((tex) => !this.destroyed && this.setLook(adamLook(last), tex));
        }
      });
    }
  }

  /** Preview a different avatar (closet) without saving. */
  preview(a: AvatarState) {
    this.setLook(adamLook(a));
  }

  get celebrationStyle() {
    return useGame.getState().save.avatar.celebration;
  }

  get trail() {
    return ITEM_BY_ID.get(useGame.getState().save.avatar.trail);
  }

  destroy(options?: Parameters<Kid['destroy']>[0]) {
    this.unsub?.();
    super.destroy(options);
  }
}
