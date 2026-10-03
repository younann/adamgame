import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { Scene } from '../engine/Scene';
import { Ease } from '../engine/Tween';
import { disposeObject, type StageLook, type ThreeStage } from './ThreeStage';

export interface Tap3DOptions {
  /** object squashed on press (defaults to the hit target) */
  visual?: THREE.Object3D;
  sound?: Parameters<Scene['sfx']>[0] | null;
}

/**
 * Base for 3D worlds. Owns a THREE.Scene + perspective camera rendered by the engine's
 * ThreeStage underneath the (now transparent) Pixi canvas. The inherited Pixi `overlay`
 * stays available for HUD-like effects: big arcade text, stars flying to the HUD, etc.
 *
 * Taps: Pixi sits on top, so a full-screen hit area on `world` forwards taps to a raycast
 * against registered 3D targets.
 */
export abstract class Scene3D extends Scene {
  readonly is3D = true;
  readonly s3 = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  stage!: ThreeStage;
  /** extra 3D per-frame updaters (mixers, particles, shaders) */
  protected updaters: ((dt: number, t: number) => void)[] = [];
  private tapTargets = new Map<THREE.Object3D, { onTap: () => void; o: Tap3DOptions }>();
  private shakeT = 0;
  private shakeAmp = 0;
  /** camera rig: position + look target (tweenable plain objects) */
  readonly camPos = { x: 0, y: 5, z: 10 };
  readonly camLook = { x: 0, y: 0, z: 0 };
  camFov = 45;

  protected abstract stageLook(): StageLook;
  /** Build the 3D content (called from build()). */
  protected abstract build3D(): void;
  /** Async 3D loading (models) — runs during the transition cover. */
  protected async load3D(): Promise<void> {}

  async load() {
    this.stage = this.engine.getThreeStage();
    await this.load3D();
  }

  /** soft light that travels with the camera so faces are never in shadow */
  readonly camFill = new THREE.DirectionalLight(0xfff4e6, 0.9);

  build() {
    this.stage.setScene(this.s3, this.cam, this.stageLook());
    this.camFill.position.set(0.4, 0.6, 1);
    this.camFill.target.position.set(0, 0, -1);
    this.cam.add(this.camFill, this.camFill.target);
    this.s3.add(this.cam);
    this.world.eventMode = 'static';
    this.world.on('pointerdown', (e: FederatedPointerEvent) => this.onPointer(e, 'down'));
    this.world.on('pointertap', (e: FederatedPointerEvent) => this.onPointer(e, 'tap'));
    this.build3D();
  }

  resize(w: number, h: number) {
    super.resize(w, h);
    this.world.hitArea = new Rectangle(-w, -h, w * 3, h * 3);
    this.stage.resize(w, h);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  /** Register a tappable 3D object. */
  onTap3D(obj: THREE.Object3D, onTap: () => void, o: Tap3DOptions = {}) {
    this.tapTargets.set(obj, { onTap, o });
  }

  offTap3D(obj: THREE.Object3D) {
    this.tapTargets.delete(obj);
  }

  private findTarget(hit: THREE.Object3D | null) {
    for (let n = hit; n; n = n.parent) {
      const t = this.tapTargets.get(n);
      if (t) return { obj: n, ...t };
    }
    return null;
  }

  private onPointer(e: FederatedPointerEvent, kind: 'down' | 'tap') {
    const hit = this.stage.pick(e.global.x, e.global.y, [...this.tapTargets.keys()].filter((o) => o.visible));
    const t = this.findTarget(hit?.object ?? null);
    if (!t) return;
    if (kind === 'down') {
      const vis = t.o.visual ?? t.obj;
      const s = vis.userData.baseScale ?? (vis.userData.baseScale = vis.scale.clone());
      if (!this.tw.isTweening(vis.scale)) {
        void this.tw.to(vis.scale, { x: s.x * 1.12, y: s.y * 0.86, z: s.z * 1.12 }, { duration: 80 }).then(() =>
          this.tw.to(vis.scale, { x: s.x, y: s.y, z: s.z }, { duration: 420, ease: Ease.elasticOut }),
        );
      }
      if (t.o.sound !== null) this.sfx(t.o.sound ?? 'press');
      this.haptic('tiny');
    } else {
      t.onTap();
    }
  }

  /** Tap a 3D object at a screen point (used by on-screen controls). Returns true if handled. */
  tapAt(x: number, y: number): boolean {
    const hit = this.stage.pick(x, y, [...this.tapTargets.keys()].filter((o) => o.visible));
    const t = this.findTarget(hit?.object ?? null);
    if (!t) return false;
    const vis = t.o.visual ?? t.obj;
    const s = vis.userData.baseScale ?? (vis.userData.baseScale = vis.scale.clone());
    if (!this.tw.isTweening(vis.scale)) {
      void this.tw.to(vis.scale, { x: s.x * 1.12, y: s.y * 0.86, z: s.z * 1.12 }, { duration: 80 }).then(() =>
        this.tw.to(vis.scale, { x: s.x, y: s.y, z: s.z }, { duration: 420, ease: Ease.elasticOut }),
      );
    }
    if (t.o.sound !== null) this.sfx(t.o.sound ?? 'press');
    this.haptic('tiny');
    t.onTap();
    return true;
  }

  /** Screen point → point on the ground plane (y = 0), or null. */
  groundAt(x: number, y: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.cam);
    const p = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  /** Soft studio reflections / image-based lighting (big quality boost for smooth materials). */
  useStudioEnvironment(intensity = 0.6) {
    const pm = new THREE.PMREMGenerator(this.stage.renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.s3.environment = env;
    this.s3.environmentIntensity = intensity;
  }

  /** Smoothly move the camera rig. */
  moveCamera(pos: Partial<typeof this.camPos>, look: Partial<typeof this.camLook>, ms = 700, ease = Ease.cubicInOut, fov?: number) {
    if (this.reduced) ms = Math.min(ms, 300);
    const p: Promise<void>[] = [
      this.tw.to(this.camPos, pos as Record<string, number>, { duration: ms, ease }),
      this.tw.to(this.camLook, look as Record<string, number>, { duration: ms, ease }),
    ];
    if (fov !== undefined) p.push(this.tw.to(this as unknown as Record<string, number>, { camFov: fov }, { duration: ms, ease }));
    return this.guard(Promise.all(p).then(() => undefined));
  }

  shake3D(amp = 0.12, ms = 400) {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = ms / 1000;
  }

  /** 3D world point → screen CSS px (for stars flying to the HUD, captions…). */
  screenOf(v: THREE.Vector3) {
    return this.stage.project(v);
  }

  /** Stars burst from a 3D point into the HUD. */
  flyStarsFrom3D(v: THREE.Vector3, count: number, opts?: { credit?: boolean }) {
    const p = this.screenOf(v);
    // flyStarsToHud expects 2D world coords; the 2D camera is identity in 3D scenes
    return this.flyStarsToHud(p.x, p.y, count, opts);
  }

  update(dtMs: number) {
    super.update(dtMs);
    const dt = Math.min(dtMs / 1000, 0.05);
    for (const u of this.updaters) u(dt, this.time);
    // camera rig + shake
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * 2.5;
      sx = (Math.random() - 0.5) * this.shakeAmp * k;
      sy = (Math.random() - 0.5) * this.shakeAmp * k;
    }
    this.cam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.cam.lookAt(this.camLook.x, this.camLook.y, this.camLook.z);
    if (Math.abs(this.cam.fov - this.camFov) > 0.01) {
      this.cam.fov = this.camFov;
      this.cam.updateProjectionMatrix();
    }
  }

  destroy() {
    this.tapTargets.clear();
    this.updaters = [];
    this.stage.clearScene();
    disposeObject(this.s3);
    this.s3.environment?.dispose();
    this.s3.environment = null;
    this.s3.clear();
    super.destroy();
  }
}
