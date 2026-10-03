import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Quality } from '../../three/ThreeStage';
import { BOUNDS, FLY_Y, START } from './flight';

/** deterministic PRNG so the skyline is the same every visit */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const HOME_ROOF = { x: START.x, z: START.z + 1.2, top: FLY_Y - 1.6, w: 5.2, d: 4.4 };

/**
 * HERO CITY at night, in 3D: gradient sky with stars and a big glowing moon, blocks of
 * toy-like towers with glowing windows (one shared window texture, UVs scaled per tower so
 * windows keep their size), neon roof trims, sweeping searchlights, a glowing street grid and
 * Adam's hero rooftop (helipad with a star) where missions start and end.
 */
export class City3D {
  readonly group = new THREE.Group();
  private beams: THREE.Mesh[] = [];
  private neon: THREE.MeshStandardMaterial[] = [];
  private stars!: THREE.Points;
  private moonGlow!: THREE.Sprite;
  private padRing!: THREE.Mesh;

  constructor(private readonly quality: Quality) {
    this.buildSky();
    this.buildStreets();
    this.buildTowers();
    this.buildHomeRoof();
    this.buildLights();
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(190, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `varying vec3 vP;
          void main(){
            float h = clamp(vP.y*1.3+0.1, 0., 1.);
            vec3 top = vec3(0.03,0.03,0.12);
            vec3 mid = vec3(0.12,0.08,0.32);
            vec3 hor = vec3(0.45,0.22,0.55);
            vec3 c = mix(hor, mid, smoothstep(0.,0.3,h));
            c = mix(c, top, smoothstep(0.3,1.,h));
            gl_FragColor = vec4(c,1.);
          }`,
      }),
    );
    sky.renderOrder = -1;
    this.group.add(sky);
    const n = 700;
    const pos = new Float32Array(n * 3);
    const r = rng(2);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(r() * 0.8 + 0.2);
      pos.set([Math.cos(th) * Math.sin(ph) * 160, Math.cos(ph) * 160, Math.sin(th) * Math.sin(ph) * 160], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.85, depthWrite: false }));
    this.group.add(this.stars);
    // the moon: emissive disc + soft halo (bloom)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
    moon.position.set(38, 46, -120);
    const haloTex = canvasTex(128, 128, (c) => {
      const grd = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grd;
      c.fillRect(0, 0, 128, 128);
    });
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xd9c8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.moonGlow.scale.setScalar(40);
    this.moonGlow.position.copy(moon.position);
    this.group.add(moon, this.moonGlow);
  }

  private buildStreets() {
    const S = this.quality === 'high' ? 1024 : 512;
    const tex = canvasTex(S, S, (c) => {
      c.fillStyle = '#141a33';
      c.fillRect(0, 0, S, S);
      // glowing street grid (blocks of 8 units on a 120-unit square)
      const k = S / 120;
      c.strokeStyle = 'rgba(255,214,120,0.55)';
      c.lineWidth = 2.2 * k;
      for (let v = -60; v <= 60; v += 8) {
        c.beginPath();
        c.moveTo((v + 60 + 4) * k, 0);
        c.lineTo((v + 60 + 4) * k, S);
        c.moveTo(0, (v + 60 + 4) * k);
        c.lineTo(S, (v + 60 + 4) * k);
        c.stroke();
      }
      c.strokeStyle = 'rgba(103,232,249,0.35)';
      c.lineWidth = 0.4 * k;
      c.setLineDash([1.5 * k, 1.5 * k]);
      for (let v = -60; v <= 60; v += 8) {
        c.beginPath();
        c.moveTo((v + 60 + 4) * k, 0);
        c.lineTo((v + 60 + 4) * k, S);
        c.stroke();
      }
    });
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.9 }),
    );
    street.rotation.x = -Math.PI / 2;
    street.receiveShadow = true;
    this.group.add(street);
  }

  /** One window texture; per-tower UV scaling keeps windows the same size on every face. */
  private windowMaps() {
    const r = rng(17);
    const lit = Array.from({ length: 64 }, () => (r() < 0.38 ? 0 : r() < 0.75 ? 1 : 2));
    const draw = (emissive: boolean) =>
      canvasTex(256, 256, (c) => {
        c.fillStyle = emissive ? '#000' : '#dfe6ff';
        c.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const k = lit[y * 8 + x];
          c.fillStyle = emissive ? ['#000', '#ffe39a', '#8ff0ff'][k] : k ? '#fff6cf' : '#4a5a98';
          c.beginPath();
          c.roundRect(x * 32 + 8, y * 32 + 7, 16, 19, 4);
          c.fill();
        }
      });
    const map = draw(false);
    const em = draw(true);
    for (const t of [map, em]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return { map, em };
  }

  private buildTowers() {
    const { map, em } = this.windowMaps();
    const tints = [0x3a5ae8, 0x5a46d8, 0x2a8ae0, 0x7a4fe8, 0x3f6af5, 0xd04f9a];
    const mats = tints.map(
      (c) => new THREE.MeshPhysicalMaterial({ color: c, map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0.6, roughness: 0.45, clearcoat: 0.3 }),
    );
    const neonCols = [0xff4fd8, 0x4edea3, 0x67e8f9, 0xffd21f];
    this.neon = neonCols.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 }));
    const roofMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa4d8, roughness: 0.4, clearcoat: 0.4 });
    const r = rng(31);
    const add = (x: number, z: number, w: number, d: number, h: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      // scale UVs so a window tile ≈ 1×1 unit on every face
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const nrm = geo.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nrm.getX(i));
        const ny = Math.abs(nrm.getY(i));
        const su = ny > 0.5 ? w : nx > 0.5 ? d : w;
        const sv = ny > 0.5 ? d : h;
        uv.setXY(i, (uv.getX(i) * su) / 4, (uv.getY(i) * sv) / 4);
      }
      const m = new THREE.Mesh(geo, mats[Math.floor(r() * mats.length)]);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      const roof = new THREE.Mesh(new RoundedBoxGeometry(w + 0.2, 0.22, d + 0.2, 2, 0.06), roofMat);
      roof.position.set(x, h + 0.08, z);
      roof.receiveShadow = true;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.07, d + 0.24), this.neon[Math.floor(r() * this.neon.length)]);
      trim.position.set(x, h - 0.05, z);
      this.group.add(m, roof, trim);
      // antenna with a blinking light on some towers
      if (r() < 0.3) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6), roofMat);
        ant.position.set(x, h + 0.9, z);
        const blink = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), this.neon[0]);
        blink.position.set(x, h + 1.65, z);
        this.group.add(ant, blink);
      }
      return h;
    };
    // blocks on an 8-unit grid; inside the flight lane roofs stay well below Adam
    const lane = (x: number, z: number) => x > BOUNDS.minX - 3 && x < BOUNDS.maxX + 3 && z > BOUNDS.minZ - 6 && z < BOUNDS.maxZ + 3;
    for (let gx = -6; gx <= 6; gx++) {
      for (let gz = -9; gz <= 3; gz++) {
        const cx = gx * 8;
        const cz = gz * 8;
        if (Math.hypot(cx, cz) > 62) continue;
        for (const [ox, oz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
          if (r() < 0.18) continue;
          const x = cx + ox + (r() - 0.5) * 0.4;
          const z = cz + oz + (r() - 0.5) * 0.4;
          if (Math.abs(x - HOME_ROOF.x) < 4 && Math.abs(z - HOME_ROOF.z) < 4) continue;
          // keep the camera's corridor behind the home roof open (chase + intro shots)
          if (Math.abs(x - HOME_ROOF.x) < 7 && z > HOME_ROOF.z) continue;
          const w = 2.2 + r() * 1.1;
          const d = 2.2 + r() * 1.1;
          const far = Math.max(Math.abs(x) - 12, -z - 18, 0);
          const h = lane(x, z) ? 1.5 + r() * (FLY_Y - 3.6) : 4 + r() * 6 + Math.min(10, far * 0.35);
          add(x, z, w, d, h);
        }
      }
    }
    // a few landmark spires on the skyline
    for (const [x, z, h] of [[-22, -30, 22], [18, -36, 26], [34, -14, 18], [-36, -10, 16]]) {
      add(x, z, 4, 4, h);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 4), this.neon[2]);
      spire.position.set(x, h + 2, z);
      spire.rotation.y = Math.PI / 4;
      this.group.add(spire);
    }
    // sweeping searchlights from the far towers
    for (const [x, z] of [[-22, -30], [18, -36], [34, -14]]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 40, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.geometry.rotateX(Math.PI).translate(0, 20, 0);
      cone.position.set(x, 18, z);
      this.beams.push(cone);
      this.group.add(cone);
    }
  }

  /** Adam's hero rooftop: helipad with a glowing star where missions start and end. */
  private buildHomeRoof() {
    const R = HOME_ROOF;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(R.w, R.top, R.d),
      new THREE.MeshPhysicalMaterial({ color: 0x2a3a7a, roughness: 0.5, clearcoat: 0.3 }),
    );
    body.position.set(R.x, R.top / 2, R.z);
    body.castShadow = body.receiveShadow = true;
    const deck = new THREE.Mesh(new RoundedBoxGeometry(R.w + 0.3, 0.3, R.d + 0.3, 3, 0.1), new THREE.MeshPhysicalMaterial({ color: 0x3b4a8f, roughness: 0.6 }));
    deck.position.set(R.x, R.top + 0.1, R.z);
    deck.receiveShadow = true;
    this.padRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 10, 64), new THREE.MeshStandardMaterial({ color: 0x4edea3, emissive: 0x4edea3, emissiveIntensity: 2 }));
    this.padRing.rotation.x = -Math.PI / 2;
    this.padRing.position.set(R.x, R.top + 0.27, R.z);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 0.45 : 1.05;
      if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const starM = new THREE.Mesh(new THREE.ShapeGeometry(star), new THREE.MeshStandardMaterial({ color: 0xffd21f, emissive: 0xffa000, emissiveIntensity: 0.9 }));
    starM.rotation.x = -Math.PI / 2;
    starM.position.set(R.x, R.top + 0.26, R.z);
    // railing lights round the deck
    const bulbMat = this.neon[3];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), bulbMat);
      b.position.set(R.x + Math.cos(a) * (R.w / 2), R.top + 0.35, R.z + Math.sin(a) * (R.d / 2));
      this.group.add(b);
    }
    this.group.add(body, deck, this.padRing, starM);
  }

  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0x8fa2ff, 0x2a1a40, 0.9));
    const moonLight = new THREE.DirectionalLight(0xd6d0ff, 1.6);
    moonLight.position.set(14, 24, 10);
    moonLight.target.position.set(0, 0, -4);
    moonLight.castShadow = true;
    const ms = this.quality === 'high' ? 2048 : 1024;
    moonLight.shadow.mapSize.set(ms, ms);
    const sc = moonLight.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 18;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 70;
    moonLight.shadow.bias = -0.0006;
    moonLight.shadow.normalBias = 0.03;
    const rim = new THREE.DirectionalLight(0xff7ad9, 0.7);
    rim.position.set(-12, 8, -18);
    this.group.add(moonLight, moonLight.target, rim);
  }

  update(_dt: number, t: number) {
    this.beams.forEach((b, i) => b.rotation.set(0.35 + Math.sin(t * 0.5 + i) * 0.25, 0, Math.sin(t * 0.7 + i * 2) * 0.5));
    this.neon.forEach((m, i) => (m.emissiveIntensity = 2 + Math.sin(t * 3 + i * 1.3) * 0.5));
    this.padRing.scale.setScalar(1 + Math.sin(t * 2.5) * 0.05);
    this.stars.rotation.y = t * 0.004;
    this.moonGlow.material.opacity = 0.85 + Math.sin(t * 0.8) * 0.1;
  }
}
