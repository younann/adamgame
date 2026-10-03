import * as THREE from 'three';
import { font } from '@/design-system/tokens';

/**
 * Hero3D — a smooth, Pixar-toy style procedural character (original design, no external art).
 * Big round head with glossy expressive eyes, curly hair, soft "clay/plastic" materials, and a
 * fully procedural rig: idle, run, kick, jump, celebrate, dive, wave, think, sad-encouraged.
 * Used for Adam (avatar colours), the goalkeeper, teammates and rivals.
 *
 * Origin = between the feet; height ≈ 1.2 units; faces +Z.
 */
export interface HeroLook {
  skin: number;
  hair: number;
  hairStyle: 'curly' | 'short' | 'spiky';
  eyes: number;
  shirt: number;
  shirtTrim: number;
  shorts: number;
  socks: number;
  shoes: number;
  shoeStripe: number;
  number?: string;
  name?: string;
  gloves?: number | null;
  headband?: number | null;
  cape?: number | null;
}

export type HeroPose = 'idle' | 'run' | 'walk' | 'ready' | 'think' | 'cheer' | 'sad' | 'wave';

const physical = (color: number, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), clearcoat: 0.12, clearcoatRoughness: 0.5, ...o });

function capsule(r: number, len: number, mat: THREE.Material, seg = 16) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function sphere(r: number, mat: THREE.Material, seg = 32) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A limb with an upper part pivoting at `root` and a lower part pivoting at the joint. */
class Limb {
  readonly root = new THREE.Group();
  readonly joint = new THREE.Group();
  constructor(upper: THREE.Object3D, lower: THREE.Object3D, upperLen: number) {
    this.root.add(upper);
    this.joint.position.y = -upperLen;
    this.joint.add(lower);
    this.root.add(this.joint);
  }
}

export class Hero3D {
  readonly root = new THREE.Group();
  /** body pivot at the hips — bob, lean and squash happen here */
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private headPivot = new THREE.Group();
  private head = new THREE.Group();
  private armL!: Limb;
  private armR!: Limb;
  private legL!: Limb;
  private legR!: Limb;
  private eyesGroup = new THREE.Group();
  private lids: THREE.Mesh[] = [];
  private pupils: THREE.Group[] = [];
  private mouthSmile!: THREE.Mesh;
  private mouthOpen!: THREE.Group;
  private brows: THREE.Mesh[] = [];
  private cape: THREE.Mesh | null = null;
  private capeBase: Float32Array | null = null;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private texs: THREE.Texture[] = [];

  pose: HeroPose = 'idle';
  /** additive offsets for one-shot actions (radians / units) */
  readonly act = { hipY: 0, lean: 0, twist: 0, armL: 0, armR: 0, armLz: 0, armRz: 0, elbowL: 0, elbowR: 0, legL: 0, legR: 0, kneeL: 0, kneeR: 0, head: 0, squash: 0, roll: 0 };
  /** 0..1 how "open" the mouth is (talking / cheering) */
  mouth = 0;
  talking = false;
  speed = 1;
  private t = Math.random() * 10;
  private blinkIn = 2;
  private blink = 0;
  private lookAt = new THREE.Vector2();

  constructor(public look: HeroLook) {
    this.build();
  }

  private track<T extends THREE.Material>(m: T) {
    this.mats.push(m);
    return m;
  }

  private build() {
    const L = this.look;
    const skin = this.track(physical(L.skin, { roughness: 0.6, sheen: 0.35, sheenColor: new THREE.Color(0xffb59a), clearcoat: 0.05 }));
    const shirt = this.track(physical(L.shirt, { roughness: 0.62, sheen: 0.1 }));
    const trim = this.track(physical(L.shirtTrim, { roughness: 0.5 }));
    const shorts = this.track(physical(L.shorts, { roughness: 0.65 }));
    const socks = this.track(physical(L.socks, { roughness: 0.7 }));
    const shoes = this.track(physical(L.shoes, { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    const stripe = this.track(physical(L.shoeStripe, { roughness: 0.4 }));
    const hairMat = this.track(physical(L.hair, { roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color(0x6a4a30), clearcoat: 0.35 }));

    this.root.add(this.hips);
    this.hips.position.y = 0.46;

    // --- legs (hip pivot → knee → shoe)
    const mkLeg = (side: number) => {
      const thigh = new THREE.Group();
      const short = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.12, 20), shorts);
      short.position.y = -0.05;
      short.castShadow = true;
      const knee = capsule(0.068, 0.07, skin);
      knee.position.y = -0.14;
      thigh.add(short, knee);
      const shin = new THREE.Group();
      const sock = capsule(0.07, 0.14, socks);
      sock.position.y = -0.12;
      const shoe = sphere(0.1, shoes);
      shoe.scale.set(0.95, 0.62, 1.45);
      shoe.position.set(0, -0.27, 0.04);
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 24, Math.PI), stripe);
      st.rotation.set(0, side * Math.PI / 2, 0);
      st.position.set(side * 0.07, -0.27, 0.04);
      shin.add(sock, shoe, st);
      const leg = new Limb(thigh, shin, 0.2);
      leg.root.position.set(side * 0.11, 0, 0);
      return leg;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    this.hips.add(this.legL.root, this.legR.root);

    // --- torso: rounded jersey with collar, number front/back
    this.hips.add(this.torso);
    const shortsTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.12, 32), shorts);
    shortsTop.castShadow = true;
    shortsTop.scale.set(1, 1, 0.82);
    shortsTop.position.y = 0.0;
    const body = capsule(0.21, 0.16, shirt, 24);
    body.scale.set(1, 1, 0.82);
    body.position.y = 0.2;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 10, 32), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.39;
    collar.scale.set(1, 0.85, 1);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.018, 8, 40), trim);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1, 0.82, 1);
    hem.position.y = 0.06;
    this.torso.add(shortsTop, body, collar, hem);
    if (L.number) {
      for (const side of [1, -1]) {
        const tex = this.numberTexture(L.number, side < 0 ? L.name : undefined, L.shirtTrim);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), this.track(new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.6 })));
        plate.position.set(0, 0.21, side * 0.177);
        if (side < 0) plate.rotation.y = Math.PI;
        this.torso.add(plate);
      }
    }
    if (L.cape) {
      const capeMat = this.track(physical(L.cape, { side: THREE.DoubleSide, roughness: 0.5, sheen: 0.3 }));
      // shaped cape: narrow at the shoulders, flaring to the hem, wrapped round the back
      const geo = new THREE.PlaneGeometry(1, 0.56, 8, 12);
      geo.translate(0, -0.28, 0);
      const cp = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < cp.count; i++) {
        const k = -cp.getY(i) / 0.56; // 0 at the shoulders → 1 at the hem
        const x = cp.getX(i) * (0.24 + 0.24 * k);
        cp.setX(i, x);
        cp.setZ(i, x * x * (1.6 - k * 0.8));
      }
      geo.computeVertexNormals();
      this.cape = new THREE.Mesh(geo, capeMat);
      this.cape.position.set(0, 0.36, -0.17);
      this.cape.castShadow = true;
      this.capeBase = Float32Array.from(geo.attributes.position.array as ArrayLike<number>);
      this.torso.add(this.cape);
    }

    // --- arms (shoulder → elbow → hand)
    const mkArm = (side: number) => {
      const upper = new THREE.Group();
      const sleeve = capsule(0.07, 0.07, shirt);
      sleeve.position.y = -0.06;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.014, 8, 20), trim);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.13;
      const upperSkin = capsule(0.055, 0.04, skin);
      upperSkin.position.y = -0.14;
      upper.add(sleeve, cuff, upperSkin);
      const lower = new THREE.Group();
      const fore = capsule(0.052, 0.09, skin);
      fore.position.y = -0.06;
      const hand = sphere(L.gloves ? 0.085 : 0.068, L.gloves ? this.track(physical(L.gloves, { roughness: 0.45 })) : skin);
      hand.position.y = -0.15;
      hand.scale.set(1, 1.05, 0.9);
      lower.add(fore, hand);
      const arm = new Limb(upper, lower, 0.17);
      arm.root.position.set(side * 0.24, 0.33, 0);
      arm.root.rotation.z = side * 0.18;
      return arm;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);
    this.torso.add(this.armL.root, this.armR.root);

    // --- head (big, round, expressive)
    this.headPivot.position.y = 0.42;
    this.torso.add(this.headPivot);
    this.headPivot.add(this.head);
    this.head.position.y = 0.3;
    const neck = capsule(0.07, 0.04, skin);
    neck.position.y = -0.24;
    const skull = sphere(0.32, skin, 48);
    skull.scale.set(1.04, 0.96, 0.98);
    const earMat = skin;
    for (const s of [-1, 1]) {
      const ear = sphere(0.07, earMat, 20);
      ear.scale.set(0.55, 1, 0.8);
      ear.position.set(s * 0.325, -0.01, 0.0);
      this.head.add(ear);
      // cheeks
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), this.track(new THREE.MeshBasicMaterial({ color: 0xff8a95, transparent: true, opacity: 0.45, depthWrite: false })));
      cheek.position.set(s * 0.2, -0.09, 0.27);
      cheek.lookAt(s * 0.6, -0.25, 1.4);
      this.head.add(cheek);
    }
    const nose = sphere(0.035, skin, 16);
    nose.position.set(0, -0.045, 0.315);
    this.head.add(neck, skull, nose);

    // eyes: big glossy sclera + iris + pupil + two highlights, lids for blinking
    const sclera = this.track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }));
    const irisMat = this.track(new THREE.MeshPhysicalMaterial({ color: L.eyes, roughness: 0.2, clearcoat: 1 }));
    const pupilMat = this.track(new THREE.MeshBasicMaterial({ color: 0x0b0b12 }));
    const hiMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.115, 0.035, 0.255);
      const ball = sphere(0.085, sclera, 32);
      ball.scale.set(0.95, 1.12, 0.6);
      const look = new THREE.Group();
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), irisMat);
      iris.position.z = 0.052;
      iris.scale.y = 1.12;
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), pupilMat);
      pupil.position.z = 0.053;
      pupil.scale.y = 1.12;
      const h1 = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), hiMat);
      h1.position.set(0.018, 0.024, 0.054);
      const h2 = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), hiMat);
      h2.position.set(-0.016, -0.02, 0.054);
      look.add(iris, pupil, h1, h2);
      this.pupils.push(look);
      const lid = sphere(0.088, skin, 24);
      lid.scale.set(0.98, 1.14, 0.62);
      lid.position.y = 0.11;
      lid.scale.y = 0.01;
      this.lids.push(lid);
      const brow = capsule(0.014, 0.055, this.track(new THREE.MeshStandardMaterial({ color: L.hair, roughness: 0.8 })), 8);
      brow.rotation.z = Math.PI / 2 + s * 0.12;
      brow.position.set(0, 0.112, 0.012);
      this.brows.push(brow);
      eye.add(ball, look, lid, brow);
      this.eyesGroup.add(eye);
    }
    this.head.add(this.eyesGroup);

    // mouth: smile tube + open mouth (cheer / talk)
    const smileCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.07, -0.13, 0.29), new THREE.Vector3(0, -0.19, 0.305), new THREE.Vector3(0.07, -0.13, 0.29));
    this.mouthSmile = new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 20, 0.012, 8), this.track(new THREE.MeshBasicMaterial({ color: 0x6b1b24 })));
    this.head.add(this.mouthSmile);
    this.mouthOpen = new THREE.Group();
    const mouthBg = sphere(0.065, this.track(new THREE.MeshBasicMaterial({ color: 0x5a1620 })), 24);
    mouthBg.scale.set(1.2, 0.8, 0.3);
    const tongue = sphere(0.04, this.track(physical(0xff7a8a, { roughness: 0.4 })), 16);
    tongue.scale.set(1.3, 0.6, 0.5);
    tongue.position.set(0, -0.03, 0.01);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), this.track(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    teeth.position.set(0, 0.035, 0.012);
    this.mouthOpen.add(mouthBg, tongue, teeth);
    this.mouthOpen.position.set(0, -0.15, 0.285);
    this.mouthOpen.scale.setScalar(0.01);
    this.head.add(this.mouthOpen);

    // hair
    this.head.add(this.buildHair(hairMat));
    if (L.headband) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.03, 10, 48), this.track(physical(L.headband)));
      band.rotation.x = Math.PI / 2 - 0.25;
      band.position.y = 0.13;
      this.head.add(band);
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.geos.push(m.geometry);
    });
  }

  private buildHair(mat: THREE.Material) {
    const g = new THREE.Group();
    const style = this.look.hairStyle;
    if (style === 'curly') {
      // ring of soft curls over the top and back of the head
      const rows: [number, number, number][] = [[0.24, 9, 0.105], [0.17, 11, 0.1], [0.08, 12, 0.095]];
      for (const [y, n, r] of rows) {
        const ringR = Math.sqrt(Math.max(0, 0.33 * 0.33 - y * y)) * 0.98;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + y * 3;
          const z = Math.cos(a) * ringR;
          if (z > 0.2 && y < 0.2) continue; // keep the face clear
          const c = sphere(r * (0.9 + Math.random() * 0.2), mat, 16);
          c.position.set(Math.sin(a) * ringR, y, z - 0.01);
          g.add(c);
        }
      }
      const crown = sphere(0.2, mat, 24);
      crown.position.set(0, 0.25, -0.03);
      crown.scale.set(1.25, 0.6, 1.15);
      g.add(crown);
      // fringe curls
      for (let i = -2; i <= 2; i++) {
        const c = sphere(0.075, mat, 16);
        c.position.set(i * 0.075, 0.24 - Math.abs(i) * 0.015, 0.22 - Math.abs(i) * 0.02);
        g.add(c);
      }
    } else {
      const cap = sphere(0.335, mat, 32);
      cap.scale.set(1.03, 0.75, 1.02);
      cap.position.set(0, 0.1, -0.03);
      g.add(cap);
      if (style === 'spiky')
        for (let i = 0; i < 7; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 12), mat);
          spike.position.set(-0.18 + i * 0.06, 0.32, 0.05 - Math.abs(i - 3) * 0.03);
          spike.rotation.z = (i - 3) * -0.15;
          g.add(spike);
        }
    }
    return g;
  }

  private numberTexture(num: string, name: string | undefined, color: number) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    const col = `#${color.toString(16).padStart(6, '0')}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (name) {
      g.font = `900 46px ${font.display}`;
      g.fillStyle = col;
      g.fillText(name, 128, 48);
    }
    g.font = `900 ${name ? 150 : 170}px ${font.display}`;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.strokeText(num, 128, name ? 160 : 140);
    g.fillStyle = col;
    g.fillText(num, 128, name ? 160 : 140);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.texs.push(t);
    return t;
  }

  // ------------------------------------------------------------------ animation
  setPose(p: HeroPose) {
    this.pose = p;
  }

  /** Look direction for the eyes (−1..1). */
  lookTowards(x: number, y: number) {
    this.lookAt.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }

  update(dt: number) {
    this.t += dt * this.speed;
    const t = this.t;
    const a = this.act;
    let hipY = 0, lean = 0, twist = 0, armL = 0, armR = 0, armLz = 0, armRz = 0, elbowL = -0.25, elbowR = -0.25;
    let legL = 0, legR = 0, kneeL = 0, kneeR = 0, head = 0, squash = 0, roll = 0;
    switch (this.pose) {
      case 'idle':
        hipY = Math.sin(t * 2.4) * 0.008;
        squash = Math.sin(t * 2.4) * 0.015;
        armL = Math.sin(t * 1.2) * 0.05;
        armR = -Math.sin(t * 1.2) * 0.05;
        head = Math.sin(t * 0.9) * 0.05;
        break;
      case 'ready':
        hipY = -0.05 + Math.sin(t * 3) * 0.01;
        legL = -0.35; legR = -0.35; kneeL = 0.7; kneeR = 0.7;
        lean = 0.12;
        armLz = 0.6; armRz = -0.6; elbowL = -0.6; elbowR = -0.6;
        roll = Math.sin(t * 1.5) * 0.04;
        break;
      case 'walk':
      case 'run': {
        const run = this.pose === 'run';
        const f = run ? 11 : 6.5;
        const s = Math.sin(t * f);
        const amp = run ? 0.85 : 0.45;
        legL = s * amp;
        legR = -s * amp;
        kneeL = Math.max(0, -Math.sin(t * f + 0.6)) * (run ? 1.2 : 0.6);
        kneeR = Math.max(0, Math.sin(t * f + 0.6)) * (run ? 1.2 : 0.6);
        armL = -s * amp * 0.9;
        armR = s * amp * 0.9;
        elbowL = elbowR = run ? -1.2 : -0.4;
        hipY = Math.abs(Math.cos(t * f)) * (run ? 0.05 : 0.02);
        lean = run ? 0.18 : 0.04;
        twist = s * (run ? 0.12 : 0.05);
        break;
      }
      case 'think':
        armR = -1.9; elbowR = -1.9; armRz = -0.3;
        head = 0.12;
        hipY = Math.sin(t * 2) * 0.006;
        break;
      case 'sad':
        head = -0.25;
        lean = 0.05;
        armL = 0.05; armR = -0.05;
        break;
      case 'wave':
        armRz = -2.6; elbowR = -0.4 + Math.sin(t * 9) * 0.45;
        hipY = Math.sin(t * 2.4) * 0.01;
        head = 0.08;
        break;
      case 'cheer':
        armLz = 2.7 + Math.sin(t * 11) * 0.2; armRz = -2.7 - Math.sin(t * 11) * 0.2;
        elbowL = elbowR = -0.2;
        hipY = Math.abs(Math.sin(t * 7)) * 0.16;
        squash = -Math.abs(Math.sin(t * 7)) * 0.05;
        head = Math.sin(t * 7) * 0.08;
        break;
    }
    this.hips.position.y = 0.46 + hipY + a.hipY;
    this.hips.rotation.x = lean + a.lean;
    this.hips.rotation.y = twist + a.twist;
    this.hips.rotation.z = roll + a.roll;
    const sq = squash + a.squash;
    this.hips.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
    this.legL.root.rotation.x = -(legL + a.legL);
    this.legR.root.rotation.x = -(legR + a.legR);
    this.legL.joint.rotation.x = kneeL + a.kneeL;
    this.legR.joint.rotation.x = kneeR + a.kneeR;
    this.armL.root.rotation.x = -(armL + a.armL);
    this.armR.root.rotation.x = -(armR + a.armR);
    this.armL.root.rotation.z = -0.18 - (armLz + a.armLz);
    this.armR.root.rotation.z = 0.18 - (armRz + a.armRz);
    this.armL.joint.rotation.x = elbowL + a.elbowL;
    this.armR.joint.rotation.x = elbowR + a.elbowR;
    this.headPivot.rotation.x = -(head + a.head) * 0.6;
    this.headPivot.rotation.z = Math.sin(t * 0.7) * 0.03;

    // blink
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.16;
      this.blinkIn = 2 + Math.random() * 3;
    }
    const closed = this.blink > 0 ? 1 : 0;
    if (this.blink > 0) this.blink -= dt;
    for (const lid of this.lids) {
      lid.scale.y = 0.01 + closed * 1.13;
      lid.position.y = closed ? 0.0 : 0.11;
    }
    // eyes follow look direction
    for (const p of this.pupils) p.position.set(this.lookAt.x * 0.018, this.lookAt.y * 0.014, 0);
    // mouth
    const want = this.talking ? 0.35 + Math.abs(Math.sin(t * 15)) * 0.65 : this.mouth;
    const cur = this.mouthOpen.scale.x;
    const k = cur + (Math.max(0.01, want) - cur) * Math.min(1, dt * 18);
    this.mouthOpen.scale.set(k, k, k);
    this.mouthSmile.visible = k < 0.3;
    // cape wave
    if (this.cape && this.capeBase) {
      const pos = (this.cape.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const fast = this.pose === 'run' ? 3 : 1;
      for (let i = 0; i < pos.count; i++) {
        const y = this.capeBase[i * 3 + 1];
        const x = this.capeBase[i * 3];
        const depth = -y / 0.62;
        pos.setZ(i, this.capeBase[i * 3 + 2] - depth * (0.08 * fast) - Math.sin(t * 5 * fast + x * 6 + y * 4) * 0.03 * depth);
      }
      pos.needsUpdate = true;
    }
  }

  /** Expression helpers */
  happy() {
    this.mouth = 0;
    for (const [i, b] of this.brows.entries()) b.rotation.z = Math.PI / 2 + (i ? -1 : 1) * -0.12;
  }
  excited() {
    this.mouth = 1;
    for (const [i, b] of this.brows.entries()) {
      b.rotation.z = Math.PI / 2 + (i ? -1 : 1) * -0.2;
      b.position.y = 0.125;
    }
  }
  determined() {
    this.mouth = 0;
    for (const [i, b] of this.brows.entries()) {
      b.rotation.z = Math.PI / 2 + (i ? -1 : 1) * 0.25;
      b.position.y = 0.108;
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}
