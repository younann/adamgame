'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useGame } from '@/state/gameStore';
import { AvatarPanel } from './AvatarPanel';
import { DataPanel } from './DataPanel';
import { InstallPanel } from './InstallPanel';
import { ParentGate, closeGate, isGateOpen } from './ParentGate';
import { EnglishProgress, MathProgress, SummaryPanel } from './ProgressPanel';
import { SessionPanel } from './SessionPanel';
import { SettingsPanel } from './SettingsPanel';
import { VoicePanel } from './VoicePanel';

const noopSubscribe = () => () => {};

const NAV = [
  { id: 'session', label: 'الوقت' },
  { id: 'summary', label: 'الملخص' },
  { id: 'english', label: 'الإنجليزي' },
  { id: 'math', label: 'الرياضيات' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'avatar', label: 'الشخصية' },
  { id: 'voice', label: 'صوتك' },
  { id: 'data', label: 'البيانات' },
  { id: 'install', label: 'التثبيت' },
];

export function ParentZone() {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [passed, setPassed] = useState(false);
  const loaded = useGame((s) => s.loaded);
  const stars = useGame((s) => s.save.stars);
  const trophies = useGame((s) => s.save.trophies);

  useEffect(() => {
    if (!useGame.getState().loaded) void useGame.getState().hydrate();
  }, []);

  if (!mounted) return <main className="min-h-dvh bg-surface-lowest" aria-busy="true" />;
  if (!passed && !isGateOpen()) return <ParentGate onPass={() => setPassed(true)} />;

  return (
    <div className="min-h-dvh bg-surface-lowest bg-[radial-gradient(ellipse_at_top,rgba(30,107,255,0.18),transparent_60%)] text-on-surface">
      <header className="sticky top-0 z-20 border-b-2 border-blue/30 bg-surface/90 backdrop-blur-xl safe-top safe-x">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 py-3">
          <div>
            <h1 className="font-display text-2xl font-black text-white">منطقة الأهل</h1>
            <p className="font-body text-xs font-bold text-on-surface-variant" dir="ltr">Parent Zone · Adam&apos;s Learning Adventure</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border-2 border-gold/50 bg-surface-highest px-3 py-1 font-display font-black text-gold-light sm:inline" aria-label={`${stars} stars, ${trophies} trophies`}>
              ⭐ {stars} · 🏆 {trophies}
            </span>
            <Link
              href="/"
              onClick={() => closeGate()}
              style={{ ['--depth' as string]: '#002b75' }}
              className="btn-chunky bg-gradient-to-b from-blue-bright to-blue-deep px-4 py-2 font-display font-black text-white focus-visible:outline-4 focus-visible:outline-gold"
            >
              🎮 العودة للعبة آدم
              <span className="sr-only"> · Back to Adam&apos;s game</span>
            </Link>
          </div>
        </div>
        <nav aria-label="أقسام · Sections" className="mx-auto max-w-5xl overflow-x-auto pb-2">
          <ul className="flex gap-2">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className="block whitespace-nowrap rounded-full border border-outline-variant bg-surface-high px-3 py-1 font-display text-sm font-black text-on-surface-variant hover:text-white focus-visible:outline-2 focus-visible:outline-gold">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 py-5 safe-x safe-bottom">
        {!loaded ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-game-lg bg-surface-container" />)}
          </div>
        ) : (
          <>
            <SessionPanel />
            <SummaryPanel />
            <EnglishProgress />
            <MathProgress />
            <SettingsPanel />
            <AvatarPanel />
            <VoicePanel />
            <DataPanel />
            <InstallPanel />
            <Link href="/" onClick={() => closeGate()} style={{ ['--depth' as string]: '#002b75' }} className="btn-chunky block bg-gradient-to-b from-blue-bright to-blue-deep py-4 text-center font-display text-xl font-black text-white">
              🎮 العودة للعبة آدم · Back to Adam&apos;s game
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
