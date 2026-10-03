import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { font } from '@/design-system/tokens';

// ------------------------------------------------------------------ football
let ballTex: THREE.CanvasTexture | null = null;
function footballTexture() {
  if (ballTex) return ballTex;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f6fb';
  g.fillRect(0, 0, W, H);
  // pentagon patches spread over the equirect map (approximate classic pattern)
  const pent = (x: number, y: number, r: number, sxScale: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      g.lineTo(x + Math.cos(a) * r * sxScale, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#1b1f2a';
    g.fill();
  };
  const rows: [number, number, number][] = [[H * 0.12, 3, 5], [H * 0.38, 5, 0], [H * 0.62, 5, 0.5], [H * 0.88, 3, 2.5]];
  for (const [y, n, off] of rows) {
    const stretch = 1 / Math.max(0.35, Math.sin((y / H) * Math.PI));
    for (let i = 0; i < n; i++) pent(((i + off / n + 0.5) / n) * W, y, 22, stretch);
  }
  g.strokeStyle = 'rgba(60,70,90,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x < W; x += W / 10) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 25, H);
    g.stroke();
  }
  ballTex = new THREE.CanvasTexture(c);
  ballTex.colorSpace = THREE.SRGBColorSpace;
  return ballTex;
}

export const BALL_R = 0.17;

export function makeFootball(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: footballTexture(), roughness: 0.45, metalness: 0 }));
  m.castShadow = true;
  m.position.y = BALL_R;
  return m;
}

export function makeColorBall(color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R * 1.15, 32, 20),
    new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.05, emissive: color, emissiveIntensity: 0.12 }),
  );
  m.castShadow = true;
  m.position.y = BALL_R * 1.15;
  return m;
}

// ------------------------------------------------------------------ text helpers
function labelCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function strokeText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string) {
  g.font = `900 ${size}px ${font.display}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = '#001849';
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/** Floating number popped above a counted ball. */
export function numberSprite(n: number | string, color = '#feb700'): THREE.Sprite {
  const tex = labelCanvas((g, w, h) => strokeText(g, String(n), w / 2, h / 2 + 6, 170, color));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.setScalar(0.55);
  s.renderOrder = 10;
  return s;
}

// ------------------------------------------------------------------ answer boards
export interface Board extends THREE.Group {
  userData: { glow: THREE.Mesh; face: THREE.Mesh; baseScale?: THREE.Vector3; value?: number };
}

/** Chunky 3D arcade sign (design-system depth + gloss) with a big number and quantity dots. */
export function makeBoard(value: number): Board {
  const grp = new THREE.Group() as Board;
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1.15, 1.15, 0.28, 4, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x2b3a66, roughness: 0.45, metalness: 0.1 }),
  );
  body.castShadow = true;
  const faceTex = labelCanvas((g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#4a5a8a');
    grd.addColorStop(1, '#1f2840');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(12, 10, w - 24, h * 0.36);
    strokeText(g, String(value), w / 2, h * 0.44, 150, '#ffffff');
    const per = Math.min(value, 5);
    for (let k = 0; k < value; k++) {
      const row = Math.floor(k / 5);
      const col = k % 5;
      const rc = row === 0 ? per : value - 5;
      g.beginPath();
      g.arc(w / 2 + (col - (rc - 1) / 2) * 30, h * 0.8 + row * 26, 9, 0, Math.PI * 2);
      g.fillStyle = '#ffdea8';
      g.fill();
    }
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.35 }));
  face.position.z = 0.142;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }));
  rim.scale.set(1, 1, 0.3);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 32),
    new THREE.MeshBasicMaterial({ color: 0xfeb700, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.z = -0.2;
  grp.add(glow, body, face);
  grp.userData = { glow, face, value };
  return grp;
}

/** Glowing target ring in the goal mouth with a number. */
export function makeTarget(value: number): Board {
  const grp = new THREE.Group() as Board;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 12, 48), new THREE.MeshStandardMaterial({ color: 0xfeb700, emissive: 0xfeb700, emissiveIntensity: 2.2 }));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4 }));
  const tex = labelCanvas((g, w, h) => {
    g.fillStyle = 'rgba(13,19,34,0.85)';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    g.fill();
    strokeText(g, String(value), w / 2, h / 2 + 8, 150, '#ffffff');
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 32),
    new THREE.MeshBasicMaterial({ color: 0x4edea3, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.z = -0.02;
  grp.add(glow, disc, ring, ring2);
  grp.userData = { glow, face: disc, value };
  return grp;
}

// ------------------------------------------------------------------ Sparky (3D)
export class Sparky3D {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private faceTex: THREE.CanvasTexture;
  private faceCanvas: HTMLCanvasElement;
  private bulb: THREE.MeshStandardMaterial;
  private jet: THREE.Mesh;
  talking = false;
  excited = false;
  private t = Math.random() * 5;

  constructor() {
    const shell = new THREE.Mesh(
      new RoundedBoxGeometry(0.62, 0.56, 0.5, 5, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2f74ff, roughness: 0.25, metalness: 0.15, emissive: 0x0a2a80, emissiveIntensity: 0.4 }),
    );
    shell.castShadow = true;
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 192;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), new THREE.MeshStandardMaterial({ map: this.faceTex, emissive: 0xffffff, emissiveMap: this.faceTex, emissiveIntensity: 1.8 }));
    screen.position.z = 0.252;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xb3c5ff }));
    ant.position.y = 0.37;
    this.bulb = new THREE.MeshStandardMaterial({ color: 0x4edea3, emissive: 0x4edea3, emissiveIntensity: 3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), this.bulb);
    bulb.position.y = 0.49;
    const ear = new THREE.MeshStandardMaterial({ color: 0xfeb700, emissive: 0xfeb700, emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), ear);
      e.rotation.z = Math.PI / 2;
      e.position.x = s * 0.33;
      this.body.add(e);
    }
    this.jet = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.35, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4edea3, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.jet.rotation.x = Math.PI;
    this.jet.position.y = -0.42;
    this.body.add(shell, screen, ant, bulb, this.jet);
    this.root.add(this.body);
    this.drawFace();
  }

  private drawFace() {
    const g = this.faceCanvas.getContext('2d')!;
    const w = this.faceCanvas.width;
    const h = this.faceCanvas.height;
    g.fillStyle = '#07142e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#4edea3';
    g.strokeStyle = '#4edea3';
    g.lineCap = 'round';
    g.lineWidth = 14;
    if (this.excited) {
      for (const cx of [80, 176]) {
        g.beginPath();
        g.moveTo(cx - 26, 82);
        g.lineTo(cx, 56);
        g.lineTo(cx + 26, 82);
        g.stroke();
      }
    } else {
      const blink = Math.sin(this.t * 0.9) > 0.985;
      for (const cx of [80, 176]) g.fillRect(cx - 18, blink ? 70 : 46, 36, blink ? 6 : 52);
    }
    if (this.talking) {
      for (let i = 0; i < 6; i++) {
        const bh = 10 + Math.abs(Math.sin(this.t * 16 + i * 1.3)) * 36;
        g.fillRect(68 + i * 22, 150 - bh / 2, 12, bh);
      }
    } else {
      g.beginPath();
      g.arc(w / 2, 128, 28, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    this.faceTex.needsUpdate = true;
  }

  update(dt: number) {
    this.t += dt;
    this.body.position.y = Math.sin(this.t * (this.excited ? 6 : 2.2)) * 0.06;
    this.body.rotation.z = Math.sin(this.t * 1.3) * 0.06 + (this.excited ? Math.sin(this.t * 9) * 0.08 : 0);
    this.bulb.emissiveIntensity = 2.5 + (this.talking ? Math.abs(Math.sin(this.t * 10)) * 3 : Math.sin(this.t * 2));
    this.jet.scale.y = 0.85 + Math.sin(this.t * 30) * 0.15;
    this.drawFace();
  }
}

// ------------------------------------------------------------------ particles
let dotTex: THREE.CanvasTexture | null = null;
function softDot() {
  if (dotTex) return dotTex;
  dotTex = labelCanvas((g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, 64, 64);
  return dotTex;
}

interface P3 {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size: number; r: number; g: number; b: number; grav: number; drag: number;
}

/** CPU-simulated, GPU-drawn additive particles (sparks, confetti glow, fireworks, trails). */
export class Particles3D {
  readonly points: THREE.Points;
  private ps: P3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  constructor(private readonly max = 1500) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { map: { value: softDot() }, uScale: { value: 400 } },
      vertexShader: `attribute float aSize; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = aSize * 400.0 / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * 2.2, t.a); }',
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, o: { count?: number; colors?: number[]; speed?: [number, number]; up?: number; gravity?: number; life?: [number, number]; size?: [number, number]; drag?: number; spread?: number } = {}) {
    const colors = o.colors ?? [0xfeb700, 0x4edea3, 0x1e6bff, 0xffffff];
    const n = o.count ?? 40;
    for (let i = 0; i < n && this.ps.length < this.max; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = (o.speed?.[0] ?? 1.5) + Math.random() * ((o.speed?.[1] ?? 5) - (o.speed?.[0] ?? 1.5));
      const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
      const life = (o.life?.[0] ?? 0.6) + Math.random() * ((o.life?.[1] ?? 1.2) - (o.life?.[0] ?? 0.6));
      const spr = o.spread ?? 0;
      this.ps.push({
        x: at.x + (Math.random() - 0.5) * spr, y: at.y + (Math.random() - 0.5) * spr, z: at.z + (Math.random() - 0.5) * spr,
        vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp + (o.up ?? 0), vz: Math.sin(ph) * Math.sin(th) * sp,
        life, max: life, size: (o.size?.[0] ?? 0.05) + Math.random() * ((o.size?.[1] ?? 0.12) - (o.size?.[0] ?? 0.05)),
        r: c.r, g: c.g, b: c.b, grav: o.gravity ?? 4, drag: o.drag ?? 0.6,
      });
    }
  }

  update(dt: number) {
    let w = 0;
    for (const p of this.ps) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.pow(1 - p.drag, dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.ps[w++] = p;
    }
    this.ps.length = w;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (p) {
        this.pos[i * 3] = p.x;
        this.pos[i * 3 + 1] = p.y;
        this.pos[i * 3 + 2] = p.z;
        const a = Math.min(1, (p.life / p.max) * 2);
        this.col[i * 3] = p.r * a;
        this.col[i * 3 + 1] = p.g * a;
        this.col[i * 3 + 2] = p.b * a;
        this.size[i] = p.size;
      } else {
        this.size[i] = 0;
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

/** Glowing energy orb (bloom) used when an answer powers Adam. */
export function makeOrb(color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 6 }));
}

/** Golden championship cup (lathe) with emissive shine for bloom. */
export function makeTrophy(): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.85, roughness: 0.22, emissive: 0x8a5a00, emissiveIntensity: 0.5 });
  const pts = [
    [0, 0], [0.32, 0], [0.32, 0.08], [0.12, 0.12], [0.08, 0.35], [0.1, 0.45], [0.28, 0.55], [0.4, 0.8], [0.44, 1.05], [0.4, 1.06], [0.0, 1.06],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), gold);
  cup.castShadow = true;
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.18, 0.62, 3, 0.05), new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.6 }));
  base.position.y = -0.09;
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 24, Math.PI * 1.3), gold);
    h.position.set(s * 0.44, 0.78, 0);
    h.rotation.z = s > 0 ? -0.6 : Math.PI + 0.6;
    g.add(h);
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: 0x1e6bff, emissive: 0x1e6bff, emissiveIntensity: 2 }));
  star.position.set(0, 0.75, 0.4);
  g.add(cup, base, star);
  return g;
}

/** Big floating 3D button (play again / home). */
export function makeChoiceButton(kind: 'again' | 'home'): THREE.Group {
  const g = new THREE.Group();
  const color = kind === 'again' ? 0x2fd389 : 0x2f74ff;
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.1, 0.35, 5, 0.3), new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.35 }));
  body.castShadow = true;
  g.add(body);
  if (kind === 'again') {
    const b = makeFootball();
    b.scale.setScalar(2.2);
    b.position.set(0, 0, 0.3);
    g.add(b);
  } else {
    const tex = labelCanvas((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(w / 2, h * 0.18);
      c.lineTo(w * 0.85, h * 0.52);
      c.lineTo(w * 0.74, h * 0.52);
      c.lineTo(w * 0.74, h * 0.84);
      c.lineTo(w * 0.26, h * 0.84);
      c.lineTo(w * 0.26, h * 0.52);
      c.lineTo(w * 0.15, h * 0.52);
      c.closePath();
      c.fill();
      c.fillStyle = '#2f74ff';
      c.fillRect(w * 0.43, h * 0.62, w * 0.14, h * 0.22);
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    face.position.z = 0.18;
    g.add(face);
  }
  return g;
}
