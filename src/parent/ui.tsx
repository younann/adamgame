'use client';

import type { ReactNode } from 'react';

/** Small shared building blocks for the Parent Zone (adult UI, same design language). */

export function Section({ id, title, en, children, icon }: { id: string; title: string; en: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 rounded-game-lg border-2 border-blue/30 bg-surface-container/90 p-4 shadow-[0_6px_0_0_#080e1d] sm:p-5">
      <h2 id={`${id}-h`} className="mb-3 flex items-center gap-2 font-display text-xl font-black text-white">
        {icon}
        <span>{title}</span>
        <span className="text-sm font-bold text-on-surface-variant" dir="ltr">
          · {en}
        </span>
      </h2>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = 'blue' }: { label: string; value: string; tone?: 'blue' | 'gold' | 'mint' }) {
  const toneCls = { blue: 'text-primary border-blue/40', gold: 'text-gold border-gold/40', mint: 'text-mint border-mint/40' }[tone];
  return (
    <div className={`rounded-game border-2 bg-surface-low px-3 py-2 ${toneCls}`}>
      <div className="font-body text-xs font-bold text-on-surface-variant">{label}</div>
      <div className="font-display text-2xl font-black">{value}</div>
    </div>
  );
}

type BtnTone = 'blue' | 'gold' | 'mint' | 'neutral' | 'danger';
const TONES: Record<BtnTone, { cls: string; depth: string; glow: string }> = {
  blue: { cls: 'bg-gradient-to-b from-blue-bright to-blue-deep text-white', depth: '#002b75', glow: 'rgba(30,107,255,.35)' },
  gold: { cls: 'bg-gradient-to-b from-gold to-gold-mid text-gold-shadow', depth: '#6b4b00', glow: 'rgba(254,183,0,.35)' },
  mint: { cls: 'bg-gradient-to-b from-mint to-mint-deep text-mint-shadow', depth: '#003824', glow: 'rgba(78,222,163,.3)' },
  neutral: { cls: 'bg-gradient-to-b from-surface-highest to-surface-container text-on-surface', depth: '#080e1d', glow: 'transparent' },
  danger: { cls: 'bg-gradient-to-b from-[#c4323f] to-red-deep text-white', depth: '#4a0e14', glow: 'transparent' },
};

export function Btn({
  children,
  tone = 'blue',
  onClick,
  disabled,
  type = 'button',
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  tone?: BtnTone;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}) {
  const t = TONES[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ ['--depth' as string]: t.depth, ['--glow' as string]: t.glow }}
      className={`btn-chunky min-h-11 px-4 py-2 font-display text-base font-black focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50 ${t.cls} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, en }: { checked: boolean; onChange: (v: boolean) => void; label: string; en: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-game bg-surface-low px-3 py-2">
      <span className="font-body font-bold">
        {label} <span className="text-xs text-on-surface-variant" dir="ltr">· {en}</span>
      </span>
      <span className="relative inline-flex">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full border-2 border-outline-variant bg-surface-highest transition peer-checked:border-mint peer-checked:bg-mint-deep peer-focus-visible:outline-2 peer-focus-visible:outline-gold" />
        <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

export function Slider({ label, en, value, onChange, min = 0, max = 1, step = 0.05, format }: {
  label: string; en: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-game bg-surface-low px-3 py-2">
      <span className="flex justify-between font-body font-bold">
        <span>
          {label} <span className="text-xs text-on-surface-variant" dir="ltr">· {en}</span>
        </span>
        <span className="font-display text-gold" dir="ltr">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#4edea3]" />
    </label>
  );
}

export function Segmented<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="rounded-game bg-surface-low px-3 py-2">
      <legend className="sr-only">{label}</legend>
      <div className="mb-1 font-body font-bold" aria-hidden>{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-game border-2 px-3 font-display font-black transition focus-visible:outline-2 focus-visible:outline-gold ${
              o.value === value ? 'border-white bg-blue text-white shadow-[0_4px_0_0_#002b75]' : 'border-outline-variant bg-surface-highest text-on-surface-variant'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
