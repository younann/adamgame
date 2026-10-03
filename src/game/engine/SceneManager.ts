import type { Container } from 'pixi.js';
import { useGame, type SceneId } from '@/state/gameStore';
import type { GameEngine } from './GameEngine';
import type { Scene } from './Scene';
import type { TransitionKind } from './Transitions';
import { logError } from './errorLog';
import { canUse3D } from '../three/support';

type SceneCtor = new (engine: GameEngine, data?: Record<string, unknown>) => Scene;

/**
 * Lazy scene registry: distant worlds are split into their own chunks and only loaded
 * (during the themed transition) when Adam travels there. The service worker precaches
 * every chunk, so this also works offline.
 */
const REGISTRY: Record<SceneId, () => Promise<{ default: SceneCtor }>> = {
  boot: () => import('../scenes/BootScene'),
  // walkable 3D island when the device supports it; the 2D map remains as a fallback
  world: () => (canUse3D() ? import('../scenes/World3D').catch(() => import('../scenes/WorldScene')) : import('../scenes/WorldScene')),
  // 3D stadium when the device supports it (and the parent hasn't chosen classic graphics);
  // the 2D stadium remains as a fallback
  football: () =>
    canUse3D() ? import('../scenes/Football3D').catch(() => import('../scenes/FootballScene')) : import('../scenes/FootballScene'),
  hero: () => (canUse3D() ? import('../scenes/HeroCity3D').catch(() => import('../scenes/HeroCityScene')) : import('../scenes/HeroCityScene')),
  racing: () => (canUse3D() ? import('../scenes/Racing3D').catch(() => import('../scenes/RacingScene')) : import('../scenes/RacingScene')),
  treasure: () => import('../scenes/TreasureScene'),
  closet: () => import('../scenes/ClosetScene'),
  stickers: () => import('../scenes/StickerScene'),
  rest: () => import('../scenes/RestScene'),
};

export const SCENE_TRANSITION: Record<SceneId, TransitionKind> = {
  boot: 'cut',
  world: 'iris',
  football: 'tunnel',
  hero: 'portal',
  racing: 'engine',
  treasure: 'map',
  closet: 'closet',
  stickers: 'iris',
  rest: 'iris',
};

export interface GotoOptions {
  data?: Record<string, unknown>;
  transition?: TransitionKind;
  /** screen point the cover iris closes onto (e.g. the tapped location) */
  at?: { x: number; y: number };
}

export class SceneManager {
  current: Scene | null = null;
  private busy = false;

  constructor(
    private readonly engine: GameEngine,
    private readonly layer: Container,
  ) {}

  get isTransitioning() {
    return this.busy;
  }

  /** Warm a scene chunk in the background (e.g. the world the child is likely to visit next). */
  prefetch(id: SceneId) {
    void REGISTRY[id]().catch(() => {});
  }

  async goto(id: SceneId, opts: GotoOptions = {}): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const store = useGame.getState();
    const kind = opts.transition ?? (this.current ? SCENE_TRANSITION[id] : 'cut');
    const modPromise = REGISTRY[id]();
    try {
      this.engine.speech.cancel();
      store.setA11yChoices([], null);
      store.setHud({ kind: 'none' });
      // decode the scene's real sounds/music while the themed transition covers the screen
      const audioReady = Promise.race([this.engine.audio.preloadFor(id), new Promise<void>((r) => setTimeout(r, 2500))]);
      await this.engine.transitions.cover(kind, opts.at);
      await audioReady;
      let mod: { default: SceneCtor };
      try {
        mod = await modPromise;
      } catch (err) {
        // Offline/missing chunk: Sparky "fixes the portal" and we fall back home.
        logError('scene-load', err);
        store.setSparkyFixing(true);
        setTimeout(() => useGame.getState().setSparkyFixing(false), 2600);
        mod = id === 'world' ? await REGISTRY.boot() : await REGISTRY.world();
      }
      if (this.current) {
        this.current.exit();
        this.layer.removeChild(this.current.root);
        this.current.destroy();
        this.current = null;
      }
      this.engine.audio.stopAllLoops();
      const scene = new mod.default(this.engine, opts.data ?? {});
      this.engine.set3D((scene as { is3D?: boolean }).is3D === true);
      this.engine.audio.playMusic(scene.music);
      await scene.load();
      scene.build();
      scene.resize(this.engine.width, this.engine.height);
      this.layer.addChild(scene.root);
      this.current = scene;
      store.setScene(scene.id);
      await this.engine.transitions.reveal();
      this.busy = false;
      scene.enter();
    } catch (err) {
      logError('scene-goto', err);
      this.busy = false;
      store.setSparkyFixing(true);
      setTimeout(() => useGame.getState().setSparkyFixing(false), 2600);
      await this.engine.transitions.reveal().catch(() => {});
    }
  }

  update(dtMs: number) {
    if (!this.current) return;
    try {
      this.current.update(dtMs);
    } catch (err) {
      logError('scene-update', err);
    }
  }

  resize(w: number, h: number) {
    this.current?.resize(w, h);
  }
}
