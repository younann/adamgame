import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { conceptColor } from '@/design-system/tokens';
import type { ChallengeChoice } from '@/learning/types';
import type { CreatureKind } from '../HeroCityScene/Creature';
import { makeBoard } from '../Football3D/props';
import { PORTAL_R } from './flight';

const toy = (color: number, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4), ...o });

function ball(r: number, mat: THREE.Material, seg = 24) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
  m.castShadow = true;
  return m;
}

/**
 * A trapped little friend in 3D (kitten, lion cub, puppy, bunny) — soft toy made of spheres,
 * glossy eyes, inside an energy bubble on a hover pad. Origin at the feet; ~0.9 units tall.
 * Once freed it rides its own little glowing hover disc and follows Adam.
 */
export class Creature3D {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private tail: THREE.Mesh;
  private bubble: THREE.Mesh;
  private bubbleRing: THREE.Mesh;
  private pad: THREE.Group;
  private eyes: THREE.Group[] = [];
  private smile: THREE.Mesh;
  private frown: THREE.Mesh;
  private t = Math.random() * 5;
  trapped = true;
  happy = false;

  constructor(readonly kind: CreatureKind) {
    const fur = toy(kind.fur);
    const belly = toy(kind.belly);
    const dark = toy(new THREE.Color(kind.fur).multiplyScalar(0.7).getHex());
    const torso = ball(0.26, fur);
    torso.scale.set(1, 0.95, 0.9);
    torso.position.y = 0.3;
    const tummy = ball(0.16, belly);
    tummy.position.set(0, 0.28, 0.13);
    tummy.scale.z = 0.6;
    const head = new THREE.Group();
    head.position.y = 0.68;
    const skull = ball(0.27, fur, 32);
    const muzzle = ball(0.12, belly);
    muzzle.position.set(0, -0.07, 0.21);
    muzzle.scale.set(1.2, 0.8, 0.8);
    const nose = ball(0.035, toy(0xff6f91, { clearcoat: 1 }));
    nose.position.set(0, -0.02, 0.31);
    head.add(skull, muzzle, nose);
    if (kind.ears === 'mane') {
      const mane = toy(0xc2410c);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const m = ball(0.1, mane, 12);
        m.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, -0.05);
        head.add(m);
      }
    } else if (kind.ears === 'round') {
      for (const s of [-1, 1]) {
        const e = ball(0.1, dark, 16);
        e.scale.set(0.7, 1.4, 0.5);
        e.position.set(s * 0.26, 0.04, 0);
        e.rotation.z = s * 0.3;
        head.add(e);
      }
    } else {
      const tall = kind.key === 'bunny' ? 2.3 : 1;
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2 * tall, 12), fur);
        e.position.set(s * 0.15, 0.24 + 0.08 * tall, 0);
        e.rotation.z = -s * 0.25;
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14 * tall, 10), toy(0xff9ec7));
        inner.position.set(0, -0.01, 0.03);
        e.add(inner);
        head.add(e);
      }
    }
    // glossy eyes with highlights (open) — happy face uses squint arcs
    const eyeMat = toy(0x1b1f2a, { clearcoat: 1, roughness: 0.15, sheen: 0 });
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const e = ball(0.05, eyeMat, 16);
      const h = ball(0.016, shine, 8);
      h.position.set(0.015, 0.018, 0.04);
      g.add(e, h);
      g.position.set(s * 0.1, 0.04, 0.23);
      head.add(g);
      this.eyes.push(g);
    }
    const mouthMat = toy(0x6b1b24, { clearcoat: 0 });
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), mouthMat);
    this.smile.rotation.z = Math.PI;
    this.smile.position.set(0, -0.1, 0.3);
    this.frown = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 16, Math.PI), mouthMat);
    this.frown.position.set(0, -0.14, 0.3);
    head.add(this.smile, this.frown);
    for (const s of [-1, 1]) {
      const paw = ball(0.08, dark, 12);
      paw.scale.set(1, 0.7, 1.2);
      paw.position.set(s * 0.14, 0.05, 0.08);
      this.body.add(paw);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: 0xff7a8a, transparent: true, opacity: 0.5 }));
      blush.position.set(s * 0.17, -0.05, 0.25);
      blush.rotation.y = s * 0.5;
      head.add(blush);
    }
    this.tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.26, 4, 8), dark);
    this.tail.geometry.translate(0, 0.13, 0);
    this.tail.position.set(0, 0.22, -0.22);
    this.tail.rotation.x = -0.9;
    this.body.add(torso, tummy, head, this.tail);
    this.root.add(this.body);

    // hover pad (stays under the friend, also when it follows Adam)
    this.pad = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.08, 32), toy(0x2a3a7a, { sheen: 0 }));
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 40), new THREE.MeshStandardMaterial({ color: 0x4edea3, emissive: 0x4edea3, emissiveIntensity: 2.5 }));
    glowRing.rotation.x = -Math.PI / 2;
    const jet = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.5, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4edea3, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    jet.rotation.x = Math.PI;
    jet.position.y = -0.3;
    this.pad.add(disc, glowRing, jet);
    this.pad.position.y = -0.05;
    this.root.add(this.pad);

    // energy bubble cage
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 24),
      new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, emissive: 0x3a7bff, emissiveIntensity: 0.25, depthWrite: false }),
    );
    this.bubble.position.y = 0.48;
    this.bubbleRing = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.02, 8, 48), new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x67e8f9, emissiveIntensity: 2.4 }));
    this.bubbleRing.position.y = 0.48;
    this.root.add(this.bubble, this.bubbleRing);
    this.setFace();
  }

  private setFace() {
    const happy = this.happy || !this.trapped;
    this.smile.visible = happy;
    this.frown.visible = !happy;
    for (const e of this.eyes) e.scale.y = happy ? 0.45 : 1;
  }

  setHappy(on: boolean) {
    this.happy = on;
    this.setFace();
  }

  free() {
    this.trapped = false;
    this.bubble.visible = false;
    this.bubbleRing.visible = false;
    this.setFace();
  }

  /** world position of the bubble centre (for bursts) */
  get center() {
    return this.root.localToWorld(new THREE.Vector3(0, 0.48, 0));
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.tail.rotation.z = Math.sin(t * (this.happy ? 14 : 3)) * (this.happy ? 0.7 : 0.25);
    this.body.position.y = this.happy ? Math.abs(Math.sin(t * 7)) * 0.12 : Math.sin(t * 2) * 0.01;
    this.body.rotation.z = this.trapped ? Math.sin(t * 1.5) * 0.08 : 0;
    this.pad.rotation.y = t * 1.5;
    if (this.trapped) {
      const s = 1 + Math.sin(t * 3) * 0.03;
      this.bubble.scale.setScalar(s);
      this.bubbleRing.rotation.set(t * 1.1, t * 0.7, 0);
    }
  }
}

/**
 * A choice portal floating in the sky: a big glowing ring in the choice's colour, a swirling
 * energy surface and the choice's sign in the middle (colour orb / number board / picture
 * card). Adam flies THROUGH the right one.
 */
export class SkyPortal {
  readonly group = new THREE.Group();
  readonly hue: number;
  private ringMat: THREE.MeshStandardMaterial;
  private swirlU = { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uA: { value: 0.55 }, uOpen: { value: 0 } };
  readonly sign: THREE.Object3D;
  private ring: THREE.Mesh;
  private flash = 0;
  private pulse = 0;
  private cooldown = 0;
  private shake = 0;
  removed = false;

  constructor(readonly choice: ChallengeChoice, picture: THREE.Texture | null) {
    const isColor = choice.visual.kind === 'color';
    const raw = isColor ? (conceptColor[choice.visual.key] ?? 0x38a8ff) : 0x38a8ff;
    // keep black/very dark colours visible as light
    this.hue = raw === conceptColor.black ? 0x8890ff : raw;
    this.swirlU.uColor.value.set(this.hue);
    this.ringMat = new THREE.MeshStandardMaterial({ color: this.hue, emissive: this.hue, emissiveIntensity: 2.2, roughness: 0.3 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_R, 0.12, 14, 64), this.ringMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_R + 0.16, 0.035, 8, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4 }));
    const swirl = new THREE.Mesh(
      new THREE.CircleGeometry(PORTAL_R - 0.05, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: this.swirlU,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uA; uniform float uOpen; varying vec2 vP;
          void main(){
            float r = length(vP) / ${PORTAL_R.toFixed(2)};
            float a = atan(vP.y, vP.x);
            float s = sin(a*4. + r*9. - uTime*(4. + uOpen*8.)) * 0.5 + 0.5;
            float edge = smoothstep(0.2, 1.0, r);
            float k = (0.2 + s*0.5) * (0.35 + edge) + uOpen * (1.0 - r);
            gl_FragColor = vec4(mix(uColor, vec3(1.), s*0.3 + uOpen*0.5) * k * uA, 1.);
          }`,
      }),
    );
    if (choice.visual.kind === 'number' || choice.value !== undefined) {
      const b = makeBoard(choice.value ?? 0);
      b.scale.setScalar(0.95);
      this.sign = b;
    } else if (isColor) {
      this.sign = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 32, 24),
        new THREE.MeshPhysicalMaterial({ color: raw, roughness: 0.2, clearcoat: 1, emissive: raw, emissiveIntensity: 0.25 }),
      );
    } else {
      const card = new THREE.Group();
      const frame = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.4, 0.16, 4, 0.14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.8 }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: picture, transparent: true }));
      face.position.z = 0.085;
      card.add(frame, face);
      this.sign = card;
    }
    this.group.add(swirl, this.ring, rim, this.sign);
    this.group.scale.setScalar(0.01);
  }

  canTrigger() {
    return this.cooldown <= 0 && !this.removed;
  }

  wrong() {
    this.flash = 1;
    this.shake = 0.5;
    this.cooldown = 1.4;
  }

  highlight() {
    this.pulse = 3;
  }

  setOpen(k: number) {
    this.swirlU.uOpen.value = k;
  }

  update(dt: number, t: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.pulse = Math.max(0, this.pulse - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.swirlU.uTime.value = t;
    this.ring.rotation.z = t * 0.5;
    const pul = this.pulse > 0 ? 1 + Math.sin(t * 10) * 0.07 : 1;
    this.ring.scale.setScalar(pul);
    this.ringMat.emissiveIntensity = 2.2 + (this.pulse > 0 ? 1.5 : 0) - this.flash * 1.6;
    this.swirlU.uA.value = 0.55 + (this.pulse > 0 ? 0.3 : 0) - this.flash * 0.35;
    this.sign.position.set(this.shake > 0 ? Math.sin(t * 60) * 0.12 * this.shake * 2 : 0, Math.sin(t * 2 + this.group.position.x) * 0.06, 0.05);
    this.sign.rotation.y = Math.sin(t * 1.3 + this.group.position.x) * 0.25;
  }
}
