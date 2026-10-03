import { Container, FillGradient, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { color, font } from '@/design-system/tokens';

/**
 * Gradients are cached by their stops. Each FillGradient owns a GPU texture that Pixi never
 * frees on its own, and these helpers are called from per-frame redraws (capes, nets, meters),
 * so creating a fresh one per call leaked thousands of textures per session. Local-space
 * gradients are shape-independent, so one instance per distinct definition is safe to share.
 */
const gradCache = new Map<string, FillGradient>();
const GRAD_CACHE_MAX = 600;

function cachedGradient(key: string, make: () => FillGradient): FillGradient {
  let g = gradCache.get(key);
  if (g) {
    // refresh LRU position
    gradCache.delete(key);
    gradCache.set(key, g);
    return g;
  }
  g = make();
  gradCache.set(key, g);
  if (gradCache.size > GRAD_CACHE_MAX) {
    const oldest = gradCache.keys().next().value as string;
    gradCache.get(oldest)?.destroy();
    gradCache.delete(oldest);
  }
  return g;
}

const stopsKey = (stops: [number, number, number?][]) => stops.map(([o, c, a]) => `${o}:${c}:${a ?? 1}`).join('|');

/** Vertical gradient in local (0..1) space. stops: [offset, color, alpha?] */
export function vGrad(stops: [number, number, number?][]): FillGradient {
  return cachedGradient(`v|${stopsKey(stops)}`, () =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: stops.map(([offset, c, a]) => ({ offset, color: rgba(c, a ?? 1) })),
      textureSpace: 'local',
    }),
  );
}

export function hGrad(stops: [number, number, number?][]): FillGradient {
  return cachedGradient(`h|${stopsKey(stops)}`, () =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: stops.map(([offset, c, a]) => ({ offset, color: rgba(c, a ?? 1) })),
      textureSpace: 'local',
    }),
  );
}

export function rGrad(stops: [number, number, number?][], cx = 0.5, cy = 0.5): FillGradient {
  return cachedGradient(`r|${cx}|${cy}|${stopsKey(stops)}`, () =>
    new FillGradient({
      type: 'radial',
      center: { x: cx, y: cy },
      innerRadius: 0,
      outerCenter: { x: cx, y: cy },
      outerRadius: 0.5,
      colorStops: stops.map(([offset, c, a]) => ({ offset, color: rgba(c, a ?? 1) })),
      textureSpace: 'local',
    }),
  );
}

export function rgba(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

export function shade(c: number, k: number): number {
  // k < 0 darken, k > 0 lighten
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export interface ChunkyOpts {
  w: number;
  h: number;
  radius?: number;
  top: number;
  bottom: number;
  depth: number; // dark depth/shadow colour
  depthPx?: number;
  border?: number;
  borderWidth?: number;
  gloss?: boolean;
}

/**
 * The design system's chunky 3D arcade tile: solid depth slab, gradient face, white rim,
 * gloss on the upper half. Origin is at the face centre.
 */
export function drawChunky(g: Graphics, o: ChunkyOpts, pressed = 0) {
  const r = o.radius ?? Math.min(o.w, o.h) * 0.22;
  const d = (o.depthPx ?? Math.max(6, o.h * 0.09)) * (1 - pressed * 0.75);
  const x = -o.w / 2;
  const y = -o.h / 2 + (o.depthPx ?? Math.max(6, o.h * 0.09)) * pressed * 0.75;
  g.clear();
  // soft drop shadow
  g.roundRect(x + 2, y + d + 6, o.w - 4, o.h, r).fill({ color: 0x000000, alpha: 0.35 });
  // depth slab
  g.roundRect(x, y + d, o.w, o.h, r).fill(o.depth);
  // face
  g.roundRect(x, y, o.w, o.h, r).fill(vGrad([[0, o.top], [1, o.bottom]]));
  if (o.gloss !== false) {
    g.roundRect(x + o.w * 0.06, y + o.h * 0.05, o.w * 0.88, o.h * 0.42, r * 0.8).fill({ color: 0xffffff, alpha: 0.22 });
  }
  g.roundRect(x, y, o.w, o.h, r).stroke({ width: o.borderWidth ?? 3, color: o.border ?? 0xffffff, alpha: 0.85 });
}

export function gameText(text: string, size: number, opts: Partial<TextStyleOptions> & { fillColor?: number; strokeColor?: number } = {}) {
  const { fillColor, strokeColor, ...rest } = opts;
  const t = new Text({
    text,
    style: {
      fontFamily: font.display,
      fontSize: size,
      fontWeight: '900',
      fill: fillColor ?? color.white,
      stroke: { color: strokeColor ?? color.surfaceLowest, width: Math.max(2, size * 0.14), join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.55, blur: 4, distance: Math.max(2, size * 0.06), angle: Math.PI / 2 },
      align: 'center',
      ...rest,
    },
    resolution: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1),
  });
  t.anchor.set(0.5);
  return t;
}

/** 5-pointed star polygon points. */
export function starPoints(r: number, inner = 0.48, points = 5, rot = -Math.PI / 2): number[] {
  const out: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / points;
    out.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return out;
}

/** Glossy gold star (rewards / HUD-like). */
export function drawGoldStar(g: Graphics, r: number) {
  g.poly(starPoints(r * 1.08, 0.5)).fill(color.goldShadow);
  g.poly(starPoints(r, 0.5)).fill(vGrad([[0, 0xfff0b3], [0.5, color.gold], [1, color.amber]]));
  g.poly(starPoints(r, 0.5)).stroke({ width: Math.max(1.5, r * 0.08), color: 0xffffff, alpha: 0.9 });
  g.ellipse(-r * 0.18, -r * 0.3, r * 0.22, r * 0.12).fill({ color: 0xffffff, alpha: 0.6 });
}

export function container(...children: Container[]) {
  const c = new Container();
  if (children.length) c.addChild(...children);
  return c;
}
