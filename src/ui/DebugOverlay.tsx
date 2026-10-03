'use client';

import { useState } from 'react';
import { useGame, type SceneId } from '@/state/gameStore';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { ChallengeRunner } from '@/game/systems/ChallengeRunner';
import { ENGLISH } from '@/learning/curriculum/english';
import { MATH } from '@/learning/curriculum/math';
import type { WorldKey } from '@/storage/schema';

/** Development-only debug overlay. Never rendered in production builds. */
export function DebugOverlay({ engine }: { engine: GameEngine }) {
  const [open, setOpen] = useState(false);
  const fps = useGame((s) => s.fps);
  const scene = useGame((s) => s.scene);
  const st = useGame.getState;
  const runner = () => (engine.scenes.current as unknown as { runner?: ChallengeRunner }).runner;
  const btn = 'rounded-lg bg-surface-high px-2 py-1 text-xs font-bold text-white active:bg-blue';
  return (
    <div className="absolute bottom-2 left-2 z-[60] font-mono text-[11px] text-mint" dir="ltr">
      <button type="button" className="rounded bg-black/70 px-2 py-1" onClick={() => setOpen((o) => !o)}>
        🐞 {fps}fps · {scene}
      </button>
      {open && (
        <div className="mt-1 flex w-64 flex-wrap gap-1 rounded-xl bg-black/85 p-2">
          <button className={btn} onClick={() => { const r = runner(); if (r?.current) r.choose(r.current.answer.id); }}>skip ✓</button>
          <button className={btn} onClick={() => { const r = runner(); if (r?.current) r.choose(r.current.distractors[0].id); }}>wrong ✗</button>
          <button className={btn} onClick={() => st().addStars(10)}>+10★</button>
          <button className={btn} onClick={() => st().addTrophy()}>+🏆</button>
          <button className={btn} onClick={() => st().updateSettings({ forcedWorlds: ['football', 'hero', 'racing', 'treasure', 'closet'] as WorldKey[] })}>unlock worlds</button>
          <button className={btn} onClick={() => { for (const c of ENGLISH.slice(0, 4)) st().setSkillState(c.id, 'mastered'); for (const m of MATH.slice(0, 4)) st().setSkillState(m.id, 'mastered'); }}>master some</button>
          <button className={btn} onClick={() => st().updateSettings({ muted: !st().save.settings.muted })}>mute</button>
          <button className={btn} onClick={() => engine.session.expireNow()}>end session</button>
          {(['world', 'football', 'hero', 'racing', 'treasure', 'closet', 'rest'] as SceneId[]).map((s) => (
            <button key={s} className={btn} onClick={() => void engine.scenes.goto(s, { data: { from: scene } })}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
