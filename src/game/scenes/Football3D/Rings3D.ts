import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ChallengeChoice } from '@/learning/types';
import { conceptColor } from '@/design-system/tokens';
import { makeBoard } from './props';

/**
 * A challenge gate on the pitch: a glowing circle with a pillar of light and a floating sign
 * (number board, colour orb or picture card). Adam runs INTO the right one.
 */
export class ChoiceRing {
  readonly group = new THREE.Group();
  readonly radius = 0.95;
  private disc: THREE.Mesh;
  private ring: THREE.Mesh;
  private beam: THREE.Mesh;
  readonly sign: THREE.Object3D;
  private flash = 0;
  private pulse = 0;
  private cooldown = 0;
  removed = false;

  constructor(readonly choice: ChallengeChoice, picture: THREE.Texture | null) {
    const tint = choice.visual.kind === 'color' ? (conceptColor[choice.visual.key] ?? 0xffffff) : 0x4edea3;
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius, 48),
      new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.02;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(this.radius, 0.06, 12, 64), new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 2.4 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius * 0.95, this.radius, 2.6, 40, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(tint) }, uA: { value: 0.35 } },
        vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(uColor, uA * pow(1.0 - vY, 2.0)); }',
      }),
    );
    this.beam.position.y = 1.3;
    if (choice.visual.kind === 'number' || choice.value !== undefined) {
      this.sign = makeBoard(choice.value ?? 0);
      this.sign.scale.setScalar(0.85);
    } else if (choice.visual.kind === 'color') {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.2, clearcoat: 1, emissive: tint, emissiveIntensity: 0.25 }));
      this.sign = orb;
    } else {
      const card = new THREE.Group();
      const frame = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.1, 0.16, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.8 }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), new THREE.MeshBasicMaterial({ map: picture, transparent: true }));
      face.position.z = 0.085;
      card.add(frame, face);
      this.sign = card;
    }
    this.sign.position.y = 2.1;
    this.group.add(this.disc, this.ring, this.beam, this.sign);
    this.group.scale.setScalar(0.01);
  }

  /** Is a point (XZ) inside the gate? */
  contains(p: THREE.Vector3) {
    return Math.hypot(p.x - this.group.position.x, p.z - this.group.position.z) < this.radius * 0.85;
  }

  canTrigger() {
    return this.cooldown <= 0 && !this.removed;
  }

  wrong() {
    this.flash = 1;
    this.cooldown = 1.6;
  }

  highlight() {
    this.pulse = 3;
  }

  update(dt: number, t: number, camPos: THREE.Vector3) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.pulse = Math.max(0, this.pulse - dt);
    this.sign.position.y = 2.1 + Math.sin(t * 2 + this.group.position.x) * 0.08;
    // face the camera (billboard around Y)
    const p = this.group.position;
    this.sign.rotation.y = Math.atan2(camPos.x - p.x, camPos.z - p.z);
    this.ring.rotation.z = t * 0.6;
    const pul = this.pulse > 0 ? 1 + Math.sin(t * 10) * 0.08 : 1;
    this.ring.scale.setScalar(pul);
    (this.beam.material as THREE.ShaderMaterial).uniforms.uA.value = 0.28 + (this.pulse > 0 ? 0.25 : 0) + Math.sin(t * 3) * 0.04;
    (this.disc.material as THREE.MeshBasicMaterial).opacity = 0.25 + this.flash * 0.3 + (this.pulse > 0 ? 0.25 : 0);
    this.sign.position.x = this.flash > 0 ? Math.sin(t * 60) * 0.08 * this.flash : 0;
  }
}

/** Collectible golden star for counting challenges. */
export function makeCollectStar(): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.32 : 0.14;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 4 });
  geo.center();
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffc23a, metalness: 0.6, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.6, clearcoat: 1 }));
  m.castShadow = true;
  return m;
}
