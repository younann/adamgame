'use client';

import { create } from 'zustand';
import type { AvatarState } from '@/avatar/items';
import { applyAttempt, emptyRecord, effectiveState } from '@/learning/mastery/MasteryEngine';
import type { AttemptRecord, MasteryState } from '@/learning/types';
import { newlyUnlocked, worldsUnlocked } from '@/game/systems/RewardEngine';
import { backfillStickers, specialsForMission, specialsForTrophies, stickerForProgress } from '@/game/systems/stickers';
import { saveRepository } from '@/storage/SaveRepository';
import { defaultSave, type ParentSettings, type SaveData, type WorldKey } from '@/storage/schema';

export type SceneId = 'boot' | 'world' | 'football' | 'hero' | 'racing' | 'treasure' | 'closet' | 'stickers' | 'rest';

export type HudState =
  | { kind: 'none' }
  | { kind: 'world' }
  | { kind: 'football'; adam: number; rivals: number; minute: number }
  | { kind: 'racing'; speed: number; nitro: number; lap: number; laps: number; position: number }
  | { kind: 'hero'; energy: number; rescued: number; goal: number }
  | { kind: 'treasure'; keys: number; fragments: number; fragmentsGoal: number }
  | { kind: 'closet' };

export interface Caption {
  id: number;
  text: string;
  lang: 'ar' | 'en';
  speaker: 'sparky' | 'commentator' | 'narrator' | 'adam';
}

export interface A11yChoice {
  id: string;
  label: string;
}

interface GameState {
  loaded: boolean;
  save: SaveData;
  scene: SceneId;
  hud: HudState;
  caption: Caption | null;
  paused: boolean;
  /** pause overlay visible (child pressed the world/pause button) */
  pauseMenu: boolean;
  audioReady: boolean;
  /** engine failed in a way Adam should see Sparky fixing */
  sparkyFixing: boolean;
  sessionExpired: boolean;
  a11yChoices: A11yChoice[];
  /** set by the engine so DOM a11y controls can answer */
  onA11yChoose: ((id: string) => void) | null;
  /** items unlocked but not yet revealed in-game */
  pendingUnlocks: string[];
  /** stickers earned but not yet revealed in-game */
  pendingStickers: string[];
  fps: number;

  hydrate(): Promise<void>;
  setScene(s: SceneId): void;
  setHud(h: HudState): void;
  patchHud(p: Partial<HudState>): void;
  setCaption(c: Omit<Caption, 'id'> | null): void;
  setPaused(p: boolean): void;
  setPauseMenu(p: boolean): void;
  setAudioReady(): void;
  setSparkyFixing(v: boolean): void;
  setSessionExpired(v: boolean): void;
  setA11yChoices(choices: A11yChoice[], onChoose: ((id: string) => void) | null): void;

  recordAttempt(a: AttemptRecord): void;
  rememberSkill(skillId: string): void;
  addStars(n: number): void;
  addTrophy(): void;
  addInventory(key: keyof SaveData['inventory'], n: number): void;
  completeMission(world: WorldKey, stars: number, skills: string[]): void;
  setLastVisited(world: WorldKey): void;
  setAvatar(p: Partial<AvatarState>): void;
  /** take up to `max` pending unlock reveals; the rest stay queued for the next reveal */
  consumeUnlocks(max?: number): string[];
  consumeStickers(max?: number): string[];
  updateSettings(p: Partial<ParentSettings>): void;
  setFaceImage(dataUrl: string | undefined): void;
  setSkillState(skillId: string, state: MasteryState | undefined): void;
  logSession(s: SaveData['sessions'][number]): void;
  addPlayTime(ms: number): void;
  replaceSave(s: SaveData): void;
  resetAll(): Promise<void>;
  unlockedWorlds(): string[];
  setFps(fps: number): void;
  /** returns true if the sticker is new */
  addSticker(id: string): boolean;
  /** mark today's daily surprise as opened */
  claimDailyGift(day: string): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => GameState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveRepository.save(get().save);
  }, 400);
}
/** Flush immediately (page hide / backgrounding). */
export function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const s = useGame.getState();
  if (s.loaded) void saveRepository.save(s.save);
}

let captionSeq = 0;

export const useGame = create<GameState>()((set, get) => {
  const mutateSave = (fn: (s: SaveData) => SaveData) => {
    const next = fn(get().save);
    // reward unlock check after every progress mutation
    const unlocks = newlyUnlocked({
      stars: next.stars,
      trophies: next.trophies,
      missionsCompleted: next.worlds.missionsCompleted,
      unlocked: next.unlocked,
    });
    const withUnlocks = unlocks.length ? { ...next, unlocked: [...next.unlocked, ...unlocks] } : next;
    set((st) => ({
      save: withUnlocks,
      pendingUnlocks: unlocks.length
        ? [...st.pendingUnlocks, ...unlocks.filter((u) => !u.endsWith('.none'))]
        : st.pendingUnlocks,
    }));
    if (get().loaded) scheduleSave(get);
  };

  const queueStickers = (ids: string[]) => {
    if (ids.length) set((st) => ({ pendingStickers: [...st.pendingStickers, ...ids] }));
  };

  return {
    loaded: false,
    save: defaultSave(),
    scene: 'boot',
    hud: { kind: 'none' },
    caption: null,
    paused: false,
    pauseMenu: false,
    audioReady: false,
    sparkyFixing: false,
    sessionExpired: false,
    a11yChoices: [],
    onA11yChoose: null,
    pendingUnlocks: [],
    pendingStickers: [],
    fps: 0,

    async hydrate() {
      const save = await saveRepository.load();
      // default-unlocked items should be present without a reveal
      const defaults = newlyUnlocked({ stars: save.stars, trophies: save.trophies, missionsCompleted: save.worlds.missionsCompleted, unlocked: save.unlocked });
      // stickers already earned by progress made before the sticker book existed
      const backfill = backfillStickers(save);
      set({ save: { ...save, unlocked: [...save.unlocked, ...defaults], stickers: [...save.stickers, ...backfill] }, loaded: true });
      void saveRepository.requestPersistence();
    },
    setScene: (scene) => set({ scene }),
    setHud: (hud) => set({ hud }),
    patchHud: (p) => set((s) => ({ hud: { ...s.hud, ...p } as HudState })),
    setCaption: (c) => set({ caption: c ? { ...c, id: ++captionSeq } : null }),
    setPaused: (paused) => set({ paused }),
    setPauseMenu: (pauseMenu) => set({ pauseMenu, paused: pauseMenu }),
    setAudioReady: () => set({ audioReady: true }),
    setSparkyFixing: (sparkyFixing) => set({ sparkyFixing }),
    setSessionExpired: (sessionExpired) => set({ sessionExpired }),
    setA11yChoices: (a11yChoices, onA11yChoose) => set({ a11yChoices, onA11yChoose }),

    recordAttempt: (a) => {
      let earned: string[] = [];
      mutateSave((s) => {
        const before = s.skills[a.skillId];
        const next = applyAttempt(before ?? emptyRecord(a.skillId, a.ts), a);
        const sticker = stickerForProgress(a.skillId, before, next);
        earned = sticker && !s.stickers.includes(sticker) ? [sticker] : [];
        return { ...s, skills: { ...s.skills, [a.skillId]: next }, stickers: [...s.stickers, ...earned] };
      });
      queueStickers(earned);
    },
    rememberSkill: (skillId) => mutateSave((s) => ({ ...s, recentSkills: [...s.recentSkills, skillId].slice(-8) })),
    addStars: (n) => mutateSave((s) => ({ ...s, stars: s.stars + n })),
    addTrophy: () => {
      let earned: string[] = [];
      mutateSave((s) => {
        earned = specialsForTrophies(s.trophies + 1).filter((id) => !s.stickers.includes(id));
        return { ...s, trophies: s.trophies + 1, stickers: [...s.stickers, ...earned] };
      });
      queueStickers(earned);
    },
    addInventory: (key, n) => mutateSave((s) => ({ ...s, inventory: { ...s.inventory, [key]: s.inventory[key] + n } })),
    completeMission: (world, stars, skills) => {
      let earned: string[] = [];
      mutateSave((s) => {
        const count = (s.worlds.missionsCompleted[world] ?? 0) + 1;
        earned = specialsForMission(world, count).filter((id) => !s.stickers.includes(id));
        return {
          ...s,
          worlds: { ...s.worlds, missionsCompleted: { ...s.worlds.missionsCompleted, [world]: count } },
          recentMissions: [...s.recentMissions, { world, ts: Date.now(), stars, skills }].slice(-40),
          stickers: [...s.stickers, ...earned],
        };
      });
      queueStickers(earned);
    },
    setLastVisited: (world) => mutateSave((s) => ({ ...s, worlds: { ...s.worlds, lastVisited: world } })),
    setAvatar: (p) => mutateSave((s) => ({ ...s, avatar: { ...s.avatar, ...p } })),
    consumeStickers: (max = 2) => {
      const all = get().pendingStickers;
      set({ pendingStickers: all.slice(max) });
      return all.slice(0, max);
    },
    consumeUnlocks: (max = 2) => {
      const u = get().pendingUnlocks;
      set({ pendingUnlocks: u.slice(max) });
      return u.slice(0, max);
    },
    updateSettings: (p) => mutateSave((s) => ({ ...s, settings: { ...s.settings, ...p } })),
    setFaceImage: (faceImage) =>
      mutateSave((s) => ({ ...s, profile: { ...s.profile, faceImage }, avatar: { ...s.avatar, usePhotoFace: !!faceImage } })),
    setSkillState: (skillId, state) =>
      mutateSave((s) => {
        const rec = s.skills[skillId] ?? emptyRecord(skillId);
        return { ...s, skills: { ...s.skills, [skillId]: { ...rec, forcedState: state } } };
      }),
    logSession: (entry) => mutateSave((s) => ({ ...s, sessions: [...s.sessions, entry].slice(-90) })),
    addPlayTime: (ms) => mutateSave((s) => ({ ...s, totalPlayMs: s.totalPlayMs + ms })),
    replaceSave: (save) => {
      set({ save });
      void saveRepository.save(save);
    },
    async resetAll() {
      await saveRepository.reset();
      set({ save: defaultSave(), pendingUnlocks: [], pendingStickers: [] });
      await get().hydrate();
    },
    unlockedWorlds: () => {
      const s = get().save;
      const totalAttempts = Object.values(s.skills).reduce((n, r) => n + r.attempts, 0);
      return worldsUnlocked({ missionsCompleted: s.worlds.missionsCompleted, totalAttempts, forced: s.settings.forcedWorlds });
    },
    setFps: (fps) => set({ fps }),
    addSticker: (id) => {
      if (get().save.stickers.includes(id)) return false;
      mutateSave((s) => ({ ...s, stickers: [...s.stickers, id] }));
      return true;
    },
    claimDailyGift: (day) => mutateSave((s) => ({ ...s, daily: { lastGiftDay: day, giftsOpened: s.daily.giftsOpened + 1 } })),
  };
});

export function skillStateOf(skillId: string): MasteryState {
  return effectiveState(useGame.getState().save.skills[skillId]);
}
