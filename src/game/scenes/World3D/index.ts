import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useGame } from '@/state/gameStore';
import type { Speaker } from '@/audio/SpeechManager';
import { Scene3D } from '../../three/Scene3D';
import { Hero3D } from '../../three/Hero3D';
import { adamLook } from '../../three/adamLook';
import { Controls } from '../../three/Controls';
import type { StageLook } from '../../three/ThreeStage';
import { Ease } from '../../engine/Tween';
import { revealUnlocks, showStickerReveal } from '../../effects/UnlockReveal';
import { dailyGiftSticker, giftAvailable, localDay } from '../../systems/stickers';
import { Particles3D, Sparky3D } from '../Football3D/props';
import { Island3D, SKY_HORIZON } from './Island3D';
import { Landmark, makeBeacon } from './landmarks';
import { GATE_R, GATE_REARM, GIFT_AT, LOCS, gateOf, moveWithin, obstacles, recommended, type LocId, type Obstacle } from './layout';

const SPEED = 5.2;
/** Sparky names a place when Adam walks this close to its gate */
const NAME_NEAR = 5;
/** establishing shot: the whole island from the sky */
const OVERVIEW = { pos: new THREE.Vector3(0, 46, 40), look: new THREE.Vector3(0, 0, -4) };

/**
 * ADAM'S WORLD in 3D — a walkable island. Adam runs around with the joystick (or taps where to
 * go); each place is a 3D landmark with a glowing portal arch in front of it. Walking through
 * the arch travels there. Locked places sit in mist behind a padlock and Sparky gives a hint.
 * The daily gift box sits by the plaza: walk into it (or tap it) to open.
 */
export default class World3D extends Scene3D {
  readonly id = 'world' as const;
  readonly music = 'map' as const;

  private island!: Island3D;
  private marks: Landmark[] = [];
  private obs: Obstacle[] = [];
  private adam!: Hero3D;
  private sparky = new Sparky3D();
  private sparks = new Particles3D(900);
  private controls!: Controls;
  private beacon = makeBeacon();
  private beaconAt: Landmark | null = null;
  private gift = new THREE.Group();
  private giftLid = new THREE.Group();
  private giftOpening = false;

  private pos = new THREE.Vector3(0, 0, 1.4);
  private vel = new THREE.Vector3();
  private facing = Math.PI; // towards −Z (up the screen)
  private moveTarget: THREE.Vector3 | null = null;
  private busy = true; // intro / travelling / gift: no walking
  private armed = new Set<LocId>();
  private near = new Set<LocId>();
  private namedAt = new Map<LocId, number>();
  private hinting = false;
  private travelling = false;
  private talking = false;
  private follow = false;
  private portrait = true;
  private camSmooth = new THREE.Vector3();
  private lookSmooth = new THREE.Vector3();

  protected stageLook(): StageLook {
    return { bloomIntensity: 0.6, bloomThreshold: 0.9, vignette: 0.32, saturation: 0.22, contrast: 0.1, exposure: 0.88 };
  }

  protected build3D() {
    const st = useGame.getState();
    this.island = new Island3D(this.stage.quality);
    this.s3.add(this.island.group);
    this.s3.fog = new THREE.Fog(SKY_HORIZON, 70, 175);
    this.useStudioEnvironment(0.22);

    const unlocked = st.unlockedWorlds();
    for (const def of LOCS) {
      const locked = def.id !== 'stickers' && !unlocked.includes(def.id);
      const m = new Landmark(def, locked, gateOf(def));
      this.s3.add(...m.objects);
      this.marks.push(m);
      this.onTap3D(m.group, () => this.walkTo(m), { sound: 'press' });
    }
    this.obs = obstacles(this.island.trees);

    // the next adventure gets a bouncing beacon
    const rec = recommended(unlocked, st.save.worlds.missionsCompleted);
    this.beaconAt = this.marks.find((m) => m.def.id === rec) ?? null;
    this.s3.add(this.beacon);
    this.engine.scenes.prefetch(this.beaconAt?.def.scene ?? 'football');

    this.buildGift();

    this.adam = new Hero3D(adamLook(st.save.avatar));
    this.s3.add(this.adam.root, this.sparky.root, this.sparks.points);

    // returning from a world: step out of that place's portal, facing the plaza
    const back = this.marks.find((m) => m.def.id === this.data.from);
    if (back) {
      const g = gateOf(back.def);
      this.pos.set(g.x + Math.sin(g.yaw) * 1.8, 0, g.z + Math.cos(g.yaw) * 1.8);
      this.facing = g.yaw;
    }
    for (const m of this.marks) {
      const g = gateOf(m.def);
      if (Math.hypot(this.pos.x - g.x, this.pos.z - g.z) > GATE_REARM) this.armed.add(m.def.id);
    }
    this.sparky.root.position.copy(this.pos).add(new THREE.Vector3(1.2, 1.8, 0));

    this.controls = new Controls(this.tex('glow'), this.tex('glow'), { onTap: (x, y) => this.onTap(x, y), onKick: () => {} }, () => this.haptic('tiny'), false);
    this.controls.setVisible(false);
    this.overlay.addChildAt(this.controls.view, 0);

    this.updaters.push((dt, t) => this.step(dt, t));
    st.setHud({ kind: 'world' });
    this.updateA11y();
  }

  private buildGift() {
    const g = this.gift;
    const pink = new THREE.MeshPhysicalMaterial({ color: 0xff6fb5, roughness: 0.35, clearcoat: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.4, roughness: 0.3, emissive: 0x8a5a00, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.75, 0.9, 3, 0.08), pink);
    body.position.y = 0.375;
    const ribbonA = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.77, 0.92), gold);
    ribbonA.position.y = 0.375;
    const ribbonB = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.77, 0.16), gold);
    ribbonB.position.y = 0.375;
    const lid = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.2, 1.0, 3, 0.06), pink);
    const lidRib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 1.02), gold);
    this.giftLid.add(lid, lidRib);
    for (const s of [-1, 1]) {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 20), gold);
      bow.position.set(s * 0.14, 0.2, 0);
      bow.rotation.set(0, Math.PI / 2, s * 0.5);
      this.giftLid.add(bow);
    }
    this.giftLid.position.y = 0.85;
    for (const m of [body, ribbonA, ribbonB, lid]) m.castShadow = true;
    g.add(body, ribbonA, ribbonB, this.giftLid);
    g.position.set(GIFT_AT.x, 0, GIFT_AT.z);
    g.rotation.y = -0.4;
    g.visible = giftAvailable(useGame.getState().save.daily.lastGiftDay, localDay());
    this.s3.add(g);
    this.onTap3D(g, () => {
      this.moveTarget = new THREE.Vector3(GIFT_AT.x, 0, GIFT_AT.z);
    }, { sound: 'press' });
  }

  private updateA11y() {
    this.setA11yChoices(
      [
        ...(this.gift.visible ? [{ id: '__gift', label: 'Surprise gift · مفاجأة' }] : []),
        ...this.marks.map((m) => ({ id: m.def.id, label: `${m.def.nameEn} · ${m.def.nameAr}${m.locked ? ' (locked)' : ''}` })),
      ],
      (id) => {
        if (id === '__gift') return void this.openGift();
        const m = this.marks.find((x) => x.def.id === id);
        if (m) void this.visit(m);
      },
    );
  }

  layout(w: number, h: number) {
    this.portrait = h >= w;
    this.camFov = this.portrait ? 52 : 44;
    this.controls.layout(w, h, this.safe.bottom, this.safe.right);
    if (!this.follow) {
      // until the intro hands over, sit at the chase position (no jump when it starts)
      const c = this.chase();
      this.camSmooth.copy(c.pos);
      this.lookSmooth.copy(c.look);
      if (this.data.from) this.setCam(c.pos, c.look);
      else this.setCam(OVERVIEW.pos, OVERVIEW.look);
    }
  }

  onSpeaking(on: boolean, speaker: Speaker) {
    this.talking = on;
    if (speaker === 'sparky') this.sparky.talking = on;
    if (speaker === 'adam') this.adam.talking = on;
  }

  // ------------------------------------------------------------------ intro
  enter() {
    void (async () => {
      const first = useGame.getState().save.recentMissions.length === 0;
      if (!this.data.from) {
        // from the establishing shot, swoop down behind Adam
        this.adam.setPose('wave');
        const c = this.chase();
        await this.moveCamera({ x: c.pos.x, y: c.pos.y, z: c.pos.z }, { x: c.look.x, y: c.look.y, z: c.look.z }, this.reduced ? 300 : 2600, Ease.cubicInOut);
      }
      this.follow = true;
      this.adam.setPose('idle');
      this.busy = false;
      this.controls.setVisible(true);
      if (useGame.getState().pendingUnlocks.length || useGame.getState().pendingStickers.length) {
        this.busy = true;
        this.controls.setVisible(false);
        await revealUnlocks(this);
        this.busy = false;
        this.controls.setVisible(true);
      }
      this.sparky.excited = true;
      await this.say(
        first
          ? [{ text: 'هاد عالمك يا آدم! حرّك إصبعك لتمشي، وادخل من البوابة اللي بتلمع!', lang: 'ar' }]
          : [{ text: 'وين بدك تروح هلأ يا بطل؟', lang: 'ar' }],
        'sparky',
      );
      this.sparky.excited = false;
      if (this.engine.shouldWrapUp()) {
        await this.say([{ text: 'ممتاز يا آدم! خلصت مغامرتنا لهسا!', lang: 'ar' }], 'sparky');
        void this.engine.endSession();
      }
    })();
  }

  // ------------------------------------------------------------------ input
  private onTap(x: number, y: number) {
    if (this.busy) return;
    if (this.tapAt(x, y)) return;
    const g = this.groundAt(x, y);
    if (!g) return;
    this.moveTarget = g.setY(0);
    this.sparks.burst(g.clone().setY(0.1), { count: 10, colors: [0xffffff, 0x4edea3], speed: [0.4, 1.2], gravity: 1, life: [0.3, 0.5] });
  }

  /** Tapping a place makes Adam run to its portal (walking in does the rest). */
  private walkTo(m: Landmark) {
    if (this.busy) return;
    const g = gateOf(m.def);
    this.moveTarget = new THREE.Vector3(g.x, 0, g.z);
    this.armed.add(m.def.id);
  }

  // ------------------------------------------------------------------ per frame
  private step(dt: number, t: number) {
    let dir = new THREE.Vector3();
    if (!this.busy) {
      const m = this.controls.move;
      if (Math.hypot(m.x, m.y) > 0.08) {
        this.moveTarget = null;
        // fixed camera heading (looking −Z): joystick up = −Z, right = +X
        dir.set(m.x, 0, m.y);
        if (dir.length() > 1) dir.normalize();
      } else if (this.moveTarget) {
        const to = this.moveTarget.clone().sub(this.pos).setY(0);
        if (to.length() < 0.25) this.moveTarget = null;
        else dir = to.normalize();
      }
    }
    this.vel.lerp(dir.multiplyScalar(SPEED), 1 - Math.exp(-10 * dt));
    const next = moveWithin(this.pos, { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt }, this.obs);
    // a blocked tap-target (tree / wall) shouldn't make Adam run on the spot forever
    if (this.moveTarget && Math.hypot(next.x - this.pos.x, next.z - this.pos.z) < SPEED * dt * 0.15) this.moveTarget = null;
    this.pos.set(next.x, 0, next.z);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.25 && !this.busy) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
    }
    if (!this.busy) this.adam.setPose(sp > 2.6 ? 'run' : sp > 0.4 ? 'walk' : 'idle');
    this.adam.root.position.copy(this.pos);
    this.adam.root.rotation.y = this.facing;
    this.adam.update(dt);

    if (!this.busy) this.checkGates();
    if (!this.busy && this.gift.visible && Math.hypot(this.pos.x - GIFT_AT.x, this.pos.z - GIFT_AT.z) < 1.05) void this.openGift();

    // world life
    this.island.update(dt, t);
    this.island.followSun(this.pos.x, this.pos.z);
    for (const m of this.marks) m.update(dt, t);
    if (this.beaconAt) {
      const d = this.beaconAt.def;
      this.beacon.position.set(d.at.x, d.height + 1.7 + Math.abs(Math.sin(t * 3.5)) * 0.5, d.at.z);
      this.beacon.rotation.y = t * 2;
    }
    if (this.gift.visible && !this.giftOpening) {
      this.gift.rotation.z = Math.sin(t * 7) * 0.06 * Math.max(0, Math.sin(t * 1.3));
      this.giftLid.position.y = 0.85 + Math.max(0, Math.sin(t * 1.3)) * Math.abs(Math.sin(t * 7)) * 0.08;
    }
    this.sparky.update(dt);
    this.sparks.update(dt);
    this.controls.update(t);
    // Sparky floats at Adam's shoulder, to the camera's right (and out of the lens while travelling)
    const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0).setY(0).normalize();
    const sparkyAt = this.travelling
      ? this.pos.clone().addScaledVector(right, 2.2).add(new THREE.Vector3(0, 2.6, 0))
      : this.pos.clone().addScaledVector(right, 1.15).add(new THREE.Vector3(0, 1.8, 0.4));
    this.sparky.root.position.lerp(sparkyAt, 1 - Math.exp(-4 * dt));
    this.sparky.root.rotation.y = Math.atan2(this.cam.position.x - this.sparky.root.position.x, this.cam.position.z - this.sparky.root.position.z);
    this.updateCamera(dt);
    this.updateCutout();
  }

  /** Feed Adam's screen position + depth to the tree cut-out shader. */
  private updateCutout() {
    this.cam.updateMatrixWorld();
    const p = this.pos.clone().setY(0.7);
    const view = p.clone().applyMatrix4(this.cam.matrixWorldInverse);
    const ndc = p.project(this.cam);
    const buf = this.stage.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.island.cut.uCut.value.set(((ndc.x + 1) / 2) * buf.x, ((ndc.y + 1) / 2) * buf.y, -view.z);
    this.island.cut.uCutR.value = buf.y * 0.13;
  }

  private checkGates() {
    for (const m of this.marks) {
      const id = m.def.id;
      const g = gateOf(m.def);
      const d = Math.hypot(this.pos.x - g.x, this.pos.z - g.z);
      if (d > GATE_REARM) this.armed.add(id);
      // name the place as Adam approaches (he can't read the labels yet)
      if (d < NAME_NEAR && !this.near.has(id)) {
        this.near.add(id);
        if (!this.talking && this.time - (this.namedAt.get(id) ?? -99) > 12) {
          this.namedAt.set(id, this.time);
          void this.engine.speech.say([{ text: m.def.nameAr, lang: 'ar' }], 'sparky');
        }
      } else if (d > NAME_NEAR + 1) this.near.delete(id);
      if (d < GATE_R && this.armed.has(id)) {
        this.armed.delete(id);
        void this.visit(m);
        return;
      }
    }
  }

  private chase() {
    // steep enough that trees in front rarely hide Adam
    const back = this.portrait ? 10 : 8.2;
    const up = this.portrait ? 13.5 : 10.5;
    return {
      pos: new THREE.Vector3(this.pos.x, up, this.pos.z + back),
      look: new THREE.Vector3(this.pos.x, 0.8, this.pos.z - (this.portrait ? 2.2 : 1.6)),
    };
  }

  private setCam(pos: THREE.Vector3, look: THREE.Vector3) {
    Object.assign(this.camPos, { x: pos.x, y: pos.y, z: pos.z });
    Object.assign(this.camLook, { x: look.x, y: look.y, z: look.z });
  }

  private updateCamera(dt: number) {
    if (!this.follow) return;
    const c = this.chase();
    const k = 1 - Math.exp(-4 * dt);
    this.camSmooth.lerp(c.pos, k);
    this.lookSmooth.lerp(c.look, k);
    this.setCam(this.camSmooth, this.lookSmooth);
  }

  // ------------------------------------------------------------------ travelling
  private async visit(m: Landmark) {
    if (this.busy || this.engine.scenes.isTransitioning) return;
    if (m.locked) return void this.lockedHint(m);
    this.busy = true;
    this.travelling = true;
    this.follow = false;
    this.moveTarget = null;
    this.vel.set(0, 0, 0);
    this.controls.setVisible(false);
    this.engine.speech.cancel();
    const g = gateOf(m.def);
    // 1. Adam cheers in the portal, sparkles burst
    this.facing = Math.atan2(m.def.at.x - this.pos.x, m.def.at.z - this.pos.z);
    this.adam.excited();
    this.adam.setPose('cheer');
    this.sparky.excited = true;
    this.sfx('portal');
    this.sfx('sparkle', { delay: 0.1 });
    this.haptic('medium');
    this.sparks.burst(new THREE.Vector3(g.x, 1.2, g.z), { count: 90, colors: [0xffc23a, 0x4edea3, 0xffffff], speed: [1, 3.5], gravity: 1.5, life: [0.6, 1.2] });
    this.stage.setBloom(1.6);
    void this.tw.progress({ duration: 900, onUpdate: (k) => this.stage.setBloom(1.6 - 0.9 * k) });
    void this.say([{ text: m.def.nameAr, lang: 'ar' }, { text: m.def.nameEn, lang: 'en' }], 'sparky');
    this.engine.scenes.prefetch(m.def.scene);
    // 2. camera swings round behind Adam to frame the landmark through the arch
    const inX = -Math.sin(g.yaw);
    const inZ = -Math.cos(g.yaw);
    await this.moveCamera(
      { x: g.x - inX * 6.5, y: 3.4, z: g.z - inZ * 6.5 },
      { x: m.def.at.x, y: m.def.height * 0.35, z: m.def.at.z },
      this.reduced ? 300 : 1000,
      Ease.cubicInOut,
    );
    // 3. Adam runs through the portal
    this.adam.setPose('run');
    void this.tw.to(this.pos, { x: g.x + inX * 1.0, z: g.z + inZ * 1.0 }, { duration: 420, ease: Ease.quadIn });
    await this.wait(260);
    // 4. themed transition, centred on the landmark
    const at = this.screenOf(new THREE.Vector3(m.def.at.x, m.def.height * 0.35, m.def.at.z));
    if (m.def.id !== 'stickers') useGame.getState().setLastVisited(m.def.id);
    void this.engine.scenes.goto(m.def.scene, { at: { x: at.x, y: at.y }, data: { from: 'world' } });
  }

  private async lockedHint(m: Landmark) {
    // bump gently back out of the arch
    const g = gateOf(m.def);
    this.vel.set(Math.sin(g.yaw) * 6, 0, Math.cos(g.yaw) * 6);
    this.moveTarget = null;
    this.sfx('softBump');
    this.haptic('tiny');
    void (async () => {
      for (const r of [-0.25, 0.25, -0.15, 0.15, 0]) await this.tw.to(m.lock.rotation, { z: r }, { duration: 70 });
    })();
    if (this.hinting) return;
    this.hinting = true;
    this.engine.speech.cancel();
    await this.say([{ text: `${m.def.nameAr} لسا مسكرة. العب أكثر لتفتحها!`, lang: 'ar' }], 'sparky');
    this.hinting = false;
  }

  // ------------------------------------------------------------------ daily gift
  /** Daily surprise: once per local day. No streaks, no pressure. */
  private async openGift() {
    const g = this.gift;
    if (!g.visible || this.busy || this.giftOpening) return;
    this.giftOpening = true;
    this.busy = true; // no travelling away mid-gift
    this.moveTarget = null;
    this.vel.set(0, 0, 0);
    this.controls.setVisible(false);
    const store = useGame.getState();
    // grant the reward in the same step as the claim, so leaving mid-animation never loses it
    store.claimDailyGift(localDay());
    const giftSticker = dailyGiftSticker(store.save.stickers, store.save.skills);
    const isNew = !!giftSticker && useGame.getState().addSticker(giftSticker);
    useGame.getState().addStars(3);
    this.engine.speech.cancel();
    this.facing = Math.atan2(GIFT_AT.x - this.pos.x, GIFT_AT.z - this.pos.z);
    this.adam.excited();
    for (const r of [-0.2, 0.2, -0.14, 0.14, 0]) await this.tw.to(g.rotation, { z: r }, { duration: 70 });
    this.sfx('chest');
    this.sfx('unlock', { delay: 0.15 });
    this.haptic('medium');
    this.adam.setPose('cheer');
    void this.tw.to(this.giftLid.position, { y: 2.6 }, { duration: 520, ease: Ease.cubicOut });
    void this.tw.to(this.giftLid.rotation, { x: 1.2, z: 0.5 }, { duration: 520 });
    const top = new THREE.Vector3(GIFT_AT.x, 1, GIFT_AT.z);
    this.sparks.burst(top, { count: 140, colors: [0xff6fb5, 0xffc23a, 0x4edea3, 0xffffff], speed: [1.5, 4.5], gravity: 3, life: [0.8, 1.5] });
    this.sparky.excited = true;
    await this.say([{ text: 'مفاجأة اليوم!', lang: 'ar' }, { text: 'Surprise!', lang: 'en' }], 'sparky');
    const from = this.screenOf(top);
    if (giftSticker && isNew) await showStickerReveal(this, giftSticker, { from: { x: from.x, y: from.y }, intro: false });
    await this.flyStarsFrom3D(top, 3, { credit: false });
    await this.tw.to(g.scale, { x: 0.01, y: 0.01, z: 0.01 }, { duration: 300, ease: Ease.backIn });
    g.visible = false;
    this.offTap3D(g);
    this.sparky.excited = false;
    this.adam.happy();
    this.adam.setPose('idle');
    this.giftOpening = false;
    this.busy = false;
    this.controls.setVisible(true);
    this.updateA11y();
  }

  destroy() {
    this.adam?.dispose();
    super.destroy();
  }
}
