'use client';

import { useGame } from '@/state/gameStore';
import { HAIR_COLORS, SKIN_TONES } from '@/avatar/items';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/** HUD portrait: Adam's photo (if the parent added one) or his drawn hero face. */
export function AdamPortrait({ level, size = 52 }: { level?: number; size?: number }) {
  const avatar = useGame((s) => s.save.avatar);
  const photo = useGame((s) => s.save.profile.faceImage);
  const skin = hex(SKIN_TONES[avatar.skin] ?? SKIN_TONES[1]);
  const hair = hex(HAIR_COLORS[avatar.hair] ?? HAIR_COLORS[0]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="h-full w-full rounded-full bg-gradient-to-tr from-gold via-blue to-mint p-[3px] shadow-[0_0_16px_rgba(30,107,255,0.8)] animate-electric">
        <div className="h-full w-full overflow-hidden rounded-full border-2 border-white/80 bg-blue-deep">
          {photo && avatar.usePhotoFace ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="آدم" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 100 100" className="h-full w-full" aria-label="آدم">
              <rect width="100" height="100" fill="#1e6bff" />
              <circle cx="50" cy="60" r="34" fill={skin} />
              <circle cx="22" cy="40" r="13" fill={hair} />
              <circle cx="38" cy="28" r="15" fill={hair} />
              <circle cx="58" cy="26" r="15" fill={hair} />
              <circle cx="76" cy="36" r="13" fill={hair} />
              <ellipse cx="38" cy="60" rx="6" ry="7" fill="#fff" />
              <ellipse cx="62" cy="60" rx="6" ry="7" fill="#fff" />
              <circle cx="39" cy="62" r="4" fill="#3a2414" />
              <circle cx="63" cy="62" r="4" fill="#3a2414" />
              <path d="M38 76 Q50 86 62 76" stroke="#6b1b24" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
      {level !== undefined && (
        <div className="absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gold font-display text-[11px] font-black text-[#412d00] shadow-[0_2px_0_0_#6b4b00]">
          {toArabicDigits(level)}
        </div>
      )}
    </div>
  );
}
