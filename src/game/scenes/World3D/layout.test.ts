import { describe, expect, it } from 'vitest';
import {
  ADAM_R, GATE_R, GIFT_AT, LOCS, gateOf, isWalkable, makeTrees, moveWithin, obstacles, recommended, type XZ,
} from './layout';

/** Grid flood-fill from the plaza over walkable, obstacle-free cells. */
function reachable(trees = makeTrees(48)) {
  const obs = obstacles(trees);
  const step = 0.5;
  const key = (p: XZ) => `${Math.round(p.x / step)},${Math.round(p.z / step)}`;
  const free = (p: XZ) => isWalkable(p) && obs.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= o.r + ADAM_R);
  const seen = new Set<string>([key({ x: 0, z: 0 })]);
  const queue: XZ[] = [{ x: 0, z: 0 }];
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const q = { x: p.x + dx, z: p.z + dz };
      const k = key(q);
      if (seen.has(k) || !free(q)) continue;
      seen.add(k);
      queue.push(q);
    }
  }
  return (p: XZ) => seen.has(key(p));
}

describe('3D world layout', () => {
  it('has a walkable gate for every location, outside its building', () => {
    for (const l of LOCS) {
      const g = gateOf(l);
      expect(isWalkable(g), l.id).toBe(true);
      expect(Math.hypot(g.x - l.at.x, g.z - l.at.z)).toBeGreaterThan(l.body + ADAM_R + GATE_R);
    }
  });

  it('lets Adam walk from the plaza to every gate and to the gift', () => {
    const canReach = reachable();
    for (const l of LOCS) {
      const g = gateOf(l);
      // snap to the flood-fill grid
      expect(canReach({ x: Math.round(g.x * 2) / 2, z: Math.round(g.z * 2) / 2 }), l.id).toBe(true);
    }
    expect(canReach({ x: Math.round(GIFT_AT.x * 2) / 2, z: Math.round(GIFT_AT.z * 2) / 2 })).toBe(true);
  });

  it('places the same trees every time, none blocking the plaza', () => {
    const a = makeTrees(48);
    expect(a.length).toBeGreaterThan(30);
    expect(makeTrees(48)).toEqual(a);
    for (const t of a) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(5);
  });

  it('keeps Adam out of buildings and in from the sea', () => {
    const stadium = LOCS[0];
    const into = moveWithin({ x: stadium.at.x + 5, z: stadium.at.z }, { x: stadium.at.x + 1, z: stadium.at.z }, obstacles([]));
    expect(Math.hypot(into.x - stadium.at.x, into.z - stadium.at.z)).toBeGreaterThanOrEqual(stadium.body + ADAM_R - 1e-6);
    const sea = moveWithin({ x: 0, z: 20 }, { x: 0, z: 40 }, []);
    expect(isWalkable(sea)).toBe(true);
    // sliding: pushing diagonally into the south shore still moves sideways
    const slide = moveWithin({ x: 0, z: 20.5 }, { x: 0.5, z: 23 }, []);
    expect(slide.x).toBeCloseTo(0.5);
  });

  it('recommends the first unlocked world not yet played', () => {
    expect(recommended(['football'], {})).toBe('football');
    expect(recommended(['football', 'hero'], { football: 1 })).toBe('hero');
    expect(recommended(['football', 'hero', 'racing', 'treasure'], { football: 2, hero: 1, racing: 1, treasure: 1 })).toBe('football');
  });
});
