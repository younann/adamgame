import type { SceneId } from '@/state/gameStore';

/**
 * Pure layout + movement rules for Adam's walkable 3D island (no three.js here, so it is
 * unit-testable). World units ≈ metres; the plaza (Adam's base) is at the origin, the
 * camera looks towards −Z, so "up the screen" is −Z.
 */

export type LocId = 'football' | 'hero' | 'racing' | 'treasure' | 'closet' | 'stickers';

export interface XZ {
  x: number;
  z: number;
}

export interface LocDef {
  id: LocId;
  scene: SceneId;
  nameAr: string;
  nameEn: string;
  /** landmark centre */
  at: XZ;
  /** solid footprint radius (Adam can't walk into the building) */
  body: number;
  /** label / beacon height above the ground */
  height: number;
}

export const LOCS: LocDef[] = [
  { id: 'football', scene: 'football', nameAr: 'الملعب', nameEn: 'Goal Stadium', at: { x: -13, z: -11 }, body: 4.4, height: 4.2 },
  { id: 'hero', scene: 'hero', nameAr: 'مدينة الأبطال', nameEn: 'Hero City', at: { x: 13, z: -12 }, body: 3.9, height: 7.6 },
  { id: 'stickers', scene: 'stickers', nameAr: 'كتاب الملصقات', nameEn: 'Sticker Book', at: { x: 0, z: -18 }, body: 2.4, height: 4.2 },
  { id: 'racing', scene: 'racing', nameAr: 'السباق', nameEn: 'Turbo Racing', at: { x: -15, z: 6 }, body: 4.7, height: 3.4 },
  { id: 'closet', scene: 'closet', nameAr: 'خزانة البطل', nameEn: 'Hero Closet', at: { x: 7, z: 12 }, body: 3.1, height: 5.6 },
  { id: 'treasure', scene: 'treasure', nameAr: 'جزيرة الكنز', nameEn: 'Treasure Island', at: { x: 28.5, z: 7.5 }, body: 1.6, height: 4.2 },
];

/** The treasure islet just off the east shore (walkable sand, joined to the main island). */
export const ISLET = { x: 28.5, z: 7.5, r: 6.8 };
export const PLAZA_R = 3.2;
export const ADAM_R = 0.35;
/** how far inside the shoreline Adam must stay */
const SHORE_MARGIN = 1.2;
/** gate (portal) trigger radius */
export const GATE_R = 0.95;
/** Adam must move this far from a gate before it can trigger again */
export const GATE_REARM = 2.4;
export const GIFT_AT: XZ = { x: 3.4, z: 2.2 };

/** Main island shoreline radius at angle θ (atan2(z, x)) — an organic blob, not a circle. */
export function islandRadius(theta: number) {
  return 25 + 2.2 * Math.sin(3 * theta + 0.5) + 1.4 * Math.sin(5 * theta + 2);
}

export function isWalkable(p: XZ): boolean {
  const d = Math.hypot(p.x, p.z);
  if (d < islandRadius(Math.atan2(p.z, p.x)) - SHORE_MARGIN) return true;
  return Math.hypot(p.x - ISLET.x, p.z - ISLET.z) < ISLET.r - SHORE_MARGIN;
}

/** Gate position: in front of the landmark, on the side facing the plaza. */
export function gateOf(l: LocDef): XZ & { yaw: number } {
  const d = Math.hypot(l.at.x, l.at.z) || 1;
  const nx = -l.at.x / d;
  const nz = -l.at.z / d;
  const off = l.body + 1.5;
  // yaw: the direction from the landmark towards the plaza (gate faces the plaza)
  return { x: l.at.x + nx * off, z: l.at.z + nz * off, yaw: Math.atan2(nx, nz) };
}

/** Curvy path from the plaza edge to a gate (quadratic bezier control points). */
export function pathOf(l: LocDef): [XZ, XZ, XZ] {
  const g = gateOf(l);
  const d = Math.hypot(g.x, g.z) || 1;
  const start = { x: (g.x / d) * PLAZA_R, z: (g.z / d) * PLAZA_R };
  const mid = { x: (start.x + g.x) / 2, z: (start.z + g.z) / 2 };
  // gentle bend, alternating side per location so paths don't look ruler-straight
  const bend = (LOCS.indexOf(l) % 2 ? 1 : -1) * Math.min(2.2, d * 0.12);
  const ctrl = { x: mid.x + (-g.z / d) * bend, z: mid.z + (g.x / d) * bend };
  return [start, ctrl, { x: g.x, z: g.z }];
}

export function bezier(p: [XZ, XZ, XZ], t: number): XZ {
  const u = 1 - t;
  return { x: u * u * p[0].x + 2 * u * t * p[1].x + t * t * p[2].x, z: u * u * p[0].z + 2 * u * t * p[1].z + t * t * p[2].z };
}

export function distToPath(p: XZ, path: [XZ, XZ, XZ]) {
  let best = Infinity;
  for (let i = 0; i <= 24; i++) {
    const q = bezier(path, i / 24);
    best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
  }
  return best;
}

export interface Obstacle extends XZ {
  r: number;
}

/** Small deterministic PRNG so scenery (and its colliders) is identical every visit. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Tree extends XZ {
  r: number;
  scale: number;
  kind: 'round' | 'bush' | 'pine';
}

/** Is this spot free of the plaza, landmarks, gates, paths and the gift? */
export function isClear(p: XZ, margin: number) {
  if (Math.hypot(p.x, p.z) < PLAZA_R + 2.5 + margin) return false;
  if (Math.hypot(p.x - GIFT_AT.x, p.z - GIFT_AT.z) < 2 + margin) return false;
  for (const l of LOCS) {
    if (Math.hypot(p.x - l.at.x, p.z - l.at.z) < l.body + 1.2 + margin) return false;
    const g = gateOf(l);
    if (Math.hypot(p.x - g.x, p.z - g.z) < 2.6 + margin) return false;
    if (distToPath(p, pathOf(l)) < 1.8 + margin) return false;
  }
  return true;
}

/** Scenery trees: a ring of woods near the shore plus a few clumps inland. */
export function makeTrees(count: number, seed = 7): Tree[] {
  const r = rng(seed);
  const out: Tree[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const th = r() * Math.PI * 2;
    const k = out.length < count * 0.7 ? 0.72 + r() * 0.22 : 0.3 + r() * 0.45;
    const d = islandRadius(th) * k;
    const p = { x: Math.cos(th) * d, z: Math.sin(th) * d };
    const kind: Tree['kind'] = r() < 0.22 ? 'bush' : r() < 0.3 ? 'pine' : 'round';
    const scale = kind === 'bush' ? 0.6 + r() * 0.3 : 0.8 + r() * 0.55;
    const rad = (kind === 'bush' ? 0.7 : 0.45) * scale;
    if (!isWalkable(p) || !isClear(p, rad)) continue;
    if (out.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < t.r + rad + 1.1)) continue;
    out.push({ ...p, r: rad, scale, kind });
  }
  return out;
}

/** All solid things Adam bumps into. */
export function obstacles(trees: Tree[]): Obstacle[] {
  return [...LOCS.map((l) => ({ x: l.at.x, z: l.at.z, r: l.body })), ...trees.map((t) => ({ x: t.x, z: t.z, r: t.r }))];
}

/**
 * Move from `from` towards `to`, sliding around obstacles and staying on land.
 * Returns the resolved position.
 */
export function moveWithin(from: XZ, to: XZ, obs: Obstacle[]): XZ {
  const p = { x: to.x, z: to.z };
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obs) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + ADAM_R;
      if (d < min) {
        const k = d > 1e-6 ? 1 / d : 0;
        p.x = o.x + (k ? dx * k : 1) * min;
        p.z = o.z + (k ? dz * k : 0) * min;
      }
    }
  }
  if (isWalkable(p)) return p;
  // slide along the shore: try each axis on its own
  if (isWalkable({ x: p.x, z: from.z })) return { x: p.x, z: from.z };
  if (isWalkable({ x: from.x, z: p.z })) return { x: from.x, z: p.z };
  return { x: from.x, z: from.z };
}

/** The adventure the beacon points at: first unlocked world not yet completed. */
export function recommended(unlocked: string[], done: Record<string, number>): LocId {
  const order: LocId[] = ['football', 'hero', 'racing', 'treasure'];
  return order.find((id) => unlocked.includes(id) && !(done[id] > 0)) ?? 'football';
}
