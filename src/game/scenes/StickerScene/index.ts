import { Container, Graphics, Sprite, type FederatedPointerEvent } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease } from '../../engine/Tween';
import { gameText, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Sparky } from '../../entities/Sparky';
import { STICKER_CATEGORIES, stickersInCategory, type Sticker } from '../../systems/stickers';
import { drawEmptySlot, drawSticker } from './stickerArt';

interface Slot {
  c: Container;
  sticker: Sticker;
  owned: boolean;
}

/**
 * STICKER BOOK — a chunky album Adam fills by learning. Pages by category, page-flip with
 * big arrows or swipe, collected stickers speak their word (English, then Arabic).
 * Progress is the filled slots themselves — no percentages, nothing to lose.
 */
export default class StickerScene extends Scene {
  readonly id = 'stickers' as const;
  readonly music = 'closet' as const;

  private bg = new Graphics();
  private starsG = new Graphics();
  private book = new Container();
  private bookG = new Graphics();
  private page = new Container();
  private title = new Container();
  private arrows: Container[] = [];
  private dots = new Container();
  private home = new Container();
  private homeRing = new Graphics();
  private homeGlow!: Sprite;
  private adam!: Adam;
  private sparky!: Sparky;
  private slots: Slot[] = [];
  private pageIndex = 0;
  private flipping = false;
  private rect = { x: 0, y: 0, w: 100, h: 100 };
  private bgStars: { x: number; y: number; r: number; p: number }[] = [];
  private swipeStart: { x: number; t: number } | null = null;
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;
  private K = 1;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    useGame.getState().setHud({ kind: 'closet' });
    this.adam = new Adam(this.faceTex);
    this.adam.setPose('idle');
    this.sparky = new Sparky(this.tex('glow'));
    this.book.addChild(this.bookG, this.title, this.page);
    // swipe to flip
    this.book.eventMode = 'static';
    this.book.on('pointerdown', (e: FederatedPointerEvent) => (this.swipeStart = { x: e.global.x, t: this.time }));
    const endSwipe = (e: FederatedPointerEvent) => {
      const s = this.swipeStart;
      this.swipeStart = null;
      if (!s) return;
      const dx = e.global.x - s.x;
      if (Math.abs(dx) > 60 && this.time - s.t < 0.8) void this.flip(dx < 0 ? 1 : -1);
    };
    this.book.on('pointerup', endSwipe);
    this.book.on('pointerupoutside', endSwipe);

    for (const dir of [1, -1]) {
      const a = new Container();
      const g = new Graphics();
      g.circle(0, 6, 34).fill(color.blueShadow);
      g.circle(0, 0, 34).fill(vGrad([[0, 0x5d93ff], [1, color.blueDeep]])).stroke({ width: 3, color: 0xffffff });
      // RTL album: the "next" arrow points left
      const s = dir === 1 ? -1 : 1;
      g.poly([s * 14, -16, s * -12, 0, s * 14, 16]).fill(0xffffff);
      a.addChild(g);
      this.tappable(a, () => void this.flip(dir), { sound: 'press', haptic: 'tiny' });
      (a as Container & { dir: number }).dir = dir;
      this.arrows.push(a);
    }

    this.homeGlow = new Sprite(this.tex('glow'));
    this.homeGlow.anchor.set(0.5);
    this.homeGlow.tint = color.mint;
    this.homeGlow.blendMode = 'add';
    this.homeGlow.scale.set(1.4);
    const hg = new Graphics();
    hg.circle(0, 0, 32).fill(vGrad([[0, 0x5d93ff], [1, color.blueDeep]])).stroke({ width: 3, color: 0xffffff });
    hg.poly([0, -18, 18, -2, 13, -2, 13, 15, -13, 15, -13, -2, -18, -2]).fill(0xffffff);
    this.home.addChild(this.homeGlow, this.homeRing, hg);
    this.tappable(this.home, () => this.leave(), { sound: 'pop', haptic: 'tiny' });

    this.world.addChild(this.bg, this.starsG, this.book, ...this.arrows, this.dots, this.home, this.adam, this.sparky, this.fx.view);
    this.buildDots();
  }

  layout(w: number, h: number) {
    const landscape = w > h * 1.1;
    const K = (this.K = Math.min(w, h) / 400);
    this.bg.clear().rect(0, 0, w, h).fill(vGrad([[0, 0x0b1230], [1, 0x1a1040]]));
    this.bgStars = Array.from({ length: 70 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.6, p: Math.random() * 6 }));
    const top = this.safe.top + (landscape ? 84 : 100);
    const bottom = h - this.safe.bottom - (landscape ? 40 : 190);
    const bw = landscape ? Math.min(w * 0.62, 820) : w - 32;
    const bx = landscape ? (w - bw) / 2 : 16;
    this.rect = { x: bx, y: top, w: bw, h: bottom - top };
    this.book.position.set(0, 0);
    this.drawBook();
    this.renderPage();
    const midY = top + (bottom - top) / 2;
    const [next, prev] = this.arrows;
    if (landscape) {
      next.position.set(bx - 50, midY);
      prev.position.set(bx + bw + 50, midY);
    } else {
      next.position.set(52, h - this.safe.bottom - 105);
      prev.position.set(w - 52, h - this.safe.bottom - 105);
    }
    for (const a of this.arrows) a.scale.set(Math.min(1.2, Math.max(0.9, K * 0.8)));
    this.dots.position.set(w / 2, landscape ? bottom + 22 : bottom + 26);
    if (landscape) {
      this.home.position.set(bx - 50, top + 40);
      this.adam.position.set(Math.min(w - 70, bx + bw + 110), h - this.safe.bottom - 20);
      this.adam.scale.set(0.75 * K);
      this.adam.visible = w - (bx + bw) > 150;
      this.sparky.visible = true;
      this.sparky.position.set(bx - 60, bottom - 40);
      this.sparky.scale.set(0.45 * K);
    } else {
      this.home.position.set(w / 2, h - this.safe.bottom - 105);
      this.adam.visible = false;
      // phone: Sparky is heard (voice + caption) rather than squeezed next to the HUD
      this.sparky.visible = false;
    }
    this.layoutDots();
  }

  private drawBook() {
    const { x, y, w, h } = this.rect;
    const g = this.bookG.clear();
    g.roundRect(x + 4, y + 14, w, h, 30).fill({ color: 0x000000, alpha: 0.4 });
    g.roundRect(x, y + 10, w, h, 30).fill(0x4a1e10);
    g.roundRect(x, y, w, h, 30).fill(vGrad([[0, 0x8a3c1e], [1, 0x5a2410]]));
    g.roundRect(x + 10, y + 10, w - 20, h - 20, 24).fill(vGrad([[0, 0xfff3d6], [1, 0xf5dfae]]));
    g.roundRect(x + 10, y + 10, w - 20, h - 20, 24).stroke({ width: 3, color: color.gold, alpha: 0.9 });
    // stitched spine on the right (RTL album)
    for (let yy = y + 30; yy < y + h - 30; yy += 18) g.rect(x + w - 6, yy, 3, 9).fill({ color: color.gold, alpha: 0.8 });
    g.circle(x + w - 4, y + h / 2, 10).fill(color.gold).stroke({ width: 2, color: 0xffffff });
  }

  private buildDots() {
    this.dots.removeChildren().forEach((c) => c.destroy());
    STICKER_CATEGORIES.forEach((_, i) => {
      const d = new Graphics();
      const hit = new Graphics().circle(0, 0, 14).fill({ color: 0xffffff, alpha: 0.001 });
      const c = new Container();
      c.addChild(hit, d);
      this.dots.addChild(c);
      this.tappable(c, () => void this.flipTo(i), { sound: 'tap', haptic: 'tiny' });
    });
    this.layoutDots();
  }

  private layoutDots() {
    const n = STICKER_CATEGORIES.length;
    const gap = Math.min(24, (this.width * 0.5) / n);
    this.dots.children.forEach((c, i) => {
      c.x = (i - (n - 1) / 2) * gap;
      const d = (c as Container).children[1] as Graphics;
      const owned = this.ownedIn(i);
      d.clear();
      d.circle(0, 0, i === this.pageIndex ? 8 : 5).fill(i === this.pageIndex ? color.gold : owned > 0 ? color.mint : 0x5a6390);
    });
  }

  private ownedIn(i: number) {
    const owned = useGame.getState().save.stickers;
    return stickersInCategory(STICKER_CATEGORIES[i].id).filter((s) => owned.includes(s.id)).length;
  }

  private renderPage() {
    this.page.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.title.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.slots = [];
    const cat = STICKER_CATEGORIES[this.pageIndex];
    const { x, y, w, h } = this.rect;
    const landscape = this.width > this.height * 1.1;
    // title ribbon
    const ribbon = new Graphics();
    const rw = Math.min(w * 0.8, 360);
    ribbon.roundRect(x + w / 2 - rw / 2, y - 18, rw, 50, 25).fill(vGrad([[0, 0x3dffb4], [1, color.mintDeep]])).stroke({ width: 3, color: 0xffffff });
    const tAr = gameText(cat.arabic, 26, { fillColor: 0xffffff, strokeColor: color.mintShadow });
    tAr.position.set(x + w / 2, y + 7);
    const tEn = gameText(cat.english.toUpperCase(), 14, { fillColor: color.mintShadow, strokeColor: 0xffffff });
    tEn.position.set(x + w / 2, y + 44);
    this.title.addChild(ribbon, tAr, tEn);

    const list = stickersInCategory(cat.id);
    const owned = useGame.getState().save.stickers;
    const cols = landscape ? Math.min(5, Math.max(3, Math.ceil(list.length / 2))) : 3;
    const rows = Math.ceil(list.length / cols);
    const innerTop = y + 66;
    const innerH = h - 66 - 24;
    const innerW = w - 48;
    const cell = Math.min(innerW / cols, innerH / rows);
    const size = Math.min(cell * 0.82, 150);
    list.forEach((s, i) => {
      const r = Math.floor(i / cols);
      const col = i % cols;
      const inRow = r === rows - 1 ? list.length - cols * (rows - 1) : cols;
      // fill right-to-left (Arabic reading order)
      const cx = x + w / 2 + ((inRow - 1) / 2 - col) * cell;
      const cy = innerTop + (r + 0.5) * cell + (innerH - rows * cell) / 2;
      const has = owned.includes(s.id);
      const c = has ? drawSticker(s, size) : drawEmptySlot(size);
      c.position.set(cx, cy);
      c.rotation = has ? ((i * 37) % 7 - 3) * 0.012 : 0;
      if (has) {
        const label = gameText(s.english, Math.max(12, size * 0.13), { fillColor: color.blueDeepest, strokeColor: 0xffffff });
        label.y = size * 0.58;
        c.addChild(label);
      }
      this.page.addChild(c);
      const slot = { c, sticker: s, owned: has };
      this.slots.push(slot);
      this.tappable(c, () => void this.tapSlot(slot), { sound: has ? 'pop' : 'softBump', haptic: 'tiny' });
    });
    this.setA11yChoices(
      [
        ...list.map((s) => ({ id: s.id, label: owned.includes(s.id) ? `${s.english} · ${s.arabic}` : '?' })),
        { id: '__next', label: 'Next page' },
        { id: '__prev', label: 'Previous page' },
        { id: '__home', label: "Adam's world" },
      ],
      (id) => {
        if (id === '__next') void this.flip(1);
        else if (id === '__prev') void this.flip(-1);
        else if (id === '__home') this.leave();
        else {
          const slot = this.slots.find((sl) => sl.sticker.id === id);
          if (slot) void this.tapSlot(slot);
        }
      },
    );
    this.layoutDots();
  }

  private async tapSlot(slot: Slot) {
    const { c, sticker } = slot;
    const sx = c.scale.x;
    if (!slot.owned) {
      for (const r of [-0.08, 0.08, -0.04, 0]) await this.tw.to(c, { rotation: r }, { duration: 60 });
      this.sparky.setMood('hint');
      await this.say([{ text: 'العب لنلاقيه!', lang: 'ar' }], 'sparky');
      this.sparky.setMood('idle');
      return;
    }
    this.fx.burst(c.x, c.y, { texture: this.tex('star'), count: 14, tints: [color.gold, color.mint, 0xffffff], speed: [80, 220], life: [0.4, 0.8], scale: [0.15, 0.3] });
    this.sfx('sparkle');
    void (async () => {
      await this.tw.to(c.scale, { x: sx * 1.25, y: sx * 1.25 }, { duration: 140 });
      await this.tw.to(c.scale, { x: sx, y: sx }, { duration: 420, ease: Ease.elasticOut });
    })();
    this.adam.setExpression('excited');
    await this.say([{ text: sticker.english, lang: 'en' }, { text: sticker.arabic, lang: 'ar' }], 'sparky');
    this.adam.setExpression('happy');
  }

  private flipTo(i: number) {
    if (i === this.pageIndex) return;
    return this.flip(i - this.pageIndex);
  }

  private async flip(delta: number) {
    if (this.flipping) return;
    const n = STICKER_CATEGORIES.length;
    const next = (this.pageIndex + delta + n * 10) % n;
    this.flipping = true;
    this.sfx('swoosh', { volume: 0.6 });
    const pivotX = this.rect.x + this.rect.w / 2;
    for (const layer of [this.page, this.title]) {
      layer.pivot.x = pivotX;
      layer.x = pivotX;
    }
    const ms = this.reduced ? 90 : 220;
    await Promise.all([this.tw.to(this.page.scale, { x: 0 }, { duration: ms, ease: Ease.quadIn }), this.tw.to(this.title.scale, { x: 0 }, { duration: ms, ease: Ease.quadIn })]);
    this.pageIndex = next;
    this.renderPage();
    await Promise.all([this.tw.to(this.page.scale, { x: 1 }, { duration: ms + 80, ease: Ease.backOut }), this.tw.to(this.title.scale, { x: 1 }, { duration: ms + 80, ease: Ease.backOut })]);
    this.flipping = false;
    const cat = STICKER_CATEGORIES[next];
    void this.say([{ text: cat.arabic, lang: 'ar' }, { text: cat.english, lang: 'en' }], 'sparky');
  }

  enter() {
    void (async () => {
      this.sparky.setMood('excited');
      await this.say([{ text: 'هاد كتاب الملصقات تبعك يا آدم!', lang: 'ar' }, { text: 'Sticker book!', lang: 'en' }], 'sparky');
      this.sparky.setMood('idle');
    })();
  }

  tick(dt: number) {
    this.adam.update(dt);
    this.sparky.update(dt);
    const g = this.starsG.clear();
    for (const s of this.bgStars) g.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.3 + Math.sin(this.time * 1.8 + s.p) * 0.25 });
    const pr = this.homeRing.clear();
    pr.arc(0, 0, 40, this.time * 3, this.time * 3 + 1.8).stroke({ width: 5, color: color.mint });
    pr.arc(0, 0, 40, this.time * 3 + Math.PI, this.time * 3 + Math.PI + 1.8).stroke({ width: 5, color: color.gold });
    this.homeGlow.alpha = 0.5 + Math.sin(this.time * 3) * 0.2;
    for (const a of this.arrows) a.y += Math.sin(this.time * 3 + (a as Container & { dir: number }).dir) * 0.15 * this.K;
    if (!this.reduced && Math.random() < 0.04 && this.slots.length) {
      const s = this.slots[Math.floor(Math.random() * this.slots.length)];
      if (s.owned) this.fx.burst(s.c.x + (Math.random() - 0.5) * 40, s.c.y - 30, { texture: this.tex('star'), count: 1, tints: [color.gold, 0xffffff], speed: [5, 20], life: [0.4, 0.7], scale: [0.08, 0.16] });
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky') this.sparky.setTalking(on);
  }

  private leave() {
    if (this.engine.scenes.isTransitioning) return;
    this.engine.speech.cancel();
    void this.goto('world', { from: 'stickers' });
  }
}
