import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;
let ready: Promise<Rapier> | null = null;

/** Load the Rapier WASM physics engine once (inlined in the bundle → works offline). */
export function loadPhysics(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

const STEP = 1 / 60;

/**
 * Thin wrapper over a Rapier world: fixed-timestep stepping, helpers for static colliders,
 * a dynamic ball and kinematic players.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private acc = 0;
  timeScale = 1;

  constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
  }

  fixedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, o: { restitution?: number; friction?: number; rotY?: number; sensor?: boolean } = {}) {
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(quatY(o.rotY ?? 0)),
    );
    const c = this.R.ColliderDesc.cuboid(hx, hy, hz)
      .setRestitution(o.restitution ?? 0.3)
      .setFriction(o.friction ?? 0.6)
      .setSensor(o.sensor ?? false);
    return this.world.createCollider(c, body);
  }

  /** Cylinder along an axis ('y' upright posts, 'x' crossbar). */
  fixedCylinder(x: number, y: number, z: number, halfH: number, r: number, axis: 'x' | 'y' = 'y', restitution = 0.6) {
    const rot = axis === 'x' ? { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } : { x: 0, y: 0, z: 0, w: 1 };
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(rot));
    return this.world.createCollider(this.R.ColliderDesc.cylinder(halfH, r).setRestitution(restitution).setFriction(0.3), body);
  }

  ball(r: number, x: number, y: number, z: number) {
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.35).setAngularDamping(0.6).setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      this.R.ColliderDesc.ball(r).setRestitution(0.62).setFriction(0.7).setDensity(0.6),
      body,
    );
    return { body, collider };
  }

  kinematicCapsule(halfH: number, r: number, x: number, y: number, z: number) {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const collider = this.world.createCollider(this.R.ColliderDesc.capsule(halfH, r).setRestitution(0.2).setFriction(0.8), body);
    return { body, collider };
  }

  /** Advance with a fixed timestep; returns the number of substeps run. */
  step(dt: number, onStep?: (h: number) => void) {
    this.acc += Math.min(dt, 0.1) * this.timeScale;
    let n = 0;
    while (this.acc >= STEP && n < 5) {
      onStep?.(STEP);
      this.world.step();
      this.acc -= STEP;
      n++;
    }
    return n;
  }

  dispose() {
    this.world.free();
  }
}

export function quatY(a: number) {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}
