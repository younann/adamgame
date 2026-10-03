import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Hero3D } from '../../three/Hero3D';
import type { PhysicsWorld } from '../../three/physics';
import type { Ball3D } from './Ball3D';
import { GOAL } from './Stadium3D';

type KState = 'guard' | 'dive' | 'down' | 'hold' | 'throw';

/**
 * Goalkeeper AI: shadows the ball along the goal line, predicts shots, dives (a kinematic
 * body, so real physics decides saves), catches slow balls and throws them back to Adam.
 * Difficulty is kid-friendly: normal shots are saved about half the time, super-shots never.
 */
export class Keeper3D {
  readonly hero: Hero3D;
  readonly body: RAPIER.RigidBody;
  private state: KState = 'guard';
  private x = 0;
  private diveT = 0;
  private diveFrom = 0;
  private diveTo = 0;
  private diveDir = 0;
  private reactAt = -1;
  private holdT = 0;
  private decided = false;
  onSave?: () => void;
  onThrow?: () => void;
  private readonly lineZ = GOAL.z + 0.55;

  constructor(private readonly phys: PhysicsWorld) {
    this.hero = new Hero3D({
      skin: 0xc98e62, hair: 0x1a1010, hairStyle: 'short', eyes: 0x2a1a10,
      shirt: 0x8b3dff, shirtTrim: 0xff8a1f, shorts: 0x2a1a55, socks: 0x8b3dff, shoes: 0x222222, shoeStripe: 0xff8a1f,
      number: '1', gloves: 0xff8a1f, headband: 0xff8a1f,
    });
    this.hero.root.scale.setScalar(0.92);
    this.hero.setPose('ready');
    const { body } = phys.kinematicCapsule(0.42, 0.32, 0, 0.75, this.lineZ);
    this.body = body;
  }

  get busy() {
    return this.state !== 'guard';
  }

  get holding() {
    return this.state === 'hold';
  }

  reset() {
    this.state = 'guard';
    this.x = 0;
    this.hero.root.rotation.z = 0;
    this.hero.setPose('ready');
    this.decided = false;
  }

  update(dt: number, t: number, ball: Ball3D, adam: THREE.Vector3) {
    const bp = ball.pos;
    const bv = ball.vel;
    switch (this.state) {
      case 'guard': {
        // shadow the ball, a bit lazily
        const want = THREE.MathUtils.clamp(bp.x * 0.55, -GOAL.halfW + 0.6, GOAL.halfW - 0.6);
        this.x += THREE.MathUtils.clamp(want - this.x, -2.6 * dt, 2.6 * dt);
        this.hero.setPose(Math.abs(want - this.x) > 0.05 ? 'ready' : 'ready');
        // shot detection
        if (bv.z < -4 && bp.z < 0 && bp.z > this.lineZ + 0.3) {
          if (!this.decided) {
            this.decided = true;
            const tHit = (this.lineZ - bp.z) / bv.z;
            const px = bp.x + bv.x * tHit;
            const inGoal = Math.abs(px) < GOAL.halfW + 0.3;
            if (inGoal) {
              const save = !ball.isSuper && Math.random() < 0.35;
              // a "save" dives to the ball; otherwise the keeper guesses (often wrong, or late)
              const guess = save ? px : Math.random() < 0.6 ? -Math.sign(px || 1) * (1 + Math.random()) : px * 0.4;
              this.diveFrom = this.x;
              this.diveTo = THREE.MathUtils.clamp(guess, -GOAL.halfW + 0.2, GOAL.halfW - 0.2);
              this.diveDir = Math.sign(this.diveTo - this.x) || 1;
              this.reactAt = t + (ball.isSuper ? 0.45 : save ? 0.08 : 0.16);
            }
          }
          if (this.reactAt > 0 && t >= this.reactAt) {
            this.reactAt = -1;
            this.state = 'dive';
            this.diveT = 0;
            this.hero.setPose('cheer');
          }
        } else if (bv.z > -1) {
          this.decided = false;
        }
        break;
      }
      case 'dive': {
        this.diveT += dt;
        const k = Math.min(1, this.diveT / 0.38);
        const e = 1 - (1 - k) * (1 - k);
        this.x = this.diveFrom + (this.diveTo - this.diveFrom) * e;
        this.hero.root.rotation.z = -this.diveDir * 1.3 * e;
        if (this.diveT > 0.5) {
          this.state = 'down';
          this.diveT = 0;
        }
        break;
      }
      case 'down': {
        this.diveT += dt;
        // a slow ball near the keeper is caught
        const near = Math.hypot(bp.x - this.x, bp.z - this.lineZ) < 1.4 && ball.speed < 6 && bp.y < 1.6;
        if (near && !ball.isSuper) {
          this.state = 'hold';
          this.holdT = 0;
          this.onSave?.();
          break;
        }
        if (this.diveT > 1.0) {
          this.hero.root.rotation.z *= 0.85;
          if (Math.abs(this.hero.root.rotation.z) < 0.05) this.reset();
        }
        break;
      }
      case 'hold': {
        this.holdT += dt;
        this.hero.root.rotation.z *= 0.85;
        this.hero.setPose('idle');
        ball.teleport(this.x, 0.9, this.lineZ + 0.45);
        if (this.holdT > 1.1) {
          // underarm throw back towards Adam
          const to = adam.clone().sub(new THREE.Vector3(this.x, 0, this.lineZ));
          const d = Math.max(1, to.length());
          to.normalize();
          ball.teleport(this.x, 1.0, this.lineZ + 0.6);
          ball.setVel(new THREE.Vector3(to.x * Math.min(9, d * 0.9), 4.2, to.z * Math.min(9, d * 0.9)));
          this.state = 'throw';
          this.holdT = 0;
          this.onThrow?.();
        }
        break;
      }
      case 'throw':
        this.holdT += dt;
        if (this.holdT > 0.6) this.reset();
        break;
    }
    const lying = this.state === 'dive' || this.state === 'down';
    this.body.setNextKinematicTranslation({ x: this.x + (lying ? this.diveDir * 0.2 : 0), y: lying ? 0.45 : 0.75, z: this.lineZ });
    const rz = lying ? -this.diveDir * Math.PI / 2 * 0.95 : 0;
    this.body.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(rz / 2), w: Math.cos(rz / 2) });
    this.hero.root.position.set(this.x, lying ? 0.15 : 0, this.lineZ);
    this.hero.update(dt);
  }
}
