# Adam's Learning Adventure — Design Tokens (Phase 0 extraction)

Extracted from the approved Hero City, Turbo Racing and Goal Stadium mockups.
Source of truth in code: `src/design-system/tokens.ts` (game/Pixi) and `src/app/globals.css` (DOM `@theme`).

## Color
| Token | Hex | Use |
|---|---|---|
| surface-lowest | `#080e1d` | page/game background, deepest shadows |
| surface | `#0d1322` | base game surface |
| surface-container-low | `#151b2b` | HUD panels (bottom stop) |
| surface-container | `#191f2f` | HUD panels |
| surface-container-high | `#242a3a` | inactive chips |
| surface-container-highest | `#2f3445` | star counter pill, neutral answer tiles |
| primary | `#b3c5ff` | light electric blue text/strokes |
| primary-container | `#1e6bff` | **electric blue** — main action, glows |
| primary-deep | `#003fa5` | blue gradient bottom |
| on-primary | `#002b75` | blue button depth shadow |
| primary-deepest | `#001849` | deepest blue shadow |
| secondary-container | `#feb700` | **gold** — stars, rewards, highlighted answer |
| secondary-fixed | `#ffdea8` | gold text |
| secondary-fixed-dim | `#ffba20` | gold mid |
| on-secondary-container | `#6b4b00` | gold button depth shadow |
| tertiary | `#4edea3` | **mint energy** — success, power, charge |
| tertiary-fixed | `#6ffbbe` | mint highlight |
| tertiary-container | `#00875d` | mint gradient bottom |
| on-tertiary | `#003824` | mint depth shadow |
| error | `#ffb4ab` | soft red (never used to punish) |
| error-container | `#93000a` | red portal depth |
| on-surface | `#dde2f8` | body text |
| on-surface-variant | `#c2c6d8` | secondary text |
| outline-variant | `#424655` | neutral strokes |

## Typography
- **Rubik** 700/800/900 — headlines, labels, numbers, HUD (Arabic + Latin).
- **Nunito Sans** 700/800/900 — body copy (Parent Zone).
- Scale: headline-xl 48/56 900 · headline-xl-mobile 36/44 900 · headline-lg 36/44 800 · headline-lg-mobile 28/36 800 · headline-md 24/32 800 · title-lg 22/28 700 · label-lg 18/24 800 · label-md 14/20 800 · body-lg 20/28 700 · body-md 16/24 700.
- In-game text uses heavy weight with dark stroke + drop shadow (`drop-shadow 0 2px 4px rgba(0,0,0,.8)`).

## Shape
- Radius: default 16px, lg 32px, xl 48px, full pill. Game tiles use 16–24px.
- **Tactile depth** ("chunky arcade button"): solid bottom shadow `0 8px 0 0 <darker shade>`, top gloss (white 35% → 0 over top half), 2–3px white/light border. Pressed: translateY(6–8px), shadow collapses to 2px. Release: overshoot bounce `cubic-bezier(0.34,1.56,0.64,1)`.

## Light & glow
- Blue glow: `0 0 20–35px rgba(30,107,255,.7–.8)`.
- Gold glow: `0 0 12–25px rgba(254,183,0,.6–.8)`.
- Mint glow: `0 0 10–30px rgba(78,222,163,.7–.9)`.
- Electric pulse: 2s ease-in-out alternating blue → mint glow.
- Vignette: top/bottom fade to `#080e1d` at 90–95%, radial blue haze from top.

## HUD patterns
- Adam portrait: circular, 3px conic-like ring gold → blue → mint, white inner border, level pin bottom corner (gold, white border).
- Star counter: dark pill, 2px gold border, filled gold star with gold glow, heavy gold number.
- Power meter: black 70% track, inner gradient mint → blue → gold, mint glow, shimmer pulse.
- Sound button: round blue gradient, 4px deep-blue depth, ping ring.
- Scoreboard: team chips (blue for Adam, neutral for rivals), center clock with red live dot.

## Motion cues
- Idle bob 3s ±4px; floating sparkle 2.2s; reticle rotate 10s linear; neon pulse 1.4s alternate.
- Wrong answer: gentle wiggle ±12px → ±6px → 0 over 210ms (never red X).
- Spark burst: 18 particles, 0.85s, `cubic-bezier(0.1,0.9,0.2,1)`, colors mint/blue/gold.
- All camera shake / large zooms are disabled or reduced under reduced-motion.

## World atmosphere
- Hero City: twilight rooftop skyline, neon towers, energy grapple lines, blue/gold energy rings.
- Turbo Racing: neon circuit, speed arrows, grandstands, star tokens on track, turbo flames.
- Goal Stadium: night stadium, floodlights, stars, golden goal frame, mint pitch.

## Experience-architecture changes vs. mockups (intentional)
- Mockup bottom nav bars → world-map locations + small pause/world button.
- Mockup victory modals → in-scene celebration sequences (camera, particles, stars fly to HUD).
- Mockup answer cards/doors → Pixi world objects (number boards, portals, tunnels, chests).
- Mockup speech panels → Sparky character + spoken audio with a small caption.
