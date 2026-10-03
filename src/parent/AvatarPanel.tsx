'use client';

import { useRef, useState } from 'react';
import { DEFAULT_AVATAR, ITEM_BY_ID } from '@/avatar/items';
import { useGame } from '@/state/gameStore';
import { Btn, Section, Toggle } from './ui';

/** Center-crops and downsizes an image file to a 256×256 JPEG data URL. */
export async function fileToFaceDataUrl(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read image'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarPanel() {
  const face = useGame((s) => s.save.profile.faceImage);
  const avatar = useGame((s) => s.save.avatar);
  const unlockedCount = useGame((s) => s.save.unlocked.length);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const dataUrl = await fileToFaceDataUrl(f);
      useGame.getState().setFaceImage(dataUrl);
      setMsg('تم حفظ الصورة ✓ · Photo saved');
    } catch (e) {
      setMsg(`تعذّر قراءة الصورة · ${(e as Error).message}`);
    }
  };

  const equipped = (['outfit', 'cape', 'shoes', 'helmet', 'mask', 'gloves', 'trail', 'celebration'] as const)
    .map((slot) => ITEM_BY_ID.get(avatar[slot]))
    .filter((i) => i && !i.id.endsWith('.none'));

  return (
    <Section id="avatar" title="شخصية آدم" en="Adam's avatar" icon={<span aria-hidden>🦸</span>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-tr from-gold via-blue to-mint p-1 shadow-[0_0_20px_rgba(30,107,255,.6)]">
          {face ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face} alt="صورة آدم · Adam's photo" className="h-full w-full rounded-full border-2 border-white object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-full border-2 border-white bg-surface-container font-display text-5xl" aria-label="no photo">🙂</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <p className="font-body text-sm font-bold text-on-surface-variant">
            ارفع صورة لوجه آدم لتظهر على شخصيته في اللعبة. تُحفظ الصورة على هذا الجهاز فقط ولا تُرسل لأي مكان.
            <span className="block" dir="ltr">Upload a face photo — stored only on this device, never uploaded.</span>
          </p>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Upload photo" onChange={(e) => void onFile(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Btn tone="blue" onClick={() => fileRef.current?.click()}>📷 رفع صورة · Upload</Btn>
            {face && <Btn tone="neutral" onClick={() => { useGame.getState().setFaceImage(undefined); setMsg('تمت إزالة الصورة'); }}>إزالة · Remove</Btn>}
            <Btn tone="neutral" onClick={() => { useGame.getState().setAvatar({ ...DEFAULT_AVATAR, usePhotoFace: !!face }); setMsg('تمت إعادة الشخصية · Avatar reset'); }}>إعادة الشخصية · Reset</Btn>
          </div>
          {face && <Toggle label="استخدم الصورة كوجه" en="Use photo face" checked={avatar.usePhotoFace} onChange={(usePhotoFace) => useGame.getState().setAvatar({ usePhotoFace })} />}
          <p role="status" className="min-h-5 font-body text-sm font-bold text-mint">{msg}</p>
          <div>
            <h3 className="mb-1 font-display font-black text-primary">يرتدي الآن · Wearing ({unlockedCount} مفتوح · unlocked)</h3>
            <ul className="flex flex-wrap gap-2">
              {equipped.map((i) => (
                <li key={i!.id} className="rounded-full bg-surface-highest px-3 py-1 font-display text-sm font-black">{i!.nameAr} <span className="text-on-surface-variant" dir="ltr">{i!.nameEn}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
