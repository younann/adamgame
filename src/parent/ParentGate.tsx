'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { gateQuestion } from './stats';

const GATE_KEY = 'adam-parent-gate';
const GATE_TTL_MS = 10 * 60_000;
const HOLD_MS = 3000;

export function isGateOpen(): boolean {
  try {
    const t = Number(sessionStorage.getItem(GATE_KEY));
    return Number.isFinite(t) && t > 0 && Date.now() - t < GATE_TTL_MS;
  } catch {
    return false;
  }
}

function openGate() {
  try {
    sessionStorage.setItem(GATE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function closeGate() {
  try {
    sessionStorage.removeItem(GATE_KEY);
  } catch {
    /* ignore */
  }
}

/** Step 1: hold for 3 s. Step 2: adult arithmetic. Kept entirely outside the child game. */
export function ParentGate({ onPass }: { onPass: () => void }) {
  const [step, setStep] = useState<'hold' | 'math'>('hold');
  const [progress, setProgress] = useState(0);
  const holdStart = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stopHold = useCallback(() => {
    holdStart.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  }, []);

  const startHold = useCallback(() => {
    holdStart.current = performance.now();
    const loop = () => {
      if (holdStart.current === null) return;
      const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        holdStart.current = null;
        setStep('math');
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-lowest px-5 py-10 text-center safe-top safe-bottom">
      <div>
        <h1 className="font-display text-3xl font-black text-white">منطقة الأهل</h1>
        <p className="font-body font-bold text-on-surface-variant" dir="ltr">Parent Zone</p>
      </div>

      {step === 'hold' ? (
        <>
          <p className="max-w-xs font-body font-bold text-on-surface">اضغط مطولاً على الزر لمدة ٣ ثواني <span className="block text-sm text-on-surface-variant" dir="ltr">Press and hold for 3 seconds</span></p>
          <button
            type="button"
            aria-label="اضغط مطولاً للدخول · Hold to enter"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startHold(); }}
            onPointerUp={stopHold}
            onPointerCancel={stopHold}
            onPointerLeave={stopHold}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && holdStart.current === null && !e.repeat) startHold(); }}
            onKeyUp={stopHold}
            onContextMenu={(e) => e.preventDefault()}
            className="relative grid h-36 w-36 touch-none select-none place-items-center rounded-full focus-visible:outline-4 focus-visible:outline-gold"
          >
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={R} fill="#151b2b" stroke="#2f3445" strokeWidth="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke="#4edea3" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
            </svg>
            <span className="relative font-display text-4xl" aria-hidden>🔒</span>
          </button>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="sr-only" />
        </>
      ) : (
        <MathStep onPass={() => { openGate(); onPass(); }} />
      )}

      <Link href="/" className="font-display font-black text-primary underline underline-offset-4">رجوع للعبة · Back to game</Link>
    </main>
  );
}

function MathStep({ onPass }: { onPass: () => void }) {
  const [q, setQ] = useState(() => gateQuestion());
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    if (Number(value) === q.answer) return onPass();
    setWrong(true);
    setValue('');
    setQ(gateQuestion());
  };

  const press = (k: string) => {
    setWrong(false);
    if (k === '⌫') setValue((v) => v.slice(0, -1));
    else if (value.length < 4) setValue((v) => v + k);
  };

  return (
    <form
      className="flex w-full max-w-xs flex-col items-center gap-4"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <label htmlFor="gate-answer" className="font-display text-3xl font-black text-white" dir="ltr">
        {q.a} × {q.b} = ?
      </label>
      <input
        id="gate-answer"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => { setWrong(false); setValue(e.target.value.replace(/\D/g, '').slice(0, 4)); }}
        aria-invalid={wrong}
        aria-describedby="gate-msg"
        dir="ltr"
        className="h-14 w-full rounded-game border-2 border-blue/50 bg-surface-container text-center font-display text-3xl font-black text-gold focus:border-gold focus:outline-none"
      />
      <p id="gate-msg" role="status" className="min-h-6 font-body text-sm font-bold text-soft-red">
        {wrong ? 'الجواب غير صحيح، جرّب سؤالاً جديداً · Try this one' : ''}
      </p>
      <div className="grid w-full grid-cols-3 gap-2" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => (
          <button
            key={k}
            type={k === '✓' ? 'submit' : 'button'}
            onClick={k === '✓' ? undefined : () => press(k)}
            aria-label={k === '⌫' ? 'delete' : k === '✓' ? 'submit' : k}
            className={`h-14 rounded-game border-2 font-display text-2xl font-black shadow-[0_4px_0_0_#080e1d] active:translate-y-1 active:shadow-none ${
              k === '✓' ? 'border-white bg-mint-deep text-white' : 'border-outline-variant bg-surface-highest text-white'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </form>
  );
}
