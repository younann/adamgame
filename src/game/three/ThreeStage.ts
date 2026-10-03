import * as THREE from 'three';
import {
  BloomEffect,
  HueSaturationEffect,
  BrightnessContrastEffect,
  type Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

export type Quality = 'high' | 'low';

export interface StageLook {
  bloomIntensity?: number;
  bloomThreshold?: number;
  vignette?: number;
  exposure?: number;
  saturation?: number;
  contrast?: number;
}

/**
 * The 3D render layer. A Three.js canvas sits UNDER the Pixi canvas (which becomes
 * transparent while a 3D scene is active), so 3D worlds get real lighting, shadows and
 * post-processing while HUD text, flying stars and big arcade text keep using Pixi.
 *
 * One stage per engine, created lazily the first time a 3D scene is entered.
 */
export class ThreeStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly quality: Quality;
  private composer: EffectComposer | null = null;
  private bloom: BloomEffect | null = null;
  private effects: Effect[] = [];
  private active: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private w = 1;
  private h = 1;

  constructor(host: HTMLElement) {
    this.quality = detectQuality();
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // SMAA in post (cheaper and better with bloom)
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.75 : 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in post
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;touch-action:none;';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(this.canvas, host.firstChild);
  }

  /** Attach a 3D scene + camera and build its post-processing chain. */
  setScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera, look: StageLook = {}) {
    for (const e of this.effects) e.dispose();
    this.effects = [];
    this.composer?.dispose();
    this.active = { scene, camera };
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: look.bloomThreshold ?? 0.75,
      luminanceSmoothing: 0.2,
      intensity: look.bloomIntensity ?? (this.quality === 'high' ? 1.1 : 0.8),
      radius: 0.7,
      levels: this.quality === 'high' ? 7 : 5,
    });
    const effects: Effect[] = [
      this.bloom,
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new HueSaturationEffect({ saturation: look.saturation ?? 0.18 }),
      new BrightnessContrastEffect({ contrast: look.contrast ?? 0.12 }),
      new VignetteEffect({ darkness: look.vignette ?? 0.5, offset: 0.32 }),
    ];
    if (this.quality === 'high') effects.unshift(new SMAAEffect());
    composer.addPass(new EffectPass(camera, ...effects));
    this.effects = effects;
    this.composer = composer;
    this.renderer.toneMappingExposure = look.exposure ?? 1;
    this.resize(this.w, this.h);
    this.canvas.style.display = 'block';
  }

  clearScene() {
    this.active = null;
    // effects own GPU resources (SMAA lookup textures, bloom mip chain) — free them explicitly
    for (const e of this.effects) e.dispose();
    this.effects = [];
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.canvas.style.display = 'none';
    this.renderer.renderLists.dispose();
  }

  get hasScene() {
    return this.active !== null;
  }

  /** Bloom pulse for goals / explosions. */
  setBloom(intensity: number) {
    if (this.bloom) this.bloom.intensity = intensity;
  }

  resize(w: number, h: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.renderer.setSize(this.w, this.h, false);
    this.composer?.setSize(this.w, this.h);
    if (this.active) {
      this.active.camera.aspect = this.w / this.h;
      this.active.camera.updateProjectionMatrix();
    }
  }

  render(dtSec: number) {
    if (!this.active || !this.composer) return;
    this.composer.render(dtSec);
  }

  /** Screen (CSS px) → first hit among `targets` (recursive). */
  pick(x: number, y: number, targets: THREE.Object3D[]): THREE.Intersection | null {
    if (!this.active) return null;
    const ndc = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.active.camera);
    const hits = this.raycaster.intersectObjects(targets, true);
    return hits[0] ?? null;
  }

  /** World position → screen CSS px. */
  project(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    if (!this.active) return { x: this.w / 2, y: this.h / 2, behind: false };
    const p = v.clone().project(this.active.camera);
    return { x: ((p.x + 1) / 2) * this.w, y: ((1 - p.y) / 2) * this.h, behind: p.z > 1 };
  }

  dispose() {
    this.clearScene();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

function detectQuality(): Quality {
  try {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (mem !== undefined && mem < 3) return 'low';
    if ((navigator.hardwareConcurrency ?? 8) < 4) return 'low';
  } catch {
    /* ignore */
  }
  return 'high';
}

/** Dispose every geometry / material / texture under an object (scene teardown). */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    // lights keep a shadow render target (colour + depth) that removal alone doesn't free
    const light = o as THREE.Light & { shadow?: THREE.LightShadow };
    if (light.isLight && light.shadow) light.shadow.dispose();
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
        if (v instanceof THREE.Texture) v.dispose();
      }
      mat.dispose();
    }
  });
}
