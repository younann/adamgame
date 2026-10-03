'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/state/gameStore';
import type { SessionLimit } from '@/game/systems/SessionTimer';
import { averageSessionMs, dailyTotals, formatDuration, playTimeLastDays, playTimeToday } from './stats';
import { Btn, Section, Segmented, Stat } from './ui';

const LIMITS: { value: SessionLimit; label: string }[] = [
  { value: 10, label: '10 د' },
  { value: 15, label: '15 د' },
  { value: 20, label: '20 د' },
  { value: 30, label: '30 د' },
  { value: 0, label: 'بلا حد' },
];

export const SESSION_EXTEND_KEY = 'adam-session-extend';

export function SessionPanel() {
  const sessions = useGame((s) => s.save.sessions);
  const totalPlayMs = useGame((s) => s.save.totalPlayMs);
  const limit = useGame((s) => s.save.settings.sessionLimitMin);
  const expired = useGame((s) => s.sessionExpired);
  const [extended, setExtended] = useState(false);

  const [now] = useState(() => Date.now());
  const { today, week, avg, daily } = useMemo(() => {
    return { today: playTimeToday(sessions, now), week: playTimeLastDays(sessions, 7, now), avg: averageSessionMs(sessions), daily: dailyTotals(sessions, 7, now) };
  }, [sessions, now]);
  const maxDay = Math.max(1, ...daily.map((d) => d.ms));

  const extend = () => {
    try {
      const prev = Number(sessionStorage.getItem(SESSION_EXTEND_KEY)) || 0;
      sessionStorage.setItem(SESSION_EXTEND_KEY, String(prev + 10));
    } catch {
      /* ignore */
    }
    useGame.getState().setSessionExpired(false);
    setExtended(true);
  };

  return (
    <Section id="session" title="وقت اللعب" en="Play time" icon={<span aria-hidden>⏱️</span>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="اليوم · Today" value={formatDuration(today)} tone="gold" />
        <Stat label="آخر ٧ أيام · 7 days" value={formatDuration(week)} />
        <Stat label="المجموع · Total" value={formatDuration(Math.max(totalPlayMs, week))} tone="mint" />
        <Stat label="معدل الجلسة · Avg" value={formatDuration(avg)} />
      </div>

      <div className="mt-4 flex h-28 items-end gap-2 rounded-game bg-surface-low p-3" role="img" aria-label={`Daily play time last 7 days: ${daily.map((d) => formatDuration(d.ms)).join(', ')}`}>
        {daily.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t-md bg-gradient-to-t from-blue-deep to-blue" style={{ height: `${Math.max(3, (d.ms / maxDay) * 72)}px` }} />
            <span className="font-body text-[10px] font-bold text-on-surface-variant">
              {new Date(d.day).toLocaleDateString('ar', { weekday: 'short' })}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Segmented<SessionLimit>
          label="مدة الجلسة · Session length"
          options={LIMITS}
          value={limit}
          onChange={(v) => useGame.getState().updateSettings({ sessionLimitMin: v })}
        />
        <div className="flex flex-wrap items-center gap-3 rounded-game bg-surface-low px-3 py-2">
          <span className="font-body font-bold">
            {expired ? 'انتهت جلسة آدم · Session ended' : 'الجلسة جارية · Session active'}
          </span>
          <Btn tone="mint" onClick={extend}>+١٠ دقائق · Extend</Btn>
          {extended && <span role="status" className="font-body text-sm font-bold text-mint">تم التمديد ✓</span>}
        </div>
      </div>
    </Section>
  );
}
