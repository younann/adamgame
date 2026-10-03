import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { conceptColor } from '@/design-system/tokens';
import type { ChallengeChoice } from '@/learning/types';
import { makeBoard } from '../Football3D/props';

const NEONS = [0x67e8f9, 0x4edea3, 0xff6fb5];

/**
 * A drive-through answer gate spanning one lane: a chunky rock/garage arch with a neon rim,
 * a dark tunnel mouth, the answer sign floating above (number board, colour orb or picture
 * card), and a lock-on meter on the road that fills while Adam holds his kart in the lane.
 */
export class Gate3D {
  readonly group = new THREE.Group();
  readonly sign: THREE.Object3D;
  readonly tint: number;
  private rimMat: THREE.MeshStandardMaterial;
  private meter: THREE.Mesh;
  private meterRing: THREE.Mesh;
  private glow = 0;
  private shake = 0;
  rushing = false;

  constructor(readonly choice: ChallengeChoice, index: number, picture: THREE.Texture | null, width = 2.6) {
    const isColor = choice.visual.kind === 'color';
    this.tint = isColor ? (conceptColor[choice.visual.key] ?? 0xffffff) : NEONS[index % NEONS.length];
    const rock = new THREE.MeshPhysicalMaterial({ color: isColor ? new THREE.Color(this.tint).lerp(new THREE.Color(0x2a2050), 0.55) : 0x3b2f6b, roughness: 0.5, clearcoat: 0.3 });
    const H = 2.6;
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.6, H, 1.4, 3, 0.2), rock);
      pillar.position.set(s * (width / 2 + 0.3), H / 2, 0);
      pillar.castShadow = true;
      this.group.add(pillar);
    }
    const top = new THREE.Mesh(new RoundedBoxGeometry(width + 1.2, 0.8, 1.4, 3, 0.25), rock);
    top.position.y = H + 0.3;
    top.castShadow = true;
    this.rimMat = new THREE.MeshStandardMaterial({ color: this.tint, emissive: this.tint, emissiveIntensity: 2 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(width / 2, 0.08, 10, 40, Math.PI), this.rimMat);
    rim.position.set(0, H - width / 2, 0.72);
    const mouth = new THREE.Mesh(
      new THREE.PlaneGeometry(width, H),
      new THREE.MeshBasicMaterial({ color: 0x070a1a, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mouth.position.set(0, H / 2, 0.1);
    // lock-on meter on the road in front of the gate
    this.meterRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: this.tint, transparent: true, opacity: 0.7, depthWrite: false }));
    this.meterRing.rotation.x = -Math.PI / 2;
    this.meterRing.position.set(0, 0.03, 2.4);
    this.meter = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshBasicMaterial({ color: this.tint, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.meter.rotation.x = -Math.PI / 2;
    this.meter.position.set(0, 0.04, 2.4);
    this.meter.scale.setScalar(0.001);
    // answer sign
    if (choice.visual.kind === 'number' || choice.value !== undefined) {
      this.sign = makeBoard(choice.value ?? 0);
    } else if (isColor) {
      this.sign = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshPhysicalMaterial({ color: this.tint, roughness: 0.2, clearcoat: 1, emissive: this.tint, emissiveIntensity: 0.3 }));
    } else {
      const card = new THREE.Group();
      const frame = new THREE.Mesh(new RoundedBoxGeometry(1.15, 1.15, 0.16, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.8 }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: picture, transparent: true }));
      face.position.z = 0.085;
      card.add(frame, face);
      this.sign = card;
    }
    this.sign.position.set(0, H + 1.45, 0.3);
    this.group.add(top, rim, mouth, this.meterRing, this.meter, this.sign);
  }

  /** 0..1 lock-on progress */
  setMeter(p: number) {
    this.meter.scale.setScalar(Math.max(0.001, p));
  }

  pulse() {
    this.glow = 1.5;
  }

  wrong() {
    this.shake = 1;
  }

  setDim(on: boolean) {
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) {
        m.transparent = true;
        m.opacity = on ? Math.min(m.opacity, 0.35) : m.opacity;
      }
    });
  }

  update(dt: number, t: number) {
    this.glow = Math.max(0, this.glow - dt);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.rimMat.emissiveIntensity = 1.8 + Math.sin(t * 4 + this.group.position.x) * 0.4 + this.glow * 2;
    const k = 1 + (this.glow > 0 ? Math.sin(t * 12) * 0.08 : 0);
    this.sign.scale.setScalar(k);
    this.sign.position.x = this.shake > 0 ? Math.sin(t * 60) * 0.12 * this.shake : 0;
    this.sign.position.y = 2.6 + 1.45 + Math.sin(t * 2.2 + this.group.position.x) * 0.1;
    this.sign.rotation.y = Math.sin(t * 1.5 + this.group.position.x) * 0.15;
    this.meterRing.rotation.z = t * 0.8;
  }
}
