'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useGame, type HudState } from '@/state/gameStore';
import type { GameEngine } from '@/game/engine/GameEngine';
import { onHudPulse, registerHudAnchor } from '@/game/engine/hudBridge';
import { AdamPortrait } from './AdamPortrait';
import { Icon } from './Icon';

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/**
 * Contextual arcade HUD — only what matters for the current game. Never a navigation bar.
 * Football: score + clock + stars · Racing: speed + nitro + stars · Hero: energy + objective
 * Treasure: keys + map fragments · World: portrait + stars + trophies + (hidden) parent door.
 */
export function Hud({ engine, shell }: { engine: GameEngine; shell: RefObject<HTMLDivElement | null> }) {
  void shell;
  const hud = useGame((s) => s.hud);
  const scene = useGame((s) => s.scene);
  if (hud.kind === 'none') return null;
  const inMission = scene !== 'world' && scene !== 'rest' && scene !== 'boot';
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 safe-top safe-x">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {inMission ? <PauseButton /> : <PortraitBlock />}
          {hud.kind === 'football' && <Scoreboard hud={hud} />}
          {hud.kind === 'racing' && <RaceMeters hud={hud} />}
          {hud.kind === 'hero' && <HeroMeters hud={hud} />}
          {hud.kind === 'treasure' && <TreasureMeters hud={hud} />}
        </div>
        <div className="flex items-center gap-2">
          <StarCounter />
          {(hud.kind === 'world' || hud.kind === 'closet') && <TrophyCounter />}
          <SoundButton engine={engine} />
          {(hud.kind === 'world') && <ParentDoor />}
        </div>
      </div>
    </div>
  );
}

function usePulse(key: 'stars' | 'trophy') {
  const [pulse, setPulse] = useState(0);
  useEffect(() => onHudPulse(key, () => setPulse((p) => p + 1)), [key]);
  return pulse;
}

function StarCounter() {
  const stars = useGame((s) => s.save.stars);
  const ref = useRef<HTMLDivElement>(null);
  const pulse = usePulse('stars');
  useEffect(() => {
    registerHudAnchor('stars', ref.current);
    return () => registerHudAnchor('stars', null);
  }, []);
  return (
    <div
      ref={ref}
      key={pulse}
      className="flex items-center gap-1 rounded-full border-2 border-gold/60 bg-surface-highest/90 px-3 py-1.5 shadow-[0_3px_0_0_#080e1d] animate-pop-in"
      aria-label={`${stars} stars`}
    >
      <Icon name="star" className="h-6 w-6 text-gold drop-shadow-[0_0_8px_rgba(254,183,0,0.8)]" />
      <span className="font-display text-lg font-black text-gold-light tabular-nums">{toArabicDigits(stars)}</span>
    </div>
  );
}

function TrophyCounter() {
  const trophies = useGame((s) => s.save.trophies);
  if (trophies === 0) return null;
  return (
    <div className="flex items-center gap-1 rounded-full border-2 border-gold/40 bg-surface-highest/90 px-2.5 py-1.5 shadow-[0_3px_0_0_#080e1d]" aria-label={`${trophies} trophies`}>
      <Icon name="trophy" className="h-5 w-5 text-gold" />
      <span className="font-display text-base font-black text-gold-light">{toArabicDigits(trophies)}</span>
    </div>
  );
}

function PortraitBlock() {
  const stars = useGame((s) => s.save.stars);
  const level = Math.floor(stars / 25) + 1;
  const progress = (stars % 25) / 25;
  return (
    <div className="pointer-events-none flex items-center gap-2.5">
      <AdamPortrait level={level} />
      <div className="hidden flex-col min-[360px]:flex">
        <span className="font-display text-sm font-black text-white drop-shadow">البطل آدم</span>
        <div className="mt-1 h-3.5 w-24 overflow-hidden rounded-full border border-primary/30 bg-black/70 p-0.5 shadow-inner sm:w-32">
          <div
            className="relative h-full rounded-full bg-gradient-to-l from-mint via-blue to-gold shadow-[0_0_10px_#4edea3] transition-[width] duration-700"
            style={{ width: `${Math.max(8, progress * 100)}%` }}
          >
            <div className="absolute inset-0 animate-pulse bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PauseButton() {
  const setPauseMenu = useGame((s) => s.setPauseMenu);
  return (
    <button
      type="button"
      aria-label="استراحة · Pause"
      onClick={() => setPauseMenu(true)}
      className="btn-chunky pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-surface-highest to-surface-low text-white [--depth:#080e1d] [--glow:transparent]"
    >
      <Icon name="pause" className="h-6 w-6" />
    </button>
  );
}

function SoundButton({ engine }: { engine: GameEngine }) {
  const muted = useGame((s) => s.save.settings.muted);
  const update = useGame((s) => s.updateSettings);
  return (
    <button
      type="button"
      aria-label={muted ? 'تشغيل الصوت · Sound on' : 'كتم الصوت · Mute'}
      onClick={() => {
        engine.unlockAudio();
        update({ muted: !muted });
      }}
      className="btn-chunky pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-blue to-blue-deep text-white [--depth:#001849]"
    >
      {!muted && <span className="pointer-events-none absolute -inset-0.5 animate-ping rounded-full bg-primary/25" />}
      <Icon name={muted ? 'volume_off' : 'volume_up'} className="h-6 w-6" />
    </button>
  );
}

/** Hidden-in-plain-sight parent entrance: must be held for 2 seconds (kids tap, parents hold). */
function ParentDoor() {
  const router = useRouter();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => router.push('/parent/'), 2000);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <button
      type="button"
      aria-label="منطقة الأهل (اضغط مطولاً) · Parent zone (press and hold)"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => e.key === 'Enter' && router.push('/parent/')}
      className="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-low/70 text-on-surface-variant/70"
    >
      <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden>
        <circle
          cx="20" cy="20" r="17" fill="none" stroke="#feb700" strokeWidth="3" strokeDasharray="107"
          strokeDashoffset={holding ? 0 : 107}
          style={{ transition: holding ? 'stroke-dashoffset 2s linear' : 'none' }}
        />
      </svg>
      <Icon name="settings" className="h-5 w-5" />
    </button>
  );
}

function Scoreboard({ hud }: { hud: Extract<HudState, { kind: 'football' }> }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 border-blue/70 bg-gradient-to-r from-surface-container/95 via-surface-low/95 to-surface-lowest/95 px-2.5 py-1.5 shadow-[0_6px_0_0_#080e1d,0_0_20px_rgba(30,107,255,0.3)]">
      <div className="flex items-center gap-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-white/70 bg-gradient-to-b from-primary via-blue to-blue-shadow font-display text-base font-black text-white">آ</div>
        <span key={hud.adam} className="font-display text-2xl font-black leading-none text-white drop-shadow animate-pop-in">{toArabicDigits(hud.adam)}</span>
      </div>
      <div className="flex flex-col items-center rounded-lg border border-gold/40 bg-surface-lowest/90 px-2 py-0.5">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-soft-red" />
          <span className="font-display text-xs font-black text-soft-red">{toArabicDigits(hud.minute)}&apos;</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-display text-2xl font-black leading-none text-white drop-shadow">{toArabicDigits(hud.rivals)}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-outline-variant bg-surface-highest font-display text-base font-black text-on-surface">م</div>
      </div>
    </div>
  );
}

function Meter({ value, from, to, label, icon }: { value: number; from: string; to: string; label: string; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border-2 border-gold/50 bg-surface-lowest/85 px-2 py-1.5" aria-label={label}>
      <Icon name={icon} className="h-5 w-5 text-gold" />
      <div className="h-3.5 w-20 overflow-hidden rounded-full bg-black/70 p-0.5 sm:w-28">
        <div className={`h-full rounded-full bg-gradient-to-l ${from} ${to} transition-[width] duration-200`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </div>
    </div>
  );
}

function RaceMeters({ hud }: { hud: Extract<HudState, { kind: 'racing' }> }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center rounded-xl border-2 border-gold/70 bg-gradient-to-l from-surface-lowest/95 to-surface-high/90 px-2.5 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.7)]" aria-label={`speed ${Math.round(hud.speed)}`}>
        <span className="font-display text-lg font-black leading-none text-gold tabular-nums">{toArabicDigits(Math.round(hud.speed))}</span>
        <span className="font-display text-[10px] font-bold text-gold-light">كم/س</span>
      </div>
      <Meter value={hud.nitro} from="from-gold" to="to-soft-red" label="nitro" icon="bolt" />
      <div className="hidden items-center rounded-lg border border-mint/40 bg-mint-shadow/80 px-2 py-0.5 font-display text-xs font-black text-mint-light sm:flex">
        {toArabicDigits(hud.lap)}/{toArabicDigits(hud.laps)}
      </div>
    </div>
  );
}

function HeroMeters({ hud }: { hud: Extract<HudState, { kind: 'hero' }> }) {
  return (
    <div className="flex items-center gap-2">
      <Meter value={hud.energy} from="from-mint" to="to-blue" label="energy" icon="bolt" />
      <div className="flex items-center gap-1 rounded-full border-2 border-mint/50 bg-surface-lowest/85 px-2.5 py-1 font-display text-sm font-black text-mint-light" aria-label={`rescued ${hud.rescued} of ${hud.goal}`}>
        <Icon name="shield" className="h-4 w-4" />
        {toArabicDigits(hud.rescued)}/{toArabicDigits(hud.goal)}
      </div>
    </div>
  );
}

function TreasureMeters({ hud }: { hud: Extract<HudState, { kind: 'treasure' }> }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-full border-2 border-gold/50 bg-surface-lowest/85 px-2.5 py-1 font-display text-sm font-black text-gold-light" aria-label={`keys ${hud.keys}`}>
        <Icon name="key" className="h-4 w-4" />
        {toArabicDigits(hud.keys)}
      </div>
      <div className="flex items-center gap-1 rounded-full border-2 border-mint/50 bg-surface-lowest/85 px-2.5 py-1 font-display text-sm font-black text-mint-light" aria-label={`map ${hud.fragments} of ${hud.fragmentsGoal}`}>
        <Icon name="map" className="h-4 w-4" />
        {toArabicDigits(hud.fragments)}/{toArabicDigits(hud.fragmentsGoal)}
      </div>
    </div>
  );
}
