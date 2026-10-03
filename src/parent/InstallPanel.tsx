'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePwaInstall } from '@/pwa/usePwaInstall';
import { useGame } from '@/state/gameStore';
import { Btn, Section } from './ui';

type SwStatus = 'unsupported' | 'none' | 'active' | 'waiting' | 'checking';

interface OfflineStatus {
  version: string;
  total: number;
  cached: number;
  missingCritical: number;
}

/** Asks the active service worker how much of the game is actually stored for offline play. */
function queryOffline(): Promise<OfflineStatus | null> {
  const ctl = navigator.serviceWorker?.controller;
  if (!ctl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 4000);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve((e.data as OfflineStatus | null) ?? null);
    };
    ctl.postMessage({ type: 'GET_STATUS' }, [ch.port2]);
  });
}

function useServiceWorker() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  // Rendered only client-side (behind the parent gate), so navigator is available.
  const [status, setStatus] = useState<SwStatus>(() => ('serviceWorker' in navigator ? 'none' : 'unsupported'));
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [offline, setOffline] = useState<OfflineStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    const r = (await navigator.serviceWorker.getRegistration()) ?? null;
    setReg(r);
    setStatus(r?.waiting ? 'waiting' : r?.active || navigator.serviceWorker.controller ? 'active' : 'none');
    setOffline(await queryOffline());
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onChange = () => void refresh();
    const t = setTimeout(onChange, 0);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => {
      clearTimeout(t);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (!reg) return;
    const onFound = () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => void refresh());
    };
    reg.addEventListener('updatefound', onFound);
    return () => reg.removeEventListener('updatefound', onFound);
  }, [reg, refresh]);

  const check = async () => {
    if (!reg) return refresh();
    setStatus('checking');
    try {
      await reg.update();
    } catch {
      /* offline */
    }
    setCheckedAt(Date.now());
    await refresh();
  };

  const apply = () => {
    const w = reg?.waiting;
    if (!w) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    w.postMessage({ type: 'SKIP_WAITING' });
  };

  return { status, check, apply, checkedAt, offline };
}

const SW_LABEL: Record<SwStatus, string> = {
  unsupported: 'غير مدعوم · Unsupported',
  none: 'غير مفعّل بعد · Not active yet',
  active: 'مفعّل · Active',
  waiting: 'تحديث جاهز · Update ready',
  checking: 'جاري الفحص… · Checking…',
};

export function InstallPanel() {
  const { canPrompt, prompt, isIOS, isInstalled, isStandalone } = usePwaInstall();
  const sw = useServiceWorker();
  const [msg, setMsg] = useState('');
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

  const install = async () => {
    const r = await prompt();
    if (r === 'accepted') {
      const s = useGame.getState().save;
      useGame.getState().replaceSave({ ...s, pwa: { ...s.pwa, installedAt: Date.now() } });
      setMsg('تم التثبيت ✓ · Installed');
    } else if (r === 'dismissed') setMsg('تم الإلغاء · Dismissed');
  };

  return (
    <Section id="install" title="تثبيت اللعبة" en="Install the game" icon={<span aria-hidden>📲</span>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 font-body font-bold">
          <span className={`rounded-full border px-3 py-1 font-display text-sm font-black ${isInstalled ? 'border-mint text-mint' : 'border-outline-variant text-on-surface-variant'}`}>
            {isInstalled ? 'مثبّتة ✓ · Installed' : 'غير مثبّتة · Not installed'}
          </span>
          {isStandalone && <span className="rounded-full border border-blue px-3 py-1 font-display text-sm font-black text-primary">وضع التطبيق · Standalone</span>}
        </div>

        {!isInstalled && canPrompt && (
          <Btn tone="gold" onClick={() => void install()} className="self-start">⭐ ثبّت لعبة آدم · Install</Btn>
        )}

        {!isInstalled && isIOS && <IosSteps />}

        {!isInstalled && !isIOS && !canPrompt && (
          <p className="font-body text-sm font-bold text-on-surface-variant">
            افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
            <span className="block" dir="ltr">Use the browser menu → “Install app” / “Add to Home screen”.</span>
          </p>
        )}
        <p role="status" className="min-h-5 font-body text-sm font-bold text-mint">{msg}</p>

        <div className="rounded-game bg-surface-low p-3 font-body text-sm">
          <h3 className="mb-2 font-display font-black text-primary">التحديثات والعمل دون إنترنت · Updates & offline</h3>
          <dl className="grid grid-cols-2 gap-2">
            <dt className="font-bold text-on-surface-variant">الإصدار · Version</dt>
            <dd className="font-display font-black" dir="ltr">{version}</dd>
            <dt className="font-bold text-on-surface-variant">Service worker</dt>
            <dd className="font-display font-black">{SW_LABEL[sw.status]}</dd>
            <dt className="font-bold text-on-surface-variant">دون إنترنت · Offline</dt>
            <dd className="font-display font-black">
              <OfflineLabel s={sw.offline} />
            </dd>
            {sw.checkedAt && (<><dt className="font-bold text-on-surface-variant">آخر فحص · Checked</dt><dd dir="ltr">{new Date(sw.checkedAt).toLocaleTimeString()}</dd></>)}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn tone="neutral" onClick={() => void sw.check()} disabled={sw.status === 'unsupported' || sw.status === 'checking'}>🔄 فحص التحديث · Check update</Btn>
            {sw.status === 'waiting' && <Btn tone="mint" onClick={sw.apply}>تطبيق التحديث · Apply update</Btn>}
          </div>
        </div>
      </div>
    </Section>
  );
}

function OfflineLabel({ s }: { s: OfflineStatus | null }) {
  if (!s) return <span className="text-on-surface-variant">غير جاهز بعد · Not ready yet</span>;
  if (s.missingCritical > 0) return <span className="text-soft-red">ناقص · Incomplete ({s.cached}/{s.total})</span>;
  if (s.cached >= s.total) return <span className="text-mint">جاهز بالكامل ✓ · Fully offline ({s.total})</span>;
  return (
    <span className="text-gold-light" dir="ltr">
      {Math.floor((s.cached / s.total) * 100)}% · {s.cached}/{s.total}
    </span>
  );
}

function Step({ n, children, icon }: { n: number; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-game bg-surface-low p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold font-display font-black text-gold-shadow">{n}</span>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white" aria-hidden>{icon}</span>
      <span className="font-body text-sm font-bold">{children}</span>
    </li>
  );
}

function IosSteps() {
  return (
    <div>
      <h3 className="mb-2 font-display font-black text-primary">على الآيفون والآيباد · iPhone & iPad (Safari)</h3>
      <ol className="flex flex-col gap-2">
        <Step n={1} icon={<svg width="26" height="30" viewBox="0 0 26 30" fill="none" stroke="#1e6bff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2v17M7 8l6-6 6 6" /><path d="M5 13H3v15h20V13h-2" /></svg>}>
          اضغط زر المشاركة في Safari <span className="block text-xs text-on-surface-variant" dir="ltr">Tap the Share button</span>
        </Step>
        <Step n={2} icon={<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#1e6bff" strokeWidth="2.4" strokeLinecap="round"><rect x="3" y="3" width="22" height="22" rx="6" /><path d="M14 9v10M9 14h10" /></svg>}>
          اختر «إضافة إلى الشاشة الرئيسية» <span className="block text-xs text-on-surface-variant" dir="ltr">Choose “Add to Home Screen”</span>
        </Step>
        <Step n={3} icon={<span className="font-display text-2xl">⚽</span>}>
          اضغط «إضافة» ثم افتح اللعبة من أيقونتها <span className="block text-xs text-on-surface-variant" dir="ltr">Tap “Add”, then launch from the icon</span>
        </Step>
      </ol>
    </div>
  );
}
