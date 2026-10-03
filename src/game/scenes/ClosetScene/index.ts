import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { AVATAR_ITEMS, unlockHint, type AvatarItem, type AvatarSlot, type AvatarState } from '@/avatar/items';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease } from '../../engine/Tween';
import { gameText, rGrad, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import type { KidPose } from '../../entities/Kid';
import { Sparky } from '../../entities/Sparky';
import { isItemUnlocked } from '../../systems/RewardEngine';
import { categoryIcon, padlock, unlockWorldIcon, type ClosetCategory } from './icons';

const CATEGORIES: { id: ClosetCategory; ar: string; en: string }[] = [
  { id: 'outfit', ar: 'البدلة', en: 'Outfit' },
  { id: 'cape', ar: 'العباءة', en: 'Cape' },
  { id: 'shoes', ar: 'الحذاء', en: 'Shoes' },
  { id: 'helmet', ar: 'الخوذة', en: 'Helmet' },
  { id: 'mask', ar: 'القناع', en: 'Mask' },
  { id: 'gloves', ar: 'القفازات', en: 'Gloves' },
  { id: 'trail', ar: 'الذيل', en: 'Trail' },
  { id: 'celebration', ar: 'الاحتفال', en: 'Celebration' },
  { id: 'hair', ar: 'الشعر', en: 'Hair' },
];

const HAIR_STYLES: { id: AvatarState['hairStyle']; ar: string; en: string }[] = [
  { id: 'curly', ar: 'شعر كيرلي', en: 'Curly hair' },
  { id: 'short', ar: 'شعر قصير', en: 'Short hair' },
  { id: 'spiky', ar: 'شعر واقف', en: 'Spiky hair' },
];

/** How each slot's mini preview is framed: Kid-local focus y + zoom. */
const FRAME: Record<ClosetCategory, { y: number; s: number; back?: boolean }> = {
  outfit: { y: -95, s: 0.36 },
  cape: { y: -80, s: 0.33, back: true },
  shoes: { y: -14, s: 0.8 },
  helmet: { y: -150, s: 0.62 },
  mask: { y: -150, s: 0.62 },
  hair: { y: -150, s: 0.62 },
  gloves: { y: -60, s: 0.46 },
  trail: { y: 0, s: 1 },
  celebration: { y: -110, s: 0.3 },
};

const CELEBRATION_POSE: Record<string, KidPose> = {
  'celebration.jump': 'cheer',
  'celebration.spin': 'victory',
  'celebration.flex': 'heroPose',
};

interface Bubble {
  id: string;
  c: Container;
  face: Container;
  ring: Graphics;
  lock: Container | null;
  locked: boolean;
  mini: Adam | null;
  item?: AvatarItem;
  hair?: (typeof HAIR_STYLES)[number];
}

interface Pedestal {
  cat: ClosetCategory;
  c: Container;
  glow: Sprite;
  top: Graphics;
}

/**
 * HERO CLOSET — a hero-HQ dressing room, not a shop. Adam stands on a rotating platform in
 * front of a big mirror; pick a category pedestal and the items float around him. Tapping an
 * earned item changes Adam instantly; locked items show what adventure unlocks them.
 */
export default class ClosetScene extends Scene {
  readonly id = 'closet' as const;
  readonly music = 'closet' as const;

  private room = new Graphics();
  private mirror = new Graphics();
  private shelves = new Graphics();
  private spots: Sprite[] = [];
  private platform = new Graphics();
  private platformGlow!: Sprite;
  private adam!: Adam;
  private sparky!: Sparky;
  private pedestalsLayer = new Container();
  private bubblesLayer = new Container();
  private pedestals: Pedestal[] = [];
  private bubbles: Bubble[] = [];
  private portal = new Container();
  private portalRing = new Graphics();
  private portalGlow!: Sprite;
  private category: ClosetCategory = 'outfit';
  private adamBase = { x: 0, y: 0, s: 1 };
  private K = 1;
  private celebrating = false;
  private nextPose = 6;
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    this.platformGlow = new Sprite(this.tex('glow'));
    this.platformGlow.anchor.set(0.5);
    this.platformGlow.tint = 0xff6fb5;
    this.platformGlow.blendMode = 'add';
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(this.tex('glow'));
      s.anchor.set(0.5, 0.05);
      s.blendMode = 'add';
      s.tint = [0xfff3c4, 0xff9ed2, 0x9fd8ff][i];
      s.alpha = 0.16;
      this.spots.push(s);
    }
    this.adam = new Adam(this.faceTex);
    this.adam.setPose('heroPose');
    this.sparky = new Sparky(this.tex('glow'));

    // exit portal (world object, not a nav button)
    this.portalGlow = new Sprite(this.tex('glow'));
    this.portalGlow.anchor.set(0.5);
    this.portalGlow.tint = color.blue;
    this.portalGlow.blendMode = 'add';
    this.portalGlow.scale.set(1.5);
    const home = new Graphics();
    home.circle(0, 0, 34).fill(rGrad([[0, 0x5d93ff], [1, color.blueDeep]]));
    home.poly([0, -18, 18, -2, 13, -2, 13, 15, -13, 15, -13, -2, -18, -2]).fill(0xffffff);
    home.roundRect(-4, 4, 8, 11, 2).fill(color.blue);
    const hit = new Graphics().circle(0, 0, 46).fill({ color: 0xffffff, alpha: 0.001 });
    this.portal.addChild(hit, this.portalGlow, this.portalRing, home);
    this.tappable(this.portal, () => this.leave(), { sound: 'portal', haptic: 'tiny' });

    for (const cat of CATEGORIES) this.pedestals.push(this.makePedestal(cat.id));

    this.world.addChild(this.room, ...this.spots, this.shelves, this.mirror, this.platformGlow, this.platform, this.adam, this.sparky, this.bubblesLayer, this.pedestalsLayer, this.portal, this.fx.view);
    useGame.getState().setHud({ kind: 'closet' });
    useGame.getState().setLastVisited('closet');
    this.showCategory('outfit', false);
  }

  // ---------------------------------------------------------------- layout
  layout(w: number, h: number) {
    const landscape = w > h * 1.1;
    const K = (this.K = Math.min(w, h) / 400);
    // room: purple-navy wall, floor, neon trims
    const floorY = landscape ? h * 0.8 : h * 0.72;
    const r = this.room.clear();
    r.rect(0, 0, w, h).fill(vGrad([[0, 0x120a2e], [0.6, 0x1d1450], [1, 0x241a5c]]));
    for (let i = 0; i < 9; i++) r.rect((w / 9) * i, 0, 2, floorY).fill({ color: 0xffffff, alpha: 0.03 });
    r.rect(0, floorY, w, h - floorY).fill(vGrad([[0, 0x2e2370], [1, 0x140c33]]));
    r.rect(0, floorY - 3, w, 4).fill({ color: 0xff6fb5, alpha: 0.85 });
    r.rect(0, floorY - 6, w, 10).fill({ color: 0xff6fb5, alpha: 0.18 });
    for (let i = -6; i <= 6; i++) r.moveTo(w / 2 + i * 40 * K, floorY).lineTo(w / 2 + i * 140 * K, h).stroke({ width: 1, color: 0xffffff, alpha: 0.05 });

    // neon shelves with folded capes / boots silhouettes on both walls
    const s = this.shelves.clear();
    const shelfW = landscape ? w * 0.16 : w * 0.2;
    for (const side of [0, 1]) {
      const x0 = side ? w - shelfW - 6 * K : 6 * K;
      for (let i = 0; i < 3; i++) {
        const y = (landscape ? h * 0.24 : h * 0.2) + i * (landscape ? 0.14 : 0.1) * h;
        s.roundRect(x0, y, shelfW, 6 * K, 3 * K).fill(side ? color.mint : color.blue);
        s.roundRect(x0, y - 2 * K, shelfW, 10 * K, 5 * K).fill({ color: side ? color.mint : color.blue, alpha: 0.18 });
        for (let j = 0; j < 3; j++) {
          const cx = x0 + shelfW * (0.2 + j * 0.3);
          const c = [color.red, color.gold, 0xa45bff, color.blue][(i + j + side) % 4];
          if ((i + j) % 2) s.roundRect(cx - 9 * K, y - 18 * K, 18 * K, 18 * K, 4 * K).fill({ color: c, alpha: 0.55 });
          else s.poly([cx - 8 * K, y - 22 * K, cx + 8 * K, y - 22 * K, cx + 12 * K, y, cx - 12 * K, y]).fill({ color: c, alpha: 0.55 });
        }
      }
    }

    // Adam on a rotating platform in front of the mirror
    const ax = w / 2;
    const ay = landscape ? floorY - 4 * K : floorY + 18 * K;
    // Adam large, but his head + mirror arch must clear the HUD
    const as = Math.min((landscape ? 1.25 : 1.12) * K, (ay - this.safe.top - 120) / 300);
    this.adamBase = { x: ax, y: ay, s: as };
    this.adam.position.set(ax, ay);
    this.adam.scale.set(as);
    this.platformGlow.position.set(ax, ay);
    this.platformGlow.scale.set(2.6 * K, 0.9 * K);

    // mirror arch behind Adam
    const mw = 150 * as;
    const mh = 290 * as;
    const m = this.mirror.clear();
    m.roundRect(ax - mw / 2 - 10 * K, ay - mh - 10 * K, mw + 20 * K, mh + 10 * K, mw / 2).fill(color.gold);
    m.roundRect(ax - mw / 2, ay - mh, mw, mh, mw / 2 - 8 * K).fill(vGrad([[0, 0x3a5a9a], [0.5, 0x22356e], [1, 0x1a2552]]));
    m.poly([ax - mw * 0.32, ay - mh * 0.85, ax - mw * 0.18, ay - mh * 0.85, ax - mw * 0.42, ay - mh * 0.3, ax - mw * 0.48, ay - mh * 0.4]).fill({ color: 0xffffff, alpha: 0.12 });
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + (i / 7) * Math.PI;
      m.circle(ax + Math.cos(a) * (mw / 2 + 4 * K), ay - mh + mw / 2 + Math.sin(a) * (mw / 2 + 4 * K), 4 * K).fill(0xfff3c4);
    }

    // spotlights from the ceiling
    this.spots.forEach((sp, i) => {
      const x = w * (0.25 + i * 0.25);
      sp.position.set(x, -10);
      sp.rotation = Math.atan2(ax - x, ay) * -1;
      sp.scale.set(1.6 * K, (ay + 20) / 64);
    });

    this.sparky.position.set(landscape ? w * 0.9 : w * 0.84, landscape ? h * 0.2 + this.safe.top : this.safe.top + 120 * K);
    this.sparky.scale.set(Math.min(0.5 * K, 0.7));
    this.portal.position.set(landscape ? w * 0.08 : w * 0.14, landscape ? h * 0.2 + this.safe.top : this.safe.top + 118 * K);
    this.portal.scale.set(Math.min(K, 1.3));

    this.layoutPedestals(w, h, landscape);
    this.layoutBubbles();
  }

  private layoutPedestals(w: number, h: number, landscape: boolean) {
    const K = this.K;
    const n = this.pedestals.length;
    const perRow = landscape ? n : 5;
    const rows = Math.ceil(n / perRow);
    const bottom = h - this.safe.bottom - (landscape ? 34 : 50) * K;
    const rowH = 66 * K;
    const maxW = landscape ? Math.min(w * 0.8, n * 92 * K) : w - 24;
    this.pedestals.forEach((p, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
      const step = maxW / perRow;
      const x = w / 2 + (col - (inRow - 1) / 2) * step;
      const y = bottom - (rows - 1 - row) * rowH;
      p.c.position.set(x, y);
      p.c.scale.set(Math.min(K, step / 72));
    });
  }

  private bubbleSlots(n: number): { x: number; y: number }[] {
    const { w, h } = { w: this.width, h: this.height };
    const landscape = w > h * 1.1;
    const K = this.K;
    const out: { x: number; y: number }[] = [];
    const left = Math.ceil(n / 2);
    const right = n - left;
    const top = landscape ? h * 0.24 + this.safe.top : this.safe.top + 200 * K;
    const bottom = landscape ? h * 0.7 : this.adamBase.y - 20 * K;
    const col = (m: number, side: -1 | 1) => {
      for (let i = 0; i < m; i++) {
        const t = m === 1 ? 0.5 : i / (m - 1);
        const y = top + (bottom - top) * t;
        const arc = Math.sin(t * Math.PI) * (landscape ? 40 : 14) * K;
        const xBase = landscape ? w / 2 + side * (w * 0.2 + 30 * K) : w / 2 + side * (w / 2 - 60 * K);
        out.push({ x: xBase + side * arc, y });
      }
    };
    col(left, -1);
    col(right, 1);
    return out;
  }

  private layoutBubbles() {
    const slots = this.bubbleSlots(this.bubbles.length);
    this.bubbles.forEach((b, i) => {
      b.c.position.set(slots[i].x, slots[i].y);
      b.c.children[0].scale.set(Math.min(this.K * 1.05, 1.7));
      (b.c as Container & { baseY?: number }).baseY = slots[i].y;
    });
  }

  // ---------------------------------------------------------------- pedestals
  private makePedestal(cat: ClosetCategory): Pedestal {
    const c = new Container();
    const glow = new Sprite(this.tex('glow'));
    glow.anchor.set(0.5);
    glow.tint = color.gold;
    glow.blendMode = 'add';
    glow.scale.set(0.9);
    glow.alpha = 0;
    const base = new Graphics();
    base.ellipse(0, 22, 32, 10).fill({ color: 0x000000, alpha: 0.35 });
    base.ellipse(0, 16, 30, 10).fill(0x2a1a55);
    const top = new Graphics();
    const icon = categoryIcon(cat);
    icon.scale.set(0.85);
    icon.y = -2;
    c.addChild(glow, base, top, icon);
    this.drawPedestalTop(top, false);
    this.pedestalsLayer.addChild(c);
    this.tappable(c, () => this.showCategory(cat, true), { sound: 'press', haptic: 'tiny' });
    return { cat, c, glow, top };
  }

  private drawPedestalTop(g: Graphics, active: boolean) {
    g.clear();
    g.circle(0, 4, 29).fill(active ? 0x8a5a00 : 0x1a1040);
    g.circle(0, 0, 29).fill(active ? vGrad([[0, 0xffe28a], [1, color.gold]]) : vGrad([[0, 0x4a3a90], [1, 0x2a1f66]]));
    g.circle(0, 0, 29).stroke({ width: 3, color: active ? 0xffffff : 0xff6fb5, alpha: active ? 1 : 0.7 });
  }

  // ---------------------------------------------------------------- items
  private progress() {
    const s = useGame.getState().save;
    return { stars: s.stars, trophies: s.trophies, missionsCompleted: s.worlds.missionsCompleted, unlocked: s.unlocked };
  }

  private showCategory(cat: ClosetCategory, speak: boolean) {
    this.category = cat;
    for (const p of this.pedestals) {
      const on = p.cat === cat;
      this.drawPedestalTop(p.top, on);
      p.glow.alpha = on ? 0.8 : 0;
    }
    // clear old bubbles
    for (const b of this.bubbles) {
      this.tw.kill(b.c);
      this.tw.drop(b.c.scale);
      b.c.destroy({ children: true });
    }
    this.bubbles = [];
    const prog = this.progress();
    const avatar = useGame.getState().save.avatar;
    if (cat === 'hair') {
      for (const hs of HAIR_STYLES) this.bubbles.push(this.makeBubble(`hair.${hs.id}`, cat, { ...avatar, hairStyle: hs.id, helmet: 'helmet.none', usePhotoFace: false }, false, undefined, hs));
    } else {
      const items = AVATAR_ITEMS.filter((i) => i.slot === (cat as AvatarSlot));
      for (const it of items) {
        const locked = !isItemUnlocked(it.id, prog);
        this.bubbles.push(this.makeBubble(it.id, cat, { ...avatar, [it.slot]: it.id, usePhotoFace: false }, locked, it));
      }
    }
    this.layoutBubbles();
    this.refreshRings();
    this.bubbles.forEach((b, i) => {
      b.c.scale.set(0);
      void this.tw.to(b.c.scale, { x: 1, y: 1 }, { duration: this.reduced ? 150 : 480, delay: i * 70, ease: Ease.backOut });
    });
    this.sfx('whoosh', { volume: 0.4 });
    this.updateA11y();
    if (speak) {
      const c = CATEGORIES.find((x) => x.id === cat)!;
      void this.say([{ text: c.ar, lang: 'ar' }, { text: c.en, lang: 'en' }], 'sparky');
    }
  }

  private makeBubble(id: string, cat: ClosetCategory, preview: AvatarState, locked: boolean, item?: AvatarItem, hair?: (typeof HAIR_STYLES)[number]): Bubble {
    const K = this.K;
    const R = 42;
    const c = new Container();
    c.scale.set(1);
    const outer = new Container();
    outer.scale.set(K);
    c.addChild(outer);
    const back = new Graphics();
    back.circle(0, 5, R).fill({ color: 0x000000, alpha: 0.35 });
    back.circle(0, 0, R).fill(rGrad([[0, 0x5a4ab0], [1, 0x241a5c]], 0.4, 0.3));
    const face = new Container();
    const mask = new Graphics().circle(0, 0, R - 3).fill(0xffffff);
    face.mask = mask;
    let mini: Adam | null = null;
    if (cat === 'trail') {
      const tg = new Graphics();
      const main = item?.colors.main || 0x8c90a1;
      const acc = item?.colors.accent || 0xc2c6d8;
      if (item?.id === 'trail.none') {
        tg.moveTo(-20, 14).quadraticCurveTo(0, 0, 22, -14).stroke({ width: 5, color: 0x8c90a1, cap: 'round' });
      } else {
        for (let i = 0; i < 6; i++) tg.star(-24 + i * 10, 16 - i * 6, 5, 8 - i * 0.6, 3.5).fill(i % 2 ? acc : main);
        tg.moveTo(-28, 22).quadraticCurveTo(0, 8, 28, -20).stroke({ width: 3, color: main, alpha: 0.6 });
      }
      face.addChild(tg);
    } else {
      const f = FRAME[cat];
      mini = new Adam(null, preview);
      if (f.back) mini.setView('back');
      mini.setExpression('happy');
      if (cat === 'celebration' && item) {
        mini.setPose(CELEBRATION_POSE[item.id] ?? 'cheer');
        mini.update(0.2);
      } else {
        mini.setPose('idle');
        mini.update(0.016);
      }
      mini.scale.set(f.s);
      mini.y = -f.y * f.s;
      face.addChild(mini);
    }
    const ring = new Graphics();
    outer.addChild(back, face, mask, ring);
    let lock: Container | null = null;
    if (locked) {
      face.alpha = 0.4;
      back.tint = 0x777777;
      lock = new Container();
      const pl = padlock();
      lock.addChild(pl);
      const kind = item?.unlock.kind === 'missions' ? item.unlock.world : item?.unlock.kind === 'trophies' ? 'trophies' : 'stars';
      const wi = unlockWorldIcon(kind, this.tex('football'));
      wi.position.set(R * 0.62, R * 0.62);
      const wiBg = new Graphics().circle(R * 0.62, R * 0.62, 17).fill(0x0d1322).stroke({ width: 2, color: color.gold });
      lock.addChild(wiBg, wi);
      outer.addChild(lock);
    }
    if (item || hair) {
      const label = gameText(item ? item.nameAr : hair!.ar, 15, { fillColor: locked ? 0xc2c6d8 : 0xffffff });
      label.y = R + 14;
      outer.addChild(label);
    }
    const hit = new Graphics().circle(0, 0, R + 6).fill({ color: 0xffffff, alpha: 0.001 });
    outer.addChildAt(hit, 0);
    this.bubblesLayer.addChild(c);
    const b: Bubble = { id, c, face, ring, lock, locked, mini, item, hair };
    this.tappable(c, () => this.pick(b), { sound: null, haptic: 'tiny', visual: outer });
    return b;
  }

  private isSelected(b: Bubble): boolean {
    const a = useGame.getState().save.avatar;
    if (b.hair) return a.hairStyle === b.hair.id;
    if (b.item) return (a as unknown as Record<string, string>)[b.item.slot] === b.item.id;
    return false;
  }

  private refreshRings() {
    for (const b of this.bubbles) {
      b.ring.clear();
      if (this.isSelected(b)) {
        b.ring.circle(0, 0, 44).stroke({ width: 6, color: color.gold });
        b.ring.circle(0, 0, 49).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
      } else {
        b.ring.circle(0, 0, 42).stroke({ width: 3, color: b.locked ? 0x5a5a70 : 0xff6fb5, alpha: 0.8 });
      }
    }
  }

  private updateA11y() {
    const choices = [
      ...this.bubbles.map((b) => ({ id: b.id, label: `${b.item?.nameEn ?? b.hair?.en ?? b.id}${b.locked ? ' (locked)' : ''}` })),
      ...CATEGORIES.map((c) => ({ id: `cat:${c.id}`, label: `${c.en} · ${c.ar}` })),
      { id: 'home', label: "Adam's world" },
    ];
    this.setA11yChoices(choices, (id) => {
      if (id === 'home') return this.leave();
      if (id.startsWith('cat:')) return this.showCategory(id.slice(4) as ClosetCategory, true);
      const b = this.bubbles.find((x) => x.id === id);
      if (b) void this.pick(b);
    });
  }

  private async pick(b: Bubble) {
    if (b.locked) return this.lockedTap(b);
    const store = useGame.getState();
    const already = this.isSelected(b);
    if (b.hair) store.setAvatar({ hairStyle: b.hair.id });
    else if (b.item) store.setAvatar({ [b.item.slot]: b.item.id } as Partial<AvatarState>);
    this.refreshRings();
    this.sfx('magic');
    this.haptic('tiny');
    const ax = this.adamBase.x;
    const ay = this.adamBase.y - 110 * this.adamBase.s;
    this.fx.burst(ax, ay, { texture: this.tex('star'), count: 24, tints: [color.gold, color.mint, 0xff6fb5, 0xffffff], speed: [120, 320], gravity: 260, life: [0.6, 1.1], scale: [0.2, 0.45] });
    this.fx.burst(b.c.x, b.c.y, { texture: this.tex('glow'), count: 8, tints: [color.gold], speed: [30, 100], life: [0.3, 0.6], scale: [0.25, 0.5], additive: true });
    void this.pop(this.adam.scale, this.adamBase.s);
    const name = b.item ? [{ text: b.item.nameAr, lang: 'ar' as const }, { text: b.item.nameEn, lang: 'en' as const }] : [{ text: b.hair!.ar, lang: 'ar' as const }, { text: b.hair!.en, lang: 'en' as const }];
    void this.say(already ? [{ text: 'حلو كتير!', lang: 'ar' }] : name, 'sparky');
    this.sparky.setMood('excited');
    void this.sparky.hop();
    if (this.celebrating) return;
    this.celebrating = true;
    try {
      if (b.item?.slot === 'celebration') {
        await this.guard(this.adam.celebrate(b.item.id, 1500));
      } else if (b.item?.slot === 'cape') {
        await this.adam.turnTo('back');
        await this.wait(700);
        await this.adam.turnTo('front');
      } else {
        this.adam.setExpression('excited');
        this.adam.setPose('victory');
        await this.wait(this.reduced ? 300 : 800);
        this.adam.setPose('heroPose');
        this.adam.setExpression('happy');
      }
    } finally {
      this.celebrating = false;
      this.sparky.setMood('idle');
    }
  }

  private async pop(scale: { x: number; y: number }, base: number) {
    this.tw.kill(scale);
    await this.tw.to(scale, { x: base * 1.08, y: base * 0.94 }, { duration: 110 });
    await this.tw.to(scale, { x: base, y: base }, { duration: 420, ease: Ease.elasticOut });
  }

  private async lockedTap(b: Bubble) {
    this.sfx('softBump');
    this.haptic('tiny');
    if (b.lock) {
      const l = b.lock;
      void (async () => {
        for (const r of [-0.25, 0.25, -0.12, 0.12, 0]) await this.tw.to(l, { rotation: r }, { duration: 60 });
      })();
      const wi = l.children[2];
      if (wi) void this.pop(wi.scale, 1);
    }
    this.sparky.setMood('hint');
    const hint = b.item ? unlockHint(b.item.unlock) : null;
    if (hint?.ar) await this.say([{ text: hint.ar, lang: 'ar' }], 'sparky');
    this.sparky.setMood('idle');
  }

  // ---------------------------------------------------------------- lifecycle
  enter() {
    void (async () => {
      this.sparky.setMood('excited');
      void this.sparky.hop();
      this.adam.setExpression('excited');
      await this.say([{ text: 'أهلا بخزانة البطل! اختار شو بدك تلبس!', lang: 'ar' }], 'sparky');
      this.sparky.setMood('idle');
      this.adam.setExpression('happy');
    })();
  }

  tick(dt: number) {
    this.adam.update(dt);
    this.sparky.update(dt);
    const K = this.K;
    // rotating platform
    const p = this.platform.clear();
    const { x, y, s } = this.adamBase;
    const rx = 92 * s;
    const ry = 26 * s;
    p.ellipse(x, y + 8 * s, rx, ry).fill(0x3a1060);
    p.ellipse(x, y, rx, ry).fill(rGrad([[0, 0xff9ed2], [1, 0x8a2a6a]]));
    p.ellipse(x, y, rx, ry).stroke({ width: 3 * K, color: 0xffffff, alpha: 0.8 });
    const spin = this.reduced ? 0 : this.time * 0.8;
    for (let i = 0; i < 12; i++) {
      const a = spin + (i / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * rx * 0.78;
      const py = y + Math.sin(a) * ry * 0.78;
      p.circle(px, py, (Math.sin(a) > 0 ? 4 : 2.5) * K).fill({ color: i % 2 ? color.gold : 0xffffff, alpha: Math.sin(a) > 0 ? 0.95 : 0.5 });
    }
    this.platformGlow.alpha = 0.4 + Math.sin(this.time * 2) * 0.12;
    this.spots.forEach((sp, i) => (sp.alpha = 0.13 + Math.sin(this.time * 1.3 + i * 2) * 0.04));
    // bubbles float
    this.bubbles.forEach((b, i) => {
      const by = (b.c as Container & { baseY?: number }).baseY;
      if (by !== undefined && !this.reduced) b.c.y = by + Math.sin(this.time * 2 + i * 1.3) * 5 * K;
    });
    // portal
    const pr = this.portalRing.clear();
    pr.arc(0, 0, 40, this.time * 3, this.time * 3 + 1.8).stroke({ width: 5, color: color.mint });
    pr.arc(0, 0, 40, this.time * 3 + Math.PI, this.time * 3 + Math.PI + 1.8).stroke({ width: 5, color: color.gold });
    this.portalGlow.alpha = 0.5 + Math.sin(this.time * 3) * 0.2;
    // occasional hero pose / sparkle on Adam
    this.nextPose -= dt;
    if (this.nextPose <= 0 && !this.celebrating) {
      this.nextPose = 5 + Math.random() * 4;
      this.adam.setPose(this.adam.pose === 'heroPose' ? 'idle' : 'heroPose');
    }
    if (Math.random() < 0.05) {
      this.fx.burst(x + (Math.random() - 0.5) * rx * 1.6, y - Math.random() * 230 * s, { texture: this.tex('star'), count: 1, tints: [color.gold, 0xff9ed2], speed: [5, 25], life: [0.5, 0.9], scale: [0.08, 0.18] });
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky') this.sparky.setTalking(on);
  }

  private leave() {
    if (this.engine.scenes.isTransitioning) return;
    this.engine.speech.cancel();
    void this.goto('world', { from: 'closet' });
  }
}

