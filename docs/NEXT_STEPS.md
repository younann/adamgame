# Next Steps — Adam's Learning Adventure

_Last updated: 2026-10-03. Read this first at the start of the next session._

## Where we are

- **Goal Stadium is a real playable 3D game** (`src/game/scenes/Football3D/`):
  procedural Pixar-toy Adam (`src/game/three/Hero3D.ts`), joystick / tap-to-run + kick button
  (`src/game/three/Controls.ts`), Rapier physics ball (`src/game/three/physics.ts`, `Ball3D.ts`),
  goalkeeper AI (`Keeper3D.ts`), learning challenges as glowing rings + collectable counting stars
  (`Rings3D.ts`) → correct ring charges a SUPER SHOT that always scores.
- **Walkable 3D world map** (`src/game/scenes/World3D/`): sunny island Adam runs around with the
  joystick / tap-to-run; six 3D landmarks (stadium, Hero City, race track, treasure islet, closet
  house, sticker book) each with a glowing portal arch — walk through it to travel. Locked places sit
  in mist behind a padlock (Sparky hints). Sparky names a place as Adam approaches. Daily gift box in
  3D (walk into / tap). Returning from a world, Adam steps out of that place's portal. Trees near the
  camera get a dithered see-through hole so they never hide Adam. Pure layout/collision rules in
  `layout.ts` (unit-tested: every gate reachable from the plaza).
- **Turbo Racing in 3D** (`src/game/scenes/Racing3D/`): Adam in a toy kart on a scrolling road
  (sunset, trees, stands, speed lines); drag left/right to steer; answers are drive-through gates per
  lane (hold the lane ~1 s to pick); correct → NITRO; 3 laps → finish arch + trophy. Lane rules in
  `lanes.ts` (unit-tested).
- **Hero City in 3D** (`src/game/scenes/HeroCity3D/`): neon night city; Adam flies (superhero pose
  via `act` offsets, always caped); answers are sky portals he flies through; correct frees a trapped
  friend in a bubble who then follows him. Flight rules in `flight.ts` (unit-tested).
- `Hero3D` cape is now a shaped cape (narrow shoulders, flared hem, wrapped round the back).
- Treasure, Closet, Stickers, Rest are still the **2D Pixi** versions. Every 3D world keeps its 2D
  version as fallback (Parent Zone → Graphics: Classic, or no WebGL2).
- Shared 3D foundation: `ThreeStage` (bloom, AgX/ACES tone mapping, SMAA, vignette), `Scene3D`
  (camera rig, tap raycast, `groundAt`, studio environment lighting, leak-free teardown).
- Dev-only character lab: `http://localhost:3000/lab/?pose=idle|run|cheer&view=close&cape=1`.
- Dev mode now unregisters any leftover service worker (an old production SW on localhost:3000
  kept serving the pre-3D app). If a tab still shows old code: Cmd+Shift+R once.
- **Nothing is committed yet.** Commit as `younann <younan.nwesre@taboola.com>`, no AI mentions.

## User decisions (keep honouring)

- Target: **real 3D game feel**, smooth **Pixar-like cartoon** style (not realistic, not blocky).
- **Free assets only** (CC0 / self-made). No paid packs, no AI-generated models.
- Kenney Mini Characters (blocky) were rejected as "cheap" → characters are procedural `Hero3D`.
- Adam must really *play*: direct control, physics, action — not answer-then-cutscene.
- Roll out world by world, showing a prototype before converting everything.

## Next session — priority order

1. **Get Adam's feedback on the iPad** (real fingers on the joystick + kick button) — stadium
   AND the new 3D island. Tune: run speed (`SPEED` in World3D / Football3D), joystick size, kick
   reach, keeper difficulty, camera distance (`chase()` in World3D). Is the island too big/small?
   Does he find the portals? Check iPad fps and the 3D/Classic fallback.
2. ~~Walkable 3D world map~~ — done 2026-10-03 (prototype; polish after Adam's feedback:
   maybe a jump button, footstep sounds, ambient sea/birds audio, a boat to the treasure islet).
3. ~~Turbo Racing in 3D~~ — done 2026-10-03 (check on iPad: lane-hold time, kart seat pose, speed feel).
4. ~~Hero City in 3D~~ — done 2026-10-03 (check on iPad: flight pose, friend size on screen, fps with ~200 towers).
5. **Treasure Island in 3D**: explore the beach/cave; run to the right chest; dig with taps.
6. **Hero Closet in 3D**: Adam on a turntable, items applied to `Hero3D` (cape, helmet, mask,
   boots, gloves, trails) — needs `Hero3D` accessory support + shaped cape mesh.
7. **Polish backlog**
   - Football: bring back free kick / dribble / passing / keeper modes as 3D gameplay.
   - Super-shot currently "magnets" the ball to Adam — consider a nicer pass from Sparky.
   - Cape is a flat plane → shaped, flowing cape.
   - Unlock / sticker reveal is still 2D → 3D reveal (Adam turntable with the new item).
   - Photo face for `Hero3D` (parent photo as face decal) like the 2D avatar.
   - Real-device checks: silent switch voice, mic recording in Safari, PWA install.
8. **Ideas from a father** (`docs/IDEAS_FROM_A_FATHER.md`) — top 3: real family photos in
   vocabulary, home "Hero Missions", Adam's own voice record & replay.
9. **Deploy** to Netlify when the user approves (`npm run build`, publish `out/`).

## How to run / verify

```bash
npm run dev                      # http://localhost:3000 (LAN: http://<mac-ip>:3000)
npm test && npm run typecheck && npm run lint
npm run build                    # static export + service worker (offline)
npm run voice                    # regenerate voice clips for new lines (needs edge-tts; see scripts/voice/README.md)
# full play-through QA (Playwright + cached Chromium):
CHROMIUM_PATH=<chrome-for-testing binary> PLAYWRIGHT_DIR=<dir with node_modules/playwright> \
  node scripts/e2e/play-all.mjs [--only football] [--offline]
```

QA tips learned this session:
- Close extra browser tabs/contexts — many WebGL contexts make screenshots blank/miscoloured.
- Tap the title screen only after its fade-in (taps during transitions are ignored by design).
- Check GPU memory across repeated visits (`renderer.info.memory`) for every new 3D scene;
  dispose shadows, post effects and skeletons (already handled in `ThreeStage` / `Scene3D`).
- New spoken lines → run `npm run voice` so they get natural voice clips.
