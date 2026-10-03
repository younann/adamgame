import { Container, Graphics, Sprite } from 'pixi.js';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene } from '../../engine/Scene';
import { Ease, bezier2, lerp } from '../../engine/Tween';
import { drawChunky, starPoints, vGrad } from '../../draw/paint';
import { Adam, loadFaceTexture } from '../../entities/Adam';
import { Sparky } from '../../entities/Sparky';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { pulseHud } from '../../engine/hudBridge';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { Skyline } from './Skyline';
import { Portal } from './Portal';
import { CREATURES, Creature } from './Creature';

const GOAL = 3;

const INTROS: VoiceLine[][] = [
  [{ text: 'صديقنا الصغير محبوس! افتح البوابة الصحيحة!', lang: 'ar' }],
  [{ text: 'واحد كمان محتاج مساعدة!', lang: 'ar' }],
  [{ text: 'آخر صديق! يلا يا بطل!', lang: 'ar' }],
];

/**
 * HERO CITY — English rescue missions on a twilight rooftop. The choices are energy
 * portals floating in the skyline; the right answer makes Adam lock on, fire his energy
 * grapple, open the portal and rescue a trapped friend.
 */
export default class HeroCityScene extends Scene implements ChallengePresenter {
  readonly id = 'hero' as const;
  readonly music = 'hero' as const;

  runner!: ChallengeRunner;
  private sky!: Skyline;
  private adam!: Adam;
  private sparky!: Sparky;
  private actors = new Container();
  private portalLayer = new Container();
  private beamG = new Graphics();
  private portals: Portal[] = [];
  private creature: Creature | null = null;
  private creaturePad = new Graphics();
  private rescuedFriends: Creature[] = [];
  private collectibles: Sprite[] = [];
  private interactive = false;
  private beam: { to: Portal; k: number } | null = null;
  private rescued = 0;
  private starsEarned = 0;
  private skillsPlayed: string[] = [];
  private home = { x: 0, y: 0 };
  private K = 1;
  private sparkyPointTimer = 0;
  private faceTex: Awaited<ReturnType<typeof loadFaceTexture>> = null;
  private badge: Container | null = null;

  async load() {
    this.faceTex = await loadFaceTexture();
  }

  build() {
    this.sky = new Skyline(this.tex('glow'), this.tex('ring'));
    this.adam = new Adam(this.faceTex);
    this.adam.setPose('heroPose');
    this.sparky = new Sparky(this.tex('glow'));
    this.actors.sortableChildren = true;
    this.world.addChild(this.sky.far, this.sky.mid, this.sky.near, this.creaturePad, this.portalLayer, this.beamG, this.actors, this.fx.view);
    this.actors.addChild(this.adam, this.sparky);
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(this.tex('goldStar'));
      s.anchor.set(0.5);
      s.scale.set(0.32);
      (s as Sprite & { ph: number }).ph = i * 1.7;
      this.world.addChild(s);
      this.collectibles.push(s);
      const hit = new Graphics().circle(0, 0, 70).fill({ color: 0xffffff, alpha: 0.001 });
      s.addChild(hit);
      this.tappable(s, () => this.grabCollectible(s), { sound: 'sparkle', haptic: 'tiny' });
    }
    this.runner = new ChallengeRunner(this, 'hero', this);
    useGame.getState().setLastVisited('hero');
    useGame.getState().setHud({ kind: 'hero', energy: 0.15, rescued: 0, goal: GOAL });
  }

  layout(w: number, h: number) {
    const K = (this.K = Math.min(w, h * 0.6) / 400);
    const landscape = !this.isPortrait;
    const roofY = h * (landscape ? 0.74 : 0.72);
    this.sky.layout(w, h, roofY);
    const padY = roofY + Math.min(h * 0.09, 70 * K);
    this.home = { x: landscape ? w * 0.5 : w * 0.5, y: padY };
    if (!this.beam) {
      this.adam.position.set(this.home.x, this.home.y);
    }
    const adamS = (landscape ? 0.95 : 0.85) * K;
    this.adam.scale.set(adamS * Math.sign(this.adam.scale.x || 1), adamS);
    this.adam.zIndex = 100;
    this.sparky.position.set(landscape ? w * 0.1 : w * 0.17, landscape ? h * 0.56 : h * 0.6);
    this.sparky.scale.set(0.5 * K);
    this.sparky.zIndex = 200;
    // rescued friends line up on the rooftop
    this.rescuedFriends.forEach((c, i) => this.placeFriend(c, i));
    // trapped friend high up on a hover pad
    const cp = this.creatureSpot();
    this.creaturePad.clear();
    this.creaturePad.ellipse(cp.x, cp.y + 4 * K, 46 * K, 12 * K).fill({ color: color.blueShadow, alpha: 0.9 }).stroke({ width: 3 * K, color: color.mint });
    this.creaturePad.ellipse(cp.x, cp.y + 4 * K, 30 * K, 7 * K).fill({ color: color.mint, alpha: 0.35 });
    if (this.creature && this.creature.trapped) {
      this.creature.position.set(cp.x, cp.y);
      this.creature.scale.set(0.85 * K);
    }
    this.portals.forEach((p, i) => this.placePortal(p, i, this.portals.length));
    const spots = landscape
      ? [[0.08, 0.2], [0.92, 0.18], [0.1, 0.5], [0.9, 0.5]]
      : [[0.1, 0.15], [0.9, 0.2], [0.09, 0.27], [0.9, 0.62]];
    this.collectibles.forEach((s, i) => {
      s.position.set(w * spots[i][0], h * spots[i][1]);
      (s as Sprite & { baseY: number }).baseY = s.y;
      s.scale.set(0.32 * K);
    });
  }

  private creatureSpot() {
    const landscape = !this.isPortrait;
    return { x: this.width * 0.5, y: this.height * (landscape ? 0.24 : 0.2) + this.safe.top * 0.5 };
  }

  private placePortal(p: Portal, i: number, n: number) {
    const w = this.width;
    const h = this.height;
    const f = n === 1 ? 0 : -1 + (2 * i) / (n - 1);
    if (this.isPortrait) {
      p.position.set(w * 0.5 + f * w * 0.31, h * 0.43 - (1 - Math.abs(f)) * h * 0.08);
    } else {
      p.position.set(w * 0.5 + f * w * 0.24, h * 0.44 - (1 - Math.abs(f)) * h * 0.05);
    }
  }

  private portalRadius() {
    return this.isPortrait ? Math.min(this.width * 0.15, this.height * 0.085) : Math.min(this.width * 0.07, this.height * 0.1);
  }

  private placeFriend(c: Creature, i: number) {
    const K = this.K;
    const side = i % 2 === 0 ? 1 : -1;
    const step = Math.floor(i / 2) + 1;
    c.position.set(this.home.x + side * (70 + step * 52) * K, this.home.y + 4 * K);
    c.scale.set(0.6 * K);
    c.zIndex = 50;
  }

  enter() {
    void this.intro();
  }

  tick(dt: number) {
    this.sky.update(dt, this.reduced);
    this.sky.parallax(this.camera.x, this.camera.y, this.width / 2, this.height / 2);
    this.adam.update(dt);
    this.sparky.update(dt);
    this.creature?.update(dt);
    for (const c of this.rescuedFriends) c.update(dt);
    for (const p of this.portals) p.update(dt);
    this.runner.tick(dt);
    for (const s of this.collectibles) {
      const ph = (s as Sprite & { ph: number }).ph;
      const by = (s as Sprite & { baseY: number }).baseY ?? s.y;
      s.y = by + Math.sin(this.time * 1.8 + ph) * 8;
      s.rotation = Math.sin(this.time * 1.2 + ph) * 0.2;
    }
    if (this.sparkyPointTimer > 0) {
      this.sparkyPointTimer -= dt;
      if (this.sparkyPointTimer <= 0) {
        this.sparky.point(null);
        this.sparky.setMood('idle');
      }
    }
    this.drawBeam();
    if (this.portals.length && Math.random() < 0.2) {
      const p = this.portals[Math.floor(Math.random() * this.portals.length)];
      const a = Math.random() * Math.PI * 2;
      this.fx.burst(p.x + Math.cos(a) * p.R, p.y + Math.sin(a) * p.R, { texture: this.tex('glow'), count: 1, tints: [p.hue, 0xffffff], speed: [5, 25], life: [0.4, 0.7], scale: [0.08, 0.16], additive: true });
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'commentator') this.sparky.setTalking(on);
  }

  // ------------------------------------------------------------------ mission flow
  private async intro() {
    this.camera.snap(this.width / 2, this.height * 0.3, this.reduced ? 1 : 1.3);
    await this.wait(200);
    void this.camera.reset(1500);
    this.sparky.setMood('excited');
    void this.sparky.hop();
    this.adam.setExpression('excited');
    await this.say([{ text: 'مدينة الأبطال بحاجة لبطل!', lang: 'ar' }, { text: 'Hero City!', lang: 'en' }], 'sparky');
    this.sparky.setMood('idle');
    this.adam.setExpression('happy');
    while (this.rescued < GOAL) {
      const result = await this.runner.run({ intro: INTROS[this.rescued] ?? INTROS[1], speaker: 'sparky' });
      this.skillsPlayed.push(result.skillId);
      this.starsEarned += result.stars;
      await this.wait(250);
    }
    await this.missionComplete();
  }

  private spawnCreature() {
    const done = useGame.getState().save.worlds.missionsCompleted.hero ?? 0;
    const kind = CREATURES[(this.rescued + done * GOAL) % CREATURES.length];
    const c = new Creature(kind);
    const cp = this.creatureSpot();
    c.position.set(cp.x, cp.y - 120 * this.K);
    c.scale.set(0.85 * this.K);
    c.alpha = 0;
    c.zIndex = 60;
    this.actors.addChild(c);
    this.creature = c;
    void this.tw.to(c, { y: cp.y, alpha: 1 }, { duration: 600, ease: Ease.bounceOut });
  }

  private async missionComplete() {
    const store = useGame.getState();
    this.sfx('fanfare');
    this.adam.setPose('victory');
    this.adam.setExpression('excited');
    for (const c of this.rescuedFriends) c.setHappy(true);
    // hero badge rises above Adam
    const K = this.K;
    const badge = new Container();
    const g = new Graphics();
    g.poly([0, -70, 60, -46, 54, 20, 0, 66, -54, 20, -60, -46]).fill(color.blueShadow);
    g.poly([0, -64, 54, -42, 48, 16, 0, 58, -48, 16, -54, -42]).fill(vGrad([[0, 0x5d93ff], [1, color.blueDeep]])).stroke({ width: 5, color: color.gold });
    g.poly(starPoints(28, 0.48)).fill(color.gold).stroke({ width: 3, color: 0xffffff });
    const glow = new Sprite(this.tex('glow'));
    glow.anchor.set(0.5);
    glow.tint = color.gold;
    glow.blendMode = 'add';
    glow.scale.set(2.4);
    badge.addChild(glow, g);
    badge.position.set(this.home.x, this.home.y - 260 * K);
    badge.scale.set(0);
    this.world.addChild(badge);
    this.badge = badge;
    void this.camera.focus(this.home.x, this.home.y - 160 * K, 1.12, 700);
    await this.tw.to(badge.scale, { x: K, y: K }, { duration: 700, ease: Ease.elasticOut });
    this.celebrate(badge.x, badge.y, 1.4);
    this.haptic('celebrate');
    void this.adam.celebrate('celebration.flex', 1400);
    await this.say([{ text: 'أنقذت كل أصحابك! أنت بطل حقيقي!', lang: 'ar' }, { text: 'Super hero!', lang: 'en' }], 'sparky');
    const target = this.screenToWorld(this.width - 70, this.safe.top + 40);
    this.sfx('whoosh');
    await this.tw.to(badge, { x: target.x, y: target.y }, { duration: 700, ease: Ease.cubicIn, onUpdate: (t) => badge.scale.set(lerp(K, 0.15, t)) });
    badge.destroy({ children: true });
    this.badge = null;
    store.addInventory('heroPowers', 1);
    pulseHud('stars');
    this.sfx('unlock');
    store.completeMission('hero', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
    await this.flyStarsToHud(this.home.x, this.home.y - 150 * K, MISSION_BONUS);
    await this.camera.reset(500);
    this.adam.setPose('heroPose');
    await revealUnlocks(this);
    if (this.engine.shouldWrapUp()) {
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
      void this.engine.endSession();
      return;
    }
    await this.offerNext();
  }

  private screenToWorld(sx: number, sy: number) {
    const cam = this.camera;
    return { x: (sx - this.width / 2) / cam.zoom + cam.x, y: (sy - this.height / 2) / cam.zoom + cam.y };
  }

  private async offerNext() {
    const K = this.K;
    const mk = (fx: number, kind: 'again' | 'home') => {
      const c = new Container();
      const glow = new Sprite(this.tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = kind === 'again' ? color.mint : color.gold;
      glow.blendMode = 'add';
      glow.scale.set(1.6);
      const g = new Graphics();
      drawChunky(g, { w: 120, h: 120, radius: 60, top: kind === 'again' ? 0x35d38f : 0x3a7bff, bottom: kind === 'again' ? color.mintDeep : color.blueDeep, depth: kind === 'again' ? color.mintShadow : color.blueShadow });
      const icon = new Graphics();
      if (kind === 'again') {
        icon.arc(0, 0, 28, -Math.PI * 0.2, Math.PI * 1.5).stroke({ width: 10, color: 0xffffff, cap: 'round' });
        icon.poly([22, -34, 36, -10, 8, -12]).fill(0xffffff);
      } else {
        icon.poly([0, -38, 40, -4, 29, -4, 29, 32, -29, 32, -29, -4, -40, -4]).fill(0xffffff);
        icon.roundRect(-9, 8, 18, 24, 4).fill(color.blue);
      }
      c.addChild(glow, g, icon);
      c.position.set(this.width * fx, this.height * (this.isPortrait ? 0.42 : 0.45));
      c.scale.set(0);
      this.world.addChild(c);
      void this.tw.to(c.scale, { x: K, y: K }, { duration: 500, ease: Ease.backOut });
      return c;
    };
    const again = mk(this.isPortrait ? 0.28 : 0.36, 'again');
    const home = mk(this.isPortrait ? 0.72 : 0.64, 'home');
    await this.say([{ text: 'بدك تنقذ أصحاب كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    await this.guard(
      new Promise<void>((resolve) => {
        const go = (id: 'again' | 'home') => {
          resolve();
          this.engine.speech.cancel();
          void (id === 'again' ? this.goto('hero') : this.goto('world', { from: 'hero' }));
        };
        this.tappable(again, () => go('again'), { sound: 'pop', haptic: 'tiny' });
        this.tappable(home, () => go('home'), { sound: 'pop', haptic: 'tiny' });
        this.setA11yChoices([{ id: 'again', label: 'Play again' }, { id: 'home', label: 'Back to world' }], (id) => go(id as 'again' | 'home'));
      }),
    );
  }

  private grabCollectible(s: Sprite) {
    this.fx.burst(s.x, s.y, { texture: this.tex('star'), count: 14, tints: [color.gold, color.mint, 0xffffff], speed: [80, 220], gravity: 200, life: [0.5, 0.9], scale: [0.15, 0.3] });
    void (async () => {
      await this.tw.to(s.scale, { x: 0, y: 0 }, { duration: 220, ease: Ease.backIn });
      await this.wait(2500);
      await this.tw.to(s.scale, { x: 0.32 * this.K, y: 0.32 * this.K }, { duration: 500, ease: Ease.elasticOut });
    })();
  }

  // ------------------------------------------------------------------ presenter
  async present(_ch: LearningChallenge, choices: ChallengeChoice[]) {
    this.adam.setPose('heroPose');
    this.adam.setExpression('happy');
    this.spawnCreature();
    const R = this.portalRadius();
    for (const p of this.portals) p.destroy({ children: true });
    this.portals = [];
    choices.forEach((ch, i) => {
      const p = new Portal(ch, this.tex('glow'), R);
      this.placePortal(p, i, choices.length);
      p.scale.set(0);
      this.portalLayer.addChild(p);
      this.portals.push(p);
      const hit = new Graphics().circle(0, 0, R * 1.25).fill({ color: 0xffffff, alpha: 0.001 });
      p.addChildAt(hit, 0);
      this.tappable(p, () => this.interactive && this.runner.choose(ch.id), { sound: 'press', haptic: 'tiny', visual: p.body });
      void this.tw.to(p.scale, { x: 1, y: 1 }, { duration: 600, delay: 250 + i * 160, ease: Ease.elasticOut });
    });
    this.sfx('portal', { delay: 0.2 });
    await this.wait(700);
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  async wrongFeedback(choiceId: string) {
    const p = this.portals.find((x) => x.choice.id === choiceId);
    this.sfx('softBump');
    this.haptic('tiny');
    void this.adam.encouraged();
    if (!p) return;
    this.fx.burst(p.x, p.y, { texture: this.tex('smoke'), count: 6, tints: [0xb3c5ff], speed: [20, 70], life: [0.4, 0.7], scale: [0.3, 0.6] });
    const x0 = p.x;
    for (const dx of [-12, 12, -6, 6, 0]) await this.tw.to(p, { x: x0 + dx }, { duration: 55 });
    this.adam.setPose('heroPose');
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const p = this.portals.find((x) => x.choice.id === ch.answer.id);
    if (!p) return;
    p.glow.alpha = 1;
    void this.tw.to(p.glow, { alpha: 0.55 }, { duration: strong ? 2600 : 1600, ease: Ease.quadIn });
    void (async () => {
      const k = strong ? 1.2 : 1.1;
      await this.tw.to(p.scale, { x: k, y: k }, { duration: 150 });
      await this.tw.to(p.scale, { x: 1, y: 1 }, { duration: 450, ease: Ease.elasticOut });
    })();
    this.sparky.setMood('hint');
    this.sparky.point(Math.atan2(p.y - this.sparky.y, p.x - this.sparky.x));
    this.sparkyPointTimer = 2.5;
  }

  private handPos() {
    return this.world.toLocal(this.adam.toGlobal({ x: 70, y: -122 }));
  }

  private drawBeam() {
    const g = this.beamG.clear();
    if (!this.beam) return;
    const { to, k } = this.beam;
    if (k <= 0) return;
    const a = this.handPos();
    const bx = lerp(a.x, to.x, k);
    const by = lerp(a.y, to.y, k);
    const wob = Math.sin(this.time * 40) * 3;
    const mx = (a.x + bx) / 2 + wob;
    const my = (a.y + by) / 2 - 10;
    g.moveTo(a.x, a.y).quadraticCurveTo(mx, my, bx, by).stroke({ width: 16, color: to.hue, alpha: 0.25 });
    g.moveTo(a.x, a.y).quadraticCurveTo(mx, my, bx, by).stroke({ width: 7, color: color.mint, alpha: 0.7 });
    g.moveTo(a.x, a.y).quadraticCurveTo(mx, my, bx, by).stroke({ width: 3, color: 0xffffff, alpha: 1 });
    g.circle(a.x, a.y, 9).fill({ color: 0xffffff, alpha: 0.9 });
    g.circle(bx, by, 12).fill({ color: color.mint, alpha: 0.6 });
    if (Math.random() < 0.6) {
      const t = Math.random();
      this.fx.burst(bezier2(a.x, mx, bx, t), bezier2(a.y, my, by, t), { texture: this.tex('glow'), count: 1, tints: [color.mint, to.hue, 0xffffff], speed: [10, 60], life: [0.2, 0.4], scale: [0.1, 0.2], additive: true });
    }
  }

  /** Lock on → grapple beam → portal opens → Adam swings up → friend rescued. */
  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    const p = this.portals.find((x) => x.choice.id === choiceId);
    this.interactive = false;
    if (!p) return;
    const K = this.K;
    this.engine.audio.setMusicIntensity(0.6);
    for (const o of this.portals) if (o !== p) void this.tw.to(o, { alpha: 0.2 }, { duration: 300 });
    // face the portal and aim
    const sx = Math.abs(this.adam.scale.x);
    this.adam.scale.x = p.x < this.adam.x - 10 ? -sx : sx;
    this.adam.setPose('point');
    this.adam.setExpression('determined');
    this.sparky.setMood('excited');
    // 1. targeting reticle locks on
    p.reticleOn = true;
    this.sfx('beep');
    this.sfx('beep', { delay: 0.18 });
    await this.wait(480);
    // 2. energy grapple fires
    this.beam = { to: p, k: 0 };
    this.sfx('zap');
    this.haptic('medium');
    await this.tw.to(this.beam, { k: 1 }, { duration: 230, ease: Ease.quadOut });
    this.camera.shake(5, 220);
    p.reticleOn = false;
    // 3. portal activates
    this.sfx('portal');
    p.doFlash();
    this.fx.burst(p.x, p.y, { texture: this.tex('ring'), count: 3, tints: [p.hue, color.mint], speed: [5, 20], life: [0.5, 0.7], scale: [0.4, 0.9], scaleEnd: 3, additive: true });
    await this.tw.progress({ duration: 450, ease: Ease.cubicOut, onUpdate: (t) => p.setOpened(t) });
    // 4. the trapped friend's cage breaks
    const cr = this.creature;
    if (cr) {
      this.sfx('pop');
      this.sfx('magic', { delay: 0.05 });
      this.fx.burst(cr.x, cr.y - 38 * cr.scale.y, { texture: this.tex('glow'), count: 16, tints: [color.primary, 0xffffff, color.mint], speed: [80, 220], life: [0.4, 0.8], scale: [0.15, 0.35], additive: true });
      cr.free();
    }
    // 5. Adam swings up to the portal
    this.adam.setPose('victory');
    this.sfx('whoosh');
    const from = { x: this.adam.x, y: this.adam.y };
    const dest = { x: p.x, y: p.y + p.R * 1.6 };
    void this.camera.focus((from.x + dest.x) / 2, (from.y + dest.y) / 2 - 60 * K, 1.12, 650);
    const cx = (from.x + dest.x) / 2;
    const cy = Math.max(from.y, dest.y) + 20 * K;
    await this.tw.progress({
      duration: 650,
      ease: Ease.sineInOut,
      onUpdate: (t) => {
        this.adam.x = bezier2(from.x, cx, dest.x, t);
        this.adam.y = bezier2(from.y, cy, dest.y, t);
        this.adam.rotation = Math.sin(t * Math.PI) * 0.25 * Math.sign(this.adam.scale.x);
      },
    });
    this.adam.rotation = 0;
    this.beam = null;
    // 6. friend floats down through the portal into Adam's arms
    if (cr) {
      cr.setHappy(true);
      await this.tw.to(cr, { x: p.x, y: p.y + p.R * 0.6 }, { duration: 450, ease: Ease.quadInOut });
      this.celebrate(p.x, p.y, 0.8);
    }
    this.haptic('celebrate');
    void this.bigText('SUPER!', { fill: color.mint, y: this.height * 0.26 });
    // 7. swing back down together
    const spotIndex = this.rescuedFriends.length;
    this.adam.setPose('heroPose');
    void this.tw.to(this.adam, { x: this.home.x, y: this.home.y }, { duration: 600, ease: Ease.quadIn });
    if (cr) {
      const side = spotIndex % 2 === 0 ? 1 : -1;
      const step = Math.floor(spotIndex / 2) + 1;
      const tx = this.home.x + side * (70 + step * 52) * K;
      const ty = this.home.y + 4 * K;
      void this.tw.to(cr.scale, { x: 0.6 * K, y: 0.6 * K }, { duration: 650 });
      await this.tw.progress({
        duration: 650,
        ease: Ease.quadIn,
        onUpdate: (t) => {
          cr.x = lerp(p.x, tx, t);
          cr.y = lerp(p.y + p.R * 0.6, ty, t) - Math.sin(t * Math.PI) * 80 * K;
        },
      });
      cr.zIndex = 50;
      this.rescuedFriends.push(cr);
      this.creature = null;
      this.sfx('bounce');
      // 8. camera pans to the rescued friend — hearts & thanks
      void this.camera.focus(cr.x, cr.y - 60 * K, 1.3, 500);
      this.fx.burst(cr.x, cr.y - 50 * K, { texture: this.tex('star'), count: 12, tints: [0xff6fb5, 0xff9ec7, color.gold], speed: [60, 160], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 120, life: [0.7, 1.1], scale: [0.18, 0.32] });
      await this.say([{ text: 'شكراً يا آدم!', lang: 'ar' }], 'sparky');
    } else {
      await this.wait(600);
    }
    // 9. stars fly into the HUD, energy rises
    this.rescued++;
    useGame.getState().patchHud({ rescued: this.rescued, energy: Math.min(1, 0.15 + (this.rescued / GOAL) * 0.85) });
    const celebrateP = this.adam.celebrate(this.adam.celebrationStyle, 1200);
    await this.flyStarsToHud(this.home.x, this.home.y - 160 * K, stars);
    await this.guard(celebrateP);
    this.adam.scale.x = Math.abs(this.adam.scale.x);
    this.engine.audio.setMusicIntensity(0);
    this.sparky.setMood('idle');
    await this.camera.reset(600);
  }

  clear() {
    for (const p of this.portals) {
      const portal = p;
      void this.tw.to(portal.scale, { x: 0, y: 0 }, { duration: 260, ease: Ease.backIn }).then(() => portal.destroy({ children: true }));
    }
    this.portals = [];
    this.beam = null;
  }

  exit() {
    this.engine.audio.setMusicIntensity(0);
    this.badge = null;
  }
}
