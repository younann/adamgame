import { ENGLISH, ENGLISH_BY_ID } from '../curriculum/english';
import { MATH_BY_ID, NUMBER_WORDS, NUMBER_WORDS_AR, SHAPES } from '../curriculum/math';
import type {
  ChallengeChoice,
  Concept,
  HintStep,
  LanguageStage,
  LearningChallenge,
  VoiceLine,
} from '../types';
import { defaultRng, randInt, shuffle, type Rng } from './rng';

const en = (text: string, slow = false): VoiceLine => ({ text, lang: 'en', slow });
const ar = (text: string): VoiceLine => ({ text, lang: 'ar' });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const numberWordAr = (n: number) => NUMBER_WORDS_AR[n] ?? String(n);

let seq = 0;
const newId = (skillId: string) => `${skillId}#${Date.now().toString(36)}${(seq++).toString(36)}`;

function numberChoice(n: number): ChallengeChoice {
  return { id: `n${n}`, value: n, label: String(n), visual: { kind: 'number', key: String(n), value: n }, ariaLabel: `${n}` };
}

function conceptChoice(c: Concept): ChallengeChoice {
  return { id: c.id, conceptId: c.id, label: c.english.toUpperCase(), visual: c.visual, ariaLabel: c.english };
}

/** Two distinct neighbours of n inside [lo, hi]. */
function numberDistractors(n: number, lo: number, hi: number, rng: Rng, count = 2): number[] {
  const pool = new Set<number>();
  for (const d of shuffle([-1, 1, -2, 2, 3, -3], rng)) {
    const v = n + d;
    if (v >= lo && v <= hi && v !== n) pool.add(v);
    if (pool.size >= count) break;
  }
  let fill = lo;
  while (pool.size < count) {
    if (fill !== n) pool.add(fill);
    fill++;
  }
  return [...pool].slice(0, count);
}

function hintsFor(stage: LanguageStage, arabicHelp: VoiceLine[], repeat: VoiceLine[], counting: boolean): HintStep[] {
  const steps: HintStep[] = [];
  if (stage === 'A') {
    steps.push({ kind: 'repeatPrompt', lines: repeat });
  } else if (stage === 'B') {
    steps.push({ kind: 'arabicHelp', lines: arabicHelp });
  } else {
    steps.push({ kind: 'repeatPrompt', lines: repeat });
    steps.push({ kind: 'arabicHelp', lines: arabicHelp });
  }
  if (counting) steps.push({ kind: 'countTogether' });
  steps.push({ kind: 'pulseAnswer' });
  return steps;
}

export interface GenerateOptions {
  stage: LanguageStage;
  rng?: Rng;
  /** number of choices shown (2–3). Defaults to 3. */
  choices?: number;
}

/**
 * Text tokens that world presenters resolve: {thing} {things} {thingsAr}
 * e.g. football → ball/balls/طابات, racing → star/stars/نجوم.
 */
export function generateChallenge(skillId: string, opts: GenerateOptions): LearningChallenge {
  const rng = opts.rng ?? defaultRng;
  const nChoices = opts.choices ?? 3;
  const stage = opts.stage;

  const concept = ENGLISH_BY_ID.get(skillId);
  if (concept) return englishChallenge(concept, stage, rng, nChoices);

  const skill = MATH_BY_ID.get(skillId);
  if (!skill) throw new Error(`Unknown skill ${skillId}`);

  switch (skill.type) {
    case 'countObjects': {
      const n = randInt(rng, skill.min, skill.max);
      const prompt: Record<LanguageStage, VoiceLine[]> = {
        A: [ar('يلا نعد {thingsAr}! كم واحد في؟'), en('How many {things}?')],
        B: [en('How many {things}? Count them!')],
        C: [en('How many {things}?')],
      };
      const arabicHelp = [ar('عدهم واحد واحد، والمس كل واحد')];
      return {
        id: newId(skillId), skillId, type: 'countObjects', prompt, arabicHelp,
        answer: numberChoice(n),
        distractors: numberDistractors(n, 1, Math.max(skill.max, 5), rng, nChoices - 1).map(numberChoice),
        difficulty: skill.difficulty,
        assets: { count: n },
        audio: [en(n === 1 ? 'One {thing}!' : `${cap(numberWord(n))} {things}!`)],
        hintSequence: hintsFor(stage, arabicHelp, prompt[stage], true),
      };
    }
    case 'numberChoice': {
      const n = randInt(rng, skill.min, skill.max);
      const w = numberWord(n);
      const prompt: Record<LanguageStage, VoiceLine[]> = {
        A: [ar(`دوّر على الرقم ${numberWordAr(n)}`), en(`${cap(w)}!`, true)],
        B: [en(`Find number ${w}!`, true)],
        C: [en(`Find number ${w}!`)],
      };
      const arabicHelp = [en(`${cap(w)}`, true), ar(`يعني ${numberWordAr(n)}`)];
      return {
        id: newId(skillId), skillId, type: 'numberChoice', prompt, arabicHelp,
        answer: numberChoice(n),
        distractors: numberDistractors(n, 1, Math.max(skill.max, 5), rng, nChoices - 1).map(numberChoice),
        difficulty: skill.difficulty,
        assets: { count: n },
        audio: [en(`${cap(w)}!`)],
        hintSequence: hintsFor(stage, arabicHelp, prompt[stage], false),
      };
    }
    case 'compare': {
      const a = randInt(rng, skill.min, skill.max - 1);
      let b = randInt(rng, skill.min, skill.max);
      if (b === a) b = a + 1;
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      const prompt: Record<LanguageStage, VoiceLine[]> = {
        A: [ar('أي رقم أكبر؟'), en('Bigger!')],
        B: [en('Which number is bigger?')],
        C: [en('Which is bigger?')],
      };
      const arabicHelp = [ar('الأكبر يعني فيه أشياء أكثر')];
      return {
        id: newId(skillId), skillId, type: 'compare', prompt, arabicHelp,
        answer: numberChoice(big), distractors: [numberChoice(small)],
        difficulty: skill.difficulty, assets: {},
        audio: [en(`${cap(numberWord(big))} is bigger!`)],
        hintSequence: hintsFor(stage, arabicHelp, prompt[stage], false),
      };
    }
    case 'order': {
      const start = randInt(rng, skill.min, Math.min(skill.max - 3, 6));
      const seqNums = [start, start + 1, start + 2];
      const next = start + 3;
      const said = seqNums.map((x) => cap(numberWord(x))).join(', ');
      const prompt: Record<LanguageStage, VoiceLine[]> = {
        A: [ar('شو الرقم اللي بعده؟'), en(`${said}...`)],
        B: [en(`${said}... what comes next?`)],
        C: [en(`${said}... what's next?`)],
      };
      const arabicHelp = [ar('كمّل العد!')];
      return {
        id: newId(skillId), skillId, type: 'order', prompt, arabicHelp,
        answer: numberChoice(next),
        distractors: numberDistractors(next, 1, 10, rng, nChoices - 1).map(numberChoice),
        difficulty: skill.difficulty, assets: { count: next },
        audio: [en(`${cap(numberWord(next))}!`)],
        hintSequence: hintsFor(stage, arabicHelp, prompt[stage], false),
      };
    }
    case 'addition': {
      const a = randInt(rng, 1, 3);
      const b = randInt(rng, 1, Math.max(1, skill.max - a));
      const sum = a + b;
      const prompt: Record<LanguageStage, VoiceLine[]> = {
        A: [ar(`معنا ${numberWordAr(a)} وزدنا ${numberWordAr(b)}. كم صاروا؟`), en(`${cap(numberWord(a))} and ${numberWord(b)} more!`)],
        B: [en(`${cap(numberWord(a))} and ${numberWord(b)} more. How many?`)],
        C: [en(`${cap(numberWord(a))} plus ${numberWord(b)}?`)],
      };
      const arabicHelp = [ar('عدهم كلهم مع بعض')];
      return {
        id: newId(skillId), skillId, type: 'addition', prompt, arabicHelp,
        answer: numberChoice(sum),
        distractors: numberDistractors(sum, 1, 6, rng, nChoices - 1).map(numberChoice),
        difficulty: skill.difficulty, assets: { count: sum, addends: [a, b] },
        audio: [en(`${cap(numberWord(sum))}!`)],
        hintSequence: hintsFor(stage, arabicHelp, prompt[stage], true),
      };
    }
    case 'shapeMatch': {
      const picked = shuffle(SHAPES, rng).slice(0, nChoices);
      const target = picked[0];
      const toChoice = (s: (typeof SHAPES)[number]): ChallengeChoice => ({
        id: `shape.${s.key}`, label: s.english.toUpperCase(), visual: { kind: 'shape', key: s.key }, ariaLabel: s.english,
      });
      const prompt: Record<LanguageStage, VoiceLine[]> = {
        A: [ar(`وين ال${target.arabic}؟`), en(`${target.english}!`, true)],
        B: [en(`Find the ${target.english.toLowerCase()}!`, true)],
        C: [en(`Find the ${target.english.toLowerCase()}!`)],
      };
      const arabicHelp = [en(target.english, true), ar(`يعني ${target.arabic}`)];
      return {
        id: newId(skillId), skillId, type: 'shapeMatch', prompt, arabicHelp,
        answer: toChoice(target), distractors: picked.slice(1).map(toChoice),
        difficulty: skill.difficulty, assets: {},
        audio: [en(`${target.english}!`)],
        hintSequence: hintsFor(stage, arabicHelp, prompt[stage], false),
      };
    }
    default:
      throw new Error(`Unsupported math type ${skill.type}`);
  }
}

function englishChallenge(concept: Concept, stage: LanguageStage, rng: Rng, nChoices: number): LearningChallenge {
  const isColor = concept.category === 'colors';
  const pool = ENGLISH.filter(
    (x) => x.category === concept.category && x.id !== concept.id && (isColor ? x.difficulty <= Math.max(concept.difficulty, 1) + 1 : true),
  );
  const fallback = ENGLISH.filter((x) => x.id !== concept.id && x.visual.kind === concept.visual.kind);
  const distractors = shuffle(pool.length >= nChoices - 1 ? pool : fallback, rng).slice(0, nChoices - 1);
  const word = concept.english;
  const lower = word.toLowerCase();

  const prompt: Record<LanguageStage, VoiceLine[]> = isColor
    ? {
        A: [ar('يا آدم! دوّر على'), en(`${word}!`, true), ar(`يعني ${concept.arabic}`)],
        B: [en(`Find ${lower}!`, true)],
        C: [en(`Find ${lower}!`)],
      }
    : {
        A: [ar(`وين ال${concept.arabic}؟`), en(`${word}!`, true)],
        B: [en(`Find the ${lower}!`, true)],
        C: [en(`Where is the ${lower}?`)],
      };
  const arabicHelp = [en(word, true), ar(`${word} يعني ${concept.arabic}`)];

  return {
    id: newId(concept.id),
    skillId: concept.id,
    type: isColor ? 'colorMatch' : 'imageVocabulary',
    prompt,
    arabicHelp,
    answer: conceptChoice(concept),
    distractors: distractors.map(conceptChoice),
    difficulty: concept.difficulty,
    assets: isColor ? { colorKey: concept.visual.key } : {},
    audio: [en(`${word}!`)],
    hintSequence: hintsFor(stage, arabicHelp, prompt[stage], false),
  };
}

/** Structural validation — used by tests and as a runtime guard before presenting. */
export function validateChallenge(ch: LearningChallenge): string[] {
  const errors: string[] = [];
  const all = [ch.answer, ...ch.distractors];
  const ids = new Set(all.map((c) => c.id));
  if (ids.size !== all.length) errors.push('duplicate choice ids');
  if (ch.distractors.length < 1) errors.push('needs at least one distractor');
  if (ch.distractors.some((d) => d.id === ch.answer.id)) errors.push('answer among distractors');
  if (ch.distractors.some((d) => d.value !== undefined && d.value === ch.answer.value)) errors.push('duplicate numeric value');
  for (const s of ['A', 'B', 'C'] as const) if (!ch.prompt[s]?.length) errors.push(`missing prompt ${s}`);
  if (ch.type === 'countObjects' && ch.assets.count !== ch.answer.value) errors.push('count asset mismatch');
  if (ch.hintSequence.length === 0) errors.push('no hints');
  return errors;
}

/** Replaces presenter tokens in voice lines. */
export function localizeLines(lines: VoiceLine[], tokens: Record<string, string>): VoiceLine[] {
  return lines.map((l) => ({ ...l, text: l.text.replace(/\{(\w+)\}/g, (_, k: string) => tokens[k] ?? k) }));
}
