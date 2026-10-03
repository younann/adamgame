import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { DEFAULT_AVATAR, ITEM_BY_ID } from '@/avatar/items';
import { useGame } from '@/state/gameStore';
import { Adam } from '../entities/Adam';
import { gameText } from '../draw/paint';
import { Ease } from '../engine/Tween';
import type { Scene } from '../engine/Scene';
import { hudAnchorPosition } from '../engine/hudBridge';
import { STICKER_BY_ID } from '../systems/stickers';
import { drawSticker } from '../scenes/StickerScene/stickerArt';

/**
 * Short in-scene unlock reveal: a spotlight opens, a mini-Adam appears wearing the newly
 * earned item, Sparky names it, and it shrinks away toward the closet. No modal grid.
 */
export async function revealUnlocks(scene: Scene): Promise<void> {
  const ids = useGame.getState().consumeUnlocks(2);
  for (const id of ids) {
    const item = ITEM_BY_ID.get(id);
    if (!item) continue;
    const c = new Container();
    const dim = new Graphics().rect(0, 0, scene.width, scene.height).fill({ color: 0x000000, alpha: 0.55 });
    dim.alpha = 0;
    const beam = new Sprite(scene.tex('glow'));
    beam.anchor.set(0.5);
    beam.tint = color.gold;
    beam.blendMode = 'add';
    beam.scale.set(4.5);
    beam.position.set(scene.width / 2, scene.height * 0.5);
    const preview = { ...useGame.getState().save.avatar, [item.slot]: id };
    if (item.slot === 'helmet' || item.slot === 'mask') preview.usePhotoFace = false;
    const mini = new Adam(null, { ...DEFAULT_AVATAR, ...preview });
    mini.position.set(scene.width / 2, scene.height * 0.62);
    const k = Math.min(scene.width, scene.height) / 420;
    mini.scale.set(0);
    mini.setExpression('excited');
    mini.setPose('heroPose');
    const label = gameText(item.nameAr, 34 * k + 6, { fillColor: color.gold });
    label.position.set(scene.width / 2, scene.height * 0.62 + 40 * k);
    label.alpha = 0;
    c.addChild(dim, beam, mini, label);
    scene.overlay.addChild(c);
    // Self-terminating: if the scene is left mid-reveal the awaits below never resume, so the
    // finally block would never run — stop as soon as the scene or the sprite is gone.
    const handle = setInterval(() => {
      if (!scene.alive || mini.destroyed) return clearInterval(handle);
      mini.update(1 / 60);
    }, 16);
    try {
      scene.sfx('unlock');
      await scene.tw.to(dim, { alpha: 1 }, { duration: 250 });
      await scene.tw.to(mini.scale, { x: 1.4 * k, y: 1.4 * k }, { duration: 600, ease: Ease.elasticOut });
      scene.celebrate(scene.camera.x, scene.camera.y, 0.8);
      void scene.tw.to(label, { alpha: 1 }, { duration: 300 });
      await scene.say([{ text: `واو! فتحت ${item.nameAr}!`, lang: 'ar' }, { text: item.nameEn, lang: 'en' }], 'sparky');
      await scene.tw.to(mini.scale, { x: 0, y: 0 }, { duration: 350, ease: Ease.backIn });
      await scene.tw.to(c, { alpha: 0 }, { duration: 250 });
    } finally {
      clearInterval(handle);
      c.destroy({ children: true });
    }
  }
  await revealStickers(scene);
}

/**
 * Newly earned stickers (≤2 at a time; the rest wait for the next moment): the sticker
 * flies out big with a shine, Sparky says the word in English then Arabic, then it flies
 * away toward the HUD/sticker book.
 */
export async function revealStickers(scene: Scene): Promise<void> {
  for (const id of useGame.getState().consumeStickers(2)) await showStickerReveal(scene, id);
}

export async function showStickerReveal(scene: Scene, id: string, opts: { from?: { x: number; y: number }; intro?: boolean } = {}) {
  const st = STICKER_BY_ID.get(id);
  if (!st) return;
  const W = scene.width;
  const H = scene.height;
  const k = Math.min(W, H) / 420;
  const c = new Container();
  const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.5 });
  dim.alpha = 0;
  const shine = new Sprite(scene.tex('glow'));
  shine.anchor.set(0.5);
  shine.tint = color.gold;
  shine.blendMode = 'add';
  shine.position.set(W / 2, H * 0.45);
  shine.scale.set(0);
  const rays = new Graphics();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rays.poly([0, 0, Math.cos(a) * 400, Math.sin(a) * 400, Math.cos(a + 0.13) * 400, Math.sin(a + 0.13) * 400]).fill({ color: i % 2 ? color.gold : color.mint, alpha: 0.12 });
  }
  rays.position.set(W / 2, H * 0.45);
  rays.alpha = 0;
  const card = drawSticker(st, 150);
  const from = opts.from ?? { x: W / 2, y: H * 0.75 };
  card.position.set(from.x, from.y);
  card.scale.set(0.1);
  const word = gameText(st.english.toUpperCase(), 40 * k + 4, { fillColor: color.gold });
  word.position.set(W / 2, H * 0.45 + 110 * k);
  word.alpha = 0;
  c.addChild(dim, rays, shine, card, word);
  scene.overlay.addChild(c);
  let spin = 0;
  const handle = setInterval(() => {
    if (!scene.alive || rays.destroyed) return clearInterval(handle);
    spin += 0.02;
    rays.rotation = spin;
  }, 16);
  try {
    scene.sfx('magic');
    void scene.tw.to(dim, { alpha: 1 }, { duration: 250 });
    void scene.tw.to(rays, { alpha: 1 }, { duration: 300 });
    void scene.tw.to(shine.scale, { x: 3.2 * k, y: 3.2 * k }, { duration: 500, ease: Ease.backOut });
    void scene.tw.to(card, { x: W / 2, y: H * 0.45, rotation: Math.PI * 2 }, { duration: 650, ease: Ease.cubicOut });
    await scene.tw.to(card.scale, { x: 1.35 * k, y: 1.35 * k }, { duration: 650, ease: Ease.backOut });
    card.rotation = 0;
    scene.celebrate(scene.camera.x, scene.camera.y, 0.7);
    scene.sfx('sparkle');
    void scene.tw.to(word, { alpha: 1 }, { duration: 250 });
    const lines = [{ text: st.english, lang: 'en' as const }, { text: st.arabic, lang: 'ar' as const }];
    await scene.say(opts.intro === false ? lines : [{ text: 'ملصق جديد!', lang: 'ar' }, ...lines], 'sparky');
    const target = hudAnchorPosition('stars', null) ?? { x: W - 60, y: 40 };
    void scene.tw.to(word, { alpha: 0 }, { duration: 200 });
    void scene.tw.to(dim, { alpha: 0 }, { duration: 400 });
    void scene.tw.to(rays, { alpha: 0 }, { duration: 300 });
    void scene.tw.to(shine, { alpha: 0 }, { duration: 300 });
    scene.sfx('whoosh');
    await scene.tw.to(card, { x: target.x, y: target.y + 20 }, { duration: 550, ease: Ease.cubicIn, onUpdate: (t) => card.scale.set(1.35 * k * (1 - t) + 0.1) });
    scene.sfx('starLand');
  } finally {
    clearInterval(handle);
    c.destroy({ children: true });
  }
}
