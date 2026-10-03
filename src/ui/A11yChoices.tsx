'use client';

import { useGame } from '@/state/gameStore';

/**
 * Keyboard / screen-reader mirror of the current in-world choices. Visually hidden until
 * focused (Tab), so it never clutters the child's game view.
 */
export function A11yChoices() {
  const choices = useGame((s) => s.a11yChoices);
  const onChoose = useGame((s) => s.onA11yChoose);
  if (!choices.length || !onChoose) return null;
  return (
    <div className="sr-only-focusable absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-2xl bg-surface-lowest/90 p-2" role="group" aria-label="Choices">
      {choices.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChoose(c.id)}
          className="rounded-xl border-2 border-gold bg-surface-high px-4 py-3 font-display text-lg font-black text-white focus:outline focus:outline-4 focus:outline-mint"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
