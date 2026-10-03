'use client';

import { flushSave, useGame } from '@/state/gameStore';

/**
 * Service worker registration + child-safe update policy (PWAUpdateManager).
 * A new version never interrupts Adam mid-mission: a waiting worker is activated when the
 * app goes to the background, or immediately if he is on the title screen. Parents can
 * also apply updates from the Parent Zone.
 */
let registered = false;

export function registerServiceWorker() {
  if (registered || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  registered = true;
  if (process.env.NODE_ENV !== 'production') {
    // a worker left over from testing a production build on this origin would keep serving
    // the old precached app over the dev server — remove it (saves in IndexedDB are untouched)
    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map((r) => r.unregister()));
      for (const k of await caches.keys()) await caches.delete(k);
      if (navigator.serviceWorker.controller) window.location.reload();
    }).catch(() => {});
    return;
  }
  window.addEventListener('load', () => void doRegister(), { once: true });
  if (document.readyState === 'complete') void doRegister();
}

async function doRegister() {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const activateWhenSafe = () => {
      const waiting = reg.waiting;
      if (!waiting || !navigator.serviceWorker.controller) return;
      const scene = useGame.getState().scene;
      if (scene === 'boot' || document.visibilityState === 'hidden') {
        flushSave();
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => nw.state === 'installed' && activateWhenSafe());
    });
    document.addEventListener('visibilitychange', activateWhenSafe);
    activateWhenSafe();
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      // only reload when it can't disrupt play
      const reload = () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      };
      if (document.visibilityState === 'hidden' || useGame.getState().scene === 'boot') reload();
      else document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && reload(), { once: true });
    });
    // check for updates periodically while open (cheap: sw.js is no-cache)
    setInterval(() => void reg.update().catch(() => {}), 30 * 60 * 1000);
  } catch {
    /* offline first-load or unsupported — the game still runs */
  }
}
