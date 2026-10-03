/** Small inline SVG HUD icons (offline-safe; no icon font download). */
const PATHS: Record<string, string> = {
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z',
  trophy: 'M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15v2h3v3H8v-3h3v-2a5 5 0 0 1-2.7-3H8a4 4 0 0 1-4-4V5h3zm-1 4v1a2 2 0 0 0 1.5 1.9A6 6 0 0 1 7 7zm11 0a6 6 0 0 1-.5 2.9A2 2 0 0 0 19 8V7z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  play: 'M7 4l13 8-13 8z',
  home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
  volume_up: 'M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  volume_off: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  settings: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM10.5 2h3l.5 2.6 2 .9 2.2-1.5 2.1 2.1-1.5 2.2.9 2 2.6.5v3l-2.6.5-.9 2 1.5 2.2-2.1 2.1-2.2-1.5-2 .9-.5 2.6h-3l-.5-2.6-2-.9-2.2 1.5-2.1-2.1 1.5-2.2-.9-2L2 13.5v-3l2.6-.5.9-2L4 5.8l2.1-2.1 2.2 1.5 2-.9z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  key: 'M8 10a5 5 0 1 1 4.6 5H11v2H9v2H6v-3.4l2.2-2.2A5 5 0 0 1 8 10zm5-2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  wrench: 'M21 7a5 5 0 0 1-6.6 4.7L6 20l-2-2 8.3-8.4A5 5 0 0 1 17 3l-3 3 1 3 3 1z',
};

const STROKED = new Set(['volume_up', 'volume_off', 'map']);

export function Icon({ name, className }: { name: string; className?: string }) {
  const d = PATHS[name] ?? PATHS.star;
  const stroked = STROKED.has(name);
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {stroked ? (
        <path d={d} fill={name === 'map' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={d} fill="currentColor" />
      )}
    </svg>
  );
}
