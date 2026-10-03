import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { font } from '@/design-system/tokens';
import { makeFootball } from '../Football3D/props';
import { starShape } from './Island3D';
import { rng, type LocDef, type LocId } from './layout';

// ------------------------------------------------------------------ material / mesh helpers
const toy = (color: number, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, ...o });
const glow = (color: number, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
const additive = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}
const box = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

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

/** Additive soft-glow billboard (always faces the camera). */
function glowSprite(color: number, size: number) {
  const tex = canvasTex(128, 128, (c) => {
    const grd = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, 128, 128);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

export const GATE_COLOR: Record<LocId, number> = {
  football: 0x4edea3, hero: 0x38a8ff, racing: 0xff8a1f, treasure: 0xffc23a, closet: 0xff6fb5, stickers: 0xffd21f,
};

export interface LandmarkArt {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

// ------------------------------------------------------------------ landmarks (local +Z faces the plaza)
function stadium(): LandmarkArt {
  const g = new THREE.Group();
  const wall = toy(0x2f6bff, { side: THREE.DoubleSide });
  const bowl = mesh(
    new THREE.LatheGeometry([[3.0, 0], [4.3, 0], [4.45, 0.15], [4.45, 1.7], [4.25, 1.85], [3.4, 0.75], [3.05, 0.62]].map(([x, y]) => new THREE.Vector2(x, y)), 64),
    wall,
  );
  const crowdTex = canvasTex(512, 64, (c) => {
    c.fillStyle = '#1b2a5c';
    c.fillRect(0, 0, 512, 64);
    const r = rng(3);
    const cols = ['#ffd21f', '#ffffff', '#4edea3', '#ff6fb5', '#38a8ff', '#ff8a1f'];
    for (let y = 6; y < 64; y += 10) for (let x = 4; x < 512; x += 9) {
      c.fillStyle = cols[Math.floor(r() * cols.length)];
      c.beginPath();
      c.arc(x + r() * 3, y + r() * 2, 3.2, 0, Math.PI * 2);
      c.fill();
    }
  });
  crowdTex.wrapS = THREE.RepeatWrapping;
  crowdTex.repeat.set(5, 1);
  const stands = mesh(new THREE.LatheGeometry([new THREE.Vector2(3.42, 0.78), new THREE.Vector2(4.24, 1.83)], 64), toy(0xffffff, { map: crowdTex, side: THREE.DoubleSide }));
  stands.position.y = 0.01;
  const pitchTex = canvasTex(512, 512, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#2f9f55' : '#3bb565';
      c.fillRect(0, i * 64, 512, 64);
    }
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 6;
    c.strokeRect(96, 96, 320, 320);
    c.beginPath();
    c.moveTo(96, 256);
    c.lineTo(416, 256);
    c.stroke();
    c.beginPath();
    c.arc(256, 256, 48, 0, Math.PI * 2);
    c.stroke();
  });
  const pitch = mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.12, 48), [toy(0x2a8a4a), toy(0xffffff, { map: pitchTex, clearcoat: 0 }), toy(0x2a8a4a)]);
  pitch.position.y = 0.6;
  // tunnel entrance facing the plaza
  const tunnel = mesh(box(1.7, 1.4, 1.0, 0.25), toy(0x14204a));
  tunnel.position.set(0, 0.7, 4.3);
  const tunnelGlow = mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 32, Math.PI), glow(0x4edea3, 2.2), false);
  tunnelGlow.position.set(0, 0.55, 4.82);
  const mouth = mesh(new THREE.CircleGeometry(0.58, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050a1c }), false);
  mouth.position.set(0, 0.55, 4.81);
  g.add(bowl, stands, pitch, tunnel, tunnelGlow, mouth);
  // floodlights
  const lamps: THREE.MeshStandardMaterial[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const pole = mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8, 8), toy(0xc8d0e0, { metalness: 0.4 }));
    pole.position.set(Math.sin(a) * 4.7, 1.9, Math.cos(a) * 4.7);
    const lampMat = glow(0xffffff, 2.5);
    lamps.push(lampMat);
    const head = mesh(box(0.95, 0.55, 0.16, 0.06), lampMat, false);
    head.position.set(Math.sin(a) * 4.6, 3.85, Math.cos(a) * 4.6);
    head.lookAt(0, 0.6, 0);
    g.add(pole, head);
  }
  // mini goals
  const white = toy(0xffffff);
  for (const s of [-1, 1]) {
    const goal = new THREE.Group();
    for (const [x, y, w, h] of [[-0.55, 0.3, 0.06, 0.6], [0.55, 0.3, 0.06, 0.6], [0, 0.6, 1.16, 0.06]]) {
      const bar = mesh(new THREE.BoxGeometry(w, h, 0.06), white);
      bar.position.set(x, y, 0);
      goal.add(bar);
    }
    goal.position.set(0, 0.66, s * 2.3);
    g.add(goal);
  }
  // flags around the rim
  const flagCols = [0xffd21f, 0xffffff, 0x4edea3, 0xff6fb5];
  const flags: THREE.Mesh[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), white);
    pole.position.set(Math.sin(a) * 4.4, 2.15, Math.cos(a) * 4.4);
    const fl = mesh(new THREE.PlaneGeometry(0.5, 0.32), toy(flagCols[k % 4], { side: THREE.DoubleSide }), false);
    fl.geometry.translate(0.25, 0, 0);
    fl.position.set(Math.sin(a) * 4.4, 2.45, Math.cos(a) * 4.4);
    flags.push(fl);
    g.add(pole, fl);
  }
  const ball = makeFootball();
  ball.scale.setScalar(1.2);
  g.add(ball);
  return {
    group: g,
    update(_dt, t) {
      lamps.forEach((m, i) => (m.emissiveIntensity = 2.2 + (Math.sin(t * 5 + i * 1.7) > 0.8 ? 1.5 : 0)));
      const x = Math.sin(t * 0.9) * 2;
      ball.position.set(x, 0.86 + Math.abs(Math.sin(t * 3.2)) * 0.6, Math.sin(t * 1.4) * 1.4);
      ball.rotation.z = -t * 4;
      flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 4 + i) * 0.5));
    },
  };
}

function heroCity(): LandmarkArt {
  const g = new THREE.Group();
  const r = rng(9);
  // same lit-window pattern for the colour and glow maps
  const winCanvas = (emissive: boolean, lit: number[]) =>
    canvasTex(128, 128, (c) => {
      c.fillStyle = emissive ? '#000000' : '#c9d4ff';
      c.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const k = lit[y * 4 + x];
        c.fillStyle = emissive ? (k === 0 ? '#000000' : k === 1 ? '#ffe9a0' : '#8ff0ff') : k ? '#fff6cf' : '#5a6aa8';
        c.beginPath();
        c.roundRect(x * 32 + 8, y * 32 + 7, 16, 18, 4);
        c.fill();
      }
    });
  const base = mesh(box(7.2, 0.3, 6.8, 0.12), toy(0x3a4566));
  base.position.y = 0.15;
  g.add(base);
  const towers: [number, number, number, number, number][] = [
    [-2.1, -1.0, 1.5, 3.6, 0x3a6af0], [-0.4, -1.9, 1.7, 6.0, 0x4458e0], [1.7, -0.9, 1.5, 4.5, 0x7a4fe8],
    [2.3, 1.4, 1.2, 2.6, 0x2a9ae8], [-2.4, 1.5, 1.2, 2.2, 0x4f7af0], [0.2, 0.6, 1.3, 3.1, 0x6a5ae8],
  ];
  for (const [x, z, w, h, col] of towers) {
    const lit = Array.from({ length: 16 }, () => (r() < 0.35 ? 0 : r() < 0.7 ? 1 : 2));
    const map = winCanvas(false, lit);
    const em = winCanvas(true, lit);
    for (const t of [map, em]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    }
    const tower = mesh(box(w, h, w, 0.18), toy(col, { map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1.1 }));
    tower.position.set(x, 0.3 + h / 2, z);
    const roof = mesh(box(w * 1.06, 0.18, w * 1.06, 0.08), toy(0xffffff));
    roof.position.set(x, 0.3 + h + 0.05, z);
    g.add(tower, roof);
  }
  // spire + energy orb + spinning ring on the tallest tower
  const top = 0.3 + 6.0 + 0.15;
  const spire = mesh(new THREE.ConeGeometry(0.28, 1.1, 16), toy(0xff4b4b));
  spire.position.set(-0.4, top + 0.55, -1.9);
  const orbMat = glow(0x67e8f9, 4);
  const orb = mesh(new THREE.SphereGeometry(0.3, 24, 16), orbMat, false);
  orb.position.set(-0.4, top + 1.35, -1.9);
  const ring = mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 48), glow(0x4edea3, 2.5), false);
  ring.position.copy(orb.position);
  // sweeping searchlights
  const beams: THREE.Mesh[] = [];
  for (const [x, z, h] of [[1.7, -0.9, 4.5], [-2.1, -1.0, 3.6]] as const) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 6, 20, 1, true), additive(0xbfe9ff, 0.12));
    cone.geometry.rotateX(Math.PI).translate(0, 3, 0); // apex on the roof, widening upwards
    cone.position.set(x, 0.3 + h + 0.15, z);
    beams.push(cone);
    g.add(cone);
  }
  // a hero badge floating over the city
  const badge = mesh(
    new THREE.ExtrudeGeometry(starShape(0.55, 0.24), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }),
    toy(0xffd21f, { emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.3 }),
  );
  badge.position.set(1.2, 6.2, 0.6);
  g.add(spire, orb, ring, badge);
  return {
    group: g,
    update(_dt, t) {
      orb.scale.setScalar(1 + Math.sin(t * 5) * 0.15);
      orbMat.emissiveIntensity = 3.5 + Math.sin(t * 5) * 1.5;
      ring.rotation.set(t * 1.3, t * 0.9, 0);
      beams.forEach((b, i) => b.rotation.set(0.5 + Math.sin(t * 0.7 + i) * 0.25, 0, Math.sin(t * 0.9 + i * 2) * 0.6));
      badge.rotation.y = t * 1.5;
      badge.position.y = 6.2 + Math.sin(t * 2) * 0.2;
    },
  };
}

function raceTrack(): LandmarkArt {
  const g = new THREE.Group();
  const ellipse = (a: number, b: number, hole?: [number, number]) => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, a, b, 0, Math.PI * 2, false, 0);
    if (hole) {
      const h = new THREE.Path();
      h.absellipse(0, 0, hole[0], hole[1], 0, Math.PI * 2, true, 0);
      s.holes.push(h);
    }
    return s;
  };
  const flat = (shape: THREE.Shape, mat: THREE.Material, y: number, depth = 0.06) => {
    const m = mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 64 }), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    g.add(m);
    return m;
  };
  flat(ellipse(4.55, 3.15, [4.35, 2.95]), toy(0xff4b4b), 0.0, 0.1);
  flat(ellipse(4.35, 2.95, [2.85, 1.55]), toy(0x343a4f, { roughness: 0.8, clearcoat: 0 }), 0.0, 0.08);
  flat(ellipse(2.85, 1.55, [2.68, 1.38]), toy(0xffffff), 0.0, 0.1);
  flat(ellipse(2.68, 1.38), toy(0x5fd35f, { clearcoat: 0 }), 0.0, 0.05);
  // centre dashes
  const dash = toy(0xffd21f);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const d = mesh(new THREE.BoxGeometry(0.32, 0.02, 0.07), dash, false);
    d.position.set(Math.cos(a) * 3.6, 0.09, -Math.sin(a) * 2.25);
    d.rotation.y = Math.atan2(2.25 * Math.cos(a), -3.6 * Math.sin(a));
    g.add(d);
  }
  // checkered start line + light gantry
  const checker = canvasTex(128, 32, (c) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      c.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      c.fillRect(x * 8, y * 8, 8, 8);
    }
  });
  const line = mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshStandardMaterial({ map: checker }), false);
  line.rotation.x = -Math.PI / 2;
  line.position.set(3.6, 0.095, 0);
  const steel = toy(0xdfe6f2, { metalness: 0.3 });
  for (const x of [2.7, 4.5]) {
    const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), steel);
    post.position.set(x, 0.9, 0);
    g.add(post);
  }
  const beam = mesh(box(2.0, 0.34, 0.3, 0.08), toy(0x1c2238));
  beam.position.set(3.6, 1.85, 0);
  const lights = [0xff3b3b, 0xffd21f, 0x3dff7a].map((c, i) => {
    const m = glow(c, 0.3);
    const l = mesh(new THREE.SphereGeometry(0.1, 12, 8), m, false);
    l.position.set(3.1 + i * 0.5, 1.85, 0.16);
    g.add(l);
    return m;
  });
  g.add(line, beam);
  // grandstand behind the track
  const stand = new THREE.Group();
  const seatCols = [0xff4b4b, 0x2f74ff, 0xffd21f];
  for (let k = 0; k < 3; k++) {
    const step = mesh(box(4.2, 0.35, 0.5, 0.06), toy(seatCols[k]));
    step.position.set(0, 0.2 + k * 0.35, -k * 0.45);
    stand.add(step);
  }
  const roof = mesh(box(4.6, 0.12, 1.6, 0.05), toy(0xffffff));
  roof.position.set(0, 1.9, -0.5);
  stand.add(roof);
  for (const x of [-2.1, 2.1]) {
    const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), steel);
    p.position.set(x, 0.95, -1.1);
    stand.add(p);
  }
  stand.position.set(0, 0, -3.9);
  g.add(stand);
  // checkered flag
  const flag = mesh(new THREE.PlaneGeometry(0.9, 0.6, 8, 1), new THREE.MeshStandardMaterial({ map: checker, side: THREE.DoubleSide }), false);
  flag.geometry.translate(0.45, 0, 0);
  flag.position.set(-4.2, 2.1, 2.2);
  const flagPole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), steel);
  flagPole.position.set(-4.2, 1.2, 2.2);
  g.add(flag, flagPole);
  const flagBase = Float32Array.from(flag.geometry.attributes.position.array as ArrayLike<number>);
  // cars
  const cars = [0xff4b4b, 0x2f74ff, 0xffd21f].map((c) => {
    const car = new THREE.Group();
    const body = mesh(box(0.8, 0.26, 0.44, 0.1), toy(c, { clearcoat: 0.8 }));
    body.position.y = 0.2;
    const cabin = mesh(box(0.36, 0.2, 0.36, 0.08), toy(0xdff6ff, { roughness: 0.1, clearcoat: 1 }));
    cabin.position.set(-0.05, 0.38, 0);
    car.add(body, cabin);
    const tyre = toy(0x1a1a22, { clearcoat: 0 });
    for (const [x, z] of [[0.26, 0.23], [-0.26, 0.23], [0.26, -0.23], [-0.26, -0.23]]) {
      const w = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), tyre);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.1, z);
      car.add(w);
    }
    g.add(car);
    return car;
  });
  return {
    group: g,
    update(_dt, t) {
      cars.forEach((car, i) => {
        const a = t * (0.55 + i * 0.12) + i * 2.1;
        const rx = 3.6 + (i - 1) * 0.35;
        const rz = 2.25 + (i - 1) * 0.35;
        car.position.set(Math.cos(a) * rx, 0.08, -Math.sin(a) * rz);
        // heading along the tangent (car's length is local +X)
        car.rotation.y = Math.atan2(rz * Math.cos(a), -rx * Math.sin(a));
      });
      const phase = Math.floor(t * 1.5) % 4;
      lights.forEach((m, i) => (m.emissiveIntensity = phase === i || (phase === 3 && i === 2) ? 3 : 0.25));
      const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = flagBase[i * 3];
        pos.setZ(i, Math.sin(t * 6 - x * 5) * 0.12 * x);
      }
      pos.needsUpdate = true;
    },
  };
}

function treasure(): LandmarkArt {
  const g = new THREE.Group();
  const sand = mesh(new THREE.SphereGeometry(1, 32, 16), toy(0xf2d79c, { clearcoat: 0, roughness: 0.95 }));
  sand.scale.set(2.4, 0.4, 2.2);
  sand.position.y = -0.18;
  g.add(sand);
  // chest
  const wood = toy(0xa0602a, { roughness: 0.6 });
  const gold = toy(0xffc23a, { metalness: 0.6, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.3 });
  const chest = new THREE.Group();
  const body = mesh(box(1.2, 0.7, 0.8, 0.08), wood);
  body.position.y = 0.35;
  chest.add(body);
  for (const x of [-0.42, 0.42]) {
    const band = mesh(new THREE.BoxGeometry(0.1, 0.72, 0.82), gold);
    band.position.set(x, 0.36, 0);
    chest.add(band);
  }
  const coins = mesh(new THREE.SphereGeometry(0.5, 20, 10), glow(0xffc23a, 1.6), false);
  coins.scale.set(1.05, 0.32, 0.7);
  coins.position.y = 0.7;
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.7, -0.4);
  const lid = mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 20, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.z = 0.4;
  const lidBand = mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.1, 20, 1, false, 0, Math.PI), gold);
  lidBand.rotation.z = Math.PI / 2;
  lidBand.position.z = 0.4;
  lidPivot.add(lid, lidBand);
  const lock = mesh(box(0.18, 0.22, 0.08, 0.03), gold);
  lock.position.set(0, 0.6, 0.42);
  const shine = glowSprite(0xffd27a, 2.2);
  shine.position.set(0, 1.0, 0);
  chest.add(coins, lidPivot, lock, shine);
  g.add(chest);
  // palms
  const leaf = toy(0x2fd27a, { side: THREE.DoubleSide });
  const trunkMat = toy(0x9a6a3c, { roughness: 0.8 });
  const palms: THREE.Group[] = [];
  for (const [x, z, lean] of [[-1.9, -1.3, -0.4], [2.0, -1.1, 0.45]]) {
    const p = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.4, 1.3, 0.1), new THREE.Vector3(lean * 1.2, 2.8, 0.2)]);
    p.add(mesh(new THREE.TubeGeometry(curve, 12, 0.14, 8), trunkMat));
    const crown = new THREE.Group();
    crown.position.set(lean * 1.2, 2.8, 0.2);
    for (let k = 0; k < 7; k++) {
      const l = mesh(new THREE.SphereGeometry(1, 12, 6), leaf);
      l.scale.set(0.85, 0.05, 0.22);
      l.position.x = 0.75;
      const arm = new THREE.Group();
      arm.rotation.y = (k / 7) * Math.PI * 2;
      arm.rotation.z = -0.45;
      arm.add(l);
      crown.add(arm);
    }
    for (let k = 0; k < 3; k++) {
      const nut = mesh(new THREE.SphereGeometry(0.11, 10, 8), toy(0x6a4020));
      nut.position.set(Math.cos(k * 2.1) * 0.16, -0.12, Math.sin(k * 2.1) * 0.16);
      crown.add(nut);
    }
    p.add(crown);
    p.position.set(x, 0, z);
    palms.push(crown);
    g.add(p);
  }
  // friendly pirate flag
  const flagTex = canvasTex(256, 160, (c) => {
    c.fillStyle = '#1b1f2a';
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(128, 70, 38, 0, Math.PI * 2);
    c.fill();
    c.fillRect(106, 92, 44, 24);
    c.fillStyle = '#1b1f2a';
    c.beginPath();
    c.arc(114, 66, 9, 0, Math.PI * 2);
    c.arc(142, 66, 9, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#1b1f2a';
    c.beginPath();
    c.arc(128, 84, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(70, 120);
    c.lineTo(186, 150);
    c.moveTo(186, 120);
    c.lineTo(70, 150);
    c.stroke();
  });
  const flag = mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }), false);
  flag.geometry.translate(0.55, 0, 0);
  flag.position.set(0.5, 2.6, -1.9);
  const pole = mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.9, 6), trunkMat);
  pole.position.set(0.5, 1.45, -1.9);
  // X marks the spot
  const xMat = toy(0xd0302a);
  for (const r of [0.6, -0.6]) {
    const bar = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.16), xMat, false);
    bar.rotation.y = r;
    bar.position.set(0, 0.04, 1.25);
    g.add(bar);
  }
  g.add(flag, pole);
  return {
    group: g,
    update(_dt, t) {
      lidPivot.rotation.x = -0.55 - Math.abs(Math.sin(t * 1.6)) * 0.12;
      chest.position.y = Math.max(0, Math.sin(t * 3)) * 0.04;
      shine.material.opacity = 0.45 + Math.sin(t * 3) * 0.25;
      palms.forEach((p, i) => (p.rotation.z = Math.sin(t * 1.2 + i) * 0.06));
      flag.rotation.y = Math.sin(t * 3) * 0.35;
    },
  };
}

function closet(): LandmarkArt {
  const g = new THREE.Group();
  const house = mesh(box(3.6, 2.6, 3.0, 0.35), toy(0xff6fb5));
  house.position.y = 1.3;
  const roof = mesh(new THREE.ConeGeometry(3.0, 1.9, 4), toy(0x2f74ff));
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.85;
  roof.position.y = 2.6 + 0.9;
  const topStar = mesh(
    new THREE.ExtrudeGeometry(starShape(0.38, 0.16), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }),
    toy(0xffd21f, { emissive: 0xffa000, emissiveIntensity: 0.7 }),
  );
  topStar.position.set(0, 4.75, 0);
  const door = mesh(box(1.05, 1.6, 0.22, 0.2), toy(0x3a1460));
  door.position.set(0, 0.8, 1.5);
  const doorStar = mesh(
    new THREE.ExtrudeGeometry(starShape(0.28, 0.12), { depth: 0.05, bevelEnabled: false }),
    glow(0xffd21f, 1.6),
    false,
  );
  doorStar.position.set(0, 1.0, 1.62);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.2), additive(0xff6fb5, 0.25));
  doorGlow.position.set(0, 0.9, 1.63);
  const winMat = glow(0xfff1a8, 1.4);
  for (const x of [-1.15, 1.15]) {
    const w = mesh(new THREE.CircleGeometry(0.34, 24), winMat, false);
    w.position.set(x, 1.65, 1.51);
    const frame = mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 24), toy(0xffffff));
    frame.position.set(x, 1.65, 1.52);
    g.add(w, frame);
  }
  // a hero cape drying on a rail by the door
  const rail = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), toy(0xdfe6f2, { metalness: 0.3 }));
  rail.rotation.x = Math.PI / 2;
  rail.position.set(2.35, 1.9, 0.6);
  const capeGeo = new THREE.PlaneGeometry(0.9, 1.2, 6, 8);
  capeGeo.translate(0, -0.6, 0);
  const cape = mesh(capeGeo, toy(0xff3b3b, { side: THREE.DoubleSide }), false);
  cape.position.set(2.35, 1.9, 0.6);
  cape.rotation.y = Math.PI / 2;
  const capeBase = Float32Array.from(capeGeo.attributes.position.array as ArrayLike<number>);
  for (const z of [0.1, 1.1]) {
    const p = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), toy(0xdfe6f2));
    p.position.set(2.35, 0.95, z);
    g.add(p);
  }
  g.add(house, roof, topStar, door, doorStar, doorGlow, rail, cape);
  return {
    group: g,
    update(_dt, t) {
      topStar.rotation.y = t * 1.2;
      (doorGlow.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 2.5) * 0.12;
      const pos = capeGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = capeBase[i * 3 + 1];
        pos.setX(i, capeBase[i * 3] + Math.sin(t * 3 + y * 3) * 0.05 * -y);
        pos.setZ(i, Math.sin(t * 2.4 + capeBase[i * 3] * 4 + y * 2) * 0.08 * -y);
      }
      pos.needsUpdate = true;
    },
  };
}

function stickerBook(): LandmarkArt {
  const g = new THREE.Group();
  const ped = mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.8, 32), toy(0xfff3d6));
  ped.position.y = 0.4;
  const pageTex = (seed: number) =>
    canvasTex(256, 320, (c) => {
      c.fillStyle = '#fff6df';
      c.fillRect(0, 0, 256, 320);
      const r = rng(seed);
      const cols = ['#ff4b4b', '#2f7bff', '#ffd21f', '#2fd27a', '#a45bff', '#ff8a1f'];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) {
        c.fillStyle = '#ffffff';
        c.strokeStyle = '#e8c56a';
        c.lineWidth = 4;
        c.beginPath();
        c.roundRect(28 + x * 112, 26 + y * 98, 88, 80, 14);
        c.fill();
        c.stroke();
        c.fillStyle = cols[Math.floor(r() * cols.length)];
        c.beginPath();
        c.arc(72 + x * 112, 66 + y * 98, 26, 0, Math.PI * 2);
        c.fill();
      }
    });
  const book = new THREE.Group();
  book.position.y = 0.95;
  book.rotation.x = 0.35;
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.z = -s * 0.16;
    const cover = mesh(box(1.5, 0.1, 1.9, 0.04), toy(0xb0402a));
    cover.position.x = s * 0.78;
    const page = mesh(new THREE.PlaneGeometry(1.36, 1.76), new THREE.MeshStandardMaterial({ map: pageTex(s + 5), roughness: 0.8 }), false);
    page.rotation.x = -Math.PI / 2;
    page.position.set(s * 0.76, 0.065, 0);
    half.add(cover, page);
    book.add(half);
  }
  const stars: THREE.Mesh[] = [];
  const starGeo = new THREE.ExtrudeGeometry(starShape(0.3, 0.13), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  const starMat = toy(0xffd21f, { emissive: 0xffa000, emissiveIntensity: 0.8, metalness: 0.3 });
  for (let k = 0; k < 5; k++) {
    const s = mesh(starGeo, starMat, false);
    stars.push(s);
    g.add(s);
  }
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.8, 48), additive(0xffd21f, 0.3));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.03;
  g.add(ped, book, halo);
  return {
    group: g,
    update(_dt, t) {
      stars.forEach((s, i) => {
        const a = t * 0.8 + (i / stars.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 1.3, 2.4 + Math.sin(t * 2 + i) * 0.25, Math.sin(a) * 1.3);
        s.rotation.y = t * 2 + i;
      });
      halo.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
    },
  };
}

const BUILDERS: Record<LocId, () => LandmarkArt> = {
  football: stadium, hero: heroCity, racing: raceTrack, treasure, closet, stickers: stickerBook,
};

// ------------------------------------------------------------------ gate (portal arch)
export class Gate {
  readonly group = new THREE.Group();
  private uniforms: { uTime: { value: number }; uColor: { value: THREE.Color }; uA: { value: number } };
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshStandardMaterial;
  private archMat: THREE.MeshStandardMaterial;
  private locked = false;

  constructor(private readonly color: number) {
    const R = 1.25;
    const lift = 0.45;
    this.archMat = glow(color, 1.8);
    const arch = mesh(new THREE.TorusGeometry(R, 0.13, 12, 48, Math.PI), this.archMat, false);
    arch.position.y = lift;
    const stone = toy(0xf3e3bd);
    for (const s of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.17, 0.2, lift, 12), stone);
      post.position.set(s * R, lift / 2, 0);
      this.group.add(post);
    }
    // swirling portal surface (semicircle + rectangle)
    const sh = new THREE.Shape();
    sh.moveTo(-R + 0.05, -lift);
    sh.lineTo(R - 0.05, -lift);
    sh.lineTo(R - 0.05, 0);
    sh.absarc(0, 0, R - 0.05, 0, Math.PI, false);
    sh.lineTo(-R + 0.05, -lift);
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uA: { value: 0.75 } };
    const swirl = new THREE.Mesh(
      new THREE.ShapeGeometry(sh, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: this.uniforms,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uA; varying vec2 vP;
          void main(){
            float r = length(vP);
            float a = atan(vP.y, vP.x);
            float s = sin(a*3. + r*7. - uTime*4.) * 0.5 + 0.5;
            float edge = smoothstep(0.4, 1.2, r);
            float k = (0.25 + s*0.55) * (0.45 + edge*0.8);
            gl_FragColor = vec4(mix(uColor, vec3(1.), s*0.35) * k * uA, 1.);
          }`,
      }),
    );
    swirl.position.y = lift;
    this.ringMat = glow(color, 1.5);
    this.ring = mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 48), this.ringMat, false);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), additive(color, 0.22));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.03;
    this.group.add(arch, swirl, this.ring, pad);
  }

  setLocked(on: boolean) {
    this.locked = on;
    const c = on ? 0x8a90a6 : this.color;
    this.archMat.color.set(c);
    this.archMat.emissive.set(c);
    this.archMat.emissiveIntensity = on ? 0.25 : 1.8;
    this.ringMat.emissive.set(c);
    this.uniforms.uColor.value.set(c);
    this.uniforms.uA.value = on ? 0.18 : 0.75;
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
    if (!this.locked) this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  }
}

// ------------------------------------------------------------------ name label, lock, beacon
export function makeLabel(text: string, locked: boolean): THREE.Sprite {
  const W = 512;
  const H = 128;
  const tex = canvasTex(W, H, (c) => {
    c.font = `900 60px ${font.display}`;
    const tw = Math.min(W - 24, c.measureText(text).width + 70);
    c.fillStyle = 'rgba(8,14,29,0.82)';
    c.strokeStyle = locked ? '#8a90a6' : '#feb700';
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect((W - tw) / 2, 14, tw, H - 28, (H - 28) / 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.direction = 'rtl';
    c.fillText(text, W / 2, H / 2 + 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(3.4, 0.85, 1);
  s.renderOrder = 5;
  return s;
}

export function makeLock(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(box(0.8, 0.66, 0.34, 0.1), toy(0xffc23a, { metalness: 0.5, roughness: 0.3 }));
  const shackle = mesh(new THREE.TorusGeometry(0.26, 0.07, 10, 24, Math.PI), toy(0xc8ccd8, { metalness: 0.6, roughness: 0.25 }));
  shackle.position.y = 0.33;
  const hole = mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: 0x4a2a10 }), false);
  hole.position.set(0, 0.02, 0.172);
  g.add(body, shackle, hole);
  return g;
}

/** Soft grey mist puffs that hide a locked place. */
function makeMist(radius: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9c0d6, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const r = rng(Math.round(radius * 100));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(a) * radius * 0.8, 0.5 + r() * 1.4, Math.sin(a) * radius * 0.8);
    m.scale.setScalar(radius * (0.38 + r() * 0.22));
    g.add(m);
  }
  return g;
}

export function makeBeacon(): THREE.Group {
  const g = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.42, 0.8, 4), toy(0xffd21f, { emissive: 0xffa000, emissiveIntensity: 1.2 }), false);
  cone.rotation.x = Math.PI;
  g.add(cone);
  return g;
}

// ------------------------------------------------------------------ the full landmark
export class Landmark {
  readonly group = new THREE.Group();
  readonly art: LandmarkArt;
  readonly gate: Gate;
  readonly label: THREE.Sprite;
  readonly lock = makeLock();
  private mist: THREE.Group;
  private t0 = Math.random() * 5;

  constructor(readonly def: LocDef, readonly locked: boolean, gateAt: { x: number; z: number; yaw: number }) {
    this.art = BUILDERS[def.id]();
    this.group.position.set(def.at.x, 0, def.at.z);
    this.group.rotation.y = gateAt.yaw;
    this.group.add(this.art.group);
    this.gate = new Gate(GATE_COLOR[def.id]);
    this.gate.group.position.set(gateAt.x, 0, gateAt.z);
    this.gate.group.rotation.y = gateAt.yaw;
    this.label = makeLabel(def.nameAr, locked);
    this.label.position.set(def.at.x, def.height + 0.6, def.at.z);
    this.mist = makeMist(def.body);
    this.mist.position.copy(this.group.position);
    this.lock.position.set(def.at.x, def.height * 0.55 + 0.8, def.at.z);
    this.lock.rotation.y = gateAt.yaw;
    this.mist.visible = this.lock.visible = locked;
    this.gate.setLocked(locked);
  }

  /** everything to add to the scene */
  get objects(): THREE.Object3D[] {
    return [this.group, this.gate.group, this.label, this.mist, this.lock];
  }

  update(dt: number, t: number) {
    this.art.update(dt, t + this.t0);
    this.gate.update(t);
    if (this.locked) {
      this.lock.position.y = this.def.height * 0.55 + 0.8 + Math.sin(t * 2) * 0.12;
      this.mist.children.forEach((m, i) => (m.position.y += Math.sin(t * 0.8 + i) * 0.002));
    }
  }
}
