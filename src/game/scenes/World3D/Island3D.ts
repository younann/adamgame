import * as THREE from 'three';
import type { Quality } from '../../three/ThreeStage';
import { GIFT_AT, ISLET, LOCS, PLAZA_R, distToPath, islandRadius, makeTrees, pathOf, rng, type Tree } from './layout';

const SKY_TOP = new THREE.Color(0x2f8cff);
export const SKY_HORIZON = new THREE.Color(0xc9ecff);
/** world extent covered by the grass texture: x, z ∈ [−EXT, EXT] */
const EXT = 34;

/**
 * Adam's island in 3D: sunny sky dome, animated sea with a foam shoreline, a soft-edged grass
 * island (painted paths + plaza baked into one canvas texture), a sandy treasure islet,
 * instanced trees / bushes / flowers / rocks, drifting clouds and butterflies.
 * Everything is procedural (no external art).
 */
export class Island3D {
  readonly group = new THREE.Group();
  readonly trees: Tree[];
  readonly sun: THREE.DirectionalLight;
  readonly ground: THREE.Object3D[] = [];
  private seaUniforms = { uTime: { value: 0 } };
  private clouds: { obj: THREE.Object3D; speed: number }[] = [];
  private flies: { obj: THREE.Group; wings: THREE.Mesh[]; c: THREE.Vector3; r: number; ph: number; sp: number }[] = [];
  private plazaGlow: THREE.Mesh;

  constructor(private readonly quality: Quality) {
    this.trees = makeTrees(quality === 'high' ? 54 : 36);
    this.buildSky();
    this.buildSea();
    this.buildLand();
    this.buildTrees();
    this.buildDetails();
    this.plazaGlow = this.buildPlaza();
    this.buildClouds();
    this.buildButterflies();
    this.sun = this.buildLights();
  }

  // ------------------------------------------------------------------ sky
  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(190, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: SKY_TOP }, uHor: { value: SKY_HORIZON }, uSun: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; varying vec3 vP;
          void main(){
            float h = clamp(vP.y, 0., 1.);
            vec3 c = mix(uHor, uTop, pow(h, 0.55));
            float s = max(dot(vP, uSun), 0.);
            c += vec3(1.0,0.92,0.7) * (pow(s, 600.) * 2.5 + pow(s, 12.) * 0.25);
            gl_FragColor = vec4(c, 1.);
          }`,
      }),
    );
    sky.renderOrder = -1;
    this.group.add(sky);
  }

  // ------------------------------------------------------------------ sea
  private buildSea() {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { ...this.seaUniforms, uFog: { value: SKY_HORIZON }, uIslet: { value: new THREE.Vector3(ISLET.x, ISLET.z, ISLET.r + 1.6) } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
        fragmentShader: `uniform float uTime; uniform vec3 uFog; uniform vec3 uIslet; varying vec3 vW;
          float shoreR(float th){ return 25. + 2.2*sin(3.*th+0.5) + 1.4*sin(5.*th+2.) + 1.9; }
          void main(){
            float th = atan(vW.z, vW.x);
            float e = min(length(vW.xz) - shoreR(th), length(vW.xz - uIslet.xy) - uIslet.z);
            vec3 deep = vec3(0.02, 0.33, 0.66);
            vec3 shallow = vec3(0.16, 0.80, 0.86);
            vec3 c = mix(shallow, deep, smoothstep(0., 14., e));
            float w = sin(vW.x*0.35 + uTime*0.8) * sin(vW.z*0.3 - uTime*0.6);
            c += w * 0.025;
            float glint = sin(vW.x*1.7 + uTime*1.3 + sin(vW.z*1.1)) * sin(vW.z*1.9 - uTime*1.1 + sin(vW.x*0.7));
            c += smoothstep(0.93, 1.0, glint) * 0.45;
            float foam = smoothstep(1.3, 0.1, e + sin(uTime*1.6 + th*18.) * 0.25);
            float foam2 = smoothstep(0.25, 0., abs(e - 2.2 - sin(uTime*0.9)*0.8)) * 0.5;
            c = mix(c, vec3(1.), clamp(foam + foam2, 0., 1.) * step(-0.5, e));
            float f = smoothstep(60., 175., length(vW - cameraPosition));
            gl_FragColor = vec4(mix(c, uFog, f), 1.);
          }`,
      }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.45;
    this.group.add(sea);
  }

  // ------------------------------------------------------------------ land
  private blobShape(extra: number) {
    const s = new THREE.Shape();
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      const r = islandRadius(th) + extra;
      // shape y = −world z (the mesh is rotated −90° about X)
      const x = Math.cos(th) * r;
      const y = -Math.sin(th) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    return s;
  }

  /** Extrude a flat shape into a soft-edged slab whose top sits at `topY`. */
  private slab(shape: THREE.Shape, depth: number, bevel: number, topY: number, mats: THREE.Material | THREE.Material[]) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 48 });
    const m = new THREE.Mesh(geo, mats);
    m.rotation.x = -Math.PI / 2;
    m.position.y = topY - depth - bevel;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private buildLand() {
    const sand = new THREE.MeshStandardMaterial({ color: 0xf2d79c, roughness: 0.95 });
    const lip = new THREE.MeshStandardMaterial({ color: 0x3ea84a, roughness: 0.9 });
    // beach ring under the grass
    this.slab(this.blobShape(1.9), 1.2, 0.5, -0.14, sand);
    // treasure islet (sand) — merges with the main island to the west
    const islet = new THREE.Shape();
    islet.absarc(ISLET.x, -ISLET.z, ISLET.r + 1.2, 0, Math.PI * 2, false);
    const isletMesh = this.slab(islet, 1.2, 0.6, -0.015, sand);
    // grass top: one painted canvas (paths, plaza, patches) mapped by world XZ
    const tex = this.paintGrass();
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    const grass = this.slab(this.blobShape(0), 1.4, 0.45, 0, [top, lip]);
    // cap UVs are the shape coords (x, −z): map them onto the texture square
    tex.repeat.set(1 / (EXT * 2), 1 / (EXT * 2));
    tex.offset.set(0.5, 0.5);
    this.ground.push(grass, isletMesh);
  }

  private paintGrass() {
    const S = this.quality === 'high' ? 2048 : 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const k = S / (EXT * 2);
    const X = (x: number) => (x + EXT) * k;
    const Z = (z: number) => (z + EXT) * k;
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, '#4fbf4a');
    grd.addColorStop(1, '#329a40');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    const r = rng(11);
    // soft light/dark patches
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(140,230,110,0.10)' : 'rgba(20,90,40,0.08)';
      g.beginPath();
      g.ellipse(r() * S, r() * S, (1 + r() * 3.5) * k, (0.8 + r() * 2.5) * k, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // grass flecks
    for (let i = 0; i < S * 14; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(200,255,170,0.10)' : 'rgba(10,70,25,0.12)';
      g.fillRect(r() * S, r() * S, 2, 3);
    }
    // darker grass under the woods ring
    for (const t of this.trees) {
      g.fillStyle = 'rgba(20,80,30,0.18)';
      g.beginPath();
      g.arc(X(t.x), Z(t.z), t.r * 2.2 * k, 0, Math.PI * 2);
      g.fill();
    }
    // paths: soft edge + sandy fill + stepping-stone dots
    const paths = LOCS.map(pathOf);
    const stroke = (w: number, style: string) => {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = style;
      g.lineWidth = w * k;
      for (const [a, b, e] of paths) {
        g.beginPath();
        g.moveTo(X(a.x), Z(a.z));
        g.quadraticCurveTo(X(b.x), Z(b.z), X(e.x), Z(e.z));
        g.stroke();
      }
    };
    stroke(2.6, 'rgba(60,110,40,0.45)');
    stroke(2.1, '#d6b46e');
    stroke(1.0, 'rgba(240,215,160,0.55)');
    // plaza: warm stone circle with a star inlay (Adam's base)
    g.fillStyle = 'rgba(60,110,40,0.45)';
    g.beginPath();
    g.arc(X(0), Z(0), (PLAZA_R + 0.5) * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#dcc08a';
    g.beginPath();
    g.arc(X(0), Z(0), (PLAZA_R + 0.25) * k, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(170,130,80,0.35)';
    g.lineWidth = 0.08 * k;
    for (let ring = 1; ring <= 3; ring++) {
      g.beginPath();
      g.arc(X(0), Z(0), ring * 1.05 * k, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(X(Math.cos(a) * 1.05), Z(Math.sin(a) * 1.05));
      g.lineTo(X(Math.cos(a) * PLAZA_R), Z(Math.sin(a) * PLAZA_R));
      g.stroke();
    }
    // gift spot
    g.fillStyle = 'rgba(255,120,190,0.35)';
    g.beginPath();
    g.arc(X(GIFT_AT.x), Z(GIFT_AT.z), 1.1 * k, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  /** Adam's base: a glowing blue ring + star on the plaza. */
  private buildPlaza() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.07, 10, 64),
      new THREE.MeshStandardMaterial({ color: 0x4edea3, emissive: 0x4edea3, emissiveIntensity: 1.6 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const star = new THREE.Mesh(
      new THREE.ExtrudeGeometry(starShape(0.6, 0.26), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }),
      new THREE.MeshStandardMaterial({ color: 0x2f74ff, emissive: 0x1e6bff, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    star.rotation.x = -Math.PI / 2;
    star.position.y = 0.01;
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshBasicMaterial({ color: 0x4edea3, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    this.group.add(glow, ring, star);
    return glow;
  }

  // ------------------------------------------------------------------ trees & details
  private buildTrees() {
    const dummy = new THREE.Object3D();
    const r = rng(23);
    const round = this.trees.filter((t) => t.kind === 'round');
    const pines = this.trees.filter((t) => t.kind === 'pine');
    const bushes = this.trees.filter((t) => t.kind === 'bush');
    const trunkMat = this.cutout(new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 }));
    const leafMat = this.cutout(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }));
    const leafGreens = [0x3fbf4a, 0x5ad35a, 0x2fa84a, 0x7ad94a, 0x46c26e];

    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 8), trunkMat, round.length + pines.length);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), leafMat, round.length * 3);
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.2, 10), leafMat, pines.length * 2);
    const bushM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), leafMat, bushes.length * 2);
    let ti = 0;
    let ci = 0;
    round.forEach((t) => {
      const s = t.scale;
      dummy.position.set(t.x, 0.7 * s, t.z);
      dummy.rotation.set(0, 0, (r() - 0.5) * 0.12);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trunks.setMatrixAt(ti++, dummy.matrix);
      const col = new THREE.Color(leafGreens[Math.floor(r() * leafGreens.length)]);
      const puffs: [number, number, number, number][] = [[0, 1.85, 0, 1.0], [0.55, 1.55, 0.2, 0.7], [-0.45, 1.6, -0.25, 0.72]];
      for (const [px, py, pz, ps] of puffs) {
        dummy.position.set(t.x + px * s, py * s, t.z + pz * s);
        dummy.rotation.set(r() * 3, r() * 3, 0);
        dummy.scale.set(ps * s * 1.05, ps * s * 0.92, ps * s);
        dummy.updateMatrix();
        crowns.setMatrixAt(ci, dummy.matrix);
        crowns.setColorAt(ci++, col.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08));
      }
    });
    let pi = 0;
    pines.forEach((t) => {
      const s = t.scale;
      dummy.position.set(t.x, 0.7 * s, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trunks.setMatrixAt(ti++, dummy.matrix);
      const col = new THREE.Color(0x2a9a5a).offsetHSL(0, 0, (r() - 0.5) * 0.08);
      for (const [py, ps] of [[1.9, 0.85], [2.8, 0.62]]) {
        dummy.position.set(t.x, py * s, t.z);
        dummy.scale.set(ps * s, ps * s, ps * s);
        dummy.updateMatrix();
        cones.setMatrixAt(pi, dummy.matrix);
        cones.setColorAt(pi++, col);
      }
    });
    let bi = 0;
    bushes.forEach((t) => {
      const s = t.scale;
      const col = new THREE.Color(leafGreens[Math.floor(r() * leafGreens.length)]);
      for (const [px, pz, ps] of [[0, 0, 0.8], [0.5, 0.25, 0.55]]) {
        dummy.position.set(t.x + px * s, ps * s * 0.55, t.z + pz * s);
        dummy.rotation.set(0, r() * 3, 0);
        dummy.scale.set(ps * s, ps * s * 0.75, ps * s);
        dummy.updateMatrix();
        bushM.setMatrixAt(bi, dummy.matrix);
        bushM.setColorAt(bi++, col);
      }
    });
    for (const m of [trunks, crowns, cones, bushM]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.group.add(m);
    }
  }

  /**
   * See-through hole: tree pixels in front of Adam, near him on screen, are dithered away so a
   * tree between the camera and Adam never hides him.
   */
  private cutout<T extends THREE.MeshStandardMaterial>(mat: T): T {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.cut);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uCut; uniform float uCutR;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          {
            float dpx = distance(gl_FragCoord.xy, uCut.xy);
            float k = smoothstep(uCutR, uCutR * 0.55, dpx) * step(vViewPosition.z, uCut.z - 0.6);
            float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (n < k * 0.85) discard;
          }`,
        );
    };
    return mat;
  }

  /** Adam on screen for the tree cut-out: (x px, y px from bottom, view depth) + radius px. */
  readonly cut = { uCut: { value: new THREE.Vector3(-9999, -9999, 0) }, uCutR: { value: 120 } };

  private buildDetails() {
    const r = rng(41);
    const dummy = new THREE.Object3D();
    // flowers: little coloured spheres on short stems, in clumps
    const n = this.quality === 'high' ? 420 : 220;
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.065, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), n);
    const colors = [0xff6fb5, 0xffd21f, 0xffffff, 0xa45bff, 0xff8a1f, 0x67e8f9];
    let i = 0;
    let guard = 0;
    while (i < n && guard++ < n * 20) {
      const th = r() * Math.PI * 2;
      const d = islandRadius(th) * (0.2 + r() * 0.72);
      const cx = Math.cos(th) * d;
      const cz = Math.sin(th) * d;
      const col = new THREE.Color(colors[Math.floor(r() * colors.length)]);
      for (let j = 0; j < 7 && i < n; j++) {
        const x = cx + (r() - 0.5) * 2.2;
        const z = cz + (r() - 0.5) * 2.2;
        if (Math.hypot(x, z) < PLAZA_R + 1) continue;
        if (LOCS.some((l) => Math.hypot(x - l.at.x, z - l.at.z) < l.body + 0.6)) continue;
        if (LOCS.some((l) => distToPath({ x, z }, pathOf(l)) < 1.3)) continue;
        dummy.position.set(x, 0.04, z);
        const fs = 0.7 + r() * 0.5;
        dummy.scale.set(fs, fs * 0.55, fs);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
        heads.setColorAt(i++, col);
      }
    }
    heads.count = i;
    heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    this.group.add(heads);

    // rocks along the beach
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.85 }), 26);
    for (let k = 0; k < 26; k++) {
      const th = r() * Math.PI * 2;
      const d = islandRadius(th) + 0.6 + r() * 1.4;
      dummy.position.set(Math.cos(th) * d, -0.15, Math.sin(th) * d);
      dummy.rotation.set(r() * 3, r() * 3, r() * 3);
      dummy.scale.set(0.6 + r() * 0.9, 0.4 + r() * 0.5, 0.6 + r() * 0.9);
      dummy.updateMatrix();
      rocks.setMatrixAt(k, dummy.matrix);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.group.add(rocks);
  }

  private buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xbfd6ff, emissiveIntensity: 0.35 });
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      const puffs = 4 + Math.floor(r() * 3);
      for (let j = 0; j < puffs; j++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set((j - puffs / 2) * 2.2 + r(), r() * 1.2, (r() - 0.5) * 2);
        m.scale.setScalar(1.6 + r() * 1.4);
        c.add(m);
      }
      const th = r() * Math.PI * 2;
      const d = 30 + r() * 60;
      c.position.set(Math.cos(th) * d, 26 + r() * 14, Math.sin(th) * d - 20);
      c.scale.y = 0.7;
      this.group.add(c);
      this.clouds.push({ obj: c, speed: 0.6 + r() * 0.8 });
    }
  }

  private buildButterflies() {
    const r = rng(77);
    const wingGeo = new THREE.CircleGeometry(0.14, 12);
    wingGeo.translate(0.12, 0, 0);
    for (let i = 0; i < 7; i++) {
      const col = [0xffd21f, 0xff6fb5, 0x67e8f9, 0xffffff, 0xff8a1f][i % 5];
      const mat = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, emissive: col, emissiveIntensity: 0.25 });
      const g = new THREE.Group();
      const wl = new THREE.Mesh(wingGeo, mat);
      const wr = new THREE.Mesh(wingGeo, mat);
      wr.scale.x = -1;
      g.add(wl, wr);
      const th = r() * Math.PI * 2;
      const d = 6 + r() * 14;
      this.flies.push({ obj: g, wings: [wl, wr], c: new THREE.Vector3(Math.cos(th) * d, 0.9, Math.sin(th) * d), r: 1.2 + r() * 2, ph: r() * 6, sp: 0.5 + r() * 0.5 });
      this.group.add(g);
    }
  }

  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0xd6ecff, 0x3f6f2a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.2);
    sun.castShadow = true;
    const ms = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(ms, ms);
    const sc = sun.shadow.camera;
    sc.left = -20;
    sc.right = 20;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun, sun.target);
    const bounce = new THREE.DirectionalLight(0x9fd0ff, 0.4);
    bounce.position.set(-10, 6, 12);
    this.group.add(bounce);
    return sun;
  }

  /** Keep the shadow frustum centred on Adam (crisp shadows on a big map). */
  followSun(x: number, z: number) {
    this.sun.position.set(x + 14, 26, z + 10);
    this.sun.target.position.set(x, 0, z);
  }

  update(dt: number, t: number) {
    this.seaUniforms.uTime.value = t;
    this.plazaGlow.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
    for (const c of this.clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > 110) c.obj.position.x = -110;
    }
    for (const f of this.flies) {
      const a = t * f.sp + f.ph;
      f.obj.position.set(f.c.x + Math.cos(a) * f.r, f.c.y + Math.sin(a * 2.3) * 0.35, f.c.z + Math.sin(a * 1.3) * f.r);
      f.obj.rotation.y = -a + Math.PI / 2;
      const flap = Math.sin(t * 22 + f.ph) * 1.1;
      f.wings[0].rotation.y = flap;
      f.wings[1].rotation.y = -flap;
    }
  }
}

/** 5-point star outline (for extruded stars). */
export function starShape(outer: number, inner: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
