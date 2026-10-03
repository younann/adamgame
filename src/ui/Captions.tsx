'use client';

import { useGame } from '@/state/gameStore';

/**
 * Small spoken-line caption (visual cue for audio, mute mode, and for parents).
 * Voice is primary; this stays small and low on the screen so the game dominates.
 */
export function Captions() {
  const caption = useGame((s) => s.caption);
  const enabled = useGame((s) => s.save.settings.captions);
  const muted = useGame((s) => s.save.settings.muted);
  if (!caption || (!enabled && !muted)) return null;
  const isEn = caption.lang === 'en';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center safe-bottom safe-x" aria-live="polite">
      <div
        key={caption.id}
        dir={isEn ? 'ltr' : 'rtl'}
        className="mb-2 flex max-w-[92%] items-center gap-2 rounded-2xl border-2 border-blue/60 bg-surface-lowest/85 px-3 py-2 shadow-[0_6px_0_0_#080e1d,0_0_20px_rgba(30,107,255,0.35)] backdrop-blur-md animate-pop-in"
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/60 bg-gradient-to-tr from-blue via-primary to-gold">
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          </span>
          <span className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-mint" />
        </span>
        <span className={`font-display font-black leading-snug text-white drop-shadow ${isEn ? 'text-lg tracking-wide text-primary-fixed' : 'text-base'}`}>
          {caption.text}
        </span>
      </div>
    </div>
  );
}
