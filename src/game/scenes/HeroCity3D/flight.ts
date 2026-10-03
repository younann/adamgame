/**
 * Pure flight rules for Hero City 3D (no three.js — unit-testable).
 * Adam flies at a fixed altitude over the rooftops; the camera looks towards −Z.
 */

export const FLY_Y = 5.2;
/** where Adam waits between rescues */
export const START = { x: 0, z: 3 };
/** the plane of challenge portals */
export const PORTAL_Z = -6.5;
export const PORTAL_R = 1.35;
/** the trapped friend's hover pad, beyond the portals */
export const FRIEND_AT = { x: 0, y: FLY_Y + 0.4, z: -13 };
export const BOUNDS = { minX: -9.5, maxX: 9.5, minZ: -10, maxZ: 6.5 };

export interface P2 {
  x: number;
  z: number;
}

/** Portal centres (x) spread across the sky lane, middle one slightly further away. */
export function portalSpots(n: number, portrait: boolean): P2[] {
  const spread = portrait ? 3.1 : 3.9;
  return Array.from({ length: n }, (_, i) => ({
    x: (i - (n - 1) / 2) * spread,
    z: PORTAL_Z - (n === 3 && i === 1 ? 0.8 : 0),
  }));
}

export function clampToBounds(p: P2): P2 {
  return {
    x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, p.x)),
    z: Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, p.z)),
  };
}

/**
 * Did Adam fly through the portal ring this frame? He must cross its plane (either way) while
 * inside the ring's radius — flying round the side doesn't count.
 */
export function flewThrough(prev: P2, next: P2, portal: P2, r = PORTAL_R): boolean {
  const a = prev.z - portal.z;
  const b = next.z - portal.z;
  if (a === 0 && b === 0) return false;
  if (a * b > 0) return false;
  const t = a === b ? 0 : a / (a - b);
  const x = prev.x + (next.x - prev.x) * t;
  return Math.abs(x - portal.x) < r * 0.8;
}
