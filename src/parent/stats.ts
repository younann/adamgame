import { ENGLISH_BY_ID } from '@/learning/curriculum/english';
import { MATH_BY_ID } from '@/learning/curriculum/math';
import { accuracy, dependence, effectiveState } from '@/learning/mastery/MasteryEngine';
import type { GameContext, MasteryState, SkillRecord } from '@/learning/types';
import type { SessionLog } from '@/storage/schema';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sessionMs(s: SessionLog): number {
  return s.activeMs > 0 ? s.activeMs : Math.max(0, s.end - s.start);
}

export function playTimeSince(sessions: SessionLog[], since: number): number {
  return sessions.filter((s) => s.start >= since).reduce((n, s) => n + sessionMs(s), 0);
}

export function playTimeToday(sessions: SessionLog[], now = Date.now()): number {
  return playTimeSince(sessions, startOfDay(now));
}

export function playTimeLastDays(sessions: SessionLog[], days: number, now = Date.now()): number {
  return playTimeSince(sessions, startOfDay(now) - (days - 1) * DAY_MS);
}

/** Per-day totals (oldest first) for a small bar chart. */
export function dailyTotals(sessions: SessionLog[], days: number, now = Date.now()): { day: number; ms: number }[] {
  const today = startOfDay(now);
  const out: { day: number; ms: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY_MS;
    const ms = sessions.filter((s) => s.start >= day && s.start < day + DAY_MS).reduce((n, s) => n + sessionMs(s), 0);
    out.push({ day, ms });
  }
  return out;
}

export function averageSessionMs(sessions: SessionLog[]): number {
  if (sessions.length === 0) return 0;
  return sessions.reduce((n, s) => n + sessionMs(s), 0) / sessions.length;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return ms > 0 ? '<1 د' : '0 د';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} س ${m} د` : `${m} د`;
}

export interface SkillName {
  en: string;
  ar: string;
  domain: 'english' | 'math';
  category: string;
}

export function skillName(skillId: string): SkillName {
  const c = ENGLISH_BY_ID.get(skillId);
  if (c) return { en: c.english, ar: c.arabic, domain: 'english', category: c.category };
  const m = MATH_BY_ID.get(skillId);
  if (m) return { en: m.title, ar: m.titleAr, domain: 'math', category: m.category };
  return { en: skillId, ar: skillId, domain: skillId.startsWith('math.') ? 'math' : 'english', category: 'other' };
}

export interface SkillRow {
  skillId: string;
  name: SkillName;
  state: MasteryState;
  forced: boolean;
  attempts: number;
  accuracy: number;
  hintDependence: number;
  arabicDependence: number;
  contexts: GameContext[];
  lastPracticed: number;
}

export function skillRow(skillId: string, rec: SkillRecord | undefined, now = Date.now()): SkillRow {
  const dep = rec ? dependence(rec) : { hint: 0, arabic: 0 };
  return {
    skillId,
    name: skillName(skillId),
    state: effectiveState(rec, now),
    forced: !!rec?.forcedState,
    attempts: rec?.attempts ?? 0,
    accuracy: rec ? accuracy(rec) : 0,
    hintDependence: dep.hint,
    arabicDependence: dep.arabic,
    contexts: rec?.contexts ?? [],
    lastPracticed: rec?.lastPracticed ?? 0,
  };
}

export interface LearningSummary {
  newlyLearned: SkillRow[];
  mastered: SkillRow[];
  needsReview: SkillRow[];
  practicedCount: number;
}

/** "Newly learned" = became familiar/mastered and first seen within the last `days`. */
export function summarize(skills: Record<string, SkillRecord>, now = Date.now(), days = 7): LearningSummary {
  const rows = Object.values(skills).map((r) => skillRow(r.skillId, r, now));
  const recentCut = now - days * DAY_MS;
  return {
    newlyLearned: rows.filter((r) => (r.state === 'familiar' || r.state === 'mastered') && (skills[r.skillId].firstSeen ?? 0) >= recentCut),
    mastered: rows.filter((r) => r.state === 'mastered'),
    needsReview: rows.filter((r) => r.state === 'needsReview'),
    practicedCount: rows.filter((r) => r.attempts > 0).length,
  };
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function relativeDay(ts: number, now = Date.now()): string {
  if (!ts) return '—';
  const diff = startOfDay(now) - startOfDay(ts);
  const days = Math.round(diff / DAY_MS);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  return `قبل ${days} أيام`;
}

export const STATE_LABEL: Record<MasteryState, { ar: string; en: string; cls: string }> = {
  new: { ar: 'جديد', en: 'New', cls: 'bg-surface-highest text-on-surface-variant border-outline-variant' },
  learning: { ar: 'يتعلم', en: 'Learning', cls: 'bg-blue/20 text-primary border-blue/60' },
  familiar: { ar: 'مألوف', en: 'Familiar', cls: 'bg-gold/15 text-gold-light border-gold/60' },
  mastered: { ar: 'متقن', en: 'Mastered', cls: 'bg-mint/15 text-mint border-mint/60' },
  needsReview: { ar: 'يحتاج مراجعة', en: 'Review', cls: 'bg-soft-red/15 text-soft-red border-soft-red/60' },
};

export const CONTEXT_LABEL: Record<GameContext, string> = {
  football: 'الملعب',
  heroPortal: 'البوابات',
  raceTunnel: 'الأنفاق',
  raceGarage: 'الكراج',
  treasureChest: 'الصناديق',
  closet: 'الخزانة',
};

/** Parent gate arithmetic: 2-digit × 1-digit. */
export function gateQuestion(rng: () => number = Math.random): { a: number; b: number; answer: number } {
  const a = 12 + Math.floor(rng() * 77); // 12..88
  const b = 3 + Math.floor(rng() * 7); // 3..9
  return { a, b, answer: a * b };
}
