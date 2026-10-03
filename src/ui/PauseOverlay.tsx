'use client';

import { useEffect } from 'react';
import { useGame } from '@/state/gameStore';
import type { GameEngine } from '@/game/engine/GameEngine';
import { Icon } from './Icon';

/**
 * Pause during a mission. Leaving a mission takes two deliberate taps (pause → home),
 * so Adam can't exit by accident. Icons + voice, minimal text.
 */
export function PauseOverlay({ engine }: { engine: GameEngine }) {
  const open = useGame((s) => s.pauseMenu);
  const setPauseMenu = useGame((s) => s.setPauseMenu);
  const scene = useGame((s) => s.scene);

  useEffect(() => {
    if (!open) return;
    engine.speech.cancel();
    void engine.speech.say([{ text: 'استراحة! بدك تكمل؟', lang: 'ar' }], 'sparky');
  }, [open, engine]);

  if (!open) return null;
  const resume = () => {
    engine.audio.sfx('pop');
    setPauseMenu(false);
  };
  const home = () => {
    engine.audio.sfx('whoosh');
    setPauseMenu(false);
    void engine.scenes.goto('world', { data: { from: scene } });
  };
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-surface-lowest/80 backdrop-blur-md safe-top safe-bottom" role="dialog" aria-label="Pause">
      <button
        type="button"
        autoFocus
        onClick={resume}
        aria-label="كمّل · Continue"
        className="btn-chunky flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-b from-mint-light via-mint to-mint-deep text-white [--depth:#003824] [--glow:rgba(78,222,163,0.7)]"
      >
        <Icon name="play" className="h-16 w-16 drop-shadow" />
      </button>
      <button
        type="button"
        onClick={home}
        aria-label="عالم آدم · Adam's world"
        className="btn-chunky flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-b from-blue-bright via-blue to-blue-deep text-white [--depth:#002b75]"
      >
        <Icon name="home" className="h-11 w-11" />
      </button>
    </div>
  );
}
