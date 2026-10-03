import { DEFAULT_AVATAR, type AvatarState } from '@/avatar/items';
import type { SkillRecord } from '@/learning/types';
import type { SessionLimit } from '@/game/systems/SessionTimer';

export const SAVE_VERSION = 1;

export type WorldKey = 'football' | 'hero' | 'racing' | 'treasure' | 'closet';

export interface ParentSettings {
  sessionLimitMin: SessionLimit;
  musicVolume: number; // 0..1
  sfxVolume: number;
  voiceVolume: number;
  muted: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  captions: boolean;
  haptics: boolean;
  /** speech rate multiplier for TTS */
  speechRate: number;
  /** '3d' = new 3D worlds where available; 'classic' = original 2D graphics */
  graphics: '3d' | 'classic';
  /** worlds force-unlocked by the parent */
  forcedWorlds: WorldKey[];
}

export interface SessionLog {
  start: number;
  end: number;
  activeMs: number;
  stars: number;
  attempts: number;
  correct: number;
}

export interface MissionLog {
  world: WorldKey;
  ts: number;
  stars: number;
  skills: string[];
}

export interface SaveData {
  version: number;
  profile: { name: string; createdAt: number; faceImage?: string };
  stars: number;
  trophies: number;
  inventory: { footballs: number; gems: number; keys: number; mapFragments: number; heroPowers: number; coins: number };
  unlocked: string[];
  avatar: AvatarState;
  worlds: { missionsCompleted: Record<string, number>; lastVisited?: WorldKey };
  skills: Record<string, SkillRecord>;
  recentSkills: string[];
  recentMissions: MissionLog[];
  sessions: SessionLog[];
  totalPlayMs: number;
  /** football match carry-over so returning resumes the same narrative */
  football: { matchesWon: number };
  /** sticker ids collected in the sticker book (see src/game/systems/stickers.ts) */
  stickers: string[];
  /** daily surprise: local date (YYYY-MM-DD) the gift was last opened */
  daily: { lastGiftDay?: string; giftsOpened: number };
  settings: ParentSettings;
  pwa: { installedAt?: number; iosGuideSeen?: boolean };
  updatedAt: number;
}

export const DEFAULT_SETTINGS: ParentSettings = {
  sessionLimitMin: 20,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  voiceVolume: 1,
  muted: false,
  reducedMotion: 'system',
  captions: true,
  haptics: true,
  speechRate: 0.9,
  graphics: '3d',
  forcedWorlds: [],
};

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    profile: { name: 'Adam', createdAt: now },
    stars: 0,
    trophies: 0,
    inventory: { footballs: 0, gems: 0, keys: 0, mapFragments: 0, heroPowers: 0, coins: 0 },
    unlocked: [],
    avatar: { ...DEFAULT_AVATAR },
    worlds: { missionsCompleted: {} },
    skills: {},
    recentSkills: [],
    recentMissions: [],
    sessions: [],
    totalPlayMs: 0,
    football: { matchesWon: 0 },
    stickers: [],
    daily: { giftsOpened: 0 },
    settings: { ...DEFAULT_SETTINGS },
    pwa: {},
    updatedAt: now,
  };
}

/**
 * Brings any stored payload up to the current schema. Unknown/corrupt data falls back to
 * defaults field-by-field so Adam never loses everything because of one bad value.
 */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const merged: SaveData = {
    ...base,
    ...r,
    profile: { ...base.profile, ...(r.profile ?? {}) },
    inventory: { ...base.inventory, ...(r.inventory ?? {}) },
    avatar: { ...base.avatar, ...(r.avatar ?? {}) },
    worlds: { ...base.worlds, ...(r.worlds ?? {}), missionsCompleted: { ...(r.worlds?.missionsCompleted ?? {}) } },
    football: { ...base.football, ...(r.football ?? {}) },
    stickers: Array.isArray(r.stickers) ? r.stickers : [],
    daily: { ...base.daily, ...(r.daily ?? {}) },
    settings: { ...base.settings, ...(r.settings ?? {}) },
    pwa: { ...base.pwa, ...(r.pwa ?? {}) },
    skills: typeof r.skills === 'object' && r.skills ? r.skills : {},
    unlocked: Array.isArray(r.unlocked) ? r.unlocked : [],
    recentSkills: Array.isArray(r.recentSkills) ? r.recentSkills : [],
    recentMissions: Array.isArray(r.recentMissions) ? r.recentMissions : [],
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    version: SAVE_VERSION,
  };
  if (typeof merged.stars !== 'number' || !Number.isFinite(merged.stars)) merged.stars = 0;
  if (typeof merged.trophies !== 'number' || !Number.isFinite(merged.trophies)) merged.trophies = 0;
  return merged;
}
