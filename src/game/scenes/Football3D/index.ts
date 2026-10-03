import * as THREE from 'three';
import { color } from '@/design-system/tokens';
import { numberWord } from '@/learning/engine/ChallengeGenerator';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene3D } from '../../three/Scene3D';
import { Hero3D } from '../../three/Hero3D';
import { adamLook } from '../../three/adamLook';
import { Controls } from '../../three/Controls';
import { PhysicsWorld, loadPhysics, type Rapier } from '../../three/physics';
import { disposeObject, type StageLook } from '../../three/ThreeStage';
import { Ease } from '../../engine/Tween';
import { drawConcept } from '../../draw/conceptArt';
import { pulseHud } from '../../engine/hudBridge';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { skillOptionsFor } from '../FootballScene/modes/chooser';
import { GOAL, Stadium3D } from './Stadium3D';
import { BALL_R, Particles3D, Sparky3D, makeChoiceButton, makeTrophy, numberSprite } from './props';
import { Ball3D } from './Ball3D';
import { Keeper3D } from './Keeper3D';
import { ChoiceRing, makeCollectStar } from './Rings3D';

type Mode3D = 'count' | 'color' | 'target' | 'passing';

const MINUTES = [60, 75, 90];
const INTROS: VoiceLine[][] = [
  [{ text: 'يلا يا آدم! المنافسين معهم هدفين. بدنا نرجع!', lang: 'ar' }],
  [{ text: 'هدف كمان ونتعادل!', lang: 'ar' }],
  [{ text: 'آدم! بدنا هدف أخير!', lang: 'ar' }],
];
const PLAY = { minX: -12, maxX: 12, minZ: GOAL.z - 0.4, maxZ: 7 };
const SPEED = 4.6;
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

interface Star {
  mesh: THREE.Mesh;
  taken: boolean;
  label?: THREE.Sprite;
}

/**
 * GOAL STADIUM — a real playable 3D football game.
 * Drag to run, tap the big ball button to kick, real physics, a goalkeeper AI.
 * Learning drives the action: run into the right glowing ring → SUPER-SHOT → goal.
 */
export default class Football3D extends Scene3D implements ChallengePresenter {
  readonly id = 'football' as const;
  readonly music = 'football' as const;
  runner!: ChallengeRunner;

  private R!: Rapier;
  private phys!: PhysicsWorld;
  private stadium!: Stadium3D;
  private adam!: Hero3D;
  private adamBody!: ReturnType<PhysicsWorld['kinematicCapsule']>['body'];
  private adamCollider!: ReturnType<PhysicsWorld['kinematicCapsule']>['collider'];
  private keeper!: Keeper3D;
  private ball!: Ball3D;
  private sparky = new Sparky3D();
  private sparks = new Particles3D();
  private controls!: Controls;

  private pos = new THREE.Vector3(0, 0, 2);
  private vel = new THREE.Vector3();
  private facing = Math.PI; // towards the goal (−Z)
  private moveTarget: THREE.Vector3 | null = null;
  private pendingKick = false;
  private kicking = false;
  private cutscene = true;
  private camSmooth = new THREE.Vector3(0, 4, 8);
  private lookSmooth = new THREE.Vector3(0, 1, -4);
  private follow: 'adam' | 'ball' | 'free' = 'free';
  private portrait = true;

  private mode: Mode3D = 'count';
  private rings: ChoiceRing[] = [];
  private stars: Star[] = [];
  private counted = 0;
  private interactive = false;
  private superArmed = false;
  private goalResolve: (() => void) | null = null;
  private lastGoalCheck = false;
  private get awaitingGoal() {
    return this.goalResolve !== null;
  }
  private score = { adam: 0, rivals: 2 };
  private skillsPlayed: string[] = [];
  private starsEarned = 0;
  private freeGoals = 0;
  private outTimer = 0;
  private superIdle = 0;
  private tutorialDone = false;

  protected stageLook(): StageLook {
    return { bloomIntensity: 0.9, bloomThreshold: 0.82, vignette: 0.5, saturation: 0.15, contrast: 0.1 };
  }

  protected async load3D() {
    this.R = await loadPhysics();
  }

  protected build3D() {
    this.phys = new PhysicsWorld(this.R);
    this.stadium = new Stadium3D(this.stage.quality);
    this.s3.add(this.stadium.group);
    this.s3.fog = new THREE.Fog(0x070f24, 60, 160);
    this.useStudioEnvironment(0.45);
    this.buildColliders();

    this.adam = new Hero3D(adamLook(useGame.getState().save.avatar));
    this.adam.root.scale.setScalar(0.92);
    const cap = this.phys.kinematicCapsule(0.3, 0.3, this.pos.x, 0.65, this.pos.z);
    this.adamBody = cap.body;
    this.adamCollider = cap.collider;

    this.keeper = new Keeper3D(this.phys);
    this.keeper.onSave = () => {
      this.sfx('thud');
      this.engine.audio.cheer(0.5);
      void this.say([pick([{ text: 'يا سلام! الحارس مسكها!', lang: 'ar' }, { text: 'Great save!', lang: 'en' }] as VoiceLine[])], 'commentator');
    };
    this.keeper.onThrow = () => this.sfx('whoosh', { volume: 0.5 });
    this.ball = new Ball3D(this.phys, 0, 0.6);

    this.s3.add(this.adam.root, this.keeper.hero.root, this.ball.mesh, this.sparky.root, this.sparks.points);

    this.controls = new Controls(this.tex('glow'), this.tex('football'), {
      onTap: (x, y) => this.onTap(x, y),
      onKick: () => this.requestKick(),
    }, () => this.haptic('tiny'));
    this.controls.setVisible(false);
    this.overlay.addChildAt(this.controls.view, 0);

    this.updaters.push((dt, t) => this.step(dt, t));
    this.runner = new ChallengeRunner(this, 'football', this);
    useGame.getState().setLastVisited('football');
  }

  private buildColliders() {
    const p = this.phys;
    p.fixedBox(0, -0.5, 0, 40, 0.5, 40, { restitution: 0.55, friction: 0.9 }); // ground
    p.fixedCylinder(-GOAL.halfW, GOAL.h / 2, GOAL.z, GOAL.h / 2, 0.07);
    p.fixedCylinder(GOAL.halfW, GOAL.h / 2, GOAL.z, GOAL.h / 2, 0.07);
    p.fixedCylinder(0, GOAL.h, GOAL.z, GOAL.halfW, 0.07, 'x');
    // net: soft (low restitution) back + sides + roof
    p.fixedBox(0, GOAL.h / 2, GOAL.z - GOAL.depth, GOAL.halfW, GOAL.h / 2, 0.05, { restitution: 0.05, friction: 1 });
    p.fixedBox(-GOAL.halfW - 0.05, GOAL.h / 2, GOAL.z - GOAL.depth / 2, 0.05, GOAL.h / 2, GOAL.depth / 2, { restitution: 0.05 });
    p.fixedBox(GOAL.halfW + 0.05, GOAL.h / 2, GOAL.z - GOAL.depth / 2, 0.05, GOAL.h / 2, GOAL.depth / 2, { restitution: 0.05 });
    p.fixedBox(0, GOAL.h + 0.05, GOAL.z - GOAL.depth / 2, GOAL.halfW, 0.05, GOAL.depth / 2, { restitution: 0.05 });
    // invisible boundary boards keep the ball in play
    p.fixedBox(0, 1, PLAY.minZ - 2.2, 20, 1, 0.2, { restitution: 0.5 });
    p.fixedBox(0, 1, PLAY.maxZ + 1, 20, 1, 0.2, { restitution: 0.5 });
    p.fixedBox(PLAY.minX - 1, 1, 0, 0.2, 1, 20, { restitution: 0.5 });
    p.fixedBox(PLAY.maxX + 1, 1, 0, 0.2, 1, 20, { restitution: 0.5 });
  }

  layout(w: number, h: number) {
    this.portrait = h >= w;
    this.camFov = this.portrait ? 64 : 46;
    this.controls.layout(w, h, this.safe.bottom, this.safe.right);
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'commentator') this.sparky.talking = on;
    if (speaker === 'adam') this.adam.talking = on;
  }

  enter() {
    void this.match();
  }

  // ------------------------------------------------------------------ input
  private onTap(x: number, y: number) {
    if (this.cutscene) return;
    if (this.tapAt(x, y)) return;
    const g = this.groundAt(x, y);
    if (g) {
      this.moveTarget = g.setY(0);
      this.sparks.burst(g.clone().setY(0.1), { count: 10, colors: [0xffffff, 0x4edea3], speed: [0.4, 1.2], gravity: 1, life: [0.3, 0.5] });
    }
  }

  private requestKick() {
    if (this.cutscene || this.kicking || this.keeper.holding) return;
    if (this.superArmed) {
      // super-shot: the glowing ball magically comes to Adam's feet, lined up with the goal
      const toGoal = new THREE.Vector3(0, 0, GOAL.z).sub(this.pos).setY(0).normalize();
      const at = this.pos.clone().addScaledVector(toGoal, 0.6);
      this.ball.teleport(at.x, BALL_R + 0.02, at.z);
      this.facing = Math.atan2(toGoal.x, toGoal.z);
      this.sfx('sparkle');
      this.sparks.burst(at.clone().setY(0.3), { count: 40, colors: [0xffc23a, 0x4edea3, 0xffffff], speed: [0.5, 2], gravity: 0.5 });
      void this.kick();
      return;
    }
    const d = this.distXZ(this.pos, this.ball.pos);
    if (d < 1.15 && this.behindBall()) void this.kick();
    else {
      // run round behind the ball (goal side ahead), then kick
      this.pendingKick = true;
      this.moveTarget = this.kickSpot();
    }
  }

  /** Where Adam should stand to shoot: just behind the ball, on the line from the goal. */
  private kickSpot() {
    const b = this.ball.pos.setY(0);
    const away = b.clone().sub(new THREE.Vector3(0, 0, GOAL.z)).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    return b.addScaledVector(away.normalize(), 0.62);
  }

  /** Is Adam on the far side of the ball from the goal (so a kick goes goal-wards)? */
  private behindBall() {
    const b = this.ball.pos;
    const toGoal = new THREE.Vector3(0, 0, GOAL.z).sub(b).setY(0).normalize();
    const toAdam = this.pos.clone().sub(b).setY(0).normalize();
    return toGoal.dot(toAdam) < -0.2;
  }

  private distXZ(a: THREE.Vector3, b: THREE.Vector3) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  // ------------------------------------------------------------------ per frame
  private step(dt: number, t: number) {
    // input → desired velocity (camera-relative joystick, or tap target)
    let dir = new THREE.Vector3();
    if (!this.cutscene && !this.kicking) {
      const m = this.controls.move;
      if (Math.hypot(m.x, m.y) > 0.08) {
        this.moveTarget = null;
        this.pendingKick = false;
        const fwd = new THREE.Vector3();
        this.cam.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
        dir.addScaledVector(right, m.x).addScaledVector(fwd, -m.y);
        if (dir.length() > 1) dir.normalize();
      } else if (this.moveTarget) {
        if (this.pendingKick) {
          if (this.keeper.holding) this.pendingKick = false;
          else this.moveTarget = this.kickSpot(); // follow a rolling ball
        }
        const to = this.moveTarget.clone().sub(this.pos).setY(0);
        const d = to.length();
        const stopAt = this.pendingKick ? 0.3 : 0.25;
        if (d < stopAt) {
          this.moveTarget = null;
          if (this.pendingKick) {
            this.pendingKick = false;
            void this.kick();
          }
        } else dir = to.normalize();
      }
    }
    const desired = dir.multiplyScalar(SPEED);
    this.vel.lerp(desired, 1 - Math.exp(-12 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, PLAY.minX, PLAY.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, GOAL.z + 1.2, PLAY.maxZ);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.25 && !this.kicking) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 14);
    }
    if (!this.kicking && !this.cutscene) this.adam.setPose(sp > 2.4 ? 'run' : sp > 0.4 ? 'walk' : 'idle');
    this.adam.root.position.copy(this.pos);
    this.adam.root.rotation.y = this.facing;
    this.adam.update(dt);

    // dribble: a moving Adam keeps the ball at his feet
    const bp = this.ball.pos;
    const near = this.distXZ(this.pos, bp);
    const face = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (!this.kicking && sp > 0.6 && near < 0.85 && bp.y < 0.5 && this.ball.speed < 7) {
      const target = this.pos.clone().addScaledVector(face, 0.55).addScaledVector(this.vel, 0.08);
      const v = target.sub(bp).multiplyScalar(7).add(this.vel.clone().multiplyScalar(0.95));
      v.y = this.ball.vel.y;
      this.ball.setVel(v);
    }
    this.controls.ready = near < 1.15;
    this.controls.super = this.superArmed;
    this.controls.update(t);

    // physics
    this.adamBody.setNextKinematicTranslation({ x: this.pos.x, y: 0.65, z: this.pos.z });
    this.keeper.update(dt, t, this.ball, this.pos);
    this.phys.step(dt);
    this.ball.sync(t);
    if (this.ball.isSuper && this.ball.speed > 3) {
      this.sparks.burst(this.ball.pos, { count: 4, colors: [0xffc23a, 0xff8a1f, 0xffffff], speed: [0.2, 0.8], gravity: -0.5, life: [0.3, 0.55], size: [0.1, 0.2] });
    } else if (this.ball.speed > 9) {
      this.sparks.burst(this.ball.pos, { count: 1, colors: [0xffffff], speed: [0, 0.2], gravity: 0, life: [0.2, 0.3], size: [0.05, 0.1] });
    }
    // slow-motion as a super-shot reaches the goal
    if (this.ball.isSuper && this.ball.speed > 3 && bp.z < GOAL.z + 3 && !this.reduced) this.phys.timeScale = 0.35;
    else this.phys.timeScale += (1 - this.phys.timeScale) * Math.min(1, dt * 4);

    this.checkGoal();
    this.checkOut(dt);
    // a super-shot that didn't go in (post, wide) is re-armed — it must always end in a goal
    if (this.ball.isSuper && !this.superArmed && !this.cutscene && this.ball.speed < 0.6) {
      this.superIdle += dt;
      if (this.superIdle > 1.0) {
        this.superIdle = 0;
        this.superArmed = true;
        this.follow = 'adam';
        void this.say([{ text: 'كمان مرة! سدّد!', lang: 'ar' }], 'commentator');
      }
    } else this.superIdle = 0;
    this.checkRings();
    this.checkStars();

    for (const r of this.rings) r.update(dt, t, this.cam.position);
    for (const s of this.stars) if (!s.taken) {
      s.mesh.rotation.y += dt * 2.4;
      s.mesh.position.y = 0.6 + Math.sin(t * 3 + s.mesh.position.x) * 0.08;
    }
    this.stadium.update(dt, t);
    this.sparky.update(dt);
    this.sparks.update(dt);
    // Sparky floats beside Adam, to the camera's right and a little behind him (never in front of the lens)
    const camFwd = new THREE.Vector3();
    this.cam.getWorldDirection(camFwd);
    camFwd.y = 0;
    camFwd.normalize();
    const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0));
    const sparkyAt = this.pos.clone().addScaledVector(camRight, 1.15).addScaledVector(camFwd, 0.5).add(new THREE.Vector3(0, 1.75, 0));
    this.sparky.root.position.lerp(sparkyAt, 1 - Math.exp(-4 * dt));
    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    if (this.follow === 'free') return;
    const goalC = new THREE.Vector3(0, 0, GOAL.z);
    const subject = this.follow === 'ball' ? this.ball.pos : this.pos;
    const toGoal = goalC.clone().sub(subject).setY(0);
    if (toGoal.lengthSq() < 0.01) toGoal.set(0, 0, -1);
    toGoal.normalize();
    const back = this.portrait ? 6.8 : 5.6;
    const up = this.portrait ? 4.6 : 3.4;
    const want = subject.clone().addScaledVector(toGoal, -back).add(new THREE.Vector3(0, up, 0));
    const look = subject.clone().addScaledVector(toGoal, this.portrait ? 4.5 : 3.5).add(new THREE.Vector3(0, 0.6, 0));
    const k = 1 - Math.exp(-(this.follow === 'ball' ? 6 : 4) * dt);
    this.camSmooth.lerp(want, k);
    this.lookSmooth.lerp(look, k);
    this.camPos.x = this.camSmooth.x;
    this.camPos.y = this.camSmooth.y;
    this.camPos.z = this.camSmooth.z;
    this.camLook.x = this.lookSmooth.x;
    this.camLook.y = this.lookSmooth.y;
    this.camLook.z = this.lookSmooth.z;
  }

  // ------------------------------------------------------------------ kicking
  private async kick() {
    if (this.kicking) return;
    this.kicking = true;
    this.moveTarget = null;
    const a = this.adam.act;
    // auto-aim assist for little players
    const bp = this.ball.pos;
    const aim = new THREE.Vector3(0, 0, GOAL.z);
    // aim for the side away from the keeper (generous aim assist for a 4-year-old)
    const kx = this.keeper.hero.root.position.x;
    const side = Math.abs(kx) > 0.2 ? -Math.sign(kx) : Math.random() < 0.5 ? -1 : 1;
    aim.x = side * GOAL.halfW * (this.superArmed ? 0.6 : 0.45 + Math.random() * 0.3);
    this.adamCollider.setSensor(true);
    setTimeout(() => this.alive && this.adamCollider.setSensor(false), 650);
    this.facing = Math.atan2(aim.x - this.pos.x, aim.z - this.pos.z);
    this.adam.determined();
    await this.tw.to(a, { legR: -0.9, kneeR: 1.1, lean: -0.1, armL: 0.6, armR: -0.4 }, { duration: 170, ease: Ease.quadOut });
    await this.tw.to(a, { legR: 1.5, kneeR: 0, lean: 0.25, armL: -0.5, armR: 0.6 }, { duration: 90, ease: Ease.quadIn });
    // contact
    const ballNow = this.ball.pos;
    if (this.distXZ(this.pos, ballNow) < 1.4) {
      const supr = this.superArmed;
      const target = new THREE.Vector3(aim.x, supr ? 1.2 : 0.4 + Math.random() * 1.2, GOAL.z - 0.6);
      const d = target.clone().sub(ballNow);
      const flat = Math.max(0.5, Math.hypot(d.x, d.z));
      const speed = supr ? 19 : 14;
      const tFlight = flat / speed;
      const vy = (d.y + 0.5 * 9.81 * tFlight * tFlight) / tFlight;
      this.ball.setVel(new THREE.Vector3((d.x / flat) * speed, Math.min(vy, 7), (d.z / flat) * speed));
      this.ball.body.setAngvel({ x: -20, y: (Math.random() - 0.5) * 10, z: 0 }, true);
      this.sfx('kick');
      this.haptic('medium');
      this.shake3D(supr ? 0.15 : 0.06, 200);
      this.sparks.burst(ballNow, { count: supr ? 60 : 18, colors: supr ? [0xffc23a, 0xffffff, 0x4edea3] : [0xffffff], speed: [1, 3.5], gravity: 2 });
      if (supr) {
        this.ball.setSuper(true);
        this.superArmed = false;
        this.follow = 'ball';
        this.sfx('nitro', { volume: 0.6 });
      }
    } else {
      this.sfx('whoosh', { volume: 0.4 });
    }
    await this.tw.to(a, { legR: 0, kneeR: 0, lean: 0, armL: 0, armR: 0 }, { duration: 260, ease: Ease.backOut });
    this.adam.happy();
    this.kicking = false;
  }

  // ------------------------------------------------------------------ goals & out of play
  private checkGoal() {
    const p = this.ball.pos;
    const inGoal = p.z < GOAL.z - BALL_R && Math.abs(p.x) < GOAL.halfW - 0.05 && p.y < GOAL.h;
    if (inGoal && !this.lastGoalCheck && !this.cutscene) void this.onGoal();
    this.lastGoalCheck = inGoal;
  }

  private checkOut(dt: number) {
    const p = this.ball.pos;
    const out = p.y < -1 || (p.z < GOAL.z - 0.2 && !(Math.abs(p.x) < GOAL.halfW && p.y < GOAL.h)) || Math.abs(p.x) > PLAY.maxX + 0.6 || p.z > PLAY.maxZ + 0.6;
    this.outTimer = out ? this.outTimer + dt : 0;
    if (this.outTimer > 1.2 && !this.cutscene) {
      this.outTimer = 0;
      const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      const np = this.pos.clone().addScaledVector(f, 1.2);
      this.ball.teleport(np.x, 0.6, np.z);
      if (this.ball.isSuper) this.superArmed = true; // a missed super-shot gets another go
      this.ball.setSuper(this.superArmed);
      this.sfx('pop');
      this.sparks.burst(np.clone().setY(0.4), { count: 24, colors: [0xffffff, 0x4edea3], speed: [0.5, 2] });
      if (this.follow === 'ball') this.follow = 'adam';
    }
  }

  private async onGoal() {
    const wasSuper = this.ball.isSuper;
    this.cutscene = true;
    this.controls.setVisible(false);
    const p = this.ball.pos;
    this.stadium.hitNet(p.x, p.y);
    this.sfx('net');
    this.sfx('goalHorn', { delay: 0.1 });
    this.haptic('celebrate');
    this.shake3D(0.22, 550);
    this.engine.audio.cheer(1);
    this.stadium.goal();
    this.stage.setBloom(2.2);
    void this.tw.progress({ duration: 1400, onUpdate: (k) => this.stage.setBloom(2.2 - 1.3 * k) });
    this.sparks.burst(p, { count: 140, speed: [2, 6], gravity: 3, life: [0.8, 1.6], size: [0.06, 0.16] });
    for (const [fx, fy, fz] of [[-7, 9, GOAL.z - 12], [7, 10, GOAL.z - 12], [0, 12, GOAL.z - 16]]) {
      setTimeout(() => {
        if (!this.alive) return;
        this.sfx('pop', { pitch: 5, volume: 0.5 });
        this.sparks.burst(new THREE.Vector3(fx, fy, fz), { count: 170, speed: [3, 7], gravity: 2, drag: 0.8, life: [0.9, 1.7], size: [0.18, 0.36] });
      }, 250 + Math.random() * 900);
    }
    this.score.adam += 1;
    useGame.getState().patchHud({ adam: this.score.adam });
    this.stadium.setLedMessage('⚽ GOOOOAL!  ★  هدددف!  ★  ADAM ⚽  ★  GOAL!  ★');
    void this.bigText('GOOOOAL!', { y: this.height * 0.28 });
    void this.engine.speech.say([{ text: 'Goal!', lang: 'en' }, { text: 'هدددف!', lang: 'ar' }], 'commentator');
    // camera swings round in front of Adam who celebrates
    this.follow = 'free';
    this.ball.setSuper(false);
    await this.wait(700);
    const spot = this.pos.clone();
    const toGoal = new THREE.Vector3(0, 0, GOAL.z).sub(spot).setY(0).normalize();
    this.facing = Math.atan2(toGoal.x, toGoal.z) + Math.PI; // turn to face the camera
    await this.moveCamera(
      { x: spot.x - toGoal.x * 3.2 + 0.8, y: 1.7, z: spot.z - toGoal.z * 3.2 },
      { x: spot.x, y: 0.85, z: spot.z },
      900,
      Ease.cubicInOut,
    );
    this.adam.excited();
    this.adam.setPose('cheer');
    if (!wasSuper) {
      this.freeGoals++;
      await this.flyStarsFrom3D(spot.clone().add(new THREE.Vector3(0, 1.6, 0)), 1);
    }
    await this.wait(wasSuper ? 300 : 1100);
    if (wasSuper && this.goalResolve) {
      const r = this.goalResolve;
      this.goalResolve = null;
      r();
      return; // succeed() continues the sequence
    }
    await this.resumePlay();
  }

  private async resumePlay() {
    this.stadium.setLedMessage('⚽ ADAM  ★  GOAL STADIUM  ★  آدم بطل الملعب  ★');
    this.adam.happy();
    this.adam.setPose('idle');
    this.keeper.reset();
    // kick-off from the middle of the penalty area
    this.pos.set(0, 0, 2.2);
    this.vel.set(0, 0, 0);
    this.facing = Math.PI;
    this.ball.teleport(0, 0.4, 0.9);
    this.ball.setSuper(this.superArmed);
    this.follow = 'adam';
    this.cutscene = false;
    this.controls.setVisible(true);
  }

  // ------------------------------------------------------------------ match flow
  private async match() {
    const store = useGame.getState();
    store.setHud({ kind: 'football', adam: 0, rivals: this.score.rivals, minute: MINUTES[0] });
    this.engine.audio.startCrowd(0.3);
    // establishing shot: sweep from high above the goal down behind Adam
    Object.assign(this.camPos, { x: 8, y: 10, z: -2 });
    Object.assign(this.camLook, { x: 0, y: 0, z: -10 });
    this.adam.setPose('wave');
    await this.wait(200);
    this.sfx('whistle');
    this.sparky.excited = true;
    const back = this.portrait ? 6.8 : 5.6;
    void this.moveCamera({ x: 0, y: this.portrait ? 4.6 : 3.4, z: this.pos.z + back }, { x: 0, y: 0.6, z: this.pos.z - 4 }, this.reduced ? 300 : 2400);
    await this.say([{ text: 'أهلا فيك بالملعب يا آدم!', lang: 'ar' }, { text: 'Goal Stadium!', lang: 'en' }], 'commentator');
    this.sparky.excited = false;
    this.camSmooth.set(this.camPos.x, this.camPos.y, this.camPos.z);
    this.lookSmooth.set(this.camLook.x, this.camLook.y, this.camLook.z);
    await this.resumePlay();
    // quick tutorial: drag to run, ball button to kick, then a short free warm-up
    if (!this.tutorialDone) {
      this.tutorialDone = true;
      await this.say([{ text: 'حرّك إصبعك عالشاشة لتركض، واضغط زر الطابة لتشوط!', lang: 'ar' }], 'sparky');
      const t0 = this.time;
      while (this.time - t0 < 14 && this.freeGoals === 0) await this.wait(250);
      while (this.cutscene) await this.wait(200);
    }
    for (let i = 0; i < 3; i++) {
      const plan: Mode3D[] = ['count', pick(['color', 'passing'] as const), pick(['target', 'count'] as const)];
      this.mode = plan[i];
      store.patchHud({ minute: MINUTES[i] });
      const res = await this.runner.run({ intro: INTROS[i], speaker: 'commentator', ...skillOptionsFor(this.mode) });
      this.skillsPlayed.push(res.skillId);
      this.starsEarned += res.stars;
      await this.wait(400);
    }
    await this.finalWhistle();
  }

  // ------------------------------------------------------------------ presenter (learning → gameplay)
  async present(ch: LearningChallenge, choices: ChallengeChoice[]) {
    this.counted = 0;
    // whistle: everyone back to the kick-off spot so the gates appear clearly ahead
    this.sfx('whistle');
    this.cutscene = true;
    this.moveTarget = null;
    this.pendingKick = false;
    this.keeper.reset();
    this.pos.set(0, 0, 3);
    this.vel.set(0, 0, 0);
    this.facing = Math.PI;
    this.ball.teleport(0, 0.4, 1.7);
    this.camSmooth.set(0, this.portrait ? 4.6 : 3.4, 3 + (this.portrait ? 6.8 : 5.6));
    this.follow = 'adam';
    await this.wait(250);
    this.cutscene = false;
    // counting objects become collectable stars around Adam
    const n = ch.type === 'countObjects' || ch.type === 'addition' || ch.type === 'numberChoice' ? ch.assets.count ?? 0 : 0;
    if (n > 0) this.spawnStars(n);
    // the choice gates spread out on the pitch between Adam and the goal
    const gz = -2.2;
    const spread = this.portrait ? 2.6 : 3.2;
    choices.forEach((c, i) => {
      const pic = c.visual.kind === 'icon' || c.visual.kind === 'shape' ? this.conceptTexture(c) : null;
      const ring = new ChoiceRing(c, pic);
      ring.group.position.set((i - (choices.length - 1) / 2) * spread, 0, gz - (i % 2) * 0.6);
      this.s3.add(ring.group);
      this.rings.push(ring);
      this.onTap3D(ring.group, () => {
        if (this.interactive) this.moveTarget = ring.group.position.clone();
      }, { sound: 'press' });
      void this.tw.to(ring.group.scale, { x: 1, y: 1, z: 1 }, { duration: 700, delay: 150 + i * 140, ease: Ease.elasticOut });
    });
    this.sfx('magic', { delay: 0.2 });
    this.setA11yChoices(choices.map((c) => ({ id: c.id, label: c.ariaLabel })), (id) => this.runner.choose(id));
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

  private spawnStars(n: number) {
    const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const side = new THREE.Vector3(f.z, 0, -f.x);
    for (let i = 0; i < n; i++) {
      const s = makeCollectStar();
      const row = Math.floor(i / 5);
      const col = i % 5;
      const inRow = Math.min(5, n - row * 5);
      const p = this.pos.clone().addScaledVector(f, 2.6 + row * 0.9).addScaledVector(side, (col - (inRow - 1) / 2) * 0.95 + 2.2);
      p.x = THREE.MathUtils.clamp(p.x, PLAY.minX, PLAY.maxX);
      p.z = THREE.MathUtils.clamp(p.z, GOAL.z + 2, PLAY.maxZ);
      s.position.set(p.x, 0.6, p.z);
      s.scale.setScalar(0.01);
      this.s3.add(s);
      void this.tw.to(s.scale, { x: 1, y: 1, z: 1 }, { duration: 500, delay: i * 90, ease: Ease.backOut });
      this.stars.push({ mesh: s, taken: false });
    }
  }

  private checkStars() {
    if (this.cutscene) return;
    for (const s of this.stars) {
      if (s.taken || this.distXZ(this.pos, s.mesh.position) > 0.65) continue;
      s.taken = true;
      this.counted++;
      const n = this.counted;
      this.sfx('pop', { pitch: (n - 1) * 2 });
      this.sfx('starLand', { pitch: n });
      this.haptic('tiny');
      this.sparks.burst(s.mesh.position, { count: 26, colors: [0xffc23a, 0xffffff], speed: [0.6, 2], gravity: 1 });
      void this.engine.speech.say([{ text: numberWord(n), lang: 'en' }], 'commentator');
      const lbl = numberSprite(n);
      lbl.position.copy(s.mesh.position).setY(1.3);
      this.s3.add(lbl);
      s.label = lbl;
      void this.tw.to(s.mesh.position, { y: 1.9 }, { duration: 400, ease: Ease.backOut });
      void this.tw.to(s.mesh.scale, { x: 0.5, y: 0.5, z: 0.5 }, { duration: 400 });
      if (this.counted === this.stars.length) for (const r of this.rings) r.highlight();
    }
  }

  private checkRings() {
    if (this.cutscene || !this.interactive) return;
    for (const r of this.rings) {
      if (!r.canTrigger() || !r.contains(this.pos)) continue;
      r.wrong(); // cooldown; the runner decides right or wrong
      this.runner.choose(r.choice.id);
    }
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  async wrongFeedback(choiceId: string) {
    this.sfx('softBump');
    this.haptic('tiny');
    const r = this.rings.find((x) => x.choice.id === choiceId);
    if (r) {
      r.wrong();
      const out = this.pos.clone().sub(r.group.position).setY(0);
      if (out.lengthSq() < 0.01) out.set(0, 0, 1);
      out.normalize();
      this.vel.addScaledVector(out, 4); // gentle bounce back out of the ring
      this.moveTarget = null;
    }
    this.adam.setPose('think');
    await this.wait(600);
    this.adam.happy();
  }

  async countTogether() {
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.label) this.s3.remove(s.label);
      const lbl = numberSprite(i + 1);
      lbl.position.copy(s.mesh.position).setY(s.mesh.position.y + 0.6);
      this.s3.add(lbl);
      s.label = lbl;
      const k = s.taken ? 0.5 : 1;
      void this.tw.to(s.mesh.scale, { x: k * 1.4, y: k * 1.4, z: k * 1.4 }, { duration: 160 }).then(() => this.tw.to(s.mesh.scale, { x: k, y: k, z: k }, { duration: 300 }));
      this.sfx('pop', { pitch: i * 2 });
      const w = numberWord(i + 1);
      await this.say([{ text: w.charAt(0).toUpperCase() + w.slice(1), lang: 'en' }], 'commentator');
    }
  }

  pulseAnswer(ch: LearningChallenge) {
    const r = this.rings.find((x) => x.choice.id === ch.answer.id);
    if (!r) return;
    r.highlight();
    this.sparks.burst(r.group.position.clone().setY(2.2), { count: 20, colors: [0xffc23a, 0xffffff], speed: [0.4, 1.4], gravity: 0.3 });
  }

  /** Right ring → its energy charges the ball → SUPER-SHOT → Adam scores. */
  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    this.interactive = false;
    const r = this.rings.find((x) => x.choice.id === choiceId);
    const src = r ? r.group.position.clone().setY(1.6) : this.pos.clone().setY(1.5);
    this.sfx('magic');
    this.sfx('power', { delay: 0.2 });
    this.haptic('medium');
    this.sparks.burst(src, { count: 90, colors: [0xffc23a, 0x4edea3, 0x1e6bff, 0xffffff], speed: [1, 4], gravity: 0.5, life: [0.6, 1.3] });
    for (const ring of this.rings) {
      ring.removed = true;
      void this.tw.to(ring.group.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 380, ease: Ease.backIn });
    }
    for (const s of this.stars) void this.tw.to(s.mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 300 });
    // energy stream from the ring into the ball
    const ballP = this.ball.pos;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (!this.alive) return;
        this.sparks.burst(src.clone().lerp(ballP, (i + 1) / 7), { count: 14, colors: [0xffc23a, 0x4edea3], speed: [0.2, 0.8], gravity: 0, life: [0.3, 0.5] });
      }, i * 60);
    }
    await this.wait(450);
    this.clearChallengeObjects();
    this.ball.setSuper(true);
    this.superArmed = true;
    this.engine.audio.setMusicIntensity(1);
    void this.bigText('SUPER SHOT!', { size: Math.min(this.width * 0.11, 80), fill: color.mint, y: this.height * 0.24, hold: 500 });
    void this.say([{ text: 'سدّد يا آدم!', lang: 'ar' }, { text: 'Shoot!', lang: 'en' }], 'commentator');
    // wait for the super-shot goal; gently remind if Adam waits
    const goal = new Promise<void>((res) => (this.goalResolve = res));
    void (async () => {
      let nudges = 0;
      while (this.alive && this.awaitingGoal) {
        await this.wait(7000);
        if (this.awaitingGoal && this.superArmed && ++nudges <= 3) void this.say([{ text: 'اضغط زر الطابة الكبير!', lang: 'ar' }], 'sparky');
      }
    })();
    await this.guard(goal);
    this.superArmed = false;
    await this.flyStarsFrom3D(this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), stars);
    this.engine.audio.setMusicIntensity(0);
    await this.resumePlay();
  }

  private clearChallengeObjects() {
    for (const r of this.rings) {
      this.offTap3D(r.group);
      this.s3.remove(r.group);
      disposeObject(r.group);
    }
    this.rings = [];
    for (const s of this.stars) {
      this.s3.remove(s.mesh);
      disposeObject(s.mesh);
      if (s.label) {
        this.s3.remove(s.label);
        disposeObject(s.label);
      }
    }
    this.stars = [];
    this.setA11yChoices([], null);
  }

  clear() {
    /* challenge objects are cleared when the super-shot is armed */
  }

  // ------------------------------------------------------------------ final whistle
  private async finalWhistle() {
    const store = useGame.getState();
    this.cutscene = true;
    this.controls.setVisible(false);
    this.follow = 'free';
    this.sfx('whistle');
    await this.wait(300);
    this.sfx('fanfare');
    this.engine.audio.cheer(1);
    this.stadium.goal();
    this.stadium.setLedMessage('🏆 ADAM WINS!  ★  آدم البطل!  ★  CHAMPION  ★');
    const trophy = makeTrophy();
    trophy.position.set(0, -1.2, -1.5);
    this.s3.add(trophy);
    const spot = new THREE.SpotLight(0xffe9a8, 40, 12, 0.35, 0.5);
    spot.position.set(0, 7, -0.5);
    spot.target = trophy;
    this.s3.add(spot);
    this.pos.set(-1.1, 0, -1.3);
    this.facing = 0.25;
    this.adam.excited();
    this.adam.setPose('cheer');
    this.ball.teleport(3, 0.3, 4);
    void this.moveCamera({ x: 0.4, y: 1.7, z: 2.4 }, { x: -0.3, y: 1.0, z: -1.5 }, 900, Ease.cubicInOut);
    this.updaters.push((dt) => (trophy.rotation.y += dt * 0.9));
    await this.tw.to(trophy.position, { y: 0.15 }, { duration: 1100, ease: Ease.backOut });
    this.sparks.burst(new THREE.Vector3(0, 1.2, -1.5), { count: 200, speed: [1.5, 4.5], gravity: 2, life: [0.9, 1.8] });
    this.haptic('celebrate');
    await this.say([{ text: 'فزت بالكأس يا آدم! أنت البطل!', lang: 'ar' }, { text: 'Champion!', lang: 'en' }], 'commentator');
    this.sfx('whoosh');
    const p = this.screenOf(trophy.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    await this.tw.to(trophy.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 500, ease: Ease.backIn });
    this.s3.remove(trophy);
    store.addTrophy();
    pulseHud('stars');
    this.sfx('unlock');
    store.completeMission('football', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
    await this.flyStarsToHud(p.x, p.y, MISSION_BONUS);
    this.adam.setPose('idle');
    this.adam.happy();
    await revealUnlocks(this);
    if (this.engine.shouldWrapUp()) {
      await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
      void this.engine.endSession();
      return;
    }
    await this.offerNext();
  }

  private async offerNext() {
    const again = makeChoiceButton('again');
    const home = makeChoiceButton('home');
    again.position.set(-0.85, 1.1, -0.2);
    home.position.set(0.85, 1.1, -0.2);
    for (const b of [again, home]) {
      b.scale.setScalar(0.01);
      this.s3.add(b);
      void this.tw.to(b.scale, { x: 0.7, y: 0.7, z: 0.7 }, { duration: 600, ease: Ease.elasticOut });
    }
    this.updaters.push((_dt, t) => {
      again.rotation.y = Math.sin(t * 1.5) * 0.2;
      home.rotation.y = Math.sin(t * 1.5 + 1) * 0.2;
    });
    void this.moveCamera({ x: 0, y: 1.4, z: 3.2 }, { x: 0, y: 1.0, z: -0.5 }, 700);
    void this.say([{ text: 'بدك تلعب مباراة كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    // taps reach the 3D buttons through the controls' tap forwarding
    this.controls.setVisible(true);
    await this.guard(
      new Promise<void>((resolve) => {
        const go = (id: string) => {
          resolve();
          this.engine.speech.cancel();
          void this.goto(id === 'again' ? 'football' : 'world', { from: 'football' });
        };
        this.onTap3D(again, () => go('again'), { sound: 'pop' });
        this.onTap3D(home, () => go('home'), { sound: 'pop' });
        this.setA11yChoices([{ id: 'again', label: 'Play again' }, { id: 'home', label: 'Back to world' }], go);
        // allow tap forwarding (movement stays frozen: Adam is posing)
        this.cutscene = false;
        this.follow = 'free';
      }),
    );
  }

  exit() {
    this.engine.audio.stopCrowd();
    this.engine.audio.setMusicIntensity(0);
  }

  destroy() {
    this.adam?.dispose();
    this.keeper?.hero.dispose();
    this.phys?.dispose();
    super.destroy();
  }
}
