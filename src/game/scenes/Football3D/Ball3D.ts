import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../../three/physics';
import { BALL_R, makeFootball } from './props';

/** The match ball: Rapier rigid body + mesh, with a "super-shot" glow mode. */
export class Ball3D {
  readonly mesh: THREE.Mesh;
  readonly body: RAPIER.RigidBody;
  private glow: THREE.PointLight;
  private aura: THREE.Mesh;
  private superOn = false;

  constructor(private readonly phys: PhysicsWorld, x: number, z: number) {
    this.mesh = makeFootball();
    const { body } = phys.ball(BALL_R, x, BALL_R + 0.02, z);
    this.body = body;
    this.glow = new THREE.PointLight(0xffc23a, 0, 4, 2);
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 1.9, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.add(this.glow, this.aura);
  }

  get pos(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get vel(): THREE.Vector3 {
    const v = this.body.linvel();
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  get speed() {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  setVel(v: THREE.Vector3) {
    this.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
  }

  teleport(x: number, y: number, z: number) {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  setSuper(on: boolean) {
    this.superOn = on;
  }

  get isSuper() {
    return this.superOn;
  }

  /** Copy physics → mesh. */
  sync(t: number) {
    const p = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    const target = this.superOn ? 1 : 0;
    const m = this.aura.material as THREE.MeshBasicMaterial;
    m.opacity += ((this.superOn ? 0.35 + Math.sin(t * 12) * 0.12 : 0) - m.opacity) * 0.15;
    this.glow.intensity += (target * (6 + Math.sin(t * 12) * 2) - this.glow.intensity) * 0.15;
  }
}
