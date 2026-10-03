import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import { useGame, type SceneId } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease } from '../../engine/Tween';
import { gameText, rGrad, shade, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Sparky } from '../../entities/Sparky';
import { revealUnlocks, showStickerReveal } from '../../effects/UnlockReveal';
import { dailyGiftSticker, giftAvailable, localDay } from '../../systems/stickers';
import { drawLocation, type LocationArt } from './locations';

type LocId = 'football' | 'hero' | 'racing' | 'treasure' | 'closet' | 'stickers';

interface Loc {
  id: LocId;
  scene: SceneId;
  nameAr: string;
  nameEn: string;
  /** shorter map label when space is tight (speech still uses nameAr) */
  labelAr?: string;
  portrait: [number, number];
  landscape: [number, number];
  view: Container;
  art: LocationArt;
  label: Container;
  beacon: Container;
  locked: boolean;
}

const LOCS: Omit<Loc, 'view' | 'art' | 'label' | 'beacon' | 'locked'>[] = [
  { id: 'football', scene: 'football', nameAr: 'الملعب', nameEn: 'Goal Stadium', portrait: [0.27, 0.28], landscape: [0.2, 0.34] },
  { id: 'hero', scene: 'hero', nameAr: 'مدينة الأبطال', nameEn: 'Hero City', portrait: [0.75, 0.25], landscape: [0.8, 0.41] },
  { id: 'racing', scene: 'racing', nameAr: 'السباق', nameEn: 'Turbo Racing', portrait: [0.26, 0.71], landscape: [0.2, 0.76] },
  { id: 'treasure', scene: 'treasure', nameAr: 'جزيرة الكنز', nameEn: 'Treasure Island', portrait: [0.76, 0.74], landscape: [0.84, 0.74] },
  { id: 'closet', scene: 'closet', nameAr: 'خزانة البطل', nameEn: 'Hero Closet', portrait: [0.72, 0.5], landscape: [0.62, 0.72] },
  { id: 'stickers', scene: 'stickers', nameAr: 'كتاب الملصقات', nameEn: 'Sticker Book', labelAr: 'الملصقات', portrait: [0.47, 0.13], landscape: [0.36, 0.72] },
];

/**
 * ADAM'S WORLD — the hub. Locations are places in a living world (not tabs): the stadium's
 * floodlights flash, tiny cars race, Hero City fires energy across the sky, Treasure Island
 * glitters. Tap a place → Adam reacts → camera flies there → themed transition.
 */
export default class WorldScene extends Scene {
  readonly id = 'world' as const;
  readonly music = 'map' as const;
  private sea = new Graphics();
  private waves = new Graphics();
  private land = new Graphics();
  private paths = new Graphics();
  private beams = new Graphics();
  private clouds = new Container();
  private locLayer = new Container();
  private platform = new Graphics();
  private platformGlow!: Sprite;
  private gift = new Container();
  private giftOpening = false;
  private adam!: Adam;
  private sparky!: Sparky;
  private locs: Loc[] = [];
  private beam: { from: [number, number]; to: [number, number]; t: number } | null = null;
  private nextBeam = 2;
  private busy = false;
  private K = 1;
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    const unlocked = useGame.getState().unlockedWorlds();
    this.platformGlow = new Sprite(this.tex('glow'));
    this.platformGlow.anchor.set(0.5);
    this.platformGlow.tint = color.blue;
    this.platformGlow.blendMode = 'add';
    this.adam = new Adam(this.faceTex);
    this.sparky = new Sparky(this.tex('glow'));
    this.locLayer.sortableChildren = true;
    for (const d of LOCS) {
      const view = new Container();
      const art = drawLocation(d.id, this.tex('glow'));
      view.addChild(art.view);
      const locked = d.id !== 'stickers' && !unlocked.includes(d.id);
      if (locked) art.setLocked(true);
      const label = new Container();
      const chip = new Graphics();
      const txt = gameText(d.labelAr ?? d.nameAr, 20, { fillColor: 0xffffff });
      chip.roundRect(-txt.width / 2 - 14, -17, txt.width + 28, 34, 17).fill({ color: color.surfaceLowest, alpha: 0.82 }).stroke({ width: 2, color: locked ? color.outlineVariant : color.gold, alpha: 0.9 });
      label.addChild(chip, txt);
      label.y = 78;
      view.addChild(label);
      const beacon = new Container();
      const arrow = new Graphics().poly([-14, -10, 14, -10, 0, 10]).fill(color.gold).stroke({ width: 3, color: 0xffffff });
      beacon.addChild(arrow);
      beacon.y = -96;
      beacon.visible = false;
      view.addChild(beacon);
      const loc: Loc = { ...d, view, art, label, beacon, locked };
      this.locs.push(loc);
      this.locLayer.addChild(view);
      const hit = new Graphics().circle(0, 0, 80).fill({ color: 0xffffff, alpha: 0.001 });
      view.addChildAt(hit, 0);
      this.tappable(view, () => this.visit(loc), { sound: 'press', haptic: 'tiny', visual: art.view });
    }
    this.world.addChild(this.sea, this.waves, this.land, this.paths, this.platformGlow, this.platform, this.locLayer, this.gift, this.adam, this.sparky, this.beams, this.clouds, this.fx.view);
    for (let i = 0; i < 6; i++) this.clouds.addChild(this.makeCloud());
    useGame.getState().setHud({ kind: 'world' });
    this.buildGift();
    this.updateA11y();
    // the next adventure becomes visible: a bouncing beacon on the recommended place
    const done = useGame.getState().save.worlds.missionsCompleted;
    const rec = this.locs.find((l) => !l.locked && l.id !== 'closet' && l.id !== 'stickers' && !(done[l.id] > 0)) ?? this.locs.find((l) => l.id === 'football');
    if (rec) rec.beacon.visible = true;
    // warm the most likely next chunk
    this.engine.scenes.prefetch(rec?.scene ?? 'football');
  }

  private updateA11y() {
    this.setA11yChoices(
      [
        ...(this.gift.visible ? [{ id: '__gift', label: 'Surprise gift · مفاجأة' }] : []),
        ...this.locs.map((l) => ({ id: l.id, label: `${l.nameEn} · ${l.nameAr}${l.locked ? ' (locked)' : ''}` })),
      ],
      (id) => {
        if (id === '__gift') return void this.openGift();
        const l = this.locs.find((x) => x.id === id);
        if (l) void this.visit(l);
      },
    );
  }

  /** Daily surprise: a gift box by Adam's platform, once per local day. No streaks, no pressure. */
  private buildGift() {
    const g = this.gift;
    const glow = new Sprite(this.tex('glow'));
    glow.anchor.set(0.5);
    glow.tint = color.gold;
    glow.blendMode = 'add';
    glow.scale.set(1.5);
    glow.y = -20;
    const box = new Graphics();
    box.roundRect(-26, -30, 52, 40, 6).fill(vGrad([[0, 0xff6fb5], [1, 0xb0306f]])).stroke({ width: 3, color: 0xffffff });
    box.rect(-5, -30, 10, 40).fill(color.gold);
    const lid = new Graphics();
    lid.roundRect(-30, -12, 60, 14, 5).fill(vGrad([[0, 0xff8ac6], [1, 0xd0408a]])).stroke({ width: 3, color: 0xffffff });
    lid.rect(-5, -12, 10, 14).fill(color.gold);
    lid.ellipse(-12, -18, 12, 7).stroke({ width: 4, color: color.gold });
    lid.ellipse(12, -18, 12, 7).stroke({ width: 4, color: color.gold });
    lid.y = -30;
    const hit = new Graphics().circle(0, -20, 46).fill({ color: 0xffffff, alpha: 0.001 });
    g.addChild(hit, glow, box, lid);
    (g as Container & { lid: Graphics; glow: Sprite }).lid = lid;
    (g as Container & { lid: Graphics; glow: Sprite }).glow = glow;
    g.visible = giftAvailable(useGame.getState().save.daily.lastGiftDay, localDay());
    this.tappable(g, () => void this.openGift(), { sound: 'press', haptic: 'tiny' });
  }

  private async openGift() {
    const g = this.gift as Container & { lid: Graphics; glow: Sprite };
    if (!g.visible || this.busy || this.giftOpening) return;
    this.giftOpening = true;
    this.busy = true; // no travelling away mid-gift
    const store = useGame.getState();
    // grant the reward in the same step as the claim, so leaving mid-animation never loses it
    store.claimDailyGift(localDay());
    const giftSticker = dailyGiftSticker(store.save.stickers, store.save.skills);
    const isNew = !!giftSticker && useGame.getState().addSticker(giftSticker);
    useGame.getState().addStars(3);
    this.engine.speech.cancel();
    this.adam.setExpression('excited');
    for (const r of [-0.18, 0.18, -0.12, 0.12, 0]) await this.tw.to(g, { rotation: r }, { duration: 70 });
    this.sfx('chest');
    this.sfx('unlock', { delay: 0.15 });
    this.haptic('medium');
    void this.tw.to(g.lid, { y: -110, rotation: 0.6, alpha: 0 }, { duration: 500, ease: Ease.cubicOut });
    this.celebrate(g.x, g.y - 30 * this.K, 1.1);
    this.sparky.setMood('excited');
    void this.sparky.hop();
    await this.say([{ text: 'مفاجأة اليوم!', lang: 'ar' }, { text: 'Surprise!', lang: 'en' }], 'sparky');
    const from = this.camera.toScreen(g.x, g.y - 30 * this.K);
    if (giftSticker && isNew) await showStickerReveal(this, giftSticker, { from, intro: false });
    await this.flyStarsToHud(g.x, g.y - 30 * this.K, 3, { credit: false });
    await this.tw.to(g, { alpha: 0 }, { duration: 300 });
    g.visible = false;
    this.sparky.setMood('idle');
    this.adam.setExpression('happy');
    this.giftOpening = false;
    this.busy = false;
    this.updateA11y();
  }

  private makeCloud() {
    const c = new Container();
    const g = new Graphics();
    for (let i = 0; i < 5; i++) g.ellipse(i * 26 - 52, Math.sin(i) * 8, 34, 20 + (i % 2) * 6).fill({ color: 0xffffff, alpha: 0.13 });
    c.addChild(g);
    (c as Container & { speed: number }).speed = 6 + Math.random() * 10;
    return c;
  }

  layout(w: number, h: number) {
    const landscape = w > h * 1.1;
    const K = (this.K = Math.min(w, h) / 400);
    // sea
    this.sea.clear().rect(-w, -h, w * 3, h * 3).fill(vGrad([[0, 0x0a1f4d], [1, 0x061233]]));
    // main island = union of soft blobs
    const L = this.land.clear();
    const cx = w * 0.5;
    const cy = landscape ? h * 0.55 : h * 0.49;
    const rx = landscape ? w * 0.38 : w * 0.46;
    const ry = landscape ? h * 0.42 : h * 0.38;
    const blobs: [number, number, number, number][] = [
      [cx, cy, rx, ry],
      [cx - rx * 0.45, cy - ry * 0.45, rx * 0.55, ry * 0.5],
      [cx + rx * 0.45, cy - ry * 0.5, rx * 0.55, ry * 0.48],
      [cx - rx * 0.45, cy + ry * 0.48, rx * 0.55, ry * 0.45],
    ];
    for (const [x, y, a, b] of blobs) L.ellipse(x, y, a + 16 * K, b + 16 * K).fill(0xe8c98a); // sand
    for (const [x, y, a, b] of blobs) L.ellipse(x, y, a, b).fill(vGrad([[0, 0x3fbf6a], [1, 0x23854a]]));
    for (const [x, y, a, b] of blobs) L.ellipse(x - a * 0.2, y - b * 0.25, a * 0.55, b * 0.4).fill({ color: 0x6fe39a, alpha: 0.18 });
    // little trees
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const tx = cx + Math.cos(a) * rx * 0.85;
      const ty = cy + Math.sin(a) * ry * 0.82;
      L.circle(tx, ty, 9 * K).fill(0x1d6e3c);
      L.circle(tx - 3 * K, ty - 3 * K, 5 * K).fill({ color: 0x5fd38a, alpha: 0.6 });
    }
    // treasure islet (separate, in the sea)
    for (const l of this.locs) {
      const [fx, fy] = landscape ? l.landscape : l.portrait;
      l.view.position.set(w * fx, h * fy);
      l.view.scale.set(K * (landscape ? 0.68 : 0.9));
      l.view.zIndex = l.view.y;
      if (l.id === 'treasure') {
        L.ellipse(l.view.x, l.view.y + 18 * K, 70 * K, 40 * K).fill(0xe8c98a);
        L.ellipse(l.view.x, l.view.y + 14 * K, 56 * K, 30 * K).fill(0x3fbf6a);
      }
    }
    // Adam's base platform in the centre
    const ax = landscape ? w * 0.47 : w * 0.42;
    const ay = landscape ? h * 0.6 : h * 0.52;
    const P = this.platform.clear();
    P.ellipse(ax, ay + 6 * K, 70 * K, 24 * K).fill(color.blueShadow);
    P.ellipse(ax, ay, 70 * K, 24 * K).fill(rGrad([[0, 0x5d93ff], [1, color.blueDeep]]));
    P.ellipse(ax, ay, 70 * K, 24 * K).stroke({ width: 3 * K, color: color.mint, alpha: 0.9 });
    P.ellipse(ax, ay, 46 * K, 14 * K).stroke({ width: 2 * K, color: 0xffffff, alpha: 0.4 });
    this.platformGlow.position.set(ax, ay);
    this.platformGlow.scale.set(2.2 * K, 0.9 * K);
    this.adam.position.set(ax, ay);
    this.adam.scale.set(0.62 * K);
    this.sparky.position.set(ax + 70 * K, ay - 95 * K);
    if (landscape) {
      this.gift.position.set(ax - 92 * K, ay - 42 * K);
      this.gift.scale.set(0.6 * K);
    } else {
      this.gift.position.set(ax - 82 * K, ay + 4 * K);
      this.gift.scale.set(0.85 * K);
    }
    this.sparky.scale.set(0.42 * K);
    // dotted paths from Adam's base to each place
    const pg = this.paths.clear();
    for (const l of this.locs) {
      const dx = l.view.x - ax;
      const dy = l.view.y - ay;
      const n = Math.floor(Math.hypot(dx, dy) / (16 * K));
      for (let i = 2; i < n - 2; i++) {
        const t = i / n;
        const bend = Math.sin(t * Math.PI) * 20 * K;
        pg.circle(ax + dx * t + bend, ay + dy * t, 3.2 * K).fill({ color: 0xfff3c4, alpha: l.locked ? 0.25 : 0.7 });
      }
    }
    this.clouds.children.forEach((c, i) => {
      c.position.set(Math.random() * w, (i / 6) * h * 0.95 + 20);
      c.scale.set(K);
    });
    // returning from a world: start zoomed in on it, then pull out to Adam
    const from = this.data.from as string | undefined;
    const back = this.locs.find((l) => l.id === from);
    if (back && !this.entered) this.camera.snap(back.view.x, back.view.y, this.reduced ? 1 : 1.7);
  }

  private entered = false;

  enter() {
    this.entered = true;
    void (async () => {
      if (this.data.from) await this.camera.reset(1100);
      this.adam.setPose('idle');
      if (await this.revealIfAny()) return;
      const first = useGame.getState().save.recentMissions.length === 0;
      this.sparky.setMood('excited');
      await this.say(
        first
          ? [{ text: 'هاد عالمك يا آدم! المس مكان لنروح عليه!', lang: 'ar' }]
          : [{ text: 'وين بدك تروح هلأ يا بطل؟', lang: 'ar' }],
        'sparky',
      );
      this.sparky.setMood('idle');
      if (this.engine.shouldWrapUp()) {
        await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
        void this.engine.endSession();
      }
    })();
  }

  private async revealIfAny() {
    const st = useGame.getState();
    if (st.pendingUnlocks.length === 0 && st.pendingStickers.length === 0) return false;
    await revealUnlocks(this);
    return false;
  }

  tick(dt: number) {
    this.adam.update(dt);
    this.sparky.update(dt);
    const K = this.K;
    for (const l of this.locs) l.art.update(dt, this.time);
    for (const l of this.locs) if (l.beacon.visible) l.beacon.y = -96 - Math.abs(Math.sin(this.time * 4)) * 14;
    if (this.gift.visible && !this.giftOpening) {
      const gg = this.gift as Container & { glow?: Sprite };
      this.gift.rotation = Math.sin(this.time * 6) * 0.06 * Math.max(0, Math.sin(this.time * 1.2));
      if (gg.glow) gg.glow.alpha = 0.5 + Math.sin(this.time * 3) * 0.25;
    }
    this.platformGlow.alpha = 0.45 + Math.sin(this.time * 2) * 0.15;
    // waves
    const wg = this.waves.clear();
    for (let i = 0; i < 26; i++) {
      const x = ((i * 137) % this.width) + Math.sin(this.time * 0.6 + i) * 12;
      const y = ((i * 89) % this.height) + Math.cos(this.time * 0.5 + i) * 6;
      wg.moveTo(x - 10 * K, y).quadraticCurveTo(x, y - 4 * K, x + 10 * K, y).stroke({ width: 2 * K, color: 0x5d93ff, alpha: 0.28 });
    }
    // clouds drift
    for (const c of this.clouds.children) {
      c.x += (c as Container & { speed: number }).speed * dt * K;
      if (c.x > this.width + 120 * K) c.x = -120 * K;
    }
    // Hero City energy beams across the sky
    this.nextBeam -= dt;
    const hero = this.locs.find((l) => l.id === 'hero');
    if (this.nextBeam <= 0 && hero) {
      const targets = this.locs.filter((l) => l !== hero);
      const t = targets[Math.floor(Math.random() * targets.length)];
      this.beam = { from: [hero.view.x, hero.view.y - 70 * K], to: [t.view.x, t.view.y - 30 * K], t: 0 };
      this.nextBeam = 3 + Math.random() * 3;
      this.sfx('zap', { volume: 0.15 });
    }
    const bg = this.beams.clear();
    if (this.beam) {
      this.beam.t += dt;
      const { from, to, t } = this.beam;
      const a = Math.max(0, 1 - t / 1.1);
      const mx = (from[0] + to[0]) / 2;
      const my = Math.min(from[1], to[1]) - 120 * K;
      bg.moveTo(from[0], from[1]).quadraticCurveTo(mx, my, to[0], to[1]).stroke({ width: 8 * K, color: color.blue, alpha: 0.35 * a });
      bg.moveTo(from[0], from[1]).quadraticCurveTo(mx, my, to[0], to[1]).stroke({ width: 3 * K, color: 0xdff6ff, alpha: 0.9 * a });
      if (t < 0.6) {
        const s = t / 0.6;
        const px = (1 - s) * (1 - s) * from[0] + 2 * (1 - s) * s * mx + s * s * to[0];
        const py = (1 - s) * (1 - s) * from[1] + 2 * (1 - s) * s * my + s * s * to[1];
        this.fx.burst(px, py, { texture: this.tex('glow'), count: 2, tints: [color.blue, color.mint], speed: [10, 40], life: [0.3, 0.5], scale: [0.15, 0.3], additive: true });
      }
      if (t > 1.2) this.beam = null;
    }
    // treasure sparkles
    const tr = this.locs.find((l) => l.id === 'treasure');
    if (tr && !tr.locked && Math.random() < 0.15) {
      this.fx.burst(tr.view.x + (Math.random() - 0.5) * 70 * K, tr.view.y - Math.random() * 50 * K, { texture: this.tex('star'), count: 1, tints: [color.gold], speed: [5, 30], life: [0.5, 0.9], scale: [0.1, 0.22] });
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky') this.sparky.setTalking(on);
  }

  private async visit(l: Loc) {
    if (this.busy || this.engine.scenes.isTransitioning) return;
    if (l.locked) {
      this.sfx('softBump');
      void l.art.wiggle?.(this.tw);
      this.sparky.setMood('hint');
      await this.say([{ text: `${l.nameAr} لسا مسكرة. العب أكثر لتفتحها!`, lang: 'ar' }], 'sparky');
      this.sparky.setMood('idle');
      return;
    }
    this.busy = true;
    this.engine.speech.cancel();
    // 1. Adam reacts
    this.adam.setExpression('excited');
    this.adam.scale.x = Math.abs(this.adam.scale.x) * (l.view.x < this.adam.x ? -1 : 1);
    this.adam.setPose('point');
    void this.adam.jump(60);
    this.sparky.setMood('excited');
    // 2. location enlarges + glows, Sparky names it (Arabic + English)
    void this.tw.to(l.art.view.scale, { x: 1.25, y: 1.25 }, { duration: 400, ease: Ease.backOut });
    this.celebrate(l.view.x, l.view.y - 20 * this.K, 0.6);
    void this.say([{ text: l.nameAr, lang: 'ar' }, { text: l.nameEn, lang: 'en' }], 'sparky');
    // 3. camera pans/zooms to the place (loading starts during the move)
    this.engine.scenes.prefetch(l.scene);
    await this.camera.panTo(l.view.x, l.view.y, this.reduced ? 1.2 : 2.1, 900, Ease.cubicInOut);
    // 4. themed transition, centred on the location
    const at = this.camera.toScreen(l.view.x, l.view.y);
    if (l.id !== 'stickers') useGame.getState().setLastVisited(l.id);
    void this.engine.scenes.goto(l.scene, { at, data: { from: 'world' } });
  }
}

export { shade };
