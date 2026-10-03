/** First paint while the engine boots: a themed glowing star, never a web spinner. */
export function LoadingScreen() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#050a18] via-[#0d1a3f] to-[#1e3a8a]">
      <div className="relative h-28 w-28 animate-bob">
        <div className="absolute inset-0 animate-ping rounded-full bg-gold/30" />
        <svg viewBox="0 0 24 24" className="relative h-28 w-28 text-gold drop-shadow-[0_0_24px_rgba(254,183,0,0.9)]" aria-hidden>
          <path fill="currentColor" stroke="#fff" strokeWidth="0.8" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
        </svg>
      </div>
      <p className="font-display text-3xl font-black text-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">مغامرة آدم</p>
    </div>
  );
}
