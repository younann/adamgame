'use client';

import { useMemo, useState } from 'react';
import { ENGLISH } from '@/learning/curriculum/english';
import { MATH } from '@/learning/curriculum/math';
import type { MasteryState, SkillRecord } from '@/learning/types';
import { useGame } from '@/state/gameStore';
import { CONTEXT_LABEL, STATE_LABEL, pct, relativeDay, skillRow, summarize, type SkillRow } from './stats';
import { Section, Stat } from './ui';

const CATEGORY_AR: Record<string, string> = {
  colors: 'الألوان · Colors', animals: 'الحيوانات · Animals', food: 'الأكل · Food', family: 'العائلة · Family',
  body: 'الجسم · Body', toys: 'الألعاب · Toys', vehicles: 'المركبات · Vehicles', objects: 'أشياء · Objects', actions: 'أفعال · Actions',
};

export function StateBadge({ state, forced }: { state: MasteryState; forced?: boolean }) {
  const l = STATE_LABEL[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-xs font-black ${l.cls}`}>
      {l.ar}
      {forced && <span title="parent override" aria-label="parent override">✋</span>}
    </span>
  );
}

function useRows(ids: string[], skills: Record<string, SkillRecord>): SkillRow[] {
  const [now] = useState(() => Date.now());
  return useMemo(() => ids.map((id) => skillRow(id, skills[id], now)), [ids, skills, now]);
}

function SkillChips({ rows, empty }: { rows: SkillRow[]; empty: string }) {
  return rows.length ? (
    <ul className="flex flex-wrap gap-2">
      {rows.map((r) => (
        <li key={r.skillId} className="rounded-full bg-surface-highest px-3 py-1 font-display text-sm font-black">
          {r.name.ar} <span className="text-on-surface-variant" dir="ltr">{r.name.en}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="font-body text-sm font-bold text-on-surface-variant">{empty}</p>
  );
}

export function SummaryPanel() {
  const skills = useGame((s) => s.save.skills);
  const [now] = useState(() => Date.now());
  const sum = useMemo(() => summarize(skills, now), [skills, now]);
  return (
    <Section id="summary" title="ملخص التعلم" en="Learning summary" icon={<span aria-hidden>🧠</span>}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="تدرّب على · Practiced" value={String(sum.practicedCount)} />
        <Stat label="متقن · Mastered" value={String(sum.mastered.length)} tone="mint" />
        <Stat label="مراجعة · Review" value={String(sum.needsReview.length)} tone="gold" />
      </div>
      <div className="flex flex-col gap-3">
        <div><h3 className="mb-1 font-display font-black text-mint">تعلّم جديد هذا الأسبوع · New this week</h3><SkillChips rows={sum.newlyLearned} empty="لا شيء بعد" /></div>
        <div><h3 className="mb-1 font-display font-black text-mint">متقن · Mastered</h3><SkillChips rows={sum.mastered} empty="لا شيء بعد" /></div>
        <div><h3 className="mb-1 font-display font-black text-gold">يحتاج مراجعة · Needs review</h3><SkillChips rows={sum.needsReview} empty="لا شيء — ممتاز!" /></div>
      </div>
    </Section>
  );
}

const OVERRIDES: { value: '' | MasteryState; label: string }[] = [
  { value: '', label: 'تلقائي · Auto' },
  { value: 'new', label: STATE_LABEL.new.ar },
  { value: 'learning', label: STATE_LABEL.learning.ar },
  { value: 'familiar', label: STATE_LABEL.familiar.ar },
  { value: 'mastered', label: STATE_LABEL.mastered.ar },
  { value: 'needsReview', label: STATE_LABEL.needsReview.ar },
];

function SkillTable({ rows, caption }: { rows: SkillRow[]; caption: string }) {
  const skills = useGame((s) => s.save.skills);
  return (
    <div className="overflow-x-auto rounded-game border border-outline-variant">
      <table className="w-full min-w-[640px] border-collapse text-start font-body text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-high font-display text-xs font-black text-on-surface-variant">
          <tr>
            <th scope="col" className="p-2 text-start">المهارة · Skill</th>
            <th scope="col" className="p-2 text-start">الحالة · State</th>
            <th scope="col" className="p-2">محاولات · Tries</th>
            <th scope="col" className="p-2">الدقة · Acc.</th>
            <th scope="col" className="p-2">تلميح · Hints</th>
            <th scope="col" className="p-2">عربي · Arabic</th>
            <th scope="col" className="p-2 text-start">أماكن · Contexts</th>
            <th scope="col" className="p-2">آخر مرة · Last</th>
            <th scope="col" className="p-2">تعديل · Override</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skillId} className="border-t border-outline-variant/60 odd:bg-surface-low/60">
              <th scope="row" className="p-2 text-start font-display font-black text-white">
                {r.name.ar} <span className="block text-xs font-bold text-on-surface-variant" dir="ltr">{r.name.en}</span>
              </th>
              <td className="p-2"><StateBadge state={r.state} forced={r.forced} /></td>
              <td className="p-2 text-center" dir="ltr">{r.attempts}</td>
              <td className="p-2 text-center" dir="ltr">{r.attempts ? pct(r.accuracy) : '—'}</td>
              <td className={`p-2 text-center ${r.hintDependence > 0.5 ? 'text-gold' : ''}`} dir="ltr">{r.attempts ? pct(r.hintDependence) : '—'}</td>
              <td className={`p-2 text-center ${r.arabicDependence > 0.5 ? 'text-gold' : ''}`} dir="ltr">{r.attempts ? pct(r.arabicDependence) : '—'}</td>
              <td className="p-2 text-xs">{r.contexts.map((c) => CONTEXT_LABEL[c]).join('، ') || '—'}</td>
              <td className="p-2 text-center text-xs">{relativeDay(r.lastPracticed)}</td>
              <td className="p-2">
                <select
                  aria-label={`Override ${r.name.en}`}
                  value={skills[r.skillId]?.forcedState ?? ''}
                  onChange={(e) => useGame.getState().setSkillState(r.skillId, (e.target.value || undefined) as MasteryState | undefined)}
                  className="rounded-md border border-outline-variant bg-surface-highest px-1 py-1 font-display text-xs font-bold"
                >
                  {OVERRIDES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EnglishProgress() {
  const skills = useGame((s) => s.save.skills);
  const [onlyPracticed, setOnlyPracticed] = useState(false);
  const ids = useMemo(() => ENGLISH.map((c) => c.id), []);
  const rows = useRows(ids, skills);
  const visible = onlyPracticed ? rows.filter((r) => r.attempts > 0) : rows;
  const cats = [...new Set(ENGLISH.map((c) => c.category))];
  const mastered = rows.filter((r) => r.state === 'mastered').length;
  return (
    <Section id="english" title="تقدم الإنجليزي" en="English progress" icon={<span aria-hidden>🔤</span>}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ProgressBar value={mastered} total={rows.length} label="متقن · mastered" />
        <label className="flex items-center gap-2 font-body text-sm font-bold">
          <input type="checkbox" checked={onlyPracticed} onChange={(e) => setOnlyPracticed(e.target.checked)} className="h-5 w-5 accent-[#4edea3]" />
          فقط ما تدرّب عليه · Practiced only
        </label>
      </div>
      <div className="flex flex-col gap-4">
        {cats.map((cat) => {
          const catRows = visible.filter((r) => r.name.category === cat);
          if (!catRows.length) return null;
          return (
            <details key={cat} open={cat === 'colors'} className="group">
              <summary className="mb-2 cursor-pointer font-display text-lg font-black text-primary">{CATEGORY_AR[cat] ?? cat} <span className="text-sm text-on-surface-variant">({catRows.length})</span></summary>
              <SkillTable rows={catRows} caption={`English ${cat}`} />
            </details>
          );
        })}
        {!visible.length && <p className="font-body font-bold text-on-surface-variant">لم يتدرّب على أي كلمة بعد</p>}
      </div>
    </Section>
  );
}

export function MathProgress() {
  const skills = useGame((s) => s.save.skills);
  const ids = useMemo(() => MATH.map((m) => m.id), []);
  const rows = useRows(ids, skills);
  const mastered = rows.filter((r) => r.state === 'mastered').length;
  return (
    <Section id="math" title="تقدم الرياضيات" en="Math progress" icon={<span aria-hidden>🔢</span>}>
      <div className="mb-3"><ProgressBar value={mastered} total={rows.length} label="متقن · mastered" /></div>
      <SkillTable rows={rows} caption="Math skills" />
    </Section>
  );
}

function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  return (
    <div className="flex min-w-48 flex-1 items-center gap-2">
      <div className="h-4 flex-1 overflow-hidden rounded-full border border-blue/30 bg-black/60 p-0.5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-full bg-gradient-to-l from-mint via-blue to-gold shadow-[0_0_10px_#4edea3]" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
      </div>
      <span className="font-display text-sm font-black text-gold" dir="ltr">{value}/{total}</span>
    </div>
  );
}
