import { Container, Graphics, Sprite } from 'pixi.js';
import { color, conceptColor } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { numberWord } from '@/learning/engine/ChallengeGenerator';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease, bezier2 } from '../../engine/Tween';
import { drawChunky, gameText } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Sparky } from '../../entities/Sparky';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { pulseHud } from '../../engine/hudBridge';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { IslandBackdrop, IslandScenery, makeGeo, type IslandGeo } from './Island';
import { Chest, makeFragment, makeGem } from './Chest';

const STOPS = 3;
const GEM_TINTS = [0x4dd9ff, 0xff6fb5, 0x6ffbbe, 0xa45bff, 0xffd21f];
const INTROS: VoiceLine[][] = [
  [{ text: 'يا آدم! خريطة الكنز مقطعة. كل صندوق فيه قطعة!', lang: 'ar' }],
  [{ text: 'يلا على الصندوق الثاني!', lang: 'ar' }],
  [{ text: 'آخر قطعة من الخريطة!', lang: 'ar' }],
];

interface ChestSlot {
  chest: Chest;
  choice: ChallengeChoice;
}

interface Gem {
  c: Container;
  num?: number;
  baseY: number;
}

/**
 * TREASURE ISLAND — adaptive review disguised as an island adventure. The treasure adapter
 * runs in review mode, so the chests ask about whatever Adam has been finding hard.
 * Adam walks along the beach, opens the right chest at each stop to collect a map piece,
 * and the completed map leads to the big treasure.
 */
export default class TreasureScene extends Scene implements ChallengePresenter {
  readonly id = 'treasure' as const;
  readonly music = 'treasure' as const;

  runner!: ChallengeRunner;
  private g!: IslandGeo;
  private backdrop!: IslandBackdrop;
  private scenery!: IslandScenery;
  private stage = new Container();
  private adam!: Adam;
  private sparky!: Sparky;
  /** Adam's position normalised to the viewport (x/w, y/h) so rotation mid-walk stays consistent */
  private adamN = { x: 0, y: 0 };
  private get adamPos() {
    return { x: this.adamN.x * this.g.w, y: this.adamN.y * this.g.h };
  }
  private facing = 1;
  private stop = 0;
  private following = true;
  private chests: ChestSlot[] = [];
  private gems: Gem[] = [];
  private counted = 0;
  private interactive = false;
  private fragments = 0;
  private keys = 0;
  private starsEarned = 0;
  private skillsPlayed: string[] = [];
  private bigChest!: Chest;
  private walking = false;
  private stepTimer = 0;
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    this.backdrop = new IslandBackdrop(this.tex('glow'));
    this.root.addChildAt(this.backdrop.view, 0);
    this.scenery = new IslandScenery(this.tex('glow'));
    this.stage.sortableChildren = true;
    this.adam = new Adam(this.faceTex);
    this.sparky = new Sparky(this.tex('glow'));
    this.bigChest = new Chest(this.tex('glow'), { gold: true });
    this.stage.addChild(this.adam, this.bigChest);
    this.world.addChild(this.scenery.back, this.scenery.ground, this.stage, this.sparky, this.fx.view);
    this.runner = new ChallengeRunner(this, 'treasure', this);
    this.keys = useGame.getState().save.inventory.keys;
    useGame.getState().setLastVisited('treasure');
    useGame.getState().setHud({ kind: 'treasure', keys: this.keys, fragments: 0, fragmentsGoal: STOPS });
  }

  layout(w: number, h: number) {
    const old = this.g;
    this.g = makeGeo(w, h, this.safe.bottom);
    const g = this.g;
    this.backdrop.layout(g);
    this.scenery.layout(g);
    const K = g.K;
    this.adam.scale.set(0.72 * K * this.facing, 0.72 * K);
    this.sparky.scale.set(0.45 * K);
    this.bigChest.position.set(g.stopX(STOPS), g.chestY - 10 * K);
    this.bigChest.scale.set(Math.min(1.6 * this.ck, 1.7));
    this.bigChest.zIndex = this.bigChest.y;
    if (!old) {
      this.adamN.x = (g.caveX + 40 * K) / w;
      this.adamN.y = g.backY / h;
      this.camera.snap(g.caveX + g.w * 0.3, h / 2, 1);
    } else if (this.following) {
      this.camera.snap(this.camTargetX(), h / 2, 1);
    }
    this.layoutChoices();
  }

  /** chest scale: as large as the spacing allows */
  private get ck() {
    return Math.min(this.g.K, this.g.spacing / 140);
  }

  private camTargetX() {
    const g = this.g;
    return this.adamPos.x + (g.landscape ? g.spacing * 1.75 : g.spacing * 1.3);
  }

  enter() {
    void this.adventure();
  }

  tick(dt: number) {
    const g = this.g;
    this.adam.update(dt);
    this.sparky.update(dt);
    for (const s of this.chests) s.chest.update(dt);
    this.bigChest.update(dt);
    this.runner.tick(dt);
    const ap = this.adamPos;
    this.adam.position.set(ap.x, ap.y);
    this.adam.zIndex = ap.y;
    this.adam.scale.x = Math.abs(this.adam.scale.y) * this.facing;
    // Sparky hovers near Adam's shoulder
    const tx = ap.x - 30 * g.K;
    const ty = ap.y - 220 * g.K;
    this.sparky.x += (tx - this.sparky.x) * Math.min(1, dt * 4);
    this.sparky.y += (ty - this.sparky.y) * Math.min(1, dt * 4);
    if (this.following) {
      const target = Math.min(this.camTargetX(), g.stopX(STOPS) + g.w * 0.05);
      this.camera.x += (target - this.camera.x) * Math.min(1, dt * 3);
      this.camera.y += (this.height / 2 - this.camera.y) * Math.min(1, dt * 3);
    }
    if (this.walking) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.32;
        this.sfx('tap', { volume: 0.12, pitch: -10 });
        this.fx.burst(ap.x, ap.y, { texture: this.tex('smoke'), count: 2, tints: [0xf2d79a], speed: [10, 40], angle: [Math.PI, Math.PI * 2], life: [0.3, 0.5], scale: [0.15, 0.3] });
      }
    }
    if (Math.random() < 0.05 && this.chests.length) {
      const s = this.chests[Math.floor(Math.random() * this.chests.length)];
      this.fx.burst(s.chest.x + (Math.random() - 0.5) * 80 * g.K, s.chest.y - Math.random() * 90 * g.K, { texture: this.tex('star'), count: 1, tints: [color.gold, 0xffffff], speed: [5, 25], life: [0.4, 0.8], scale: [0.08, 0.18] });
    }
    this.scenery.update(dt, this.camera.x, this.reduced);
    this.backdrop.update(dt, this.camera.x);
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'narrator') this.sparky.setTalking(on);
  }

  // ------------------------------------------------------------------ adventure flow
  private async walkTo(x: number, y = this.g.backY) {
    const p = this.adamPos;
    const dist = Math.hypot(x - p.x, y - p.y);
    if (dist < 2) return;
    this.facing = x >= p.x ? 1 : -1;
    this.adam.setPose('walk');
    this.walking = true;
    const speed = 230 * this.g.K;
    await this.tw.to(this.adamN, { x: x / this.g.w, y: y / this.g.h }, { duration: Math.max(350, (dist / speed) * 1000), ease: Ease.sineInOut });
    this.walking = false;
    this.adam.setPose('idle');
    this.facing = 1;
  }

  private async adventure() {
    this.sfx('sparkle');
    this.sparky.setMood('excited');
    void this.sparky.hop();
    const first = !Object.values(useGame.getState().save.skills).some((r) => r.attempts > 0);
    await Promise.all([
      this.walkTo(this.g.adamX(0)),
      this.say(
        [{ text: 'أهلا بجزيرة الكنز يا آدم!', lang: 'ar' }, { text: 'Treasure Island!', lang: 'en' }],
        'sparky',
      ),
    ]);
    this.sparky.setMood('idle');
    if (first) await this.wait(150);
    for (this.stop = 0; this.stop < STOPS; this.stop++) {
      if (this.stop > 0) await this.walkTo(this.g.adamX(this.stop));
      // review mode revisits what Adam finds hard, but never the same chest puzzle twice in one hunt
      const played = [...this.skillsPlayed];
      const result = await this.runner.run({ intro: INTROS[this.stop], speaker: 'sparky', filter: (id) => !played.includes(id) });
      this.skillsPlayed.push(result.skillId);
      this.starsEarned += result.stars;
      await this.wait(200);
    }
    await this.finale();
  }

  private async finale() {
    const g = this.g;
    const K = g.K;
    const store = useGame.getState();
    // the three map pieces join into the full map
    const map = new Container();
    const pieces = [0, 1, 2].map((i) => {
      const f = makeFragment(i);
      f.position.set(this.width / 2 + (i - 1) * 140 * K, this.height * 0.3 + (i % 2 ? 40 : -20) * K);
      f.scale.set(1.3 * K);
      f.rotation = (i - 1) * 0.4;
      map.addChild(f);
      return f;
    });
    this.overlay.addChild(map);
    this.sfx('magic');
    await Promise.all(
      pieces.map((p, i) => this.tw.to(p, { x: this.width / 2 + (i - 1) * 64 * 1.3 * K, y: this.height * 0.3, rotation: 0 }, { duration: 700, ease: Ease.backOut, delay: i * 120 })),
    );
    this.sfx('unlock');
    this.screenFx.burst(this.width / 2, this.height * 0.3, { texture: this.tex('star'), count: 24, tints: [color.gold, 0xffffff], speed: [80, 260], life: [0.5, 1], scale: [0.15, 0.35] });
    await this.say([{ text: 'الخريطة كملت! الكنز الكبير هناك!', lang: 'ar' }, { text: 'Treasure!', lang: 'en' }], 'sparky');
    await this.tw.to(map, { alpha: 0 }, { duration: 300 });
    map.destroy({ children: true });

    // walk to the big chest
    this.stop = STOPS;
    await this.walkTo(g.stopX(STOPS) - 160 * K);
    this.following = false;
    await this.camera.focus(g.stopX(STOPS), g.chestY - 90 * K, this.reduced ? 1 : 1.25, 600);
    this.bigChest.glint.alpha = 0.8;
    this.sparky.setMood('hint');
    void this.say([{ text: 'المس الصندوق يا آدم!', lang: 'ar' }], 'sparky');
    // Adam opens it himself
    await this.guard(
      new Promise<void>((resolve) => {
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          this.setA11yChoices([], null);
          resolve();
        };
        this.tappable(this.bigChest, go, { sound: 'press', haptic: 'medium' });
        this.setA11yChoices([{ id: 'open', label: 'Open the treasure · افتح الكنز' }], go);
        // pulse until tapped
        void (async () => {
          while (!done && this.alive) {
            await this.pop(this.bigChest, 1.06);
            await this.tw.wait(500);
          }
        })();
      }),
    );
    this.bigChest.eventMode = 'none';
    this.sparky.setMood('excited');
    await this.openChest(this.bigChest, true);
    const gems = 5;
    void this.bigText('TREASURE!', { y: this.height * 0.28 });
    this.engine.speech.say([{ text: 'لقيت الكنز يا آدم!', lang: 'ar' }], 'sparky');
    // gem fountain
    for (let i = 0; i < 4; i++) {
      this.fx.burst(this.bigChest.x, this.bigChest.y - 90 * K, { texture: this.tex('star'), count: 14, tints: GEM_TINTS, speed: [220, 460], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 700, life: [0.9, 1.5], scale: [0.25, 0.45] });
      this.sfx('coin', { pitch: i * 2 });
      await this.wait(220);
    }
    void this.adam.celebrate(this.adam.celebrationStyle, 1600);
    store.addInventory('gems', gems);
    store.addInventory('mapFragments', STOPS);
    store.completeMission('treasure', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
    await this.flyStarsToHud(this.bigChest.x, this.bigChest.y - 100 * K, MISSION_BONUS);
    await this.camera.panTo(this.camTargetX(), this.height / 2, 1, 500);
    await revealUnlocks(this);
    if (this.engine.shouldWrapUp()) {
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
      void this.engine.endSession();
      return;
    }
    await this.offerNext();
  }

  private async offerNext() {
    const g = this.g;
    const K = g.K;
    const mk = (dx: number, kind: 'again' | 'home') => {
      const c = new Container();
      const glow = new Sprite(this.tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = kind === 'again' ? color.gold : color.blue;
      glow.blendMode = 'add';
      glow.scale.set(1.6);
      const b = new Graphics();
      drawChunky(b, { w: 130, h: 130, radius: 34, top: kind === 'again' ? 0x35d38f : 0x3a7bff, bottom: kind === 'again' ? color.mintDeep : color.blueDeep, depth: kind === 'again' ? color.mintShadow : color.blueShadow });
      c.addChild(glow, b);
      if (kind === 'again') {
        const ch = new Chest(this.tex('glow'));
        ch.scale.set(0.62);
        ch.y = 30;
        c.addChild(ch);
      } else {
        const h = new Graphics();
        h.poly([0, -42, 44, -4, 32, -4, 32, 36, -32, 36, -32, -4, -44, -4]).fill(0xffffff);
        h.roundRect(-10, 8, 20, 28, 4).fill(color.blue);
        c.addChild(h);
      }
      c.position.set(this.camera.x + dx * K, g.backY - 150 * K);
      c.scale.set(0);
      c.zIndex = 9000;
      this.stage.addChild(c);
      return c;
    };
    const span = g.landscape ? 180 : 95;
    const again = mk(-span, 'again');
    const home = mk(span, 'home');
    for (const c of [again, home]) void this.tw.to(c.scale, { x: K, y: K }, { duration: 500, ease: Ease.backOut });
    this.sparky.setMood('idle');
    await this.say([{ text: 'بدك تدور على كنز كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    await this.guard(
      new Promise<void>((resolve) => {
        const pick = (id: string) => {
          resolve();
          this.engine.speech.cancel();
          void this.goto(id === 'again' ? 'treasure' : 'world', { from: 'treasure' });
        };
        this.tappable(again, () => pick('again'), { sound: 'pop', haptic: 'tiny' });
        this.tappable(home, () => pick('home'), { sound: 'pop', haptic: 'tiny' });
        this.setA11yChoices([{ id: 'again', label: 'Play again' }, { id: 'home', label: 'Back to world' }], pick);
      }),
    );
  }

  // ------------------------------------------------------------------ presenter
  async present(ch: LearningChallenge, choices: ChallengeChoice[]) {
    const g = this.g;
    const K = g.K;
    this.counted = 0;
    this.adam.setExpression('happy');
    const isColor = ch.type === 'colorMatch';
    const isNumber = choices.every((c) => c.value !== undefined);
    this.chests = choices.map((choice, i) => {
      const chest = new Chest(this.tex('glow'), {
        paint: isColor ? (conceptColor[choice.visual.key] ?? null) : null,
        number: isNumber ? choice.value : null,
        badge: !isColor && !isNumber ? choice.visual : null,
      });
      chest.alpha = 0;
      this.stage.addChild(chest);
      void i;
      return { chest, choice };
    });
    this.layoutChoices();
    // chests pop up out of the sand
    await Promise.all(
      this.chests.map((s, i) => {
        const fy = s.chest.y;
        s.chest.y = fy + 40 * K;
        s.chest.scale.set(0.3 * this.ck);
        return (async () => {
          await this.wait(i * 150);
          this.sfx('pop', { pitch: i * 3 });
          this.fx.burst(s.chest.x, fy, { texture: this.tex('smoke'), count: 8, tints: [0xf2d79a], speed: [40, 140], angle: [Math.PI, Math.PI * 2], life: [0.4, 0.7], scale: [0.3, 0.6] });
          void this.tw.to(s.chest, { alpha: 1, y: fy }, { duration: 420, ease: Ease.backOut });
          await this.tw.to(s.chest.scale, { x: this.ck, y: this.ck }, { duration: 520, ease: Ease.elasticOut });
        })();
      }),
    );
    for (const s of this.chests) {
      this.tappable(s.chest, () => this.interactive && !s.chest.opened && this.runner.choose(s.choice.id), { sound: 'press', haptic: 'tiny' });
    }
    // counting support: gems scattered on the sand
    let count = 0;
    let labels: number[] | undefined;
    if (ch.type === 'countObjects' || ch.type === 'addition') count = ch.assets.count ?? 0;
    else if (ch.type === 'numberChoice') count = Math.min(ch.assets.count ?? 0, 10);
    else if (ch.type === 'order') {
      const next = ch.answer.value ?? 4;
      labels = [next - 3, next - 2, next - 1];
      count = 3;
    }
    if (count > 0) await this.spawnGems(count, ch.assets.addends, labels);
  }

  private layoutChoices() {
    const g = this.g;
    if (!g) return;
    const n = this.chests.length;
    const cx = g.stopX(Math.min(this.stop, STOPS - 1));
    this.chests.forEach((s, i) => {
      s.chest.position.set(cx + (i - (n - 1) / 2) * g.spacing, g.chestY);
      if (s.chest.alpha > 0) s.chest.scale.set(this.ck);
      s.chest.zIndex = s.chest.y;
    });
    this.gems.forEach((gm, i) => this.placeGem(gm, i, this.gems.length));
  }

  private gemAddends: [number, number] | undefined;

  private placeGem(gm: Gem, i: number, n: number) {
    const g = this.g;
    const K = g.K;
    const rows = n > 5 ? 2 : 1;
    const per = Math.ceil(n / rows);
    const row = Math.floor(i / per);
    const col = i % per;
    const inRow = row === rows - 1 ? n - per * (rows - 1) : per;
    const step = (g.landscape ? 56 : 44) * K;
    let x = g.stopX(Math.min(this.stop, STOPS - 1)) + g.spacing * (g.landscape ? 0.1 : 0.25) + (col - (inRow - 1) / 2) * step;
    if (this.gemAddends && rows === 1) x += (i < this.gemAddends[0] ? -1 : 1) * 12 * K;
    const y = (g.backY + g.chestY - 95 * this.ck) / 2 + 4 * K - row * 34 * K;
    gm.c.position.set(x, y);
    gm.baseY = y;
    gm.c.zIndex = y;
    gm.c.scale.set(0.9 * K);
  }

  private async spawnGems(n: number, addends?: [number, number], labels?: number[]) {
    this.gemAddends = addends;
    for (let i = 0; i < n; i++) {
      const tint = addends ? (i < addends[0] ? GEM_TINTS[0] : GEM_TINTS[1]) : GEM_TINTS[i % GEM_TINTS.length];
      const c = makeGem(tint);
      const gm: Gem = { c, baseY: 0 };
      this.gems.push(gm);
      this.stage.addChild(c);
      if (labels) this.attachLabel(gm, String(labels[i]));
      this.tappable(c, () => this.onGemTap(gm), { sound: null, haptic: 'tiny' });
    }
    this.gems.forEach((gm, i) => this.placeGem(gm, i, n));
    await Promise.all(
      this.gems.map(async (gm, i) => {
        const y = gm.baseY;
        gm.c.y = y - 160 * this.g.K;
        gm.c.alpha = 0;
        await this.wait(i * 90);
        void this.tw.to(gm.c, { alpha: 1 }, { duration: 150 });
        await this.tw.to(gm.c, { y }, { duration: 450, ease: Ease.bounceOut });
        this.sfx('coin', { volume: 0.4, pitch: i });
      }),
    );
  }

  private attachLabel(gm: Gem, text: string) {
    gm.c.getChildByLabel('label')?.destroy();
    const t = gameText(text, 36, { fillColor: color.gold });
    t.label = 'label';
    t.y = -66;
    t.scale.set(0.2);
    gm.c.addChild(t);
    void this.tw.to(t.scale, { x: 1, y: 1 }, { duration: 380, ease: Ease.backOut });
  }

  private async bounceGem(gm: Gem) {
    this.tw.kill(gm.c);
    gm.c.y = gm.baseY;
    await this.tw.to(gm.c, { y: gm.baseY - 34 * this.g.K }, { duration: 160, ease: Ease.quadOut });
    await this.tw.to(gm.c, { y: gm.baseY }, { duration: 260, ease: Ease.bounceOut });
  }

  private onGemTap(gm: Gem) {
    void this.bounceGem(gm);
    if (gm.num === undefined) gm.num = ++this.counted;
    this.sfx('pop', { pitch: (gm.num - 1) * 2 });
    this.attachLabel(gm, String(gm.num));
    this.fx.burst(gm.c.x, gm.c.y - 20 * this.g.K, { texture: this.tex('glow'), count: 4, tints: [color.gold], speed: [20, 70], life: [0.3, 0.5], scale: [0.15, 0.3], additive: true });
    this.engine.speech.say([{ text: numberWord(gm.num), lang: 'en' }], 'sparky');
    if (this.counted === this.gems.length) for (const s of this.chests) void this.pop(s.chest, 1.08);
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  async wrongFeedback(choiceId: string) {
    this.sfx('softBump');
    this.haptic('tiny');
    const s = this.chests.find((c) => c.choice.id === choiceId);
    void this.adam.encouraged();
    if (!s) return;
    // locked chest rattles gently (lid jiggles, never a red X)
    const c = s.chest;
    for (const r of [-0.08, 0.08, -0.05, 0.05, 0]) {
      void this.tw.to(c.lid, { y: -58 - 4 }, { duration: 50 });
      await this.tw.to(c, { rotation: r }, { duration: 60 });
      void this.tw.to(c.lid, { y: -58 }, { duration: 50 });
    }
    this.fx.burst(c.x, c.y - 70 * this.g.K, { texture: this.tex('smoke'), count: 4, tints: [0xf2d79a], speed: [20, 60], life: [0.3, 0.5], scale: [0.2, 0.35] });
  }

  async countTogether(ch: LearningChallenge) {
    this.adam.setPose('point');
    for (let i = 0; i < this.gems.length; i++) {
      const gm = this.gems[i];
      gm.num = i + 1;
      this.attachLabel(gm, String(i + 1));
      void this.bounceGem(gm);
      this.sfx('pop', { pitch: i * 2 });
      await this.say([{ text: numberWord(i + 1).replace(/^./, (c) => c.toUpperCase()), lang: 'en' }], 'sparky');
    }
    this.counted = this.gems.length;
    this.adam.setPose('idle');
    if (ch.assets.count) this.pulseAnswer(ch, false);
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const s = this.chests.find((c) => c.choice.id === ch.answer.id);
    if (!s) return;
    s.chest.glint.alpha = 1;
    void this.tw.to(s.chest.glint, { alpha: 0 }, { duration: strong ? 2600 : 1600, ease: Ease.quadIn });
    void this.pop(s.chest, strong ? 1.15 : 1.08);
    this.fx.burst(s.chest.x, s.chest.y - 60 * this.g.K, { texture: this.tex('star'), count: 8, tints: [color.gold, 0xffffff], speed: [30, 110], life: [0.4, 0.8], scale: [0.12, 0.25] });
  }

  private async pop(el: Container, k: number) {
    const sx = el.scale.x;
    const sy = el.scale.y;
    await this.tw.to(el.scale, { x: sx * k, y: sy * k }, { duration: 140, ease: Ease.quadOut });
    await this.tw.to(el.scale, { x: sx, y: sy }, { duration: 420, ease: Ease.elasticOut });
  }

  private async openChest(chest: Chest, big = false) {
    const K = this.g.K;
    chest.opened = true;
    this.sfx('chest');
    this.haptic('medium');
    await this.tw.to(chest.lid.scale, { x: 1.04, y: 0.9 }, { duration: 90 });
    void this.tw.to(chest.lid, { y: -58 - 30, rotation: -0.45 }, { duration: 420, ease: Ease.backOut });
    void this.tw.to(chest.lid.scale, { x: 1, y: 0.75 }, { duration: 420, ease: Ease.backOut });
    void this.tw.to(chest.beam.scale, { y: big ? 5.5 : 4 }, { duration: 500, ease: Ease.cubicOut });
    chest.glint.alpha = 1;
    this.camera.shake(big ? 8 : 4, 250);
    const sx = chest.x;
    const sy = chest.y - 70 * K * (big ? 1.5 : 1);
    this.fx.burst(sx, sy, { texture: this.tex('coin'), count: big ? 30 : 16, speed: [200, 420], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 800, life: [0.8, 1.3], scale: [0.25, 0.45], spin: [-6, 6] });
    this.fx.burst(sx, sy, { texture: this.tex('glow'), count: 10, tints: [color.gold, 0xffffff], speed: [30, 160], life: [0.4, 0.8], scale: [0.3, 0.7], additive: true });
    for (let i = 0; i < 4; i++) this.sfx('coin', { delay: 0.12 + i * 0.09, pitch: i * 2 });
    await this.wait(450);
  }

  /** Correct chest: Adam walks up, the chest bursts open, a map piece flies to the HUD. */
  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    const g = this.g;
    const K = g.K;
    this.interactive = false;
    const s = this.chests.find((c) => c.choice.id === choiceId)!;
    for (const o of this.chests) if (o !== s) void this.tw.to(o.chest, { alpha: 0, y: o.chest.y + 30 * K }, { duration: 400, ease: Ease.quadIn });
    for (const gm of this.gems) void this.tw.to(gm.c, { alpha: 0 }, { duration: 300 });
    s.chest.glint.alpha = 1;
    void this.pop(s.chest, 1.15);
    this.sfx('magic');
    // Adam walks up to the chest
    this.following = false;
    await this.walkTo(s.chest.x - 90 * K, g.chestY - 6 * K);
    this.adam.setPose('point');
    void this.camera.focus(s.chest.x - 30 * K, s.chest.y - 90 * K, this.reduced ? 1 : 1.35, 500);
    await this.openChest(s.chest);
    // map fragment rises out of the chest, then flies into the HUD
    const frag = makeFragment(this.stop);
    frag.position.set(s.chest.x, s.chest.y - 80 * K);
    frag.scale.set(0.2 * K);
    frag.zIndex = 99999;
    this.stage.addChild(frag);
    await this.tw.to(frag, { y: s.chest.y - 200 * K }, { duration: 500, ease: Ease.backOut, onUpdate: (t) => frag.scale.set((0.2 + t * 1.1) * K) });
    void this.say([{ text: 'قطعة من الخريطة!', lang: 'ar' }], 'sparky');
    await this.wait(400);
    const from = this.camera.toScreen(frag.x, frag.y);
    frag.destroy();
    const fly = makeFragment(this.stop);
    fly.position.set(from.x, from.y);
    fly.scale.set(1.3 * K * this.camera.zoom);
    this.overlay.addChild(fly);
    const target = { x: this.width - 150, y: this.safe.top + 34 };
    const cx = (from.x + target.x) / 2;
    const cy = Math.min(from.y, target.y) - 80;
    this.sfx('whoosh');
    await this.tw.progress({
      duration: 650,
      ease: Ease.cubicIn,
      onUpdate: (t) => {
        fly.x = bezier2(from.x, cx, target.x, t);
        fly.y = bezier2(from.y, cy, target.y, t);
        fly.rotation = t * 4;
        fly.scale.set((1.3 * K * this.camera.zoom) * (1 - t * 0.7));
      },
    });
    fly.destroy();
    this.sfx('starLand');
    this.fragments++;
    // independent success also earns a golden key
    if (stars >= 3) {
      this.keys++;
      useGame.getState().addInventory('keys', 1);
    }
    useGame.getState().patchHud({ fragments: this.fragments, keys: this.keys });
    pulseHud('objective');
    // celebrate + stars
    this.adam.setPose('idle');
    const celebrate = this.adam.celebrate(this.adam.celebrationStyle, 1300);
    this.celebrate(s.chest.x, s.chest.y - 100 * K, 0.8);
    await this.flyStarsToHud(s.chest.x, s.chest.y - 120 * K, stars);
    await this.guard(celebrate);
    await this.camera.panTo(this.camTargetX(), this.height / 2, 1, 500);
    void this.tw.to(s.chest, { alpha: 0 }, { duration: 400 });
    await this.walkTo(g.adamX(this.stop));
    this.following = true;
  }

  clear() {
    for (const s of this.chests) {
      this.tw.drop(s.chest);
      s.chest.destroy({ children: true });
    }
    this.chests = [];
    for (const gm of this.gems) {
      this.tw.drop(gm.c);
      gm.c.destroy({ children: true });
    }
    this.gems = [];
    this.gemAddends = undefined;
  }
}
