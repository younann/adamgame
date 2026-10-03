/**
 * Bridge between the Pixi game layer and the React/DOM HUD.
 * DOM HUD elements register anchors (e.g. the star counter) so in-game rewards can fly
 * precisely into them, and can receive "pulse" notifications when something lands.
 */
type AnchorKey = 'stars' | 'trophy' | 'power' | 'portrait' | 'objective';

const anchors = new Map<AnchorKey, HTMLElement>();
const pulseListeners = new Map<AnchorKey, Set<() => void>>();

export function registerHudAnchor(key: AnchorKey, el: HTMLElement | null) {
  if (el) anchors.set(key, el);
  else anchors.delete(key);
}

/** Screen position (CSS px, relative to the game shell) of a HUD anchor. */
export function hudAnchorPosition(key: AnchorKey, shell: HTMLElement | null): { x: number; y: number } | null {
  const el = anchors.get(key);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = shell?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
}

export function pulseHud(key: AnchorKey) {
  pulseListeners.get(key)?.forEach((f) => f());
}

export function onHudPulse(key: AnchorKey, fn: () => void) {
  if (!pulseListeners.has(key)) pulseListeners.set(key, new Set());
  pulseListeners.get(key)!.add(fn);
  return () => {
    pulseListeners.get(key)?.delete(fn);
  };
}
