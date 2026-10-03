/**
 * Pure lane / steering rules for the 3D race (no three.js — unit-tested).
 * The road runs along −Z; x is across the road (metres).
 */

/** half-width Adam's kart may steer to (road is 11 m wide) */
export const STEER_MAX = 3.9;
/** metres per second of sideways steering at full joystick */
export const STEER_SPEED = 7;
/** km/h shown on the HUD per m/s of kart speed (cartoon-fast) */
export const KMH = 6.2;
/** how long Adam must hold his kart in a gate's lane to drive into it */
export const LOCK_TIME = 1.0;

/** Lane centre x for gate `i` of `n` (2 → wide apart, 3 → left / middle / right). */
export function laneX(i: number, n: number): number {
  if (n <= 1) return 0;
  const spread = n === 2 ? 2.2 : 3.0;
  return -spread + ((2 * spread) / (n - 1)) * i;
}

/** Index of the gate whose lane contains x, or −1 if the kart is between lanes. */
export function laneAt(x: number, n: number): number {
  const half = n === 2 ? 1.6 : 1.15;
  for (let i = 0; i < n; i++) if (Math.abs(x - laneX(i, n)) <= half) return i;
  return -1;
}

/** One steering step: joystick (−1..1) or a tap target pulls the kart sideways, clamped to the road. */
export function steerStep(x: number, input: number, target: number | null, dt: number): number {
  let v = input * STEER_SPEED;
  if (Math.abs(input) < 0.08 && target !== null) {
    const d = target - x;
    v = Math.abs(d) < 0.05 ? 0 : Math.sign(d) * Math.min(STEER_SPEED, Math.abs(d) * 6);
  }
  return Math.max(-STEER_MAX, Math.min(STEER_MAX, x + v * dt));
}

/**
 * Lock-on: holding the kart in a gate's lane fills a meter; full → that gate is chosen.
 * Adam must have steered since the gates appeared (or since a wrong pick), so a kart that
 * simply starts in the middle lane never answers by accident.
 */
export class LaneLock {
  lane = -1;
  progress = 0;
  armed = false;

  reset() {
    this.lane = -1;
    this.progress = 0;
    this.armed = false;
  }

  /** returns the chosen lane index when the meter fills, else −1 */
  update(x: number, n: number, steered: boolean, dt: number): number {
    if (steered) this.armed = true;
    const l = laneAt(x, n);
    if (l !== this.lane) {
      this.lane = l;
      this.progress = 0;
    }
    if (!this.armed || l < 0) {
      this.progress = Math.max(0, this.progress - dt * 2);
      return -1;
    }
    this.progress += dt / LOCK_TIME;
    if (this.progress >= 1) {
      this.progress = 0;
      this.armed = false;
      return l;
    }
    return -1;
  }
}
