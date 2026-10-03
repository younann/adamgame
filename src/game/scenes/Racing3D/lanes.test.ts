import { describe, expect, it } from 'vitest';
import { LOCK_TIME, LaneLock, STEER_MAX, laneAt, laneX, steerStep } from './lanes';

describe('3D race lanes', () => {
  it('spreads gates across the road and finds the lane under the kart', () => {
    expect([0, 1, 2].map((i) => laneX(i, 3))).toEqual([-3, 0, 3]);
    expect([0, 1].map((i) => laneX(i, 2))).toEqual([-2.2, 2.2]);
    for (const n of [2, 3]) for (let i = 0; i < n; i++) expect(laneAt(laneX(i, n), n)).toBe(i);
    expect(laneAt(-1.5, 3)).toBe(-1); // between left and middle
    expect(laneX(0, 3)).toBeGreaterThanOrEqual(-STEER_MAX); // every lane is reachable
  });

  it('steers with the joystick or towards a tapped spot, never off the road', () => {
    expect(steerStep(0, 1, null, 10)).toBe(STEER_MAX);
    expect(steerStep(0, -1, null, 10)).toBe(-STEER_MAX);
    let x = 0;
    for (let i = 0; i < 120; i++) x = steerStep(x, 0, 3, 1 / 60);
    expect(x).toBeCloseTo(3, 1);
  });

  it('chooses a lane only after Adam steers and holds it', () => {
    const lock = new LaneLock();
    const dt = 1 / 60;
    let picked = -1;
    // sitting in the middle lane without steering never answers
    for (let i = 0; i < 300 && picked < 0; i++) picked = lock.update(0, 3, false, dt);
    expect(picked).toBe(-1);
    // steer once, then hold the right lane
    picked = lock.update(3, 3, true, dt);
    let t = dt;
    while (picked < 0 && t < 5) {
      picked = lock.update(3, 3, false, dt);
      t += dt;
    }
    expect(picked).toBe(2);
    expect(t).toBeGreaterThanOrEqual(LOCK_TIME - dt);
    // after a pick it must be re-armed by steering
    for (let i = 0; i < 300; i++) expect(lock.update(3, 3, false, dt)).toBe(-1);
  });
});
