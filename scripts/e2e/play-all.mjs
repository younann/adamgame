/**
 * End-to-end play-through (QA). Plays every world to mission completion on the DEV server
 * (uses the dev-only window.__adam / __adamStore hooks), in phone portrait and tablet landscape
 * at Retina density, and fails on any page error. Optional --offline checks the production
 * build (out/) via a local static server with the network disabled.
 *
 *   node scripts/e2e/play-all.mjs [--url http://localhost:3000] [--only football,hero] [--offline]
 *
 * Playwright is resolved from PLAYWRIGHT_DIR (a folder containing node_modules/playwright) or
 * the normal module path; CHROMIUM_PATH can point at an installed Chromium binary.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const URL = arg('--url', 'http://localhost:3000');
const ONLY = arg('--only', '')?.split(',').filter(Boolean);
const OFFLINE = args.includes('--offline');
const OUT = '.playwright-mcp/e2e';
mkdirSync(OUT, { recursive: true });

const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const results = [];
const log = (...a) => console.log('[e2e]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, arg, timeout = 30000, label = 'condition') {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(fn, arg).catch(() => false);
    if (ok) return ok;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(250);
  }
}

const sceneId = (p) => p.evaluate(() => window.__adam?.scenes.current?.id ?? null);
const missions = (p, w) => p.evaluate((w) => window.__adamStore.getState().save.worlds.missionsCompleted[w] ?? 0, w);

/** Answer challenges (one wrong first) until the world's mission count increases. */
async function playMission(page, world, shot) {
  const before = await missions(page, world);
  let answered = 0;
  let wrongDone = false;
  const t0 = Date.now();
  while ((await missions(page, world)) <= before) {
    if (Date.now() - t0 > 240000) throw new Error(`${world}: mission did not complete`);
    const state = await page.evaluate(() => {
      const r = window.__adam.scenes.current?.runner;
      if (!r?.current) return null;
      return { id: r.current.answer.id, wrong: r.current.distractors[0]?.id, active: r.active, busy: r.busy, prompting: r.prompting };
    });
    // 3D football: a solved challenge arms a super-shot that the player kicks with the ball button
    const kicked = await page.evaluate(() => {
      const sc = window.__adam.scenes.current;
      if (sc?.superArmed && !sc.cutscene && !sc.kicking) {
        sc.requestKick();
        return true;
      }
      return false;
    });
    if (kicked) {
      await sleep(1500);
      continue;
    }
    if (state && state.active && !state.busy) {
      const pick = !wrongDone && state.wrong ? state.wrong : state.id;
      if (pick === state.wrong) wrongDone = true;
      else answered++;
      await page.evaluate((id) => window.__adam.scenes.current.runner.choose(id), pick);
      if (answered === 1 && pick !== state.wrong) await page.screenshot({ path: `${OUT}/${shot}-${world}-action.png` }).catch(() => {});
      await sleep(1500);
    } else {
      // no question active: press in-world action objects (e.g. the final treasure chest)
      const pressed = await page.evaluate(() => {
        const st = window.__adamStore.getState();
        const c = st.a11yChoices.find((x) => !/again|home|world|back/i.test(x.id));
        if (!window.__adam.scenes.current?.runner?.current && c && st.onA11yChoose) {
          st.onA11yChoose(c.id);
          return c.id;
        }
        return null;
      });
      await sleep(pressed ? 1500 : 400);
    }
  }
  return answered;
}

/** Tap the title screen once it's ready (taps during the fade-in are ignored by design). */
async function tapToStart(page, viewport) {
  await waitFor(page, () => window.__adam?.scenes?.current?.id === 'boot' && !window.__adam.scenes.isTransitioning, null, 90000, 'title screen');
  for (let i = 0; i < 4; i++) {
    await sleep(800);
    await page.mouse.click(viewport.width / 2, viewport.height * 0.84);
    try {
      await waitFor(page, () => window.__adam.scenes.current?.id === 'world', null, 20000, 'world');
      return;
    } catch {
      /* retry the tap */
    }
  }
  throw new Error('title tap never reached the world');
}

async function runViewport(browser, name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 300)}`));
  await page.goto(URL);
  await waitFor(page, () => !!window.__adam?.scenes?.current, null, 60000, 'engine');
  await tapToStart(page, viewport);
  const size = await page.evaluate(() => [window.__adam.width, window.__adam.height]);
  if (size[0] !== viewport.width || size[1] !== viewport.height) errors.push(`engine size ${size} != viewport`);
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/${name}-world.png` });
  // unlock everything for testing
  await page.evaluate(() => window.__adamStore.getState().updateSettings({ forcedWorlds: ['football', 'hero', 'racing', 'treasure', 'closet'] }));

  const worlds = ['football', 'hero', 'racing', 'treasure'].filter((w) => !ONLY.length || ONLY.includes(w));
  for (const w of worlds) {
    const t0 = Date.now();
    try {
      await page.evaluate((w) => window.__adam.scenes.goto(w, { data: { from: 'world' } }), w);
      await waitFor(page, (w) => window.__adam.scenes.current?.id === w && !window.__adam.scenes.isTransitioning, w, 60000, `${w} scene`);
      await sleep(1500);
      await page.screenshot({ path: `${OUT}/${name}-${w}-start.png` });
      const n = await playMission(page, w, name);
      await sleep(2000);
      await page.screenshot({ path: `${OUT}/${name}-${w}-end.png` });
      results.push({ vp: name, scene: w, ok: true, answered: n, secs: Math.round((Date.now() - t0) / 1000) });
      log(name, w, 'completed', n, 'answers');
    } catch (e) {
      await page.screenshot({ path: `${OUT}/${name}-${w}-FAIL.png` }).catch(() => {});
      results.push({ vp: name, scene: w, ok: false, error: String(e.message ?? e) });
      log(name, w, 'FAILED', e.message);
    }
  }
  for (const s of ['closet', 'stickers'].filter((x) => !ONLY.length || ONLY.includes(x))) {
    try {
      await page.evaluate((s) => window.__adam.scenes.goto(s, { data: { from: 'world' } }), s);
      await waitFor(page, (s) => window.__adam.scenes.current?.id === s && !window.__adam.scenes.isTransitioning, s, 60000, s);
      await sleep(2500);
      // interact through the accessible choice mirror
      const choices = await page.evaluate(() => window.__adamStore.getState().a11yChoices.map((c) => c.id));
      for (const id of choices.slice(0, 3)) {
        if (/home|world|back/i.test(id)) continue;
        await page.evaluate((id) => window.__adamStore.getState().onA11yChoose?.(id), id);
        await sleep(1200);
      }
      await page.screenshot({ path: `${OUT}/${name}-${s}.png` });
      results.push({ vp: name, scene: s, ok: true });
    } catch (e) {
      results.push({ vp: name, scene: s, ok: false, error: String(e.message ?? e) });
    }
  }
  // persistence: stars survive a reload
  try {
    const stars = await page.evaluate(() => window.__adamStore.getState().save.stars);
    await sleep(1200);
    await page.reload();
    await waitFor(page, () => window.__adamStore?.getState().loaded && window.__adam?.scenes?.current, null, 90000, 'reload');
    const stars2 = await page.evaluate(() => window.__adamStore.getState().save.stars);
    results.push({ vp: name, scene: 'persistence', ok: stars2 === stars && stars > 0, stars, stars2 });
  } catch (e) {
    results.push({ vp: name, scene: 'persistence', ok: false, error: e.message });
    results.push({ vp: name, scene: 'errors', ok: errors.length === 0, errors: errors.slice(0, 20) });
    await ctx.close();
    return;
  }
  // session end → rest scene
  await tapToStart(page, viewport);
  await page.evaluate(() => { window.__adam.session.expireNow(); window.__adam.endSession(); });
  await waitFor(page, () => window.__adam.scenes.current?.id === 'rest', null, 30000, 'rest').then(
    () => results.push({ vp: name, scene: 'rest', ok: true }),
    (e) => results.push({ vp: name, scene: 'rest', ok: false, error: e.message }),
  );
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/${name}-rest.png` });
  results.push({ vp: name, scene: 'errors', ok: errors.length === 0, errors: errors.slice(0, 20) });
  await ctx.close();
}

async function offlineCheck(browser) {
  const server = spawn('python3', ['-m', 'http.server', '4199'], { cwd: 'out', stdio: 'ignore' });
  await sleep(1200);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('http://localhost:4199/');
    await waitFor(page, () => navigator.serviceWorker?.controller != null, null, 30000, 'sw control').catch(() => {});
    await sleep(4000);
    const cache = await page.evaluate(async () => {
      let n = 0;
      for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
      return n;
    });
    await ctx.setOffline(true);
    await page.reload();
    await sleep(4000);
    const canvas = await page.evaluate(() => !!document.querySelector('canvas'));
    await page.mouse.click(196, 715);
    await sleep(15000);
    await page.screenshot({ path: `${OUT}/offline-world.png` });
    results.push({ vp: 'offline', scene: 'boot+world', ok: canvas && cache > 20 && errors.length === 0, cache, errors });
  } catch (e) {
    results.push({ vp: 'offline', scene: 'boot', ok: false, error: e.message });
  } finally {
    await ctx.close();
    server.kill();
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
try {
  if (OFFLINE) await offlineCheck(browser);
  else {
    await runViewport(browser, 'phone', { width: 393, height: 852 });
    await runViewport(browser, 'tablet', { width: 1180, height: 820 });
  }
} finally {
  await browser.close();
}
console.table(results.map((r) => ({ vp: r.vp, scene: r.scene, ok: r.ok, info: r.error ?? r.answered ?? r.errors?.join(' | ') ?? '' })));
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
