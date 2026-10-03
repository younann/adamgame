import * as THREE from 'three';
import { font } from '@/design-system/tokens';

const SKIN = [0xf6cfa8, 0xe9b48a, 0xc98e62, 0x9c6a43, 0x6e4a2e];
const FAN_ADAM = [0x1e6bff, 0xfeb700, 0xffffff, 0x1e6bff, 0x2f7bff, 0x4edea3];
const FAN_RIVAL = [0x8b3dff, 0xff8a1f];

export const GOAL = { z: -10, halfW: 3, h: 2.2, depth: 1.4 };
export const SPOT_Z = -3.6;

/**
 * Night stadium in 3D: sky + stars, striped pitch with markings, tiered stands with an
 * instanced (GPU-animated) crowd, floodlight towers with glowing panels and light beams,
 * neon roof trim, scrolling LED boards, waving flags, and a goal whose net bulges.
 */
export class Stadium3D {
  readonly group = new THREE.Group();
  readonly netMesh: THREE.Mesh;
  private crowdUniforms = { uTime: { value: 0 }, uHype: { value: 0 } };
  private flagUniforms = { uTime: { value: 0 } };
  private ledTex: THREE.CanvasTexture;
  private ledCanvas: HTMLCanvasElement;
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private beams: THREE.Mesh[] = [];
  private netBase: Float32Array;
  private bulge = { x: 0, y: 1, amp: 0, vel: 0 };
  private stars!: THREE.Points;
  private flashT = 0;
  hype = 0;

  constructor(private readonly quality: 'high' | 'low') {
    this.buildSky();
    this.buildPitch();
    this.buildStands();
    this.buildLights();
    const led = this.buildLed();
    this.ledCanvas = led.canvas;
    this.ledTex = led.tex;
    this.netMesh = this.buildGoal();
    this.netBase = Float32Array.from((this.netMesh.geometry as THREE.BufferGeometry).attributes.position.array as ArrayLike<number>);
    this.buildFlags();
  }

  // ------------------------------------------------------------------ sky
  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `varying vec3 vP;
          void main(){
            float h = clamp(vP.y*1.4+0.15, 0., 1.);
            vec3 top = vec3(0.012,0.025,0.075);
            vec3 mid = vec3(0.05,0.10,0.26);
            vec3 hor = vec3(0.12,0.20,0.48);
            vec3 c = mix(hor, mid, smoothstep(0.,0.35,h));
            c = mix(c, top, smoothstep(0.35,1.,h));
            gl_FragColor = vec4(c,1.);
          }`,
      }),
    );
    this.group.add(sky);
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.85 + 0.15);
      pos.set([Math.cos(th) * Math.sin(ph) * 150, Math.cos(ph) * 150, Math.sin(th) * Math.sin(ph) * 150], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }));
    this.group.add(this.stars);
  }

  // ------------------------------------------------------------------ pitch
  private buildPitch() {
    const W = 1024;
    const H = 1536;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    // pitch covers x ∈ [-16,16], z ∈ [-12, 36] → 32 × 48 units
    const sx = W / 32;
    const sz = H / 48;
    const X = (x: number) => (x + 16) * sx;
    const Z = (z: number) => (z + 12) * sz;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#2a9a55' : '#33ad62';
      g.fillRect(0, (i * H) / 16, W, H / 16 + 1);
    }
    // soft noise for grass texture
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,40,10'},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 5;
    const rect = (x0: number, z0: number, x1: number, z1: number) => g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    g.beginPath();
    g.moveTo(X(-16), Z(GOAL.z));
    g.lineTo(X(16), Z(GOAL.z));
    g.stroke();
    rect(-7.5, GOAL.z, 7.5, GOAL.z + 7.5); // penalty box
    rect(-4, GOAL.z, 4, GOAL.z + 2.8); // goal area
    g.beginPath();
    g.arc(X(0), Z(SPOT_Z), 2.6 * sx, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(X(0), Z(SPOT_Z), 0.16 * sx, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(X(-16), Z(14));
    g.lineTo(X(16), Z(14));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Z(14), 4 * sx, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(32, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0, 12);
    pitch.receiveShadow = true;
    this.group.add(pitch);
    // surrounding apron
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 110), new THREE.MeshStandardMaterial({ color: 0x1d6b3e, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.01, 10);
    apron.receiveShadow = true;
    this.group.add(apron);
  }

  // ------------------------------------------------------------------ stands + crowd
  private buildStands() {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1a2650, roughness: 0.85 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x2b3b78, roughness: 0.8 });
    const seats: { x: number; y: number; z: number; rival: boolean }[] = [];
    const tiers = 9;
    // behind the goal (curved band) + two side stands
    const addBand = (cx: number, cz: number, rot: number, length: number, start: number) => {
      const band = new THREE.Group();
      band.position.set(cx, 0, cz);
      band.rotation.y = rot;
      for (let t = 0; t < tiers; t++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(length, 0.6, 1.2), t % 2 ? stepMat : standMat);
        step.position.set(0, 0.3 + t * 0.62, -(start + t * 1.15));
        step.receiveShadow = true;
        band.add(step);
        const n = Math.floor(length / 0.55);
        for (let i = 0; i < n; i++) {
          if (Math.random() < 0.08) continue;
          const lx = -length / 2 + (i + 0.5) * (length / n) + (Math.random() - 0.5) * 0.12;
          const v = new THREE.Vector3(lx, 0.62 + t * 0.62, -(start + t * 1.15));
          v.applyEuler(new THREE.Euler(0, rot, 0)).add(new THREE.Vector3(cx, 0, cz));
          seats.push({ x: v.x, y: v.y, z: v.z, rival: rot === 0 && lx > length * 0.28 });
        }
      }
      // roof trim with neon (bloom)
      const roofY = 0.3 + tiers * 0.62 + 0.9;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 1, 0.35, 1.6), new THREE.MeshStandardMaterial({ color: 0x0a1024, roughness: 0.6 }));
      roof.position.set(0, roofY, -(start + tiers * 1.15 - 0.4));
      band.add(roof);
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(length + 1, 0.08, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x1e6bff, emissive: 0x1e6bff, emissiveIntensity: 3.2 }),
      );
      neon.position.set(0, roofY - 0.2, -(start + tiers * 1.15 - 1.2));
      band.add(neon);
      this.group.add(band);
    };
    addBand(0, GOAL.z, 0, 40, 4.5); // behind goal
    addBand(-17.5, 6, Math.PI / 2, 30, 0.8); // left
    addBand(17.5, 6, -Math.PI / 2, 30, 0.8); // right

    // instanced crowd: body + head, bobbing on the GPU
    const count = this.quality === 'high' ? seats.length : Math.floor(seats.length * 0.6);
    const used = seats.sort(() => Math.random() - 0.5).slice(0, count);
    const bodyGeo = new THREE.CapsuleGeometry(0.16, 0.26, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.13, 10, 8);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) phase[i] = Math.random() * Math.PI * 2;
    bodyGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    headGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const mk = (geo: THREE.BufferGeometry) => {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.crowdUniforms.uTime;
        sh.uniforms.uHype = this.crowdUniforms.uHype;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nuniform float uHype;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             float sp = 3.0 + uHype * 5.0;
             transformed.y += abs(sin(uTime * sp + aPhase)) * (0.04 + uHype * 0.32);`,
          );
      };
      return new THREE.InstancedMesh(geo, mat, count);
    };
    const bodies = mk(bodyGeo);
    const heads = mk(headGeo);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    used.forEach((s, i) => {
      m.makeTranslation(s.x, s.y + 0.3, s.z);
      bodies.setMatrixAt(i, m);
      const pal = s.rival ? FAN_RIVAL : FAN_ADAM;
      bodies.setColorAt(i, col.setHex(pal[Math.floor(Math.random() * pal.length)]));
      m.makeTranslation(s.x, s.y + 0.7, s.z);
      heads.setMatrixAt(i, m);
      heads.setColorAt(i, col.setHex(SKIN[Math.floor(Math.random() * SKIN.length)]));
    });
    this.group.add(bodies, heads);
  }

  // ------------------------------------------------------------------ lights
  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0x9cbcff, 0x0f2a18, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.8);
    sun.position.set(6, 16, 8);
    sun.target.position.set(0, 0, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 14;
    sc.bottom = -10;
    sc.near = 1;
    sc.far = 50;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.group.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0x6f9bff, 0.9);
    rim.position.set(-8, 6, -14);
    this.group.add(rim);

    const towers: [number, number][] = [[-15, -15], [15, -15], [-15, 22], [15, 22]];
    for (const [x, z] of towers) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 13, 8), new THREE.MeshStandardMaterial({ color: 0x2a3350, metalness: 0.4, roughness: 0.5 }));
      pole.position.set(x, 6.5, z);
      this.group.add(pole);
      const head = new THREE.Group();
      head.position.set(x, 13.2, z);
      head.lookAt(0, 0, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 0.3), new THREE.MeshStandardMaterial({ color: 0x1b2240, roughness: 0.5 }));
      head.add(frame);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 4 });
      this.lampMats.push(lampMat);
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 2; b++) {
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), lampMat);
          lamp.position.set(-1.15 + a * 0.77, -0.4 + b * 0.8, 0.16);
          head.add(lamp);
        }
      this.group.add(head);
      // light beam (additive cone) toward the pitch centre
      const len = Math.hypot(x, 13, z + 2);
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(4.2, len, 24, 1, true),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uAlpha: { value: 0.07 } },
          vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
          fragmentShader: 'uniform float uAlpha; varying float vY; void main(){ gl_FragColor = vec4(0.85,0.95,1.0, uAlpha * pow(vY, 1.6)); }',
        }),
      );
      beam.geometry.translate(0, -len / 2, 0);
      beam.position.set(x, 13.2, z);
      beam.lookAt(0, 0, -2);
      beam.rotateX(-Math.PI / 2);
      this.beams.push(beam);
      this.group.add(beam);
    }
  }

  // ------------------------------------------------------------------ LED boards
  private buildLed() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(34, 0.75, 0.15), [mat, mat, mat, mat, mat, mat]);
    board.position.set(0, 0.38, GOAL.z - 2.6);
    this.group.add(board);
    for (const side of [-1, 1]) {
      const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(30, 0.75, 0.15), mat);
      sideBoard.position.set(side * 16.2, 0.38, 6);
      sideBoard.rotation.y = Math.PI / 2;
      this.group.add(sideBoard);
    }
    this.drawLed(canvas, '⚽ ADAM  ★  GOAL STADIUM  ★  آدم بطل الملعب  ★', tex);
    return { canvas, tex };
  }

  private drawLed(canvas: HTMLCanvasElement, msg: string, tex: THREE.CanvasTexture) {
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#05070f';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.font = `900 40px ${font.display}`;
    g.textBaseline = 'middle';
    let x = 10;
    let i = 0;
    while (x < canvas.width) {
      g.fillStyle = i++ % 2 ? '#4edea3' : '#feb700';
      g.fillText(msg, x, canvas.height / 2 + 2);
      x += g.measureText(msg).width + 60;
    }
    tex.needsUpdate = true;
  }

  setLedMessage(msg: string) {
    this.drawLed(this.ledCanvas, msg, this.ledTex);
  }

  // ------------------------------------------------------------------ goal + net
  private buildGoal(): THREE.Mesh {
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.15 });
    const r = 0.07;
    const post = (x: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL.h, 16), postMat);
      m.position.set(x, GOAL.h / 2, GOAL.z);
      m.castShadow = true;
      this.group.add(m);
    };
    post(-GOAL.halfW);
    post(GOAL.halfW);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL.halfW * 2 + r * 2, 16), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL.h, GOAL.z);
    bar.castShadow = true;
    this.group.add(bar);
    // golden glow strip on the crossbar (design: golden goal frame)
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(GOAL.halfW * 2, 0.03, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xfeb700, emissive: 0xfeb700, emissiveIntensity: 2.5 }),
    );
    glow.position.set(0, GOAL.h + 0.08, GOAL.z + 0.02);
    this.group.add(glow);

    // net texture
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 6;
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    const netTex = new THREE.CanvasTexture(c);
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = (rx: number, ry: number) => {
      const t = netTex.clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9, color: 0xe8eeff });
    };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.halfW * 2, GOAL.h, 30, 12), netMat(14, 5));
    back.position.set(0, GOAL.h / 2, GOAL.z - GOAL.depth);
    back.castShadow = false;
    this.group.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.depth, GOAL.h), netMat(3.5, 5));
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * GOAL.halfW, GOAL.h / 2, GOAL.z - GOAL.depth / 2);
      this.group.add(side);
    }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.halfW * 2, GOAL.depth), netMat(14, 3.5));
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, GOAL.h, GOAL.z - GOAL.depth / 2);
    this.group.add(roof);
    return back;
  }

  /** Ball hits the net at local x (−halfW..halfW) and height y. */
  hitNet(x: number, y: number) {
    this.bulge.x = x;
    this.bulge.y = y;
    this.bulge.amp = 0.75;
    this.bulge.vel = 0;
  }

  goal() {
    this.hype = 3.5;
    this.flashT = 1;
  }

  // ------------------------------------------------------------------ flags
  private buildFlags() {
    const colors = [0x1e6bff, 0xfeb700, 0x4edea3, 0x1e6bff, 0xfeb700, 0x4edea3];
    colors.forEach((c, i) => {
      const x = -12.5 + i * 5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0xb3c5ff }));
      pole.position.set(x, 7.6, GOAL.z - 15.2);
      const mat = new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.flagUniforms.uTime;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
             float k = (position.x + 0.6) / 1.2;
             transformed.z += sin(uTime * 5.0 + position.x * 4.0 + ${i.toFixed(1)}) * 0.18 * k;`);
      };
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7, 12, 2), mat);
      flag.position.set(x + 0.6, 8.35, GOAL.z - 15.2);
      this.group.add(pole, flag);
    });
  }

  // ------------------------------------------------------------------ update
  update(dt: number, t: number) {
    this.hype = Math.max(0, this.hype - dt);
    this.crowdUniforms.uTime.value = t;
    this.crowdUniforms.uHype.value = Math.min(1, this.hype);
    this.flagUniforms.uTime.value = t;
    this.ledTex.offset.x = (this.ledTex.offset.x + dt * (0.03 + this.hype * 0.05)) % 1;
    (this.stars.material as THREE.PointsMaterial).opacity = 0.65 + Math.sin(t * 1.3) * 0.15;
    this.flashT = Math.max(0, this.flashT - dt * 0.7);
    for (const m of this.lampMats) m.emissiveIntensity = 4 + Math.sin(t * 13) * 0.15 + this.flashT * 5;
    for (const b of this.beams) (b.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 0.07 + this.flashT * 0.12;
    // net spring
    const b = this.bulge;
    if (Math.abs(b.amp) > 0.002 || Math.abs(b.vel) > 0.002) {
      b.vel += (-b.amp * 70 - b.vel * 7) * dt;
      b.amp += b.vel * dt;
      const pos = (this.netMesh.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const base = this.netBase;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1] + GOAL.h / 2;
        const d = Math.hypot(x - b.x, (y - b.y) * 1.2);
        const k = Math.max(0, 1 - d / 2.2);
        pos.setZ(i, base[i * 3 + 2] - b.amp * k * k);
      }
      pos.needsUpdate = true;
    }
  }
}
