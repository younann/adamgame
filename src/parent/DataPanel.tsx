'use client';

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/state/gameStore';
import { saveRepository } from '@/storage/SaveRepository';
import { Btn, Section } from './ui';

const ERROR_LOG_KEY = 'adam-error-log';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function readErrorLog(): { ts: number; message: string }[] {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as { ts: number; message: string }[]).filter((e) => e && typeof e.message === 'string') : [];
  } catch {
    return [];
  }
}

export function DataPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [errors, setErrors] = useState<{ ts: number; message: string }[]>(readErrorLog);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => undefined);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, []);

  const exportBackup = () => {
    const text = saveRepository.exportJson(useGame.getState().save);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `adam-adventure-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setMsg('تم تنزيل النسخة الاحتياطية ✓ · Backup downloaded');
  };

  const importBackup = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = saveRepository.importJson(await f.text());
      useGame.getState().replaceSave(data);
      setMsg('تمت استعادة النسخة ✓ · Backup restored');
    } catch (e) {
      setMsg(`ملف غير صالح · ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doReset = async () => {
    await useGame.getState().resetAll();
    setResetOpen(false);
    setConfirmText('');
    setMsg('تم مسح كل التقدم · All progress reset');
  };

  return (
    <Section id="data" title="البيانات والتخزين" en="Data & storage" icon={<span aria-hidden>💾</span>}>
      <div className="flex flex-col gap-3">
        <p className="font-body text-sm font-bold text-on-surface-variant">
          كل بيانات آدم محفوظة على هذا الجهاز فقط. <span dir="ltr">All data stays on this device (IndexedDB).</span>
        </p>
        <dl className="grid grid-cols-2 gap-2 font-body text-sm">
          <div className="rounded-game bg-surface-low px-3 py-2"><dt className="font-bold text-on-surface-variant">المساحة المستخدمة · Used</dt><dd className="font-display font-black text-white" dir="ltr">{usage ? `${fmtBytes(usage.usage)} / ${fmtBytes(usage.quota)}` : '—'}</dd></div>
          <div className="rounded-game bg-surface-low px-3 py-2"><dt className="font-bold text-on-surface-variant">تخزين دائم · Persistent</dt><dd className="font-display font-black text-white">{persisted === null ? '—' : persisted ? 'نعم · Yes' : 'لا · No'}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Btn tone="blue" onClick={exportBackup}>⬇️ تصدير · Export</Btn>
          <Btn tone="neutral" onClick={() => fileRef.current?.click()}>⬆️ استيراد · Import</Btn>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import backup file" onChange={(e) => void importBackup(e.target.files?.[0])} />
          <Btn tone="danger" onClick={() => setResetOpen((v) => !v)} ariaLabel="Reset all progress">🗑️ مسح التقدم · Reset</Btn>
        </div>
        {resetOpen && (
          <div className="flex flex-col gap-2 rounded-game border-2 border-soft-red/60 bg-red-deep/20 p-3" role="group" aria-labelledby="reset-h">
            <p id="reset-h" className="font-body font-bold text-soft-red">
              سيتم حذف كل النجوم والتقدم نهائياً. اكتب <b dir="ltr">ADAM</b> للتأكيد. <span dir="ltr">This permanently deletes all progress. Type ADAM to confirm.</span>
            </p>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} dir="ltr" aria-label="Type ADAM to confirm" className="h-11 rounded-game border-2 border-soft-red/60 bg-surface-container px-3 font-display font-black text-white" />
            <div className="flex gap-2">
              <Btn tone="danger" disabled={confirmText.trim().toUpperCase() !== 'ADAM'} onClick={() => void doReset()}>تأكيد المسح · Confirm</Btn>
              <Btn tone="neutral" onClick={() => { setResetOpen(false); setConfirmText(''); }}>إلغاء · Cancel</Btn>
            </div>
          </div>
        )}
        <p role="status" className="min-h-5 font-body text-sm font-bold text-mint">{msg}</p>

        <details className="rounded-game bg-surface-low p-3">
          <summary className="cursor-pointer font-display font-black text-primary">سجل الأخطاء التقنية · Error log ({errors.length})</summary>
          {errors.length ? (
            <>
              <ul className="mt-2 max-h-56 overflow-auto font-mono text-xs" dir="ltr">
                {errors.slice(-50).reverse().map((e, i) => (
                  <li key={i} className="border-b border-outline-variant/50 py-1"><span className="text-on-surface-variant">{new Date(e.ts).toLocaleString()}</span> — {e.message}</li>
                ))}
              </ul>
              <Btn tone="neutral" className="mt-2" onClick={() => { try { localStorage.removeItem(ERROR_LOG_KEY); } catch { /* ignore */ } setErrors([]); }}>مسح السجل · Clear</Btn>
            </>
          ) : (
            <p className="mt-2 font-body text-sm font-bold text-on-surface-variant">لا توجد أخطاء · No errors</p>
          )}
        </details>
      </div>
    </Section>
  );
}
