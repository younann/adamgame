import { describe, expect, it } from 'vitest';
import { BOUNDS, FRIEND_AT, PORTAL_R, START, clampToBounds, flewThrough, portalSpots } from './flight';

describe('hero city flight', () => {
  it('spreads portals inside the flight lane, between Adam and the trapped friend', () => {
    for (const portrait of [true, false]) {
      for (const n of [2, 3]) {
        const spots = portalSpots(n, portrait);
        expect(spots).toHaveLength(n);
        for (const s of spots) {
          expect(s.x - PORTAL_R).toBeGreaterThan(BOUNDS.minX);
          expect(s.x + PORTAL_R).toBeLessThan(BOUNDS.maxX);
          expect(s.z).toBeLessThan(START.z);
          expect(s.z).toBeGreaterThan(BOUNDS.minZ);
        }
        // rings never overlap
        for (let i = 1; i < n; i++) expect(spots[i].x - spots[i - 1].x).toBeGreaterThan(PORTAL_R * 2);
      }
    }
    // the friend can't be reached by flying around the portals
    expect(FRIEND_AT.z).toBeLessThan(BOUNDS.minZ);
  });

  it('detects flying through a ring, not past it', () => {
    const p = { x: 2, z: -6 };
    expect(flewThrough({ x: 2, z: -5.8 }, { x: 2.1, z: -6.2 }, p)).toBe(true);
    expect(flewThrough({ x: 2, z: -6.2 }, { x: 2, z: -5.8 }, p)).toBe(true); // backwards counts too
    expect(flewThrough({ x: 4, z: -5.8 }, { x: 4, z: -6.2 }, p)).toBe(false); // round the side
    expect(flewThrough({ x: 2, z: -5 }, { x: 2, z: -5.5 }, p)).toBe(false); // not there yet
  });

  it('keeps Adam in the flight lane', () => {
    expect(clampToBounds({ x: 50, z: -50 })).toEqual({ x: BOUNDS.maxX, z: BOUNDS.minZ });
    expect(clampToBounds({ x: 1, z: 1 })).toEqual({ x: 1, z: 1 });
  });
});
