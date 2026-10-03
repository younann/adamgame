import type { MusicTheme } from './music';
import type { SfxName } from './sfx';

/** Sounds decoded right after the first tap (used everywhere). */
export const CORE_SFX: SfxName[] = [
  'tap', 'click', 'press', 'pop', 'whoosh', 'swoosh', 'star', 'starLand', 'softBump', 'magic',
  'sparkle', 'unlock', 'fanfare', 'coin', 'bounce', 'boing', 'power',
];

/** Per-scene extras preloaded while the themed transition covers the screen. */
export const SCENE_AUDIO: Record<string, { sfx: SfxName[]; music?: MusicTheme; amb?: string[] }> = {
  boot: { sfx: [], music: 'title' },
  world: { sfx: ['zap'], music: 'map' },
  football: { sfx: ['kick', 'net', 'post', 'goalHorn', 'cheer', 'whistle', 'thud'], music: 'football', amb: ['crowd'] },
  racing: { sfx: ['nitro', 'beep', 'go', 'zap', 'thud', 'cheer'], music: 'racing', amb: ['engine'] },
  hero: { sfx: ['zap', 'portal', 'beep'], music: 'hero', amb: ['city'] },
  treasure: { sfx: ['chest', 'thud'], music: 'treasure', amb: ['ocean'] },
  closet: { sfx: [], music: 'closet' },
  stickers: { sfx: ['chest'], music: 'closet' },
  rest: { sfx: [], music: 'rest' },
};

/** Ambience bed that accompanies a music theme (started/stopped by playMusic). */
export const THEME_AMBIENCE: Partial<Record<MusicTheme, { name: string; level: number }>> = {
  treasure: { name: 'ocean', level: 0.55 },
  hero: { name: 'city', level: 0.3 },
};

/** Frequently repeated sounds get slight random pitch so they never feel robotic. */
export const JITTER: ReadonlySet<string> = new Set([
  'tap', 'click', 'press', 'pop', 'bounce', 'kick', 'whoosh', 'swoosh', 'starLand', 'coin', 'softBump', 'net', 'thud', 'boing',
]);
