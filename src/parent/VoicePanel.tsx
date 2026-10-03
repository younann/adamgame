'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  MAX_CLIP_MS,
  MAX_CLIPS_PER_CATEGORY,
  VoiceLimitError,
  addClip,
  deleteClip,
  getVoiceEnabledPref,
  getVoiceFrequency,
  listClips,
  setVoiceEnabledPref,
  setVoiceFrequency,
  type VoiceCategory,
  type VoiceClip,
  type VoiceFrequency,
} from '@/storage/parentVoice';
import { Btn, Section, Segmented, Toggle } from './ui';
import { VoiceRecorder, micCapability, type MicState } from './voiceRecorder';

const CATEGORIES: { id: VoiceCategory; title: string; en: string; when: string; phrases: string[] }[] = [
  { id: 'praise', title: 'تشجيع', en: 'Praise', when: 'بعد الإجابة الصحيحة · after a correct answer', phrases: ['برافو آدم!', 'شاطر يا بطل!', 'Great job Adam!'] },
  { id: 'name', title: 'اسم آدم', en: 'Calling Adam', when: 'عند بدء اللعب · when Adam starts playing', phrases: ['آدم!', 'يا آدم يا بطل!'] },
  { id: 'welcome', title: 'ترحيب', en: 'Welcome', when: 'عند بدء اللعب · when Adam starts playing', phrases: ['أهلا يا آدم!', 'يلا نلعب يا حبيبي!'] },
  { id: 'goodbye', title: 'وداع', en: 'Goodbye', when: 'عند انتهاء وقت اللعب · when play time ends', phrases: ['باي يا حبيبي، بنلعب بكرة!', 'تصبح على خير يا بطل!'] },
];

/** Stop a preview player and release its object URL. */
function releasePlayback(el: RefObject<HTMLAudioElement | null>, url: RefObject<string | null>) {
  const a = el.current;
  if (a) {
    a.onended = null;
    a.onerror = null;
    a.pause();
  }
  el.current = null;
  if (url.current) URL.revokeObjectURL(url.current);
  url.current = null;
}

/** Parent Zone: record your own voice for Adam. Recordings stay on this device only. */
export function VoicePanel() {
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [freq, setFreq] = useState<VoiceFrequency>('sometimes');
  const [mic, setMic] = useState<MicState>('unknown');
  const [recording, setRecording] = useState<VoiceCategory | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const rec = useRef<VoiceRecorder | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  /** a recorder is opening the mic (permission prompt) — all Record buttons are disabled */
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const all = await listClips();
      setClips(all);
      const pref = getVoiceEnabledPref();
      setEnabled(pref ?? all.length > 0);
    } catch {
      setError('تعذر فتح التسجيلات على هذا الجهاز · Could not open recordings storage');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // initial load from IndexedDB + environment capability check (client-only APIs)
    void (async () => {
      await refresh();
      if (!alive) return;
      setFreq(getVoiceFrequency());
      setMic(micCapability());
    })();
    return () => {
      alive = false;
      releasePlayback(audioEl, audioUrl);
      rec.current?.cancel();
      rec.current = null;
    };
  }, [refresh]);

  const stopPlayback = () => releasePlayback(audioEl, audioUrl);

  async function startRecording(category: VoiceCategory) {
    if (rec.current || starting) return; // one recorder at a time (double taps, two categories)
    setError(null);
    if (clips.filter((c) => c.category === category).length >= MAX_CLIPS_PER_CATEGORY) {
      setError(`وصلت للحد الأقصى (${MAX_CLIPS_PER_CATEGORY}) لهذا القسم · Limit reached`);
      return;
    }
    const r = new VoiceRecorder(
      (ms, lvl) => {
        setElapsed(ms);
        setLevel(lvl);
      },
      async (result) => {
        if (rec.current !== r) return;
        rec.current = null;
        setRecording(null);
        setLevel(0);
        if (!result) {
          setError('التسجيل قصير جداً، جرّب مرة ثانية · Too short, try again');
          return;
        }
        try {
          await addClip({ category, ...result });
          if (getVoiceEnabledPref() === null) setVoiceEnabledPref(true);
          await refresh();
        } catch (e) {
          setError(e instanceof VoiceLimitError ? 'وصلت للحد الأقصى · Limit reached' : 'تعذر حفظ التسجيل · Could not save the recording');
        }
      },
    );
    // claim the slot before the permission prompt so nothing else can start meanwhile
    rec.current = r;
    setStarting(true);
    stopPlayback();
    setPlayingId(null);
    try {
      await r.begin();
    } catch (e) {
      r.cancel();
      if (rec.current === r) rec.current = null;
      setStarting(false);
      if (e instanceof Error && e.message === 'cancelled') return;
      if (e instanceof Error && e.message === 'denied') setMic('denied');
      else {
        if (process.env.NODE_ENV !== 'production') console.warn('[voice] recording failed', e);
        setError('تعذر بدء التسجيل · Could not start recording');
      }
      return;
    }
    setStarting(false);
    if (rec.current !== r) {
      // unmounted / superseded while the mic was opening
      r.cancel();
      return;
    }
    setMic('ok');
    setRecording(category);
    setElapsed(0);
  }

  function stopRecording() {
    rec.current?.stop();
  }

  function play(clip: VoiceClip) {
    const wasPlaying = playingId === clip.id;
    stopPlayback();
    if (wasPlaying) {
      setPlayingId(null);
      return;
    }
    const url = URL.createObjectURL(clip.blob);
    audioUrl.current = url;
    const a = new Audio(url);
    audioEl.current = a;
    setPlayingId(clip.id);
    const end = () => {
      if (audioEl.current === a) stopPlayback();
      setPlayingId((p) => (p === clip.id ? null : p));
    };
    a.onended = end;
    a.onerror = end;
    void a.play().catch(() => {
      end();
      setError('تعذر تشغيل التسجيل على هذا المتصفح · This browser cannot play this recording');
    });
  }

  async function remove(clip: VoiceClip) {
    if (playingId === clip.id) {
      stopPlayback();
      setPlayingId(null);
    }
    await deleteClip(clip.id);
    await refresh();
  }

  const secs = (ms: number) => (ms / 1000).toFixed(1);

  return (
    <Section id="voice" title="صوتك لآدم" en="Your voice for Adam" icon={<span aria-hidden>🎙️</span>}>
      <p className="mb-3 font-body text-sm font-bold text-on-surface-variant">
        سجّل صوتك وهو يشجع آدم، وراح تسمعه اللعبة بأوقات مناسبة. التسجيلات بتضل على هذا الجهاز فقط ومش ضمن النسخة الاحتياطية.
        <span className="block text-xs" dir="ltr">Record your own voice; the game plays it at the right moments. Recordings stay on this device only (not in backups).</span>
      </p>

      {mic === 'insecure' && (
        <p role="alert" className="mb-3 rounded-game border-2 border-gold/60 bg-gold-shadow/40 p-3 font-body text-sm font-bold text-gold-light">
          التسجيل بحاجة لاتصال آمن (https) — افتح اللعبة من الرابط المنشور أو من نفس الجهاز (localhost).
          <span className="block text-xs" dir="ltr">Recording needs a secure connection (https or localhost).</span>
        </p>
      )}
      {mic === 'unsupported' && (
        <p role="alert" className="mb-3 rounded-game border-2 border-gold/60 bg-gold-shadow/40 p-3 font-body text-sm font-bold text-gold-light">
          هذا المتصفح لا يدعم التسجيل. جرّب Safari أو Chrome حديث. <span className="block text-xs" dir="ltr">This browser can&apos;t record audio.</span>
        </p>
      )}
      {mic === 'denied' && (
        <p role="alert" className="mb-3 rounded-game border-2 border-soft-red/60 bg-red-deep/30 p-3 font-body text-sm font-bold text-soft-red">
          ما في إذن للمايكروفون. اسمح باستخدام المايكروفون من إعدادات المتصفح وجرّب مرة ثانية.
          <span className="block text-xs" dir="ltr">Microphone permission was denied — allow it in the browser/site settings and try again.</span>
        </p>
      )}
      {error && (
        <p role="status" className="mb-3 rounded-game bg-surface-low p-2 font-body text-sm font-bold text-gold-light">
          {error}
        </p>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <Toggle
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            setVoiceEnabledPref(v);
          }}
          label="استخدم تسجيلاتي في اللعبة"
          en="Use my recordings in the game"
        />
        <Segmented
          label="كم مرة يسمع صوت التشجيع؟ · How often (praise)"
          value={freq}
          onChange={(v) => {
            setFreq(v);
            setVoiceFrequency(v);
          }}
          options={[
            { value: 'sometimes', label: 'أحياناً · Sometimes' },
            { value: 'often', label: 'كثيراً · Often' },
          ]}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const mine = clips.filter((c) => c.category === cat.id);
          const isRec = recording === cat.id;
          const disabled = starting || mic === 'insecure' || mic === 'unsupported' || (recording !== null && !isRec);
          return (
            <div key={cat.id} className="flex flex-col gap-2 rounded-game border-2 border-outline-variant bg-surface-low p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-black text-white">
                  {cat.title} <span className="text-xs font-bold text-on-surface-variant" dir="ltr">· {cat.en}</span>
                </h3>
                <span className="font-display text-xs font-black text-on-surface-variant" dir="ltr">
                  {mine.length}/{MAX_CLIPS_PER_CATEGORY}
                </span>
              </div>
              <p className="font-body text-xs font-bold text-on-surface-variant">{cat.when}</p>
              <div className="flex flex-wrap gap-1" aria-label="أمثلة · Suggestions">
                {cat.phrases.map((p) => (
                  <span key={p} className="rounded-full border border-gold/40 bg-surface-highest px-2 py-0.5 font-display text-sm font-bold text-gold-light">
                    «{p}»
                  </span>
                ))}
              </div>

              {isRec ? (
                <div className="flex items-center gap-3" aria-live="polite">
                  <Btn tone="danger" onClick={stopRecording} className="flex-1 py-3 text-lg" ariaLabel="إيقاف التسجيل · Stop recording">
                    ⏹ إيقاف · Stop
                  </Btn>
                  <div className="flex w-28 flex-col gap-1">
                    <div className="h-3 overflow-hidden rounded-full bg-black/60" aria-hidden>
                      <div className="h-full rounded-full bg-gradient-to-l from-gold via-mint to-blue transition-[width] duration-75" style={{ width: `${Math.min(100, level * 140)}%` }} />
                    </div>
                    <span className="font-display text-sm font-black text-soft-red tabular-nums" dir="ltr">
                      ● {secs(elapsed)}s / {MAX_CLIP_MS / 1000}s
                    </span>
                  </div>
                </div>
              ) : (
                <Btn tone="mint" onClick={() => void startRecording(cat.id)} disabled={disabled || mine.length >= MAX_CLIPS_PER_CATEGORY} className="py-3 text-lg" ariaLabel={`تسجيل ${cat.title} · Record ${cat.en}`}>
                  🎙️ سجّل · Record
                </Btn>
              )}

              {mine.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {mine.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-game bg-surface-highest/70 px-2 py-1.5">
                      <Btn tone="blue" onClick={() => play(c)} className="min-h-10 px-3 py-1" ariaLabel={`${playingId === c.id ? 'إيقاف' : 'تشغيل'} ${i + 1} · ${playingId === c.id ? 'Stop' : 'Play'}`}>
                        {playingId === c.id ? '⏸' : '▶️'}
                      </Btn>
                      <span className="flex-1 font-body text-sm font-bold">
                        #{i + 1} <span className="text-on-surface-variant" dir="ltr">· {secs(c.durationMs)}s</span>
                      </span>
                      <Btn tone="neutral" onClick={() => void remove(c)} className="min-h-10 px-3 py-1" ariaLabel={`حذف ${i + 1} · Delete`}>
                        🗑️
                      </Btn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 font-body text-xs font-bold text-on-surface-variant">
        ملاحظة: على آيفون/آيباد من الشاشة الرئيسية، قد يطلب الجهاز إذن المايكروفون من جديد. الحد الأقصى ١٥ ثانية للتسجيل.
        <span className="block" dir="ltr">Note: in an installed iPhone/iPad app the mic permission may be asked again each time. Max 15 s per recording.</span>
      </p>
    </Section>
  );
}
