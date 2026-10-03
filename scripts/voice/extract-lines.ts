/**
 * Enumerates EVERY line the game can speak → scripts/voice/lines.json
 *   a) learning prompts / hints / success lines for every skill × stage × many seeds × world tokens
 *   b) static VoiceLine literals in src (say() calls, intro tables, ENCOURAGE…)
 *   c) dynamic templates (world names, avatar item names, unlock hints, counting words)
 * Run via: node scripts/voice/run.mjs extract
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ENGLISH } from '../../src/learning/curriculum/english';
import { MATH, NUMBER_WORDS } from '../../src/learning/curriculum/math';
import { ADAPTERS, type WorldId } from '../../src/learning/adapters/index';
import { generateChallenge, localizeLines } from '../../src/learning/engine/ChallengeGenerator';
import { seeded } from '../../src/learning/engine/rng';
import { AVATAR_ITEMS, unlockHint } from '../../src/avatar/items';
import { STICKERS, STICKER_CATEGORIES } from '../../src/game/systems/stickers';
import type { VoiceLine } from '../../src/learning/types';

type Speaker = 'sparky' | 'commentator' | 'narrator' | 'adam';
interface Entry {
  speaker: Speaker;
  lang: 'ar' | 'en';
  text: string;
  slow?: boolean;
  src: string;
}

const ROOT = process.cwd();
const out = new Map<string, Entry>();
const unresolved: string[] = [];

const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
function add(speaker: Speaker, lang: 'ar' | 'en', text: string, src: string, slow = false) {
  const t = norm(text);
  if (!t || /\$\{/.test(t)) return;
  const sp = lang === 'en' ? 'en' : speaker; // English: one teaching voice for everyone
  const k = `${sp}|${lang}|${t}`;
  const prev = out.get(k);
  if (prev) {
    if (slow) prev.slow = true;
    return;
  }
  out.set(k, { speaker, lang, text: t, slow, src });
}

/** World → speaker used by its ChallengeRunner. */
const WORLD_SPEAKER: Record<WorldId, Speaker> = { football: 'commentator', hero: 'sparky', racing: 'sparky', treasure: 'sparky' };

// ---------------------------------------------------------------- a) learning lines
const SEEDS = 260;
for (const world of Object.keys(ADAPTERS) as WorldId[]) {
  const tok = ADAPTERS[world].tokens;
  const speaker = WORLD_SPEAKER[world];
  const skills = [...ENGLISH.map((c) => c.id), ...MATH.map((m) => m.id)];
  for (const skillId of skills) {
    for (const stage of ['A', 'B', 'C'] as const) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        for (const choices of [2, 3]) {
          let ch;
          try {
            ch = generateChallenge(skillId, { stage, rng: seeded(seed * 7919 + choices), choices });
          } catch {
            continue;
          }
          const L = (lines: VoiceLine[]) => localizeLines(lines, tok);
          const all = [
            ...L(ch.prompt.A), ...L(ch.prompt.B), ...L(ch.prompt.C),
            ...L(ch.arabicHelp), ...L(ch.audio),
            ...ch.hintSequence.flatMap((h) => (h.lines ? L(h.lines) : [])),
          ];
          for (const l of all) add(speaker, l.lang, l.text, `learning:${skillId}`, !!l.slow);
        }
      }
      // English-only skills are deterministic-ish; fewer seeds needed but harmless
    }
  }
}

// counting words (scenes speak numberWord(n) and capitalised forms)
for (let n = 1; n <= 20; n++) {
  const w = NUMBER_WORDS[n];
  add('sparky', 'en', w, 'counting');
  add('sparky', 'en', w.charAt(0).toUpperCase() + w.slice(1), 'counting');
}

// ---------------------------------------------------------------- b) static literals
function walk(dir: string, files: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) files.push(p);
  }
  return files;
}

/** speakers referenced by say(..., 'x') calls in a file */
function fileSpeakers(src: string): Speaker[] {
  const set = new Set<Speaker>();
  for (const m of src.matchAll(/'(sparky|commentator|narrator|adam)'\s*\)/g)) set.add(m[1] as Speaker);
  for (const m of src.matchAll(/speaker:\s*'(sparky|commentator|narrator|adam)'/g)) set.add(m[1] as Speaker);
  return set.size ? [...set] : ['sparky'];
}

const STR = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;
const unq = (m: RegExpMatchArray, i: number) => (m[i] ?? m[i + 1] ?? '').replace(/\\(.)/g, '$1');

for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('src/learning/') || rel.startsWith('src/parent/') || rel.startsWith('src/app/')) continue;
  const src = readFileSync(file, 'utf8');
  const speakers = fileSpeakers(src);

  // say([...], 'speaker') blocks → exact speaker for literals inside
  const claimed = new Set<number>();
  const sayRe = /\.say\(\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = sayRe.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']' && --depth === 0) break;
    }
    const body = src.slice(m.index, i + 1);
    const after = src.slice(i + 1, i + 60);
    const sp = /^\s*,\s*'(sparky|commentator|narrator|adam)'/.exec(after)?.[1] as Speaker | undefined;
    const lineRe = new RegExp(String.raw`text:\s*(?:${STR})\s*,\s*lang:\s*'(ar|en)'`, 'g');
    for (const lm of body.matchAll(lineRe)) {
      add(sp ?? speakers[0], lm[3] as 'ar' | 'en', unq(lm, 1), rel);
      claimed.add(m.index + (lm.index ?? 0));
    }
    for (const tm of body.matchAll(/text:\s*`([^`]*)`/g)) if (tm[1].includes('${')) unresolved.push(`${rel}: \`${tm[1]}\``);
  }

  // every other VoiceLine literal (intro tables, ENCOURAGE, ...) → all speakers used in the file
  const lineRe = new RegExp(String.raw`text:\s*(?:${STR})\s*,\s*lang:\s*'(ar|en)'(?:\s*,\s*slow:\s*(true))?`, 'g');
  for (const lm of src.matchAll(lineRe)) {
    const slow = lm[4] === 'true';
    const targets: Speaker[] = rel.includes('ChallengeRunner') ? ['sparky', 'commentator'] : speakers;
    for (const sp of targets) add(sp, lm[3] as 'ar' | 'en', unq(lm, 1), rel, slow);
  }

  // label tables spoken by scenes ({ ar: '…', en: '…' }, { nameAr, nameEn })
  for (const lm of src.matchAll(new RegExp(String.raw`\b(ar|nameAr):\s*(?:${STR})`, 'g'))) for (const sp of speakers) add(sp, 'ar', unq(lm, 2), rel);
  for (const lm of src.matchAll(new RegExp(String.raw`\b(en|nameEn):\s*(?:${STR})`, 'g'))) add('sparky', 'en', unq(lm, 2), rel);
}

// ---------------------------------------------------------------- c) dynamic templates
const WORLD_NAMES_AR = ['الملعب', 'مدينة الأبطال', 'السباق', 'جزيرة الكنز', 'خزانة البطل', 'كتاب الملصقات'];
// sticker words + album category names (spoken by the sticker book and the sticker reveal)
for (const st of [...STICKERS, ...STICKER_CATEGORIES]) {
  add('sparky', 'en', st.english, 'stickers');
  add('sparky', 'ar', st.arabic, 'stickers');
}
for (const n of WORLD_NAMES_AR) add('sparky', 'ar', `${n} لسا مسكرة. العب أكثر لتفتحها!`, 'template:world-locked');
for (const it of AVATAR_ITEMS) {
  add('sparky', 'ar', `واو! فتحت ${it.nameAr}!`, 'template:unlock');
  add('sparky', 'ar', it.nameAr, 'items');
  add('sparky', 'en', it.nameEn, 'items');
  const h = unlockHint(it.unlock);
  if (h.ar) add('sparky', 'ar', h.ar, 'template:unlockHint');
}

// ---------------------------------------------------------------- report + write
const entries = [...out.values()].sort((a, b) => (a.lang + a.text).localeCompare(b.lang + b.text));
writeFileSync(join(ROOT, 'scripts/voice/lines.json'), JSON.stringify(entries, null, 1));
const by = (f: (e: Entry) => string) => entries.reduce<Record<string, number>>((acc, e) => ((acc[f(e)] = (acc[f(e)] ?? 0) + 1), acc), {});
console.log(`extract: ${entries.length} lines`, by((e) => `${e.lang === 'en' ? 'en' : e.speaker}`));
if (unresolved.length) {
  console.log('extract: dynamic say() templates enumerated from data (verify list above covers them):');
  for (const u of [...new Set(unresolved)]) console.log('  -', u);
}
