import type { Speaker } from './SpeechManager';

/**
 * Voice clip identity, shared by the generator (scripts/voice) and the runtime (SpeechManager).
 * English lines use ONE consistent teaching voice for every speaker (consistent pronunciation of
 * target words), so their speaker is normalised to 'en'. Arabic lines keep the speaker's voice.
 */
export type VoiceSpeaker = Speaker | 'en';

export function voiceSpeaker(speaker: Speaker, lang: 'ar' | 'en'): VoiceSpeaker {
  return lang === 'en' ? 'en' : speaker;
}

/** Index key used in manifest.index: "<voiceSpeaker>|<lang>|<text>" */
export function voiceIndexKey(speaker: Speaker, lang: 'ar' | 'en', text: string): string {
  return `${voiceSpeaker(speaker, lang)}|${lang}|${normalizeText(text)}`;
}

/** Fallback index key used in manifest.byText: "<lang>|<text>" */
export function voiceTextKey(lang: 'ar' | 'en', text: string): string {
  return `${lang}|${normalizeText(text)}`;
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface VoiceManifest {
  version: number;
  voices: Record<string, { voice: string; rate: string; pitch: string }>;
  /** clip id → file + duration (s) */
  clips: Record<string, { f: string; d: number }>;
  /** voiceIndexKey → clip id */
  index: Record<string, string>;
  /** voiceTextKey → clip id (any speaker) */
  byText: Record<string, string>;
}
