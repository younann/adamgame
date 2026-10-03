'use client';

import { useGame } from '@/state/gameStore';
import { Icon } from './Icon';

/** Child-safe error state: Sparky fixes the portal. Never stack traces or network errors. */
export function SparkyFixing() {
  const on = useGame((s) => s.sparkyFixing);
  if (!on) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface-lowest/70 backdrop-blur-sm" role="status" aria-live="assertive">
      <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-blue bg-gradient-to-b from-surface-container to-surface-lowest p-6 shadow-[0_10px_0_0_#080e1d,0_0_40px_rgba(30,107,255,0.5)] animate-pop-in">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border-2 border-white/70 bg-gradient-to-b from-[#5d93ff] via-blue to-blue-deep shadow-[0_6px_0_0_#002b75] animate-bob">
          <div className="flex h-12 w-16 items-center justify-center gap-3 rounded-2xl bg-[#07142e]">
            <span className="h-3 w-3 rounded-full bg-mint" />
            <span className="h-3 w-3 rounded-full bg-mint" />
          </div>
          <Icon name="wrench" className="absolute -bottom-3 -left-3 h-10 w-10 animate-spin text-gold [animation-duration:2s]" />
        </div>
        <p className="font-display text-xl font-black text-white" dir="rtl">أوبس! سباركي عم يصلّح البوابة!</p>
      </div>
    </div>
  );
}
