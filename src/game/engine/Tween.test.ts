import { describe, expect, it } from 'vitest';
import { Tweener } from './Tween';

describe('Tweener', () => {
  it('kill() resolves the killed tween so awaiting sequences never hang', async () => {
    const tw = new Tweener();
    const o = { x: 0 };
    let done = false;
    const p = tw.to(o, { x: 10 }, { duration: 1000 }).then(() => (done = true));
    tw.update(100);
    tw.kill(o);
    await p;
    expect(done).toBe(true);
    expect(o.x).toBeGreaterThan(0);
    expect(tw.isTweening(o)).toBe(false);
  });
  it('clear() abandons tweens without resolving (scene teardown)', async () => {
    const tw = new Tweener();
    let done = false;
    void tw.to({ x: 0 }, { x: 1 }, { duration: 100 }).then(() => (done = true));
    tw.clear();
    tw.update(200);
    await Promise.resolve();
    expect(done).toBe(false);
  });
  it('drops tweens on destroyed targets and keeps animating the rest', () => {
    const tw = new Tweener();
    const dead = { x: 0, destroyed: false };
    const live = { x: 0 };
    void tw.to(dead, { x: 1 }, { duration: 100 });
    void tw.to(live, { x: 1 }, { duration: 100 });
    dead.destroyed = true;
    tw.update(50);
    expect(dead.x).toBe(0);
    expect(live.x).toBeGreaterThan(0);
  });
  it('a throwing target does not stop other tweens', () => {
    const tw = new Tweener();
    const bad = { set x(_v: number) { throw new Error('destroyed'); }, get x() { return 0; } };
    const live = { x: 0 };
    void tw.to(bad, { x: 1 }, { duration: 100 });
    void tw.to(live, { x: 1 }, { duration: 100 });
    tw.update(50);
    tw.update(50);
    expect(live.x).toBe(1);
  });
});
