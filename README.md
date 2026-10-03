# Adam's Learning Adventure — مغامرة آدم

A private, installable (PWA) educational **game** for Adam (4). Arabic-native, learning English
and Math through football, racing, superhero and treasure adventures — where every correct
answer *physically powers gameplay* (Adam shoots, the car fires its nitro, the portal opens,
the chest bursts open).

## Run

```bash
npm install
npm run dev          # http://localhost:3000 (dev: debug overlay 🐞 bottom-left)
npm test             # unit tests (mastery, adaptive queue, challenges, rewards, save, session)
npm run typecheck
npm run build        # static export to out/ + service worker (scripts/build-sw.mjs)
npm start            # serve out/ locally (production behaviour, SW enabled)
npm run icons        # regenerate PWA icons from the SVG in scripts/generate-icons.mjs
```

## Deploy (Netlify)

`netlify.toml` is production-ready:

- build command `npm run build`, publish directory `out` (Next.js static export — no server runtime or adapter needed)
- `sw.js` / manifest are served `no-cache` so updates are detected; `/_next/static/*` immutable
- unknown paths fall back to the game shell (Adam never sees a 404)
- Node 22

Environment variables (all optional):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_VERSION` | Overrides the version shown in the Parent Zone (default: `package.json` version + build timestamp) |

After deploying, open the site on the iPad/iPhone → **Parent Zone** (hold the ⚙ on the world map
for 2 s, then the parent gate) → *Install* for instructions (iOS: Share → Add to Home Screen).

## Architecture

```
src/
  app/                 Next.js App Router: / (game shell), /parent (Parent Zone)
  ui/                  Thin React/DOM layer over the canvas: HUD, captions, pause, a11y, debug
  game/
    engine/            GameEngine (Pixi app, lifecycle), SceneManager (lazy chunks), Scene base,
                       Camera, Tween, Transitions (themed), Textures (baked procedural art), hudBridge
    scenes/            Boot, World (hub map), Football (vertical slice), HeroCity, Racing,
                       Treasure, Closet, Rest
    entities/          Kid rig (procedural character), Adam (avatar layers + photo face), Sparky, Trophy
    effects/           ParticleSystem, UnlockReveal
    systems/           ChallengeRunner (hints/scaffolding/mastery recording), RewardEngine, SessionTimer
    draw/              paint helpers (gradients, chunky 3D tiles), conceptArt (colours/numbers/shapes/vocab)
  learning/            Presentation-independent learning core
    curriculum/        ~50 English concepts + Math skills
    engine/            ChallengeGenerator (LearningChallenge), validation, rng
    mastery/           MasteryEngine (states, Arabic→English stages A/B/C)
    adaptive/          AdaptiveQueue (weighted picks, gating, spaced reuse, review mode)
    adapters/          World adapters: same challenge → portals / tunnels / balls / chests
  audio/               AudioManager (Web Audio buses), procedural music per world, SFX, SpeechManager
  storage/             IndexedDB SaveRepository (+ localStorage fallback), schema + migrations
  state/               Zustand store (save data + runtime UI state)
  pwa/                 SW registration / child-safe update policy, install hook
  parent/              Parent Zone (gate, progress, settings, session, avatar photo, data, install)
  avatar/              Avatar items catalogue (earned, never bought)
docs/DESIGN_TOKENS.md  Phase 0 design extraction
```

**Two render layers.** PixiJS renders the game world (everything Adam plays with). React renders
only a minimal HUD, captions, pause and the Parent Zone. Scene changes are camera moves and themed
transitions inside one page — never web navigation.

**Learning ↔ world separation.** `generateChallenge(skillId, {stage})` produces a
`LearningChallenge` with no presentation. Each world implements `ChallengePresenter`
(present / wrongFeedback / countTogether / pulseAnswer / succeed) and the shared
`ChallengeRunner` handles prompts, idle hints, Arabic help timing and mastery recording.

**Art & audio are original and procedural** (Pixi vector drawing, Web Audio synthesis, browser TTS),
so there are no third-party IP assets and everything works offline. `VoiceLine.audio` and
`public/game/**`, `public/audio/**` are ready for recorded voice and painted sprites later.

## Offline

`scripts/build-sw.mjs` precaches every file of the static export (app shell, all scene chunks,
fonts, icons). After the first load the whole game works without internet; saves are local
(IndexedDB). Updates install in the background and activate only when the app is backgrounded
or on the title screen, so a new version never interrupts a mission.

## Debug (development only)

The 🐞 overlay (not present in production builds) can skip/fail challenges, give stars/trophies,
unlock worlds, set mastery, mute, end the session and jump between scenes. `window.__adam`
exposes the engine in dev.
