import { Application, Container } from 'pixi.js';
import { AudioManager } from '@/audio/AudioManager';
import { SpeechManager } from '@/audio/SpeechManager';
import { setParentVoiceHost } from '@/audio/ParentVoice';
import { color, setFontFamilies } from '@/design-system/tokens';
import { flushSave, useGame, type SceneId } from '@/state/gameStore';
import { SESSION_REWARD } from '../systems/RewardEngine';
import { SessionTimer } from '../systems/SessionTimer';
import { logError } from './errorLog';
import type { Haptic } from './Scene';
import { SceneManager } from './SceneManager';
import { ThreeStage } from '../three/ThreeStage';
import { Textures } from './Textures';
import { Transitions } from './Transitions';

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const EXTEND_KEY = 'adam-session-extend';

/**
 * The game runtime: owns the Pixi application, render layers, scene manager, audio, speech,
 * session clock and lifecycle (backgrounding, resize, orientation, reduced motion).
 */
export class GameEngine {
  app!: Application;
  host!: HTMLElement;
  readonly sceneLayer = new Container();
  readonly topLayer = new Container();
  scenes!: SceneManager;
  transitions!: Transitions;
  textures!: Textures;
  readonly audio = new AudioManager();
  speech!: SpeechManager;
  session: SessionTimer;
  safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  width = 1;
  height = 1;
  private systemReducedMotion = false;
  private unsubscribers: (() => void)[] = [];
  private destroyed = false;
  private fpsAcc = { frames: 0, ms: 0 };
  private sessionStart = Date.now();
  private sessionStarsAtStart = 0;
  private wrappingUp = false;

  constructor() {
    const s = useGame.getState().save.settings;
    this.session = new SessionTimer(s.sessionLimitMin);
  }

  get reducedMotion(): boolean {
    const pref = useGame.getState().save.settings.reducedMotion;
    return pref === 'on' || (pref === 'system' && this.systemReducedMotion);
  }

  async init(host: HTMLElement) {
    this.host = host;
    await this.loadFonts();
    const app = new Application();
    await app.init({
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      background: color.surfaceLowest,
      // transparent-capable context so 3D scenes can show the Three.js layer underneath;
      // 2D scenes switch the background back to opaque (see set3D)
      backgroundAlpha: 0,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    this.app = app;
    app.canvas.style.position = 'absolute';
    app.canvas.style.inset = '0';
    host.appendChild(app.canvas);
    app.renderer.background.alpha = 1;
    app.canvas.setAttribute('aria-hidden', 'true');
    app.stage.addChild(this.sceneLayer, this.topLayer);

    this.textures = new Textures(app.renderer);
    this.transitions = new Transitions(this);
    this.topLayer.addChild(this.transitions.view);
    this.scenes = new SceneManager(this, this.sceneLayer);

    this.speech = new SpeechManager({
      onCaption: (text, lang, speaker) => {
        const st = useGame.getState();
        st.setCaption(text ? { text, lang, speaker } : null);
      },
      onSpeaking: (speaking, speaker) => this.scenes.current?.onSpeaking(speaking, speaker),
      duck: (on) => this.audio.duck(on),
      volume: () => this.audio.voiceVolume,
      rate: () => useGame.getState().save.settings.speechRate,
      audio: () => (this.audio.ctx && this.audio.voiceBus ? { ctx: this.audio.ctx, out: this.audio.voiceBus } : null),
    });

    // the parent's recorded voice plays as narration (shares the speech token + ducking)
    setParentVoiceHost({ ctx: () => this.audio.ctx, play: (buf) => this.speech.playBuffer(buf, 'narrator') });

    // iOS: a call / Siri / app switch can leave the AudioContext suspended or 'interrupted';
    // only a user gesture can restart it, so re-unlock on the next tap anywhere in the game.
    const reunlock = () => {
      if (this.audio.needsReunlock) this.audio.unlock();
    };
    host.addEventListener('pointerdown', reunlock, { capture: true });
    host.addEventListener('touchend', reunlock, { capture: true });
    this.unsubscribers.push(() => {
      host.removeEventListener('pointerdown', reunlock, { capture: true });
      host.removeEventListener('touchend', reunlock, { capture: true });
    });

    this.readSafeArea();
    this.handleResize();
    app.renderer.on('resize', () => this.handleResize());

    // settings → audio
    this.audio.applySettings(useGame.getState().save.settings);
    let lastSettings = useGame.getState().save.settings;
    this.unsubscribers.push(
      useGame.subscribe((st) => {
        if (st.save.settings !== lastSettings) {
          lastSettings = st.save.settings;
          this.audio.applySettings(lastSettings);
          this.session.setLimit(lastSettings.sessionLimitMin);
        }
      }),
    );

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.systemReducedMotion = mq.matches;
    const onMq = () => (this.systemReducedMotion = mq.matches);
    mq.addEventListener('change', onMq);
    this.unsubscribers.push(() => mq.removeEventListener('change', onMq));

    const onVis = () => this.onVisibility();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('orientationchange', this.onOrientation);
    this.unsubscribers.push(() => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('orientationchange', this.onOrientation);
    });

    app.ticker.add((t) => this.tick(t.deltaMS));
    this.sessionStarsAtStart = useGame.getState().save.stars;
  }

  private async loadFonts() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const display = cs.getPropertyValue('--font-rubik').trim();
      const body = cs.getPropertyValue('--font-nunito').trim();
      setFontFamilies(display, body);
      if (display) {
        await Promise.race([
          Promise.all([
            document.fonts.load(`900 32px ${display}`, 'Adam آدم 123'),
            document.fonts.load(`800 32px ${display}`, 'Adam آدم 123'),
          ]),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
      }
    } catch {
      /* fallback fonts are fine */
    }
  }

  private readSafeArea() {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;inset:0;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    this.safe = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
  }

  private handleResize() {
    if (!this.app) return;
    this.readSafeArea();
    // Pixi v8: screen size is in CSS pixels (renderer.width already excludes resolution)
    this.width = this.app.screen.width;
    this.height = this.app.screen.height;
    this.transitions.resize(this.width, this.height);
    this.threeStage?.resize(this.width, this.height);
    this.scenes.resize(this.width, this.height);
  }

  private onOrientation = () => {
    setTimeout(() => {
      this.app?.resize();
      this.handleResize();
    }, 250);
  };

  private tick(dtRaw: number) {
    const dt = Math.min(dtRaw, 50);
    const st = useGame.getState();
    this.transitions.update(dt);
    if (!st.paused) {
      this.scenes.update(dt);
      if (this.threeStage?.hasScene) this.threeStage.render(dt / 1000);
      const scene = st.scene;
      if (scene !== 'boot' && scene !== 'rest') {
        this.session.tick(dt);
        if (this.session.isExpired() && !st.sessionExpired) st.setSessionExpired(true);
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      this.fpsAcc.frames++;
      this.fpsAcc.ms += dtRaw;
      if (this.fpsAcc.ms >= 1000) {
        st.setFps(Math.round((this.fpsAcc.frames * 1000) / this.fpsAcc.ms));
        this.fpsAcc = { frames: 0, ms: 0 };
      }
    }
  }

  private onVisibility() {
    if (document.visibilityState === 'hidden') {
      this.app?.ticker.stop();
      this.audio.suspend();
      this.speech?.cancel();
      this.recordPlayTime();
      flushSave();
    } else {
      this.applyParentExtension();
      this.audio.resume();
      this.app?.ticker.start();
    }
  }

  private onPageHide = () => {
    this.recordPlayTime();
    this.logSession();
    flushSave();
  };

  private playedMsLogged = 0;
  private recordPlayTime() {
    const delta = this.session.activeMs - this.playedMsLogged;
    if (delta > 1000) {
      useGame.getState().addPlayTime(delta);
      this.playedMsLogged = this.session.activeMs;
    }
  }

  /** Parent Zone "+10 min" writes minutes to sessionStorage; apply them here. */
  applyParentExtension() {
    try {
      const v = Number(sessionStorage.getItem(EXTEND_KEY) ?? 0);
      if (v > 0) {
        this.session.extend(v);
        sessionStorage.removeItem(EXTEND_KEY);
        useGame.getState().setSessionExpired(false);
      }
    } catch {
      /* ignore */
    }
  }

  /** Scenes call this at a mission boundary (never mid-kick / mid-race). */
  shouldWrapUp(): boolean {
    this.applyParentExtension();
    return this.session.shouldWrapUp();
  }

  /** Session over: Sparky says goodbye, Adam returns to base, reward, rest state. */
  async endSession() {
    if (this.wrappingUp) return;
    this.wrappingUp = true;
    this.recordPlayTime();
    this.logSession();
    await this.scenes.goto('rest', { data: { reward: SESSION_REWARD } });
    this.wrappingUp = false;
  }

  /** Parent override from the rest scene (after the parent gate). */
  resumeAfterRest(minutes: number) {
    this.session.extend(minutes);
    useGame.getState().setSessionExpired(false);
    this.sessionStart = Date.now();
    this.sessionStarsAtStart = useGame.getState().save.stars;
    void this.scenes.goto('world');
  }

  private logged = false;
  private logSession() {
    if (this.logged || this.session.activeMs < 5000) return;
    this.logged = true;
    const s = useGame.getState().save;
    const skills = Object.values(s.skills);
    const since = this.sessionStart;
    let attempts = 0;
    let correct = 0;
    for (const r of skills) if (r.lastPracticed >= since) {
      attempts += r.recent.length ? 1 : 0;
      correct += r.recent[r.recent.length - 1] ? 1 : 0;
    }
    useGame.getState().logSession({
      start: since,
      end: Date.now(),
      activeMs: this.session.activeMs,
      stars: s.stars - this.sessionStarsAtStart,
      attempts,
      correct,
    });
  }

  goto(id: SceneId, data?: Record<string, unknown>) {
    return this.scenes.goto(id, { data });
  }

  haptic(kind: Haptic) {
    if (!useGame.getState().save.settings.haptics) return;
    try {
      const pattern = kind === 'tiny' ? 8 : kind === 'medium' ? 28 : [30, 40, 30, 40, 70];
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported (iOS) — haptics are never required */
    }
  }

  /** First child tap: unlock audio + speech (autoplay policies). */
  unlockAudio() {
    this.audio.unlock();
    this.speech.unlock();
    useGame.getState().setAudioReady();
  }

  // ---------- 3D layer ----------
  private threeStage: ThreeStage | null = null;

  /** Lazily create the Three.js layer (under the Pixi canvas). */
  getThreeStage(): ThreeStage {
    if (!this.threeStage) {
      this.threeStage = new ThreeStage(this.host);
      this.threeStage.resize(this.width, this.height);
    }
    return this.threeStage;
  }

  /** While a 3D scene is active the Pixi canvas becomes a transparent overlay. */
  set3D(on: boolean) {
    if (!this.app) return;
    this.app.renderer.background.alpha = on ? 0 : 1;
    if (!on) this.threeStage?.clearScene();
  }

  destroy() {
    this.destroyed = true;
    for (const u of this.unsubscribers) u();
    try {
      // release everything that could keep this engine (and its AudioContext) alive
      setParentVoiceHost(null);
      this.speech?.dispose();
      this.audio.dispose();
      this.scenes?.current?.destroy();
      this.threeStage?.dispose();
      this.threeStage = null;
      this.textures?.destroy();
      this.app?.destroy(true, { children: true });
    } catch (err) {
      logError('engine-destroy', err);
    }
  }
}
