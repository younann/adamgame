import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { font } from '@/design-system/tokens';
import type { Hero3D } from '../../three/Hero3D';

const toy = (color: number, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, ...o });

function plateTexture(num: string, bg: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = bg;
  g.font = `900 92px ${font.display}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(num, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A chunky toy go-kart with a seated Hero3D driver: glossy body, big soft tyres that spin,
 * steering wheel, spoiler, number plates and exhaust flames that roar on NITRO.
 * Origin = road level under the kart centre; faces −Z (down the road).
 */
export class Kart3D {
  readonly root = new THREE.Group();
  /** body tilts/rolls (wheels stay on the road) */
  private body = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private frontPivots: THREE.Group[] = [];
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private wheel: THREE.Group;
  nitro = 0;

  constructor(color: number, accent: number, num: string, readonly driver: Hero3D) {
    const paint = toy(color);
    const trim = toy(accent);
    const dark = toy(0x1c2238, { clearcoat: 0.2, roughness: 0.6 });
    const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.32, 2.1, 4, 0.14), paint);
    chassis.position.y = 0.36;
    const nose = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.26, 0.7, 4, 0.12), paint);
    nose.position.set(0, 0.42, -1.05);
    const bumper = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.16, 0.22, 3, 0.07), trim);
    bumper.position.set(0, 0.3, -1.42);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.55, 0.22, 3, 0.1), dark);
    seat.position.set(0, 0.72, 0.62);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.6), trim);
    stripe.position.set(0, 0.525, -0.25);
    // spoiler
    const wing = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.08, 0.36, 2, 0.03), trim);
    wing.position.set(0, 0.95, 1.05);
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.12), dark);
      strut.position.set(s * 0.45, 0.72, 1.05);
      this.body.add(strut);
    }
    // number plates on the sides + nose
    const plate = new THREE.MeshStandardMaterial({ map: plateTexture(num, `#${color.toString(16).padStart(6, '0')}`), roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), plate);
      p.position.set(s * 0.632, 0.38, 0.1);
      p.rotation.y = s * Math.PI / 2;
      this.body.add(p);
    }
    // steering wheel
    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 20), dark);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), dark);
    column.rotation.x = Math.PI / 2;
    column.position.z = 0.17;
    this.wheel.add(rim, column);
    this.wheel.position.set(0, 0.78, -0.05);
    this.wheel.rotation.x = -0.6;
    // exhausts + flames
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const s of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 10), toy(0xc8ccd8, { metalness: 0.7 }));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(s * 0.3, 0.4, 1.15);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 10, 1, true), this.flameMat);
      flame.rotation.x = Math.PI / 2; // apex points backwards (+Z)
      flame.position.set(s * 0.3, 0.4, 1.5);
      this.flames.push(flame);
      this.body.add(pipe, flame);
    }
    this.body.add(chassis, nose, bumper, seat, stripe, wing, this.wheel);
    // driver sits in the seat, facing down the road
    driver.root.scale.setScalar(0.82);
    driver.root.position.set(0, 0.2, 0.32);
    driver.root.rotation.y = Math.PI;
    Object.assign(driver.act, { legL: 1.45, legR: 1.45, kneeL: 1.25, kneeR: 1.25, armL: 1.15, armR: 1.15, elbowL: -0.55, elbowR: -0.55, armLz: 0.1, armRz: -0.1 });
    this.body.add(driver.root);
    // tyres
    const tyre = toy(0x1a1a22, { clearcoat: 0.1, roughness: 0.7 });
    const hub = toy(0xffffff, { metalness: 0.3 });
    for (const [x, z, r] of [[-0.72, -0.78, 0.26], [0.72, -0.78, 0.26], [-0.74, 0.72, 0.32], [0.74, 0.72, 0.32]] as const) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 20), tyre);
      w.rotation.z = Math.PI / 2;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.32, 12), hub);
      cap.rotation.z = Math.PI / 2;
      const spin = new THREE.Group();
      spin.add(w, cap);
      const pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      pivot.add(spin);
      this.wheels.push(spin);
      if (z < 0) this.frontPivots.push(pivot);
      this.root.add(pivot);
    }
    this.root.add(this.body);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !this.flames.includes(o as THREE.Mesh)) o.castShadow = true;
    });
  }

  /** speed m/s, lateral steer velocity (m/s, + = right) */
  update(dt: number, speed: number, steerVel: number, t: number) {
    for (const w of this.wheels) w.rotation.x -= (speed * dt) / 0.3;
    const yaw = THREE.MathUtils.clamp(-steerVel * 0.06, -0.35, 0.35);
    for (const p of this.frontPivots) p.rotation.y += (yaw * 1.5 - p.rotation.y) * Math.min(1, dt * 10);
    this.body.rotation.y += (yaw - this.body.rotation.y) * Math.min(1, dt * 6);
    this.body.rotation.z += (THREE.MathUtils.clamp(steerVel * 0.025, -0.12, 0.12) - this.body.rotation.z) * Math.min(1, dt * 6);
    this.body.position.y = Math.abs(Math.sin(t * (8 + speed * 0.4))) * 0.012 * Math.min(1, speed / 6);
    this.wheel.rotation.z = -yaw * 2.5;
    // flames: a lick at cruise, a roar on nitro
    const f = 0.35 + this.nitro * 1.6 + Math.sin(t * 40) * 0.12;
    for (const fl of this.flames) {
      fl.scale.set(0.8 + this.nitro, f, 0.8 + this.nitro);
      fl.position.z = 1.3 + f * 0.25;
    }
    this.flameMat.color.setHex(this.nitro > 0.3 ? 0x6fd0ff : 0xffa040);
    this.flameMat.opacity = speed > 1 ? 0.85 : 0.2;
    this.driver.update(dt);
  }
}
