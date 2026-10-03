import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Quality } from '../../three/ThreeStage';

const ROAD_W = 11;
const LEN = 260; // road visible ahead
const FAR = -200;
const NEAR = 30;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const SUNSET_HORIZON = new THREE.Color(0xffc9a0);

/**
 * The race course: sunset sky, rolling grass, an endless scrolling road (lane dashes + red/white
 * kerbs), and recycled roadside life — trees, lamp posts, flags, banners, grandstand blocks.
 * The kart stays near the origin; the world streams past at `speed` (m/s, +Z).
 */
export class Track3D {
  readonly group = new THREE.Group();
  private roadTex: THREE.CanvasTexture;
  private kerbTex: THREE.CanvasTexture;
  private grassTex: THREE.CanvasTexture;
  private trees: THREE.InstancedMesh;
  private trunks: THREE.InstancedMesh;
  private treeSpots: { x: number; z: number; s: number }[] = [];
  private props: THREE.Object3D[] = [];
  private lines: THREE.LineSegments;
  private linePos: Float32Array;
  private lineSeeds: { x: number; y: number; z: number }[] = [];
  private dummy = new THREE.Object3D();
  readonly sun: THREE.DirectionalLight;

  constructor(private readonly quality: Quality) {
    this.buildSky();
    this.grassTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#4caf47';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(170,240,120,0.18)' : 'rgba(20,80,30,0.18)';
        g.fillRect(Math.random() * 256, Math.random() * 256, 3, 6);
      }
      g.fillStyle = 'rgba(30,110,40,0.25)';
      g.fillRect(0, 0, 256, 40);
    });
    this.grassTex.repeat.set(40, 40);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 0.95 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, -100);
    grass.receiveShadow = true;

    this.roadTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#3a4054';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
      // edge lines + lane dashes (lanes at x = −1.5, +1.5 → u = 0.36, 0.64)
      g.fillStyle = '#ffffff';
      g.fillRect(10, 0, 7, 256);
      g.fillRect(239, 0, 7, 256);
      g.fillStyle = '#ffd21f';
      for (const u of [0.364, 0.636]) g.fillRect(u * 256 - 4, 30, 8, 120);
    });
    this.roadTex.repeat.set(1, LEN / 8);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, LEN), new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.75 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.0, NEAR - LEN / 2);
    road.receiveShadow = true;

    this.kerbTex = canvasTex(64, 64, (g) => {
      g.fillStyle = '#ff3b3b';
      g.fillRect(0, 0, 64, 32);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 32, 64, 32);
    });
    this.kerbTex.repeat.set(1, LEN / 2);
    const kerbMat = new THREE.MeshStandardMaterial({ map: this.kerbTex, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, LEN), kerbMat);
      kerb.position.set(s * (ROAD_W / 2 + 0.35), 0.06, NEAR - LEN / 2);
      kerb.receiveShadow = true;
      this.group.add(kerb);
    }
    this.group.add(grass, road);

    // trees (instanced, recycled along the road)
    const n = quality === 'high' ? 90 : 56;
    const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    this.trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), leaf, n);
    this.trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 7), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 }), n);
    const greens = [0x3fbf4a, 0x5ad35a, 0x2fa84a, 0x7ad94a, 0x46c26e];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      this.treeSpots.push({ x: side * (9 + Math.random() * 22), z: FAR + Math.random() * (NEAR - FAR), s: 0.8 + Math.random() * 0.9 });
      this.trees.setColorAt(i, new THREE.Color(greens[i % greens.length]));
    }
    for (const m of [this.trees, this.trunks]) {
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }

    // roadside props, evenly spaced and recycled
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f2, metalness: 0.4, roughness: 0.4 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 2 });
    const flagCols = [0xff3b3b, 0x2f74ff, 0xffd21f, 0x2fd389, 0xff6fb5];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      if (i % 4 < 2) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 8), lampMat);
        pole.position.y = 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), lampMat);
        arm.position.set(-side * 0.55, 3.95, 0);
        const bulb = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.16, 0.3, 2, 0.06), bulbMat);
        bulb.position.set(-side * 1.05, 3.88, 0);
        g.add(pole, arm, bulb);
      } else {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), lampMat);
        pole.position.y = 1.3;
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: flagCols[i % flagCols.length], side: THREE.DoubleSide }));
        flag.geometry.translate(-side * 0.45, 0, 0);
        flag.position.y = 2.3;
        flag.userData.flag = true;
        g.add(pole, flag);
      }
      g.position.set(side * (ROAD_W / 2 + 1.3), 0, FAR + (i / 16) * (NEAR - FAR));
      g.traverse((o) => (o.castShadow = true));
      this.props.push(g);
      this.group.add(g);
    }
    // banner arches over the road every so often
    for (let i = 0; i < 2; i++) {
      const arch = this.makeBanner(i);
      arch.position.z = FAR + i * ((NEAR - FAR) / 2);
      this.props.push(arch);
      this.group.add(arch);
    }
    // grandstands with a cheering (bobbing) crowd
    for (let i = 0; i < 3; i++) {
      const st = this.makeStand();
      st.position.set(i % 2 ? 11.5 : -11.5, 0, FAR + i * 75);
      st.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2;
      this.props.push(st);
      this.group.add(st);
    }

    // speed lines (streaks rushing past the camera)
    const L = 70;
    this.linePos = new Float32Array(L * 6);
    for (let i = 0; i < L; i++) this.lineSeeds.push(this.lineSeed(Math.random() * 60 - 50));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    this.sun = this.buildLights();
  }

  private lineSeed(z: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 5;
    return { x: Math.cos(a) * r, y: 2.2 + Math.sin(a) * r * 0.6, z };
  }

  private makeBanner(i: number) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5.2, 10), mat);
      p.position.set(s * (ROAD_W / 2 + 0.9), 2.6, 0);
      g.add(p);
    }
    const tex = canvasTex(1024, 128, (c) => {
      const grd = c.createLinearGradient(0, 0, 1024, 0);
      grd.addColorStop(0, i ? '#ff6fb5' : '#1e6bff');
      grd.addColorStop(1, i ? '#ff8a1f' : '#4edea3');
      c.fillStyle = grd;
      c.fillRect(0, 0, 1024, 128);
      c.font = '900 84px Rubik, "Arial Rounded MT Bold", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 12;
      c.strokeStyle = '#001849';
      const txt = i ? '★ TURBO RACING ★' : '★ ADAM 4 ★ GO GO GO ★';
      c.strokeText(txt, 512, 68);
      c.fillStyle = '#ffffff';
      c.fillText(txt, 512, 68);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const board = new THREE.Mesh(new RoundedBoxGeometry(ROAD_W + 2.2, 1.1, 0.3, 3, 0.1), [
      mat, mat, mat, mat, new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }), mat,
    ]);
    board.position.y = 5;
    g.add(board);
    g.traverse((o) => (o.castShadow = true));
    return g;
  }

  private makeStand() {
    const g = new THREE.Group();
    const cols = [0x2f74ff, 0xffd21f, 0xff3b3b];
    for (let k = 0; k < 3; k++) {
      const step = new THREE.Mesh(new RoundedBoxGeometry(12, 0.6, 1.2, 2, 0.08), new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.5 }));
      step.position.set(0, 0.3 + k * 0.6, -k * 1.1);
      g.add(step);
    }
    const fans = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 60);
    const fanCols = [0xffd21f, 0xffffff, 0x4edea3, 0xff6fb5, 0x38a8ff, 0xff8a1f];
    for (let i = 0; i < 60; i++) {
      const row = i % 3;
      this.dummy.position.set(-5.5 + Math.floor(i / 3) * 0.58, 0.85 + row * 0.6, -row * 1.1);
      this.dummy.updateMatrix();
      fans.setMatrixAt(i, this.dummy.matrix);
      fans.setColorAt(i, new THREE.Color(fanCols[i % fanCols.length]));
    }
    fans.userData.fans = true;
    const roof = new THREE.Mesh(new RoundedBoxGeometry(12.6, 0.15, 4, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    roof.position.set(0, 3.4, -1.2);
    g.add(fans, roof);
    g.traverse((o) => (o.castShadow = true));
    return g;
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uHor: { value: SUNSET_HORIZON }, uTop: { value: new THREE.Color(0x3a6cf0) }, uSun: { value: new THREE.Vector3(0.25, 0.12, -1).normalize() } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform vec3 uHor; uniform vec3 uTop; uniform vec3 uSun; varying vec3 vP;
          void main(){
            float h = clamp(vP.y, 0., 1.);
            vec3 c = mix(uHor, uTop, pow(h, 0.5));
            float s = max(dot(vP, uSun), 0.);
            c += vec3(1.0,0.75,0.4) * (pow(s, 400.) * 3. + pow(s, 8.) * 0.35);
            gl_FragColor = vec4(c, 1.);
          }`,
      }),
    );
    sky.renderOrder = -1;
    this.group.add(sky);
    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x5bb86a, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hillMat);
      h.scale.set(30 + Math.random() * 30, 10 + Math.random() * 12, 20);
      h.position.set(-130 + i * 32 + Math.random() * 10, -4, -190 - Math.random() * 20);
      this.group.add(h);
    }
  }

  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0xffe2c8, 0x3f6f2a, 0.8));
    const sun = new THREE.DirectionalLight(0xffe0b8, 2.4);
    sun.position.set(-8, 14, 6);
    sun.target.position.set(0, 0, -6);
    sun.castShadow = true;
    const ms = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(ms, ms);
    const sc = sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 20;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 60;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun, sun.target);
    return sun;
  }

  /** Advance the world `dz` metres towards the camera. `fast` 0..1 drives speed lines. */
  update(dz: number, t: number, fast: number) {
    this.roadTex.offset.y += dz / 8;
    this.kerbTex.offset.y += dz / 2;
    this.grassTex.offset.y += dz / 10;
    const span = NEAR - FAR;
    this.treeSpots.forEach((s, i) => {
      s.z += dz;
      if (s.z > NEAR) {
        s.z -= span;
        s.x = (i % 2 ? 1 : -1) * (9 + Math.random() * 22);
      }
      this.dummy.rotation.set(0, i, 0);
      this.dummy.position.set(s.x, 0.7 * s.s, s.z);
      this.dummy.scale.setScalar(s.s);
      this.dummy.updateMatrix();
      this.trunks.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.set(s.x, 1.9 * s.s, s.z);
      this.dummy.scale.set(1.15 * s.s, 1.05 * s.s, 1.15 * s.s);
      this.dummy.updateMatrix();
      this.trees.setMatrixAt(i, this.dummy.matrix);
    });
    this.trees.instanceMatrix.needsUpdate = true;
    this.trunks.instanceMatrix.needsUpdate = true;
    for (const p of this.props) {
      p.position.z += dz;
      if (p.position.z > NEAR) p.position.z -= span;
      p.traverse((o) => {
        if (o.userData.flag) o.rotation.y = Math.sin(t * 6 + p.position.z) * 0.4;
        if (o.userData.fans) o.position.y = Math.abs(Math.sin(t * 8 + p.position.z)) * 0.12;
      });
    }
    // speed lines
    const mat = this.lines.material as THREE.LineBasicMaterial;
    mat.opacity = fast * 0.55;
    this.lines.visible = fast > 0.01;
    if (this.lines.visible) {
      const len = 2 + fast * 6;
      this.lineSeeds.forEach((s, i) => {
        s.z += dz * 1.6;
        if (s.z > 8) Object.assign(s, this.lineSeed(-50 - Math.random() * 10));
        this.linePos.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
      });
      this.lines.geometry.attributes.position.needsUpdate = true;
    }
  }
}
