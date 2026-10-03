import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADAPTERS, type WorldId } from '@/learning/adapters';
import { generateChallenge, localizeLines } from '@/learning/engine/ChallengeGenerator';
import { seeded } from '@/learning/engine/rng';
import { ENGLISH } from '@/learning/curriculum/english';
import { MATH } from '@/learning/curriculum/math';
import { voiceIndexKey, voiceSpeaker, voiceTextKey, type VoiceManifest } from './voiceKey';
import type { Speaker } from './SpeechManager';

const path = join(process.cwd(), 'public/audio/voice/manifest.json');
const manifest: VoiceManifest | null = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
const WORLD_SPEAKER: Record<WorldId, Speaker> = { football: 'commentator', hero: 'sparky', racing: 'sparky', treasure: 'sparky' };

describe('voice keys', () => {
  it('are stable and normalise English to one teaching voice', () => {
    expect(voiceSpeaker('commentator', 'en')).toBe('en');
    expect(voiceSpeaker('commentator', 'ar')).toBe('commentator');
    expect(voiceIndexKey('sparky', 'en', '  Find   blue! ')).toBe('en|en|Find blue!');
    expect(voiceTextKey('ar', 'يلا')).toBe('ar|يلا');
  });
});

describe.skipIf(!manifest)('voice manifest coverage', () => {
  it('every clip referenced by the index exists', () => {
    for (const id of Object.values(manifest!.index)) expect(manifest!.clips[id], id).toBeTruthy();
    for (const c of Object.values(manifest!.clips)) expect(existsSync(join(process.cwd(), 'public/audio/voice', c.f)), c.f).toBe(true);
  });

  it('every learning line (sample of skills × stages × worlds) has a natural-voice clip', () => {
    const missing: string[] = [];
    const skills = [...ENGLISH.filter((_, i) => i % 3 === 0).map((c) => c.id), ...MATH.map((m) => m.id)];
    for (const world of Object.keys(ADAPTERS) as WorldId[]) {
      const tok = ADAPTERS[world].tokens;
      for (const id of skills) {
        for (const stage of ['A', 'B', 'C'] as const) {
          for (let seed = 1; seed <= 25; seed++) {
            const ch = generateChallenge(id, { stage, rng: seeded(seed * 31) });
            const lines = localizeLines([...ch.prompt[stage], ...ch.arabicHelp, ...ch.audio], tok);
            for (const l of lines) {
              const k = voiceIndexKey(WORLD_SPEAKER[world], l.lang, l.text);
              if (!manifest!.index[k] && !manifest!.byText[voiceTextKey(l.lang, l.text)]) missing.push(k);
            }
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('core static lines are covered', () => {
    for (const [sp, lang, text] of [
      ['sparky', 'ar', 'يلا يا آدم! مغامرتك بلشت!'],
      ['commentator', 'ar', 'آدم! بدنا هدف أخير!'],
      ['commentator', 'ar', 'قريب! خلينا نعدهم مع بعض.'],
      ['sparky', 'ar', 'ممتاز يا آدم! خلصت مغامرتنا لهسا!'],
    ] as const) expect(manifest!.index[voiceIndexKey(sp, lang, text)], text).toBeTruthy();
  });
});
