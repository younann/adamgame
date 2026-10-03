'use client';

import { useGame } from '@/state/gameStore';
import type { ParentSettings, WorldKey } from '@/storage/schema';
import { Section, Segmented, Slider, Toggle } from './ui';

const WORLDS: { key: WorldKey; ar: string; en: string }[] = [
  { key: 'football', ar: 'ملعب الأهداف', en: 'Goal Stadium' },
  { key: 'hero', ar: 'مدينة الأبطال', en: 'Hero City' },
  { key: 'racing', ar: 'سباق التوربو', en: 'Turbo Racing' },
  { key: 'treasure', ar: 'جزيرة الكنز', en: 'Treasure Island' },
  { key: 'closet', ar: 'خزانة البطل', en: 'Hero Closet' },
];

export function SettingsPanel() {
  const settings = useGame((s) => s.save.settings);
  const set = (p: Partial<ParentSettings>) => useGame.getState().updateSettings(p);
  const toggleWorld = (w: WorldKey, on: boolean) =>
    set({ forcedWorlds: on ? [...new Set([...settings.forcedWorlds, w])] : settings.forcedWorlds.filter((x) => x !== w) });

  return (
    <Section id="settings" title="الإعدادات" en="Settings" icon={<span aria-hidden>⚙️</span>}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="font-display font-black text-primary">الصوت · Audio</h3>
          <Toggle label="كتم الصوت" en="Mute" checked={settings.muted} onChange={(muted) => set({ muted })} />
          <Slider label="الموسيقى" en="Music" value={settings.musicVolume} onChange={(musicVolume) => set({ musicVolume })} />
          <Slider label="المؤثرات" en="Sound effects" value={settings.sfxVolume} onChange={(sfxVolume) => set({ sfxVolume })} />
          <Slider label="الصوت المتكلم" en="Voice" value={settings.voiceVolume} onChange={(voiceVolume) => set({ voiceVolume })} />
          <Slider label="سرعة الكلام" en="Speech rate" min={0.6} max={1.2} step={0.05} value={settings.speechRate} onChange={(speechRate) => set({ speechRate })} format={(v) => `${v.toFixed(2)}×`} />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="font-display font-black text-primary">العرض · Display</h3>
          <Segmented<ParentSettings['reducedMotion']>
            label="تقليل الحركة · Reduced motion"
            value={settings.reducedMotion}
            onChange={(reducedMotion) => set({ reducedMotion })}
            options={[
              { value: 'system', label: 'حسب الجهاز · System' },
              { value: 'on', label: 'تشغيل · On' },
              { value: 'off', label: 'إيقاف · Off' },
            ]}
          />
          <Segmented<ParentSettings['graphics']>
            label="الرسومات · Graphics"
            value={settings.graphics}
            onChange={(graphics) => set({ graphics })}
            options={[
              { value: '3d', label: 'ثلاثي الأبعاد · 3D' },
              { value: 'classic', label: 'كلاسيكي · Classic (older devices)' },
            ]}
          />
          <Toggle label="ترجمة الكلام على الشاشة" en="Captions" checked={settings.captions} onChange={(captions) => set({ captions })} />
          <Toggle label="الاهتزاز" en="Haptics" checked={settings.haptics} onChange={(haptics) => set({ haptics })} />
          <h3 className="mt-2 font-display font-black text-primary">فتح العوالم · Unlock worlds</h3>
          <p className="font-body text-xs font-bold text-on-surface-variant">العوالم تفتح تلقائياً مع اللعب؛ هنا يمكنك فتحها مباشرة. · Worlds open with progress; force-open them here.</p>
          {WORLDS.map((w) => (
            <Toggle key={w.key} label={w.ar} en={w.en} checked={settings.forcedWorlds.includes(w.key)} onChange={(on) => toggleWorld(w.key, on)} />
          ))}
        </div>
      </div>
    </Section>
  );
}
