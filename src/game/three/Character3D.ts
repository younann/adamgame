import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Rigged, animated 3D characters (Kenney "Mini Characters", CC0) with kit recolouring.
 * Animations available: idle, walk, sprint, jump, fall, crouch, sit, drive, emote-yes,
 * emote-no, attack-kick-right/left, interact-right/left, pick-up, holding-*…
 */
export type CharacterModel =
  | 'male-a' | 'male-b' | 'male-c' | 'male-d' | 'male-e' | 'male-f'
  | 'female-a' | 'female-b' | 'female-c' | 'female-d' | 'female-e' | 'female-f';

export interface Kit {
  /** shirt + sleeves */
  shirt: number;
  /** shorts / trousers */
  shorts?: number;
  /** accent stripe colour mixed into the darkest shirt shade */
  accent?: number;
  /** hair colour (head-only strips that aren't the dark eye/mouth colour) */
  hair?: number;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

export function preloadCharacters(models: CharacterModel[]) {
  return Promise.all(models.map((m) => loadGltf(urlFor(m)).catch(() => null)));
}

const urlFor = (m: CharacterModel) => `/game/models/characters/character-${m}.glb`;

export class Character3D {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private ownedTextures: THREE.Texture[] = [];
  private ownedGeometries: THREE.BufferGeometry[] = [];

  private constructor(gltf: GLTF, scale: number) {
    this.model = skeletonClone(gltf.scene);
    this.model.scale.setScalar(scale);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // give each instance its own material so kits can differ
        m.material = (m.material as THREE.Material).clone();
      }
    });
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  static async create(model: CharacterModel, opts: { scale?: number; kit?: Kit } = {}): Promise<Character3D> {
    const gltf = await loadGltf(urlFor(model));
    const c = new Character3D(gltf, opts.scale ?? 1);
    if (opts.kit) c.applyKit(opts.kit);
    c.play('idle');
    return c;
  }

  get animations() {
    return [...this.actions.keys()];
  }

  /** Crossfade to an animation. Non-looping clips resolve when they finish. */
  play(name: string, o: { loop?: boolean; fade?: number; speed?: number; clampEnd?: boolean } = {}): Promise<void> {
    const next = this.actions.get(name);
    if (!next) return Promise.resolve();
    const loop = o.loop ?? true;
    const fade = o.fade ?? 0.18;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = o.clampEnd ?? !loop;
    next.timeScale = o.speed ?? 1;
    next.enabled = true;
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    this.currentName = name;
    if (loop) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== next) return;
        this.mixer.removeEventListener('finished', done);
        resolve();
      };
      this.mixer.addEventListener('finished', done);
    });
  }

  /** Duration (s) of a clip at a given speed — used to time kick contact etc. */
  duration(name: string, speed = 1) {
    return (this.actions.get(name)?.getClip().duration ?? 0) / speed;
  }

  get playing() {
    return this.currentName;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  /**
   * Recolour the kit by UV remapping. The shared atlas is a grid of vertical gradient strips
   * (16 columns × 4 bands) and one strip is often shared by unrelated parts (a black suit and
   * the eyes). So instead of repainting shared strips, each character gets a private copy of
   * its geometry and atlas; shirt / shorts / hair vertices are pointed at unused strips in the
   * atlas's empty top band, which are painted with the kit colours (keeping the original
   * strip's shading profile). Skin (hands, face) and shoes keep their original strips.
   */
  applyKit(kit: Kit) {
    let atlas: THREE.Texture | null = null;
    const meshes: THREE.SkinnedMesh[] = [];
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        meshes.push(m);
        atlas = atlas ?? ((m.material as THREE.MeshStandardMaterial).map ?? null);
      }
    });
    const img = (atlas as THREE.Texture | null)?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!img) return;
    const W = img.width;
    const H = img.height;
    const COLS = 16;
    const BANDS = 4;
    const cw = 1 / COLS;
    const ch = 1 / BANDS;
    const cellOf = (u: number, v: number) => {
      const cx = Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS)));
      const cy = Math.min(BANDS - 1, Math.max(0, Math.floor(v * BANDS)));
      return cy * COLS + cx;
    };

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H);
    const d = data.data;
    const lumAt = (u: number, v: number) => {
      const x = Math.min(W - 1, Math.floor(u * W));
      const y = Math.min(H - 1, Math.floor(v * H));
      const i = (y * W + x) * 4;
      return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    };
    const cellCentreLum = (c: number) => lumAt(((c % COLS) + 0.5) * cw, (Math.floor(c / COLS) + 0.5) * ch);

    // pass 1: classify strips
    const headCells = new Set<number>();
    const bodyCells = new Set<number>();
    const handCells = new Set<number>(); // skin on the body (hands) — shared with the face
    const legCount = new Map<number, number>();
    const boneOf = (m: THREE.SkinnedMesh, i: number) => {
      const geo = m.geometry;
      const si = geo.getAttribute('skinIndex');
      const sw = geo.getAttribute('skinWeight');
      if (!si || !sw) return '';
      let best = -1;
      let bone = '';
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > best) {
          best = w;
          bone = m.skeleton?.bones[si.getComponent(i, k)]?.name ?? '';
        }
      }
      return bone;
    };
    for (const m of meshes) {
      const uv = m.geometry.getAttribute('uv');
      if (!uv) continue;
      const isHead = /head/.test(m.name);
      for (let i = 0; i < uv.count; i++) {
        const c = cellOf(uv.getX(i), uv.getY(i));
        if (isHead) headCells.add(c);
        else {
          bodyCells.add(c);
          const bone = boneOf(m, i);
          if (/leg/.test(bone)) legCount.set(c, (legCount.get(c) ?? 0) + 1);
        }
      }
    }
    for (const c of bodyCells) if (headCells.has(c) && cellCentreLum(c) > 110) handCells.add(c); // skin
    const shortsCell = [...legCount.entries()].filter(([c]) => !handCells.has(c)).sort((a, b) => b[1] - a[1])[0]?.[0];
    const hairCells = new Set([...headCells].filter((c) => !bodyCells.has(c) && cellCentreLum(c) > 60));

    // destination strips in the empty top band (cols 4..6 of band 0)
    const SHIRT = 4;
    const SHORTS = 5;
    const HAIR = 6;
    const paintStrip = (dst: number, src: number, target: number) => {
      // copy the source strip's vertical shading profile, tinted with the target colour
      const sx = Math.floor(((src % COLS) + 0.5) * cw * W);
      const sy0 = Math.floor(Math.floor(src / COLS) * ch * H);
      const dx0 = Math.floor((dst % COLS) * cw * W);
      const dy0 = Math.floor(Math.floor(dst / COLS) * ch * H);
      const sh = Math.floor(ch * H);
      const sw = Math.floor(cw * W);
      let ref = 1;
      for (let y = 0; y < sh; y++) {
        const i = ((sy0 + y) * W + sx) * 4;
        ref = Math.max(ref, d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      }
      const tr = (target >> 16) & 255;
      const tg = (target >> 8) & 255;
      const tb = target & 255;
      for (let y = 0; y < sh; y++) {
        const si = ((sy0 + y) * W + sx) * 4;
        const k = 0.55 + 0.45 * ((d[si] * 0.3 + d[si + 1] * 0.59 + d[si + 2] * 0.11) / ref);
        for (let x = 0; x < sw; x++) {
          const di = ((dy0 + y) * W + dx0 + x) * 4;
          d[di] = Math.min(255, tr * k);
          d[di + 1] = Math.min(255, tg * k);
          d[di + 2] = Math.min(255, tb * k);
          d[di + 3] = 255;
        }
      }
    };

    // pass 2: private geometry with remapped UVs
    let shirtSrc = -1;
    for (const m of meshes) {
      m.geometry = m.geometry.clone();
      this.ownedGeometries.push(m.geometry);
      const uv = m.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
      if (!uv) continue;
      const isHead = /head/.test(m.name);
      const remap = (i: number, dst: number) => {
        const u = uv.getX(i);
        const v = uv.getY(i);
        const c = cellOf(u, v);
        const fu = u - (c % COLS) * cw;
        const fv = v - Math.floor(c / COLS) * ch;
        uv.setXY(i, (dst % COLS) * cw + fu, Math.floor(dst / COLS) * ch + fv);
      };
      for (let i = 0; i < uv.count; i++) {
        const c = cellOf(uv.getX(i), uv.getY(i));
        if (isHead) {
          if (kit.hair !== undefined && hairCells.has(c)) remap(i, HAIR);
          continue;
        }
        const bone = boneOf(m, i);
        if (/torso|arm/.test(bone) && !handCells.has(c)) {
          if (shirtSrc < 0) shirtSrc = c;
          remap(i, SHIRT);
        } else if (/leg/.test(bone) && kit.shorts !== undefined && c === shortsCell) {
          remap(i, SHORTS);
        }
      }
      uv.needsUpdate = true;
    }
    paintStrip(SHIRT, shirtSrc >= 0 ? shirtSrc : SHIRT, kit.shirt);
    if (kit.shorts !== undefined && shortsCell !== undefined) paintStrip(SHORTS, shortsCell, kit.shorts);
    const hairSrc = [...hairCells][0];
    if (kit.hair !== undefined && hairSrc !== undefined) paintStrip(HAIR, hairSrc, kit.hair);

    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // glTF convention
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.ownedTextures.push(tex);
    for (const m of meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const t of this.ownedTextures) t.dispose();
    for (const g of this.ownedGeometries) g.dispose();
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) (m.material as THREE.Material).dispose();
      // each cloned skeleton owns a small bone texture on the GPU
      if (m.isSkinnedMesh) m.skeleton?.dispose();
    });
  }
}
