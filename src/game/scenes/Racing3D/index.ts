import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { color } from '@/design-system/tokens';
import { numberWord } from '@/learning/engine/ChallengeGenerator';
import type { ChallengeChoice, LearningChallenge, VoiceLine } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene3D } from '../../three/Scene3D';
import { Hero3D } from '../../three/Hero3D';
import { adamLook } from '../../three/adamLook';
import { Controls } from '../../three/Controls';
import { disposeObject, type StageLook } from '../../three/ThreeStage';
import { Ease } from '../../engine/Tween';
import { pulseHud } from '../../engine/hudBridge';
import { drawConcept } from '../../draw/conceptArt';
import { ChallengeRunner, type ChallengePresenter } from '../../systems/ChallengeRunner';
import { MISSION_BONUS } from '../../systems/RewardEngine';
import { revealUnlocks } from '../../effects/UnlockReveal';
import { Particles3D, Sparky3D, makeChoiceButton, makeTrophy, numberSprite } from '../Football3D/props';
import { makeCollectStar } from '../Football3D/Rings3D';
import { Track3D, SUNSET_HORIZON } from './Track3D';
import { Kart3D } from './Kart3D';
import { Gate3D } from './Gate3D';
import { KMH, LaneLock, laneX, steerStep } from './lanes';

const SPEED_NORMAL = 18;
const SPEED_CRUISE = 8;
const SPEED_NITRO = 38;
const LAPS = 3;
/** gates hover this far ahead of the kart while Adam chooses */
const HOLD_Z = -17;
const SPAWN_Z = -150;
const STAR_Z = -8;

const LAP_INTRO: VoiceLine[][] = [
  [{ text: 'يلا يا آدم! السباق بلّش!', lang: 'ar' }],
  [{ text: 'المنافس رجع! يلا نسرّع!', lang: 'ar' }],
  [{ text: 'آخر دورة يا بطل!', lang: 'ar' }],
];

interface Star {
  mesh: THREE.Mesh;
  num: number | null;
  label: THREE.Sprite | null;
}

/**
 * TURBO RACING in 3D — Adam drives his own kart down a real road. Drag left/right (or tap a
 * spot on the road) to steer. Answers are drive-through gates across the lanes: hold the kart
 * in the right lane (or tap the gate) → NITRO → blast through the tunnel and overtake the rival.
 */
export default class Racing3D extends Scene3D implements ChallengePresenter {
  readonly id = 'racing' as const;
  readonly music = 'racing' as const;
  runner!: ChallengeRunner;

  private track!: Track3D;
  private kart!: Kart3D;
  private rival!: Kart3D;
  private adam!: Hero3D;
  private rivalKid!: Hero3D;
  private sparky = new Sparky3D();
  private sparks = new Particles3D(1200);
  private controls!: Controls;

  /** tweenable race state */
  private st = { kartX: 0, rivalAhead: 14, nitroFuel: 0, fovKick: 0 };
  private speed = 0;
  private targetSpeed = 0;
  private steerVel = 0;
  private tapTarget: number | null = null;
  private steered = false;
  private driving = false; // joystick steering allowed
  private autopilot = false; // a scripted move owns kartX
  private boosting = false;
  private follow = true;
  private portrait = true;
  private lap = 1;
  private position = 2;
  private hudTimer = 0;
  private engineSnd: { setSpeed: (v: number) => void; stop: () => void } | null = null;
  /** things that stream past with the road (start gantry, finish arch) */
  private scrollers: THREE.Object3D[] = [];

  private gates: Gate3D[] = [];
  private stars: Star[] = [];
  private counted = 0;
  private interactive = false;
  private lock = new LaneLock();
  private skillsPlayed: string[] = [];
  private starsEarned = 0;
  private camSmooth = new THREE.Vector3(0, 4, 8);
  private lookSmooth = new THREE.Vector3(0, 1, -10);

  protected stageLook(): StageLook {
    return { bloomIntensity: 0.75, bloomThreshold: 0.86, vignette: 0.38, saturation: 0.22, contrast: 0.1, exposure: 0.92 };
  }

  protected build3D() {
    const save = useGame.getState().save;
    this.track = new Track3D(this.stage.quality);
    this.s3.add(this.track.group);
    this.s3.fog = new THREE.Fog(SUNSET_HORIZON, 60, 190);
    this.useStudioEnvironment(0.25);

    this.adam = new Hero3D(adamLook(save.avatar));
    this.kart = new Kart3D(0x1e6bff, 0xffc23a, '4', this.adam);
    this.rivalKid = new Hero3D({
      skin: 0xc98e62, hair: 0x1a1010, hairStyle: 'spiky', eyes: 0x2a1a10,
      shirt: 0x8b3dff, shirtTrim: 0xff8a1f, shorts: 0x2a1a55, socks: 0x8b3dff, shoes: 0x222222, shoeStripe: 0xff8a1f,
      number: '7',
    });
    this.rival = new Kart3D(0x8b3dff, 0xff8a1f, '7', this.rivalKid);
    this.s3.add(this.kart.root, this.rival.root, this.sparky.root, this.sparks.points);

    this.controls = new Controls(this.tex('glow'), this.tex('glow'), { onTap: (x, y) => this.onTap(x, y), onKick: () => {} }, () => this.haptic('tiny'), false);
    this.controls.setVisible(false);
    this.overlay.addChildAt(this.controls.view, 0);

    this.updaters.push((dt, t) => this.step(dt, t));
    this.runner = new ChallengeRunner(this, 'racing', this);
    useGame.getState().setLastVisited('racing');
    useGame.getState().setHud({ kind: 'racing', speed: 0, nitro: 0, lap: 1, laps: LAPS, position: 2 });
  }

  layout(w: number, h: number) {
    this.portrait = h >= w;
    this.controls.layout(w, h, this.safe.bottom, this.safe.right);
    const c = this.chase();
    this.camSmooth.copy(c.pos);
    this.lookSmooth.copy(c.look);
    this.setCam(c.pos, c.look);
  }

  enter() {
    this.engineSnd = this.engine.audio.startEngine();
    this.engine.audio.startCrowd(0.12);
    void this.race();
  }

  exit() {
    this.engineSnd?.stop();
    this.engineSnd = null;
    this.engine.audio.stopCrowd();
    this.engine.audio.setMusicIntensity(0);
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    if (speaker === 'sparky' || speaker === 'commentator') this.sparky.talking = on;
  }

  // ------------------------------------------------------------------ input
  private onTap(x: number, y: number) {
    if (this.tapAt(x, y)) return;
    if (!this.driving) return;
    const g = this.groundAt(x, y);
    if (!g) return;
    this.tapTarget = THREE.MathUtils.clamp(g.x, -3.9, 3.9);
    this.steered = true;
    this.sparks.burst(new THREE.Vector3(this.tapTarget, 0.1, Math.max(g.z, -12)), { count: 10, colors: [0xffffff, 0x4edea3], speed: [0.4, 1.2], gravity: 1, life: [0.3, 0.5] });
  }

  // ------------------------------------------------------------------ frame
  private step(dt: number, t: number) {
    const st = this.st;
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * (this.targetSpeed > this.speed ? 1.6 : 2.4));
    const dz = this.speed * dt;
    // steering
    const prevX = st.kartX;
    if (this.driving && !this.autopilot) {
      const m = this.controls.move.x;
      if (Math.abs(m) > 0.25) {
        this.steered = true;
        this.tapTarget = null;
      }
      st.kartX = steerStep(st.kartX, m, this.tapTarget, dt);
      if (this.tapTarget !== null && Math.abs(this.tapTarget - st.kartX) < 0.05) this.tapTarget = null;
    }
    this.steerVel += ((st.kartX - prevX) / Math.max(dt, 1e-3) - this.steerVel) * Math.min(1, dt * 10);
    this.kart.root.position.set(st.kartX, 0, 0);
    this.kart.nitro += ((this.boosting ? 1 : 0) - this.kart.nitro) * Math.min(1, dt * 6);
    this.kart.update(dt, this.speed, this.steerVel, t);
    // rival
    const rz = -st.rivalAhead;
    this.rival.root.visible = rz < 12;
    this.rival.root.position.set(1.7 * Math.sign(1.5 - st.kartX || 1) + Math.sin(t * 0.7) * 0.4, 0, rz);
    this.rival.update(dt, this.speed + 1, Math.cos(t * 0.7) * 0.3, t);

    this.track.update(dz, t, this.reduced ? 0 : Math.max(0, (this.speed - 20) / 18));
    for (const o of this.scrollers) o.position.z += dz;
    // drop the start gantry / finish arch once they're well behind the camera
    for (const o of this.scrollers.filter((x) => x.position.z > 40)) {
      this.scrollers.splice(this.scrollers.indexOf(o), 1);
      this.s3.remove(o);
      disposeObject(o);
    }
    for (const g of this.gates) {
      if (g.rushing) g.group.position.z += dz;
      g.update(dt, t);
    }
    for (const s of this.stars) {
      s.mesh.rotation.y += dt * 2.4;
      if (s.label) s.label.position.set(s.mesh.position.x, s.mesh.position.y + 0.65, s.mesh.position.z);
    }
    // lock-on: hold the kart in a gate's lane to drive into it
    if (this.interactive && this.gates.length && !this.autopilot) {
      const pick = this.lock.update(st.kartX, this.gates.length, this.steered, dt);
      this.steered = false;
      this.gates.forEach((g, i) => g.setMeter(i === this.lock.lane && this.lock.armed ? this.lock.progress : 0));
      if (pick >= 0) {
        this.gates.forEach((g) => g.setMeter(0));
        this.runner.choose(this.gates[pick].choice.id);
      }
    }
    // nitro exhaust sparks
    if (this.boosting && !this.reduced) {
      const ex = this.kart.root.position.clone().add(new THREE.Vector3(0, 0.45, 1.6));
      this.sparks.burst(ex, { count: 4, colors: [0x6fd0ff, 0xffffff, 0xffc23a], speed: [0.5, 2], gravity: -0.5, life: [0.2, 0.4], size: [0.08, 0.16] });
    }
    if (this.boosting) st.nitroFuel = Math.max(0, st.nitroFuel - dt * 0.35);
    this.engineSnd?.setSpeed(Math.min(1, this.speed / SPEED_NITRO));
    // Sparky flies alongside, to the right of the kart
    const sp = new THREE.Vector3(st.kartX + (st.kartX > 2.5 ? -1.8 : 1.8), 2.1, -0.8);
    this.sparky.root.position.lerp(sp, 1 - Math.exp(-4 * dt));
    this.sparky.update(dt);
    this.sparks.update(dt);
    this.controls.update(t);
    this.runner.tick(dt);
    this.updateCamera(dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.125;
      useGame.getState().patchHud({ speed: this.speed * KMH, nitro: st.nitroFuel, lap: this.lap, position: this.position });
    }
  }

  private chase() {
    const x = this.st.kartX;
    return {
      pos: new THREE.Vector3(x * 0.55, this.portrait ? 4.4 : 3.3, this.portrait ? 8.4 : 6.8),
      look: new THREE.Vector3(x * 0.8, 1.0, this.portrait ? -12 : -10),
    };
  }

  private setCam(pos: THREE.Vector3, look: THREE.Vector3) {
    Object.assign(this.camPos, { x: pos.x, y: pos.y, z: pos.z });
    Object.assign(this.camLook, { x: look.x, y: look.y, z: look.z });
  }

  private updateCamera(dt: number) {
    if (!this.follow) return;
    const c = this.chase();
    const k = 1 - Math.exp(-5 * dt);
    this.camSmooth.lerp(c.pos, k);
    this.lookSmooth.lerp(c.look, k);
    this.setCam(this.camSmooth, this.lookSmooth);
    // a wider lens at speed sells the rush
    const base = this.portrait ? 62 : 52;
    const fast = Math.max(0, (this.speed - SPEED_NORMAL) / (SPEED_NITRO - SPEED_NORMAL));
    this.camFov += (base + fast * 12 + this.st.fovKick - this.camFov) * Math.min(1, dt * 4);
  }

  private steerTo(x: number, ms: number) {
    this.autopilot = true;
    this.tapTarget = null;
    return this.tw.to(this.st, { kartX: x }, { duration: ms, ease: Ease.cubicInOut }).then(() => {
      this.autopilot = false;
    });
  }

  // ------------------------------------------------------------------ race flow
  private async race() {
    this.adam.determined();
    await this.countdown();
    this.targetSpeed = SPEED_NORMAL;
    this.driving = true;
    this.controls.setVisible(true);
    this.sfx('go');
    this.haptic('medium');
    this.shake3D(0.08, 300);
    for (let i = 0; i < LAPS; i++) {
      this.lap = i + 1;
      if (i > 0) {
        // the rival comes back so every lap has an overtake
        void this.tw.to(this.st, { rivalAhead: 14 }, { duration: 2200, ease: Ease.quadOut });
        this.position = 2;
      }
      await this.wait(i === 0 ? 1600 : 2000);
      if (i === 0) await this.say([{ text: 'حرّك إصبعك يمين وشمال لتسوق!', lang: 'ar' }], 'sparky');
      const res = await this.runner.run({ intro: LAP_INTRO[i], speaker: 'sparky' });
      this.skillsPlayed.push(res.skillId);
      this.starsEarned += res.stars;
    }
    await this.finishLine();
  }

  private async countdown() {
    this.sparky.excited = true;
    void this.say([{ text: 'جاهز يا آدم؟', lang: 'ar' }, { text: 'Ready… set… GO!', lang: 'en' }], 'sparky');
    // start-light gantry over the road
    const gantry = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6f2, metalness: 0.4, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.6, 8), steel);
      p.position.set(s * 6.4, 2.3, 0);
      gantry.add(p);
    }
    const beam = new THREE.Mesh(new RoundedBoxGeometry(13, 0.5, 0.5, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x1c2238 }));
    beam.position.y = 4.4;
    const box = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.1, 0.5, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x0d1322 }));
    box.position.set(0, 3.7, 0.1);
    gantry.add(beam, box);
    const mats = [0, 1, 2].map((i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x333344, emissive: 0x000000, emissiveIntensity: 3 });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), m);
      l.position.set((i - 1) * 0.8, 3.7, 0.4);
      gantry.add(l);
      return m;
    });
    gantry.position.z = -9;
    this.s3.add(gantry);
    this.scrollers.push(gantry);
    for (let lit = 1; lit <= 3; lit++) {
      mats[lit - 1].color.setHex(color.red);
      mats[lit - 1].emissive.setHex(color.red);
      this.sfx('beep');
      this.engineSnd?.setSpeed(0.25 + lit * 0.12);
      await this.wait(650);
    }
    for (const m of mats) {
      m.color.setHex(0x3dff7a);
      m.emissive.setHex(0x3dff7a);
    }
    this.sparky.excited = false;
    void this.bigText('GO!', { fill: color.mint, y: this.height * 0.3, hold: 300 });
  }

  private async finishLine() {
    // checkered arch approaches
    const arch = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5.6, 10), white);
      p.position.set(s * 6.5, 2.8, 0);
      arch.add(p);
    }
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 160;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffffff' : '#111111';
      g.fillRect(i * 32, j * 32, 32, 32);
    }
    g.fillStyle = '#feb700';
    g.font = '900 84px Rubik, "Arial Rounded MT Bold", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FINISH', 512, 116);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 2.1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 }));
    banner.position.y = 5.2;
    const lineTex = new THREE.CanvasTexture(c);
    lineTex.colorSpace = THREE.SRGBColorSpace;
    lineTex.repeat.set(1, 0.4);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.2), new THREE.MeshStandardMaterial({ map: lineTex }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    arch.add(banner, line);
    arch.position.z = -170;
    this.s3.add(arch);
    this.scrollers.push(arch);
    this.targetSpeed = 24;
    void this.say([{ text: 'خط النهاية! يلا يا آدم!', lang: 'ar' }], 'sparky');
    await this.guard(new Promise<void>((resolve) => {
      const check = () => (arch.position.z >= 0 ? resolve() : void this.tw.wait(50).then(check));
      check();
    }));
    // crossing!
    this.position = 1;
    this.driving = false;
    this.controls.setVisible(false);
    this.sfx('fanfare');
    this.engine.audio.cheer(1);
    this.haptic('celebrate');
    this.shake3D(0.12, 400);
    const kp = this.kart.root.position.clone();
    this.sparks.burst(kp.clone().add(new THREE.Vector3(0, 2, -3)), { count: 160, colors: [0xffffff, 0x111111, 0xffc23a, 0x4edea3], speed: [2, 6], gravity: 3, life: [0.9, 1.7] });
    this.stage.setBloom(2);
    void this.tw.progress({ duration: 1200, onUpdate: (k) => this.stage.setBloom(2 - 1.25 * k) });
    void this.bigText('1st!', { fill: color.gold, y: this.height * 0.28 });
    // pull up and spin the camera round to Adam, who stands up and cheers
    this.targetSpeed = 0;
    this.follow = false;
    await this.moveCamera({ x: kp.x + 1.4, y: 1.8, z: -4.6 }, { x: kp.x, y: 0.9, z: 0 }, this.reduced ? 300 : 1300, Ease.cubicInOut, this.portrait ? 58 : 46);
    Object.assign(this.adam.act, { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0, armLz: 0, armRz: 0 });
    this.adam.root.position.y = 0.45;
    this.adam.excited();
    this.adam.setPose('cheer');
    await this.say([{ text: 'أنت الأول يا آدم! فزت بالسباق!', lang: 'ar' }, { text: 'First place!', lang: 'en' }], 'sparky');

    // trophy rises in front of the kart, then flies into the HUD
    const store = useGame.getState();
    const trophy = makeTrophy();
    trophy.position.set(kp.x - 0.9, -1.4, -2.2);
    this.s3.add(trophy);
    this.updaters.push((dt) => (trophy.rotation.y += dt * 0.9));
    await this.tw.to(trophy.position, { y: 0.3 }, { duration: 900, ease: Ease.backOut });
    this.sparks.burst(trophy.position.clone().add(new THREE.Vector3(0, 0.8, 0)), { count: 160, speed: [1.5, 4], gravity: 2, life: [0.9, 1.6] });
    this.haptic('celebrate');
    await this.wait(700);
    this.sfx('whoosh');
    const p = this.screenOf(trophy.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    await this.tw.to(trophy.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 500, ease: Ease.backIn });
    this.s3.remove(trophy);
    disposeObject(trophy);
    store.addTrophy();
    pulseHud('stars');
    this.sfx('unlock');
    store.completeMission('racing', this.starsEarned + MISSION_BONUS, this.skillsPlayed);
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

  private raceAgainButton(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.1, 0.35, 5, 0.3), new THREE.MeshStandardMaterial({ color: 0x2fd389, roughness: 0.3, emissive: 0x2fd389, emissiveIntensity: 0.35 }));
    body.castShadow = true;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.fillRect(58, 40, 14, 180);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      x.fillStyle = (i + j) % 2 ? '#ffffff' : '#111111';
      x.fillRect(72 + i * 34, 40 + j * 34, 34, 34);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    face.position.z = 0.18;
    g.add(body, face);
    return g;
  }

  private async offerNext() {
    const kp = this.kart.root.position;
    const again = this.raceAgainButton();
    const home = makeChoiceButton('home');
    // buttons float between the camera and the kart, facing the camera (+Z → −Z flip)
    again.position.set(kp.x + 0.2, 1.5, -2.6);
    home.position.set(kp.x + 2.0, 1.5, -2.6);
    for (const b of [again, home]) {
      b.rotation.y = Math.PI + 0.25;
      b.scale.setScalar(0.01);
      this.s3.add(b);
      void this.tw.to(b.scale, { x: 0.6, y: 0.6, z: 0.6 }, { duration: 600, ease: Ease.elasticOut });
    }
    this.updaters.push((_dt, t) => {
      again.position.y = 1.5 + Math.sin(t * 2) * 0.06;
      home.position.y = 1.5 + Math.sin(t * 2 + 1) * 0.06;
    });
    void this.moveCamera({ x: kp.x + 1.1, y: 1.7, z: -6.2 }, { x: kp.x + 1.0, y: 1.2, z: -1 }, 700);
    void this.say([{ text: 'بدك تسابق كمان؟ ولا نرجع على عالمنا؟', lang: 'ar' }], 'sparky');
    // taps reach the 3D buttons through the controls' tap forwarding
    this.controls.setVisible(true);
    await this.guard(
      new Promise<void>((resolve) => {
        const go = (id: string) => {
          resolve();
          this.engine.speech.cancel();
          void (id === 'again' ? this.goto('racing') : this.goto('world', { from: 'racing' }));
        };
        this.onTap3D(again, () => go('again'), { sound: 'pop' });
        this.onTap3D(home, () => go('home'), { sound: 'pop' });
        this.setA11yChoices([{ id: 'again', label: 'Race again' }, { id: 'home', label: 'Back to world' }], go);
      }),
    );
  }

  // ------------------------------------------------------------------ presenter
  async present(ch: LearningChallenge, choices: ChallengeChoice[]) {
    this.counted = 0;
    this.targetSpeed = SPEED_CRUISE;
    this.adam.happy();
    this.lock.reset();
    // the rival pulls far ahead so the gates are clear to see
    void this.tw.to(this.st, { rivalAhead: 45 }, { duration: 1500, ease: Ease.quadIn });
    const n = choices.length;
    choices.forEach((c, i) => {
      const pic = c.visual.kind === 'icon' || c.visual.kind === 'shape' ? this.conceptTexture(c) : null;
      const gate = new Gate3D(c, i, pic, n === 2 ? 3.0 : 2.5);
      gate.group.position.set(laneX(i, n), 0, SPAWN_Z);
      this.s3.add(gate.group);
      this.gates.push(gate);
      this.onTap3D(gate.group, () => this.interactive && this.runner.choose(c.id), { sound: 'press', visual: gate.sign });
      void this.tw.to(gate.group.position, { z: HOLD_Z - (i % 2) * 0.01 }, { duration: 1700, ease: Ease.cubicOut });
    });
    this.sfx('whoosh', { volume: 0.5 });
    // star tokens float over the road for counting
    let count = 0;
    let labels: number[] | null = null;
    if (ch.type === 'order') {
      const next = ch.answer.value ?? 4;
      labels = [next - 3, next - 2, next - 1];
      count = 3;
    } else if (ch.type !== 'compare' && ch.type !== 'colorMatch' && (ch.assets.count ?? 0) <= 10) {
      count = ch.assets.count ?? 0;
    }
    const rows = count > 5 ? 2 : 1;
    const perRow = Math.ceil(count / rows);
    const addends = ch.assets.addends;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = row === rows - 1 ? count - perRow * (rows - 1) : perRow;
      let x = inRow === 1 ? 0 : -3.4 + (6.8 * col) / (inRow - 1);
      if (addends && rows === 1) x += i < addends[0] ? -0.4 : 0.4;
      const mesh = makeCollectStar();
      mesh.position.set(x, 8, STAR_Z - row * 1.6);
      mesh.scale.setScalar(1.3);
      this.s3.add(mesh);
      const s: Star = { mesh, num: null, label: null };
      if (labels) this.setStarNumber(s, labels[i]);
      this.stars.push(s);
      this.onTap3D(mesh, () => this.onStarTap(s), { sound: null });
      void this.tw.to(mesh.position, { y: 1.9 + row * 0.9 }, { duration: 650, delay: 500 + i * 120, ease: Ease.bounceOut }).then(() => this.sfx('pop', { pitch: i, volume: 0.6 }));
    }
    await this.wait(1200);
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

  private setStarNumber(s: Star, n: number) {
    s.num = n;
    if (s.label) {
      this.s3.remove(s.label);
      disposeObject(s.label);
    }
    s.label = numberSprite(n);
    this.s3.add(s.label);
  }

  private onStarTap(s: Star) {
    void this.hop(s);
    if (s.num === null) this.setStarNumber(s, ++this.counted);
    this.sfx('pop', { pitch: ((s.num ?? 1) - 1) * 2 });
    this.haptic('tiny');
    this.sparks.burst(s.mesh.position, { count: 18, colors: [0xffc23a, 0xffffff], speed: [0.5, 1.6], gravity: 1 });
    void this.engine.speech.say([{ text: numberWord(s.num ?? 1), lang: 'en' }], 'sparky');
    if (this.counted === this.stars.length) for (const g of this.gates) g.pulse();
  }

  private async hop(s: Star) {
    const y = s.mesh.position.y;
    if (this.tw.isTweening(s.mesh.position)) return;
    await this.tw.to(s.mesh.position, { y: y + 0.5 }, { duration: 160, ease: Ease.quadOut });
    await this.tw.to(s.mesh.position, { y }, { duration: 300, ease: Ease.bounceOut });
  }

  setInteractive(on: boolean) {
    this.interactive = on;
    if (!on) for (const g of this.gates) g.setMeter(0);
  }

  async wrongFeedback(choiceId: string) {
    const g = this.gates.find((x) => x.choice.id === choiceId);
    this.sfx('softBump');
    this.haptic('tiny');
    // gentle slow-down bump — never a crash
    this.targetSpeed = 3;
    this.shake3D(0.06, 250);
    const kp = this.kart.root.position;
    this.sparks.burst(kp.clone().add(new THREE.Vector3(0, 0.5, -1.2)), { count: 22, colors: [0xffffff, 0xdddddd], speed: [0.5, 1.8], gravity: -0.3, life: [0.4, 0.8], size: [0.12, 0.25] });
    this.adam.happy();
    this.sparky.excited = false;
    g?.wrong();
    this.lock.reset(); // Adam steers again to choose again
    // ease back out of that lane, towards the middle
    await this.guard(this.steerTo(this.st.kartX * 0.35, 500));
    await this.wait(300);
    this.targetSpeed = SPEED_CRUISE;
    this.adam.determined();
  }

  async countTogether(ch: LearningChallenge) {
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (ch.type !== 'order') this.setStarNumber(s, i + 1);
      void this.hop(s);
      this.sfx('pop', { pitch: i * 2 });
      this.sparks.burst(s.mesh.position, { count: 10, colors: [0xffc23a], speed: [0.3, 1], gravity: 0.5 });
      await this.say([{ text: numberWord(i + 1).replace(/^./, (c) => c.toUpperCase()), lang: 'en' }], 'sparky');
    }
    this.counted = this.stars.length;
  }

  pulseAnswer(ch: LearningChallenge, strong: boolean) {
    const g = this.gates.find((x) => x.choice.id === ch.answer.id);
    if (!g) return;
    g.pulse();
    this.sparks.burst(g.group.position.clone().setY(strong ? 4.6 : 4.2), { count: strong ? 30 : 16, colors: [0xffc23a, 0xffffff], speed: [0.4, 1.4], gravity: 0.3 });
  }

  /** Correct: stars charge the nitro, steer into the lane, NITRO through the tunnel, overtake. */
  async succeed(choiceId: string, _ch: LearningChallenge, stars: number) {
    this.interactive = false;
    const g = this.gates.find((x) => x.choice.id === choiceId) ?? this.gates[0];
    this.engine.audio.setMusicIntensity(0.5);
    g.pulse();
    this.sfx('magic');
    for (const o of this.gates) if (o !== g) o.setDim(true);
    // counted stars fly into the kart's nitro tank
    const tank = () => this.kart.root.position.clone().add(new THREE.Vector3(0, 0.7, 0.6));
    const flights = this.stars.map((s, i) =>
      (async () => {
        const from = s.mesh.position.clone();
        if (s.label) s.label.visible = false;
        await this.tw.progress({
          duration: 450,
          delay: i * 90,
          ease: Ease.cubicIn,
          onUpdate: (k) => {
            const to = tank();
            s.mesh.position.lerpVectors(from, to, k).setY(THREE.MathUtils.lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 1.2);
            s.mesh.scale.setScalar(1.3 * (1 - k * 0.7));
          },
        });
        this.sfx('starLand', { pitch: i });
        s.mesh.visible = false;
      })(),
    );
    void this.tw.to(this.st, { nitroFuel: 1 }, { duration: 700 });
    await this.guard(Promise.all(flights).then(() => undefined));
    this.sfx('power');
    await this.wait(250);

    // steer into the lane
    this.adam.excited();
    await this.guard(this.steerTo(g.group.position.x, 550));
    this.autopilot = true;

    // NITRO!
    this.boosting = true;
    this.targetSpeed = SPEED_NITRO;
    this.sfx('nitro');
    this.haptic('medium');
    this.engine.audio.setMusicIntensity(1);
    this.shake3D(0.1, 900);
    void this.tw.to(this.st, { fovKick: 10 }, { duration: 400 }).then(() => this.tw.to(this.st, { fovKick: 0 }, { duration: 1200 }));
    this.stage.setBloom(1.8);
    for (const o of this.gates) o.rushing = true;
    // overtake the rival
    this.sfx('whoosh', { delay: 0.5 });
    void this.tw.to(this.st, { rivalAhead: -20 }, { duration: 1600, ease: Ease.quadIn }).then(() => {
      this.position = 1;
    });
    await this.guard(new Promise<void>((resolve) => {
      const check = () => (g.group.position.z >= -0.6 ? resolve() : void this.tw.wait(30).then(check));
      check();
    }));
    // through the tunnel: a burst of light
    this.sfx('swoosh');
    this.stage.setBloom(2.6);
    void this.tw.progress({ duration: 700, onUpdate: (k) => this.stage.setBloom(2.6 - 1.85 * k) });
    const kp = this.kart.root.position.clone().add(new THREE.Vector3(0, 1.2, -1));
    this.sparks.burst(kp, { count: 120, colors: [g.tint, 0xffc23a, 0xffffff], speed: [2, 6], gravity: 1, life: [0.5, 1.1] });
    void this.bigText('TURBO!', { fill: color.gold, y: this.height * 0.3 });
    await this.wait(700);
    await this.flyStarsFrom3D(kp, stars);

    // settle back to race pace
    this.boosting = false;
    this.targetSpeed = SPEED_NORMAL;
    this.engine.audio.setMusicIntensity(0);
    this.autopilot = false;
    await this.guard(this.steerTo(0, 700));
    this.adam.determined();
  }

  clear() {
    for (const g of this.gates) {
      this.offTap3D(g.group);
      this.tw.drop(g.group.position);
      this.s3.remove(g.group);
      disposeObject(g.group);
    }
    this.gates = [];
    for (const s of this.stars) {
      this.offTap3D(s.mesh);
      this.tw.drop(s.mesh.position);
      this.s3.remove(s.mesh);
      disposeObject(s.mesh);
      if (s.label) {
        this.s3.remove(s.label);
        disposeObject(s.label);
      }
    }
    this.stars = [];
  }

  destroy() {
    this.adam?.dispose();
    this.rivalKid?.dispose();
    super.destroy();
  }
}
