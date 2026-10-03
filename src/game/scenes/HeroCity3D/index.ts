import * as THREE from 'three';
import { color } from '@/design-system/tokens';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene3D } from '../../three/Scene3D';
import { Hero3D } from '../../three/Hero3D';
import { adamLook } from '../../three/adamLook';
import { Controls } from '../../three/Controls';
import { disposeObject, type StageLook } from '../../three/ThreeStage';
import { Ease } from '../../engine/Tween';
import { drawConcept } from '../../draw/conceptArt';
import { pulseHud } from '../../engine/hudBridge';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { Particles3D, Sparky3D, makeChoiceButton } from '../Football3D/props';
import { makeCollectStar } from '../Football3D/Rings3D';
import { CREATURES } from '../HeroCityScene/Creature';
import { City3D, HOME_ROOF } from './City3D';
import { Creature3D, SkyPortal } from './actors';
import { BOUNDS, FLY_Y, FRIEND_AT, START, clampToBounds, flewThrough, portalSpots } from './flight';

const GOAL = 3;
const SPEED = 6.5;
/** the hero's body pivots at the belly while flying (Hero3D's origin is at the feet) */
const PIVOT = 0.6;

const INTROS: VoiceLine[][] = [
  [{ text: 'صديقنا الصغير محبوس! افتح البوابة الصحيحة!', lang: 'ar' }],
  [{ text: 'واحد كمان محتاج مساعدة!', lang: 'ar' }],
  [{ text: 'آخر صديق! يلا يا بطل!', lang: 'ar' }],
];

interface SkyStar {
  mesh: THREE.Mesh;
  away: number;
}

/**
 * HERO CITY 3D — Adam really flies over a night city. Drag to steer his flight (or tap where to
 * fly). English challenges appear as big glowing portals in the sky; Adam flies THROUGH the
 * right one → hero power bursts the bubble that traps a little friend, who then rides along on
 * a hover disc. Rescue three friends to earn the hero badge.
 */
export default class HeroCity3D extends Scene3D implements ChallengePresenter {
  readonly id = 'hero' as const;
  readonly music = 'hero' as const;
  runner!: ChallengeRunner;

  private city!: City3D;
  private adam!: Hero3D;
  /** flight pivot (position + pitch/roll); Adam hangs under it */
  private flyer = new THREE.Group();
  private sparky = new Sparky3D();
  private sparks = new Particles3D();
  private controls!: Controls;

  private pos = new THREE.Vector3(HOME_ROOF.x, HOME_ROOF.top + 0.27 + PIVOT, HOME_ROOF.z);
  private vel = new THREE.Vector3();
  private facing = Math.PI;
  private moveTarget: THREE.Vector3 | null = null;
  private flying = false;
  private cutscene = true;
  private follow = false;
  private portrait = true;
  private camSmooth = new THREE.Vector3();
  private lookSmooth = new THREE.Vector3();

  private portals: SkyPortal[] = [];
  private creature: Creature3D | null = null;
  private friends: Creature3D[] = [];
  private skyStars: SkyStar[] = [];
  private interactive = false;
  private rescued = 0;
  private starsEarned = 0;
  private skillsPlayed: string[] = [];

  protected stageLook(): StageLook {
    return { bloomIntensity: 0.65, bloomThreshold: 0.9, vignette: 0.45, saturation: 0.18, contrast: 0.12, exposure: 0.85 };
  }

  protected build3D() {
    const save = useGame.getState().save;
    this.city = new City3D(this.stage.quality);
    this.s3.add(this.city.group);
    this.s3.fog = new THREE.Fog(0x2a1a50, 45, 140);
    this.useStudioEnvironment(0.3);

    // Adam is a superhero here: he always wears a cape
    const look = adamLook(save.avatar);
    look.cape ??= 0xff4b4b;
    this.adam = new Hero3D(look);
    this.adam.root.scale.setScalar(0.95);
    this.adam.root.position.y = -PIVOT;
    this.flyer.add(this.adam.root);
    this.flyer.rotation.order = 'YXZ';
    this.s3.add(this.flyer, this.sparky.root, this.sparks.points);

    for (let i = 0; i < 5; i++) {
      const m = makeCollectStar();
      m.scale.setScalar(1.3);
      this.s3.add(m);
      const s = { mesh: m, away: 0 };
      this.placeSkyStar(s);
      this.skyStars.push(s);
    }

    this.controls = new Controls(this.tex('glow'), this.tex('glow'), { onTap: (x, y) => this.onTap(x, y), onKick: () => {} }, () => this.haptic('tiny'), false);
    this.controls.setVisible(false);
    this.overlay.addChildAt(this.controls.view, 0);

    this.updaters.push((dt, t) => this.step(dt, t));
    this.runner = new ChallengeRunner(this, 'hero', this);
    useGame.getState().setLastVisited('hero');
    useGame.getState().setHud({ kind: 'hero', energy: 0.15, rescued: 0, goal: GOAL });
  }

  layout(w: number, h: number) {
    this.portrait = h >= w;
    this.camFov = this.portrait ? 60 : 48;
    this.controls.layout(w, h, this.safe.bottom, this.safe.right);
    // portals re-spread for the new aspect
    portalSpots(this.portals.length, this.portrait).forEach((s, i) => {
      const p = this.portals[i];
      if (p && !p.removed) p.group.position.set(s.x, FLY_Y, s.z);
    });
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'commentator') this.sparky.talking = on;
    if (speaker === 'adam') this.adam.talking = on;
  }

  enter() {
    void this.mission();
  }

  // ------------------------------------------------------------------ input
  private onTap(x: number, y: number) {
    if (this.tapAt(x, y)) return;
    if (this.cutscene || !this.flying) return;
    const p = this.skyAt(x, y);
    if (!p) return;
    const c = clampToBounds(p);
    this.moveTarget = new THREE.Vector3(c.x, FLY_Y, c.z);
    this.sparks.burst(this.moveTarget, { count: 12, colors: [0xffffff, 0x4edea3], speed: [0.4, 1.4], gravity: 0, life: [0.3, 0.5] });
  }

  /** Screen point → point on Adam's flight plane. */
  private skyAt(x: number, y: number) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.cam);
    const p = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLY_Y), p) ? { x: p.x, z: p.z } : null;
  }

  // ------------------------------------------------------------------ per frame
  private step(dt: number, t: number) {
    const prev = { x: this.pos.x, z: this.pos.z };
    if (this.flying && !this.cutscene) {
      let dir = new THREE.Vector3();
      const m = this.controls.move;
      if (Math.hypot(m.x, m.y) > 0.08) {
        this.moveTarget = null;
        dir.set(m.x, 0, m.y); // camera looks −Z: drag up = fly forward
        if (dir.length() > 1) dir.normalize();
      } else if (this.moveTarget) {
        const to = this.moveTarget.clone().sub(this.pos).setY(0);
        if (to.length() < 0.3) this.moveTarget = null;
        else dir = to.normalize();
      }
      this.vel.lerp(dir.multiplyScalar(SPEED), 1 - Math.exp(-5 * dt));
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const c = clampToBounds(this.pos);
      if (c.x !== this.pos.x) this.vel.x *= -0.3;
      if (c.z !== this.pos.z) this.vel.z *= -0.3;
      this.pos.x = c.x;
      this.pos.z = c.z;
      this.pos.y += (FLY_Y + Math.sin(t * 2.2) * 0.12 - this.pos.y) * Math.min(1, dt * 3);
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let turn = 0;
    if (sp > 0.4 && this.flying) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn = d;
      this.facing += d * Math.min(1, dt * 6);
    }
    this.flyer.position.copy(this.pos);
    this.flyer.rotation.y = this.facing;
    if (this.flying) {
      const k = Math.min(1, sp / SPEED);
      this.flyer.rotation.x += (0.25 + k * 0.95 - this.flyer.rotation.x) * Math.min(1, dt * 5);
      this.flyer.rotation.z += (THREE.MathUtils.clamp(-turn * 0.6, -0.5, 0.5) - this.flyer.rotation.z) * Math.min(1, dt * 4);
      this.adam.speed = 1 + k;
    } else {
      this.flyer.rotation.x *= 1 - Math.min(1, dt * 6);
      this.flyer.rotation.z *= 1 - Math.min(1, dt * 6);
    }
    this.adam.update(dt);

    // learning: fly through a portal
    if (this.interactive && !this.cutscene) {
      for (const p of this.portals) {
        if (!p.canTrigger()) continue;
        const pp = { x: p.group.position.x, z: p.group.position.z };
        if (flewThrough(prev, this.pos, pp)) {
          p.wrong(); // cooldown so one pass = one answer; the runner decides right or wrong
          this.sparks.burst(p.group.position, { count: 30, colors: [p.hue, 0xffffff], speed: [1, 3], gravity: 0, life: [0.3, 0.6] });
          this.runner.choose(p.choice.id);
        }
      }
    }
    this.collectSkyStars(dt, t);

    for (const p of this.portals) p.update(dt, t);
    this.creature?.update(dt);
    this.updateFriends(dt, t);
    this.city.update(dt, t);
    this.sparky.update(dt);
    this.sparks.update(dt);
    this.controls.update(t);
    this.runner.tick(dt);
    // Sparky flies at Adam's shoulder
    const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0).setY(0).normalize();
    const sparkyAt = this.pos.clone().addScaledVector(right, 1.3).add(new THREE.Vector3(0, 0.9, 0.6));
    this.sparky.root.position.lerp(sparkyAt, 1 - Math.exp(-4 * dt));
    if (sp > 1) this.sparks.burst(this.pos.clone().add(new THREE.Vector3(0, -0.2, 0)), { count: 1, colors: [0x67e8f9, 0xffffff], speed: [0, 0.3], gravity: 0, life: [0.3, 0.5], size: [0.05, 0.1] });
    this.updateCamera(dt);
  }

  private setFlying(on: boolean) {
    this.flying = on;
    const a = this.adam.act;
    // superhero flight pose: one fist forward, the other arm back, legs trailing
    Object.assign(a, on ? { armR: 2.9, elbowR: 0.2, armL: -0.4, armLz: 0.3, legL: -0.15, legR: 0.1, kneeL: 0.5, kneeR: 0.2 } : { armR: 0, elbowR: 0, armL: 0, armLz: 0, legL: 0, legR: 0, kneeL: 0, kneeR: 0 });
    this.adam.setPose('idle');
  }

  private chase() {
    // high enough that nearby rooftops never fill the screen
    const back = this.portrait ? 7.6 : 6.4;
    const up = this.portrait ? 4.4 : 3.3;
    return {
      pos: new THREE.Vector3(this.pos.x * 0.85, this.pos.y + up, this.pos.z + back),
      look: new THREE.Vector3(this.pos.x * 0.9, this.pos.y - 0.4, this.pos.z - 5),
    };
  }

  private updateCamera(dt: number) {
    if (!this.follow) return;
    const c = this.chase();
    const k = 1 - Math.exp(-3.5 * dt);
    this.camSmooth.lerp(c.pos, k);
    this.lookSmooth.lerp(c.look, k);
    Object.assign(this.camPos, { x: this.camSmooth.x, y: this.camSmooth.y, z: this.camSmooth.z });
    Object.assign(this.camLook, { x: this.lookSmooth.x, y: this.lookSmooth.y, z: this.lookSmooth.z });
  }

  private snapCamera() {
    const c = this.chase();
    this.camSmooth.copy(c.pos);
    this.lookSmooth.copy(c.look);
  }

  /** Bonus stars floating in the sky: fly through them for sparkles (just for fun). */
  private placeSkyStar(s: SkyStar) {
    for (;;) {
      const x = BOUNDS.minX + 1 + Math.random() * (BOUNDS.maxX - BOUNDS.minX - 2);
      const z = BOUNDS.minZ + 1 + Math.random() * (BOUNDS.maxZ - BOUNDS.minZ - 2);
      if (z > -9 && z < -3) continue; // keep the portal plane clear
      s.mesh.position.set(x, FLY_Y + 0.2, z);
      break;
    }
    s.mesh.visible = true;
    s.mesh.scale.setScalar(1.3);
  }

  private collectSkyStars(dt: number, t: number) {
    for (const s of this.skyStars) {
      if (!s.mesh.visible) {
        s.away -= dt;
        if (s.away <= 0) this.placeSkyStar(s);
        continue;
      }
      s.mesh.rotation.y += dt * 2.2;
      s.mesh.position.y = FLY_Y + 0.2 + Math.sin(t * 2 + s.mesh.position.x) * 0.15;
      if (!this.flying || this.cutscene) continue;
      if (Math.hypot(this.pos.x - s.mesh.position.x, this.pos.z - s.mesh.position.z) < 0.9) {
        s.mesh.visible = false;
        s.away = 4;
        this.sfx('sparkle');
        this.haptic('tiny');
        this.sparks.burst(s.mesh.position, { count: 30, colors: [0xffc23a, 0xffffff], speed: [0.8, 2.4], gravity: 0.5 });
      }
    }
  }

  private updateFriends(dt: number, t: number) {
    const behind = new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    const side = new THREE.Vector3(behind.z, 0, -behind.x);
    this.friends.forEach((f, i) => {
      f.update(dt);
      if (!this.flying) return; // placed by cutscenes
      const want = this.pos
        .clone()
        .addScaledVector(behind, 1.3 + Math.floor(i / 2) * 1.0)
        .addScaledVector(side, (i % 2 ? 1 : -1) * 0.9)
        .add(new THREE.Vector3(0, -0.9 + Math.sin(t * 2.5 + i) * 0.12, 0));
      f.root.position.lerp(want, 1 - Math.exp(-3 * dt));
      f.root.rotation.y = this.facing;
    });
  }

  // ------------------------------------------------------------------ mission flow
  private async mission() {
    // establishing shot over the city, settling behind Adam on his rooftop
    this.flyer.position.copy(this.pos);
    Object.assign(this.camPos, { x: 10, y: 18, z: 24 });
    Object.assign(this.camLook, { x: 0, y: 4, z: -12 });
    this.adam.setPose('wave');
    this.sparky.excited = true;
    const standCam = { x: this.pos.x + 0.6, y: this.pos.y + 1.6, z: this.pos.z + 5.2 };
    void this.moveCamera(standCam, { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z - 3 }, this.reduced ? 300 : 2600, Ease.cubicInOut);
    this.adam.excited();
    await this.say([{ text: 'مدينة الأبطال بحاجة لبطل!', lang: 'ar' }, { text: 'Hero City!', lang: 'en' }], 'sparky');
    this.sparky.excited = false;
    this.adam.happy();
    await this.takeOff();
    const first = !(useGame.getState().save.worlds.missionsCompleted.hero > 0);
    if (first) {
      await this.say([{ text: 'حرّك إصبعك لتطير، وطير من البوابة الصحيحة!', lang: 'ar' }], 'sparky');
      await this.wait(1500);
    }
    while (this.rescued < GOAL) {
      const res = await this.runner.run({ intro: INTROS[this.rescued] ?? INTROS[1], speaker: 'sparky' });
      this.skillsPlayed.push(res.skillId);
      this.starsEarned += res.stars;
      await this.wait(250);
    }
    await this.missionComplete();
  }

  private async takeOff() {
    this.sfx('whoosh');
    this.sfx('power', { delay: 0.1 });
    this.haptic('medium');
    this.sparks.burst(this.pos.clone().setY(HOME_ROOF.top + 0.4), { count: 60, colors: [0x67e8f9, 0x4edea3, 0xffffff], speed: [1, 3], gravity: -0.5 });
    this.adam.setPose('idle');
    this.setFlying(true);
    this.follow = true;
    this.camSmooth.set(this.camPos.x, this.camPos.y, this.camPos.z);
    this.lookSmooth.set(this.camLook.x, this.camLook.y, this.camLook.z);
    await this.tw.to(this.pos, { y: FLY_Y, z: START.z }, { duration: this.reduced ? 300 : 900, ease: Ease.cubicOut });
    this.cutscene = false;
    this.controls.setVisible(true);
  }

  // ------------------------------------------------------------------ presenter
  async present(_ch: LearningChallenge, choices: ChallengeChoice[]) {
    this.cutscene = true;
    this.moveTarget = null;
    this.vel.set(0, 0, 0);
    // back to the start of the sky lane, facing the portals
    const back = this.tw.to(this.pos, { x: START.x, y: FLY_Y, z: START.z }, { duration: this.reduced ? 200 : 600, ease: Ease.cubicInOut });
    this.facing = Math.PI;
    this.spawnCreature();
    const spots = portalSpots(choices.length, this.portrait);
    choices.forEach((c, i) => {
      const pic = c.visual.kind === 'icon' || c.visual.kind === 'shape' ? this.conceptTexture(c) : null;
      const p = new SkyPortal(c, pic);
      p.group.position.set(spots[i].x, FLY_Y, spots[i].z);
      this.s3.add(p.group);
      this.portals.push(p);
      // tapping a portal flies Adam straight through it
      this.onTap3D(p.group, () => {
        if (this.interactive && !this.cutscene) this.moveTarget = new THREE.Vector3(p.group.position.x, FLY_Y, p.group.position.z - 1.6);
      }, { sound: 'press', visual: p.sign });
      void this.tw.to(p.group.scale, { x: 1, y: 1, z: 1 }, { duration: 700, delay: 250 + i * 160, ease: Ease.elasticOut });
    });
    this.sfx('portal', { delay: 0.2 });
    await this.guard(back);
    await this.wait(500);
    this.cutscene = false;
  }

  private spawnCreature() {
    const done = useGame.getState().save.worlds.missionsCompleted.hero ?? 0;
    const kind = CREATURES[(this.rescued + done * GOAL) % CREATURES.length];
    const c = new Creature3D(kind);
    c.root.scale.setScalar(1.4);
    c.root.position.set(FRIEND_AT.x, FRIEND_AT.y + 4, FRIEND_AT.z);
    this.s3.add(c.root);
    this.creature = c;
    void this.tw.to(c.root.position, { y: FRIEND_AT.y }, { duration: 800, ease: Ease.bounceOut });
  }

  private conceptTexture(c: ChallengeChoice): THREE.Texture {
    const art = drawConcept(c.visual, 200);
    art.position.set(110, 110);
    const canvas = this.engine.app.renderer.extract.canvas({ target: art, resolution: 1 }) as HTMLCanvasElement;
    art.destroy({ children: true });
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  async wrongFeedback(choiceId: string) {
    this.sfx('softBump');
    this.haptic('tiny');
    const p = this.portals.find((x) => x.choice.id === choiceId);
    p?.wrong();
    // gentle bounce back to the start of the lane, then try again
    this.cutscene = true;
    this.moveTarget = null;
    this.vel.set(0, 0, 0);
    this.adam.determined();
    this.shake3D(0.05, 200);
    await this.tw.to(this.pos, { x: START.x * 0.5 + this.pos.x * 0.5, z: START.z }, { duration: this.reduced ? 200 : 700, ease: Ease.cubicOut });
    this.facing = Math.PI;
    this.adam.happy();
    this.cutscene = false;
  }

  pulseAnswer(ch: LearningChallenge) {
    const p = this.portals.find((x) => x.choice.id === ch.answer.id);
    if (!p) return;
    p.highlight();
    this.sparks.burst(p.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)), { count: 24, colors: [0xffc23a, 0xffffff], speed: [0.4, 1.4], gravity: 0.3 });
  }

  /** Right portal → it opens → Adam zooms through → the bubble bursts → the friend joins him. */
  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    this.interactive = false;
    this.cutscene = true;
    this.moveTarget = null;
    this.vel.set(0, 0, 0);
    this.controls.setVisible(false);
    const p = this.portals.find((x) => x.choice.id === choiceId);
    this.engine.audio.setMusicIntensity(0.6);
    for (const o of this.portals) {
      if (o === p) continue;
      o.removed = true;
      void this.tw.to(o.group.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 350, ease: Ease.backIn });
    }
    if (p) {
      p.highlight();
      this.sfx('portal');
      this.sfx('magic', { delay: 0.1 });
      this.haptic('medium');
      this.stage.setBloom(2);
      void this.tw.progress({ duration: 900, onUpdate: (k) => this.stage.setBloom(2 - k) });
      this.sparks.burst(p.group.position, { count: 90, colors: [p.hue, 0xffffff, 0xffc23a], speed: [1.5, 4], gravity: 0, life: [0.6, 1.1] });
      await this.tw.progress({ duration: 400, onUpdate: (k) => p.setOpen(k) });
    }
    // zoom through the portal to the trapped friend
    const cr = this.creature;
    this.adam.determined();
    this.sfx('whoosh');
    const via = p ? p.group.position : new THREE.Vector3(0, FLY_Y, -6);
    this.facing = Math.atan2(via.x - this.pos.x, via.z - this.pos.z);
    this.vel.set(Math.sin(this.facing) * SPEED, 0, Math.cos(this.facing) * SPEED);
    await this.tw.to(this.pos, { x: via.x, z: via.z - 0.8 }, { duration: 500, ease: Ease.quadIn });
    if (cr) {
      this.facing = Math.atan2(FRIEND_AT.x - this.pos.x, FRIEND_AT.z - this.pos.z);
      await this.tw.to(this.pos, { x: FRIEND_AT.x, y: FLY_Y, z: FRIEND_AT.z + 1.6 }, { duration: 600, ease: Ease.cubicOut });
      this.vel.set(0, 0, 0);
      // POW — the bubble pops
      this.sfx('pop');
      this.sfx('zap', { delay: 0.05 });
      this.haptic('celebrate');
      this.shake3D(0.12, 300);
      this.sparks.burst(cr.center, { count: 120, colors: [0x67e8f9, 0xffffff, 0xff6fb5, 0xffc23a], speed: [1.5, 4.5], gravity: 1, life: [0.6, 1.2] });
      cr.free();
      cr.setHappy(true);
      void this.bigText('SUPER!', { fill: color.mint, y: this.height * 0.26 });
      this.adam.excited();
      await this.say([{ text: 'شكراً يا آدم!', lang: 'ar' }], 'sparky');
      this.friends.push(cr);
      this.creature = null;
      void this.tw.to(cr.root.scale, { x: 1, y: 1, z: 1 }, { duration: 500 });
    }
    // fly home along the lane with the new friend in tow
    this.facing = 0;
    await this.tw.to(this.pos, { x: START.x, z: START.z }, { duration: this.reduced ? 300 : 1100, ease: Ease.cubicInOut });
    this.facing = Math.PI;
    this.rescued++;
    useGame.getState().patchHud({ rescued: this.rescued, energy: Math.min(1, 0.15 + (this.rescued / GOAL) * 0.85) });
    await this.flyStarsFrom3D(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), stars);
    this.adam.happy();
    this.engine.audio.setMusicIntensity(0);
    this.cutscene = false;
    this.controls.setVisible(true);
  }

  clear() {
    for (const p of this.portals) {
      p.removed = true;
      this.offTap3D(p.group);
      const g = p.group;
      void this.tw.to(g.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 260, ease: Ease.backIn }).then(() => {
        this.s3.remove(g);
        disposeObject(g);
      });
    }
    this.portals = [];
  }

  // ------------------------------------------------------------------ finale
  private async missionComplete() {
    const store = useGame.getState();
    this.cutscene = true;
    this.interactive = false;
    this.controls.setVisible(false);
    this.moveTarget = null;
    this.vel.set(0, 0, 0);
    // everyone lands on Adam's hero rooftop
    this.facing = 0;
    const roofY = HOME_ROOF.top + 0.27;
    await this.tw.to(this.pos, { x: HOME_ROOF.x, y: roofY + PIVOT + 0.6, z: HOME_ROOF.z }, { duration: this.reduced ? 300 : 1100, ease: Ease.cubicInOut });
    this.follow = false;
    this.setFlying(false);
    await this.tw.to(this.pos, { y: roofY + PIVOT }, { duration: 300, ease: Ease.quadIn });
    this.sfx('thud');
    this.shake3D(0.06, 200);
    this.friends.forEach((f, i) => {
      const a = Math.PI * 0.75 + (i / Math.max(1, this.friends.length - 1)) * Math.PI * 0.5;
      void this.tw.to(f.root.position, { x: HOME_ROOF.x + Math.cos(a) * 1.4, y: roofY + 0.05, z: HOME_ROOF.z - Math.sin(a) * 1.1 + 0.8 }, { duration: 700, delay: i * 120, ease: Ease.cubicOut });
      f.root.rotation.y = 0;
      f.setHappy(true);
    });
    this.sfx('fanfare');
    this.adam.excited();
    this.adam.setPose('cheer');
    const spot = new THREE.Vector3(HOME_ROOF.x, roofY, HOME_ROOF.z);
    await this.moveCamera({ x: spot.x + 0.6, y: spot.y + 1.9, z: spot.z + 4.6 }, { x: spot.x, y: spot.y + 1.1, z: spot.z }, 900, Ease.cubicInOut);
    // the hero badge rises above Adam
    const badge = makeHeroBadge();
    badge.position.set(spot.x, spot.y + 1.2, spot.z - 0.2);
    badge.scale.setScalar(0.01);
    this.s3.add(badge);
    this.updaters.push((dt) => (badge.rotation.y += dt * 1.6));
    void this.tw.to(badge.position, { y: spot.y + 2.5 }, { duration: 900, ease: Ease.backOut });
    await this.tw.to(badge.scale, { x: 1, y: 1, z: 1 }, { duration: 700, ease: Ease.elasticOut });
    this.sparks.burst(badge.position, { count: 180, speed: [1.5, 4.5], gravity: 2, life: [0.9, 1.7] });
    this.haptic('celebrate');
    await this.say([{ text: 'أنقذت كل أصحابك! أنت بطل حقيقي!', lang: 'ar' }, { text: 'Super hero!', lang: 'en' }], 'sparky');
    this.sfx('whoosh');
    const from = this.screenOf(badge.position);
    await this.tw.to(badge.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 500, ease: Ease.backIn });
    this.s3.remove(badge);
    store.addInventory('heroPowers', 1);
    pulseHud('stars');
    this.sfx('unlock');
    store.completeMission('hero', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
    await this.flyStarsToHud(from.x, from.y, MISSION_BONUS);
    this.adam.setPose('idle');
    this.adam.happy();
    await revealUnlocks(this);
    if (this.engine.shouldWrapUp()) {
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
      void this.engine.endSession();
      return;
    }
    await this.offerNext(spot);
  }

  private async offerNext(spot: THREE.Vector3) {
    const again = makeChoiceButton('again');
    const home = makeChoiceButton('home');
    again.position.set(spot.x - 0.85, spot.y + 1.3, spot.z + 0.8);
    home.position.set(spot.x + 0.85, spot.y + 1.3, spot.z + 0.8);
    for (const b of [again, home]) {
      b.scale.setScalar(0.01);
      this.s3.add(b);
      void this.tw.to(b.scale, { x: 0.7, y: 0.7, z: 0.7 }, { duration: 600, ease: Ease.elasticOut });
    }
    this.updaters.push((_dt, t) => {
      again.rotation.y = Math.sin(t * 1.5) * 0.2;
      home.rotation.y = Math.sin(t * 1.5 + 1) * 0.2;
    });
    void this.moveCamera({ x: spot.x, y: spot.y + 1.6, z: spot.z + 4.2 }, { x: spot.x, y: spot.y + 1.2, z: spot.z }, 700);
    void this.say([{ text: 'بدك تنقذ أصحاب كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    // taps reach the 3D buttons through the controls' tap forwarding (flight stays off)
    this.controls.setVisible(true);
    await this.guard(
      new Promise<void>((resolve) => {
        const go = (id: string) => {
          resolve();
          this.engine.speech.cancel();
          void (id === 'again' ? this.goto('hero') : this.goto('world', { from: 'hero' }));
        };
        this.onTap3D(again, () => go('again'), { sound: 'pop' });
        this.onTap3D(home, () => go('home'), { sound: 'pop' });
        this.setA11yChoices([{ id: 'again', label: 'Play again' }, { id: 'home', label: 'Back to world' }], go);
      }),
    );
  }

  exit() {
    this.engine.audio.setMusicIntensity(0);
  }

  destroy() {
    this.adam?.dispose();
    super.destroy();
  }
}

/** Golden hero shield with a blue star (the mission reward). */
function makeHeroBadge(): THREE.Group {
  const g = new THREE.Group();
  const shield = new THREE.Shape();
  shield.moveTo(0, 0.7);
  shield.lineTo(0.6, 0.46);
  shield.lineTo(0.54, -0.2);
  shield.quadraticCurveTo(0.3, -0.55, 0, -0.66);
  shield.quadraticCurveTo(-0.3, -0.55, -0.54, -0.2);
  shield.lineTo(-0.6, 0.46);
  shield.closePath();
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc23a, metalness: 0.7, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.5, clearcoat: 1 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }), gold);
  body.geometry.center();
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.13 : 0.3;
    if (i === 0) star.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  const starM = new THREE.Mesh(
    new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x2f74ff, emissive: 0x1e6bff, emissiveIntensity: 1.6 }),
  );
  starM.position.z = 0.12;
  const back = starM.clone();
  back.position.z = -0.18;
  g.add(body, starM, back);
  return g;
}
