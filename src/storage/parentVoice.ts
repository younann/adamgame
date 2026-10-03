import { openDB, type IDBPDatabase } from 'idb';

/**
 * Parent voice recordings ("برافو آدم!", Adam's name, welcome, goodbye).
 * Stored in their own IndexedDB database so they never bloat the save / JSON backup;
 * recordings stay on this device only.
 */
export type VoiceCategory = 'praise' | 'name' | 'welcome' | 'goodbye';

export const VOICE_CATEGORIES: VoiceCategory[] = ['praise', 'name', 'welcome', 'goodbye'];
export const MAX_CLIPS_PER_CATEGORY = 8;
export const MAX_CLIP_MS = 15_000;

export interface VoiceClip {
  id: string;
  category: VoiceCategory;
  blob: Blob;
  mime: string;
  durationMs: number;
  createdAt: number;
  label?: string;
}

const DB_NAME = 'adam-voice';
const STORE = 'clips';
let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('category', 'category');
        }
      },
    });
  }
  return dbp;
}

export class VoiceLimitError extends Error {}

export async function listClips(category?: VoiceCategory): Promise<VoiceClip[]> {
  const d = await db();
  const all = (category ? await d.getAllFromIndex(STORE, 'category', category) : await d.getAll(STORE)) as VoiceClip[];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getClip(id: string): Promise<VoiceClip | undefined> {
  return (await (await db()).get(STORE, id)) as VoiceClip | undefined;
}

export async function addClip(input: Omit<VoiceClip, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<VoiceClip> {
  if (!VOICE_CATEGORIES.includes(input.category)) throw new VoiceLimitError('Unknown category');
  if (input.durationMs > MAX_CLIP_MS + 500) throw new VoiceLimitError('Clip too long');
  const existing = await listClips(input.category);
  if (existing.length >= MAX_CLIPS_PER_CATEGORY) throw new VoiceLimitError('Too many clips in this category');
  const clip: VoiceClip = {
    ...input,
    id: input.id ?? `${input.category}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: input.createdAt ?? Date.now(),
  };
  await (await db()).put(STORE, clip);
  notify();
  return clip;
}

export async function deleteClip(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
  notify();
}

/** Change notifications (same tab) so the game can drop its decoded-buffer cache. */
const listeners = new Set<() => void>();
export function onClipsChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notify() {
  listeners.forEach((f) => f());
}

// ---- parent preferences (localStorage; per device) ----
const ENABLED_KEY = 'adam-parent-voice-enabled';
const FREQ_KEY = 'adam-parent-voice-frequency';
export type VoiceFrequency = 'sometimes' | 'often';

/** null = never set (default: on when at least one clip exists). */
export function getVoiceEnabledPref(): boolean | null {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}
export function setVoiceEnabledPref(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
export function getVoiceFrequency(): VoiceFrequency {
  try {
    return localStorage.getItem(FREQ_KEY) === 'often' ? 'often' : 'sometimes';
  } catch {
    return 'sometimes';
  }
}
export function setVoiceFrequency(f: VoiceFrequency) {
  try {
    localStorage.setItem(FREQ_KEY, f);
  } catch {
    /* ignore */
  }
}
export const FREQUENCY_CHANCE: Record<VoiceFrequency, number> = { sometimes: 0.35, often: 0.7 };
