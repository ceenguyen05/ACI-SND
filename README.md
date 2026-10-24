# ACI: Search & Destroy

[![CI](https://github.com/ceenguyen05/ACI-SND/actions/workflows/ci.yml/badge.svg)](https://github.com/ceenguyen05/ACI-SND/actions/workflows/ci.yml)
[![Deploy](https://github.com/ceenguyen05/ACI-SND/actions/workflows/deploy.yml/badge.svg)](https://github.com/ceenguyen05/ACI-SND/actions/workflows/deploy.yml)

**▶ Play in the browser: https://ceenguyen05.github.io/ACI-SND/** (the latest `main`, deployed
automatically)

A tactical first-person shooter in the style of CS:GO / CS2, playing **Search & Destroy (bomb
defusal)** on one original map: **ACI HQ**. ACI HQ is a single-story building where the west
half is offices (meeting rooms, engineering cubicles, B-site bullpen) and the east half is
manufacturing (A-site assembly line, factory floor, warehouse, shipping docks).

It runs in the browser using TypeScript, Three.js and Vite. Models, animation and audio are
generated in code, with three locally bundled CC0 scanned surface sets for the buildings.
Version 1 is **offline, you vs. bots**, in teams of 1v1 up to 5v5.

| Topic | Document |
|---|---|
| Development plan | [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) |
| Game design (rules, weapons, economy, bots) | [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) |
| Map layout and callouts | [docs/MAP.md](docs/MAP.md) |
| Movement and visual overhaul | [docs/POLISH.md](docs/POLISH.md) |
| Art sources and licenses | [docs/ASSETS.md](docs/ASSETS.md) |
| CI, GitHub Pages deploys and rollback | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| How to contribute | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## Quick start

**Requirements:**
* **Node.js 20.19+ or 22.12+.** This machine has 22.20.0; CI uses Node 22 (`.nvmrc`).
* **npm.** This machine has 10.9.3.
* A WebGL2 browser: Chrome, Edge or Firefox.

No VS Code extensions are required.

```bash
npm install          # once
npm run dev          # starts http://localhost:5173 and opens the browser
```

Click the title screen, go to **Play → Start match**, then click the game window to capture
the mouse. Press **Esc** at any time to pause and release the mouse.

To build a production version to host anywhere:

```bash
npm run build        # outputs static files to dist/
npm run preview      # serves dist/ locally
```

You don't need to host it yourself: every push to `main` is checked and published to GitHub
Pages (see [Deployment](#deployment)).

## Controls (all rebindable in Settings → Controls)

| Action | Key | Action | Key |
|---|---|---|---|
| Move | W A S D | Fire | Left mouse |
| Jump | Space | Aim down sights / scope / knife stab | Right mouse |
| Crouch / hold to prone | C | **Tilt / lean left / right** | **Q / E** |
| Slide while running forward | Left Alt | Leave prone | Release C (requires clearance) |
| Walk (silent) | Left Shift | Reload | R |
| Primary / Secondary / Knife | 1 / 2 / 3 | Use · Defuse · Pick up · Pry (hold, with crowbar) | F |
| Grenades (cycle) / Bomb | 4 / 5 | Drop weapon | G |
| **Gadgets (cycle)** | **6** | **Camera / drone feeds** | **T** (Q/E switch, Left mouse ping) |
| **Quick melee** (stab without switching) | **V** | **Stim yourself** | **H** |
| **Use killstreak** | **7** | **Detonate C4** | **Z** |
| **Ping enemy / spot** | **Middle mouse** | **Inspect weapon** | **Y** |
| **Weapon light on/off** | **L** | **Gunsmith** | **B**, then tab **4** |
| **Mantle** | hold **Space** into a ledge | Skip killcam | Space |
| Last weapon | X | Buy menu (1–4 tabs, **R** rebuy, **A** auto-buy) | B |
| Scoreboard | Tab (hold) | Pause / free the mouse | Esc |

Crouch defaults to **C** rather than CS's Ctrl, because Ctrl+W closes a browser tab.
Hold C while standing still for 0.55 seconds to go prone. Crawl at 18% of weapon run
speed; release C to rise when there is room.
* Moving, firing or aiming restarts the timer, so crouch-walking and crouch-spraying never
  drop you prone.
* Prefer Call of Duty controls? Set **Settings → Game → Crouch & prone** to **Toggle**: tap C
  to crouch or stand, hold C to go prone (it stays), and press Space to stand up.

Left Alt starts a short, audible slide from forward running momentum. Sliding slows down
naturally, reduces accuracy and has a cooldown, so it can't be chained for a speed boost.
Both actions follow your custom bindings.
Saved profiles that still have cameras on V are moved to T automatically, because V is now quick melee.

**Aim assist** (Settings → Game): Off / Low (default) / Medium / High. Your crosshair slows
down over a visible enemy, and you get a gentle, speed-limited pull toward their upper chest
while you move the mouse or strafe. Walls, smoke, flashes and teammates switch it off, and it
never applies to bots.

## Features

**Gameplay**
* CS2 competitive rules: freeze time, 20 s buy time, 1:55 rounds, 40 s bomb timer, 3.2 s plant,
  and 10 s defuse (5 s with a kit).
* Halftime side swap; MR4, MR8 or MR12 match lengths.
* Full CS2 economy: loss bonus ladder, plant bonus, and per-weapon kill rewards.
* **Final killcam** (Call of Duty S&D style): when a round is won by an elimination, the
  deciding kill is replayed from the killer's eyes with slow motion on the shot. On match
  point it's the *Final Killcam*. Space skips it, and you can turn it off in Settings.
* **Clutch and multi-kill moments:** "1 v 3" when you're the last one alive, DOUBLE / TRIPLE /
  QUAD KILL and **ACE** callouts with stingers, plus a spoken round announcer (browser speech,
  toggle in Settings → Audio).
* **Pings** (middle mouse): mark the enemy under your crosshair (spotted on radar for 5 s) or
  a spot. Teammates see a diamond with the distance, and bots go to check it.
* 22 original guns plus a knife, in eight classes: pistols (including the full-auto Viper MP),
  SMGs, shotguns, assault rifles (including the 3-round-burst Talon B3), LMGs, snipers
  (including the semi-auto Marshal DMR that stays scoped), a 40 mm grenade launcher and an RPG. Each has a fixed learnable spray
  pattern, movement and jump inaccuracy, armor penetration, range falloff, and
  head/chest/stomach/leg hit groups. Launchers fire real projectiles with gravity and splash
  damage.
* **Wallbangs:** bullets penetrate wood, fabric, glass and thin metal with damage loss per
  material (up to 2 surfaces), shown with a ⊘ icon in the kill feed.
* **Stun grenades** slow the movement and aim of everyone caught in the blast. **Throwing
  knives** kill in one hit to the head or body and can be picked back up. The **heartbeat
  sensor** shows enemies within 24 m in front of you on a tablet screen, through walls.
* **Quick melee (V):** a fast knife stab (or crowbar swing) while you keep holding your gun.
  It hits people (55 damage, backstabs kill), breaks barricades and wrecks enemy gadgets.
* **Stim pistol:** shoot a dropping healing dart at a teammate (+60 HP over 5 s) or press H
  to inject yourself (+15 HP over 5 s). One dart loaded plus two spare; an Ammo Box adds a
  third. Back-to-back heals on the same person are weaker.
* **Fortify and breach** (Operation One / Siege style): board up doorways with Wooden or
  Steel Barricades, pry them off with a Crowbar, stick and remote-detonate C4, drop an Ammo
  Box for your team, and bolt in an Armor Plate (+25, up to 150).
* **Killstreaks** (Call of Duty style, earned in one life and kept until used with 7):
  UAV (3 kills), Counter-UAV (4), Hunter Drone (5), and a steerable Cruise Missile (6) with a
  thermal view. Toggle them in the match setup.
* **Gunsmith (buy menu tab 4).** Buy attachments for your guns across 8 slots: optics
  (red dot, holo, 2.5× ACOG), muzzles (suppressor, compensator, flash hider, brake, choke),
  barrels, grips and bipods, 1 mW / 5 mW lasers and a tactical light, extended / fast /
  drum mags, stocks, and FMJ or hollow-point ammo.
  * Up to 5 per gun; which slots a gun has depends on its class.
  * Live stat bars show what each change does.
  * Attachments are bought once per gun and **kept for the half even if you die**: rebuy
    the gun and your loadout comes back.
  * Bots kit out their guns too.
* **Weapon inspect (Y)** turns the gun to show off its finish.
* **Easy-going extras:**
  * **Rebuy** (buy menu R) restores last round's purchases, with your Gunsmith attachments
    back for free. **Auto-buy** (A) picks the best rifle, armor, kit and grenades you can
    afford.
  * **Objective markers** show bomb sites A/B with distances, the planted bomb with its
    countdown, and a dropped bomb for Attackers.
  * **Gameplay tips** run during the first rounds.
  * Each of these can be switched off in Settings.
* Bots use the new stances too: Defenders sometimes hold long angles from prone (they get
  up if you push them), and anyone may slide while running a route.
* **Buy menu in three tabs:** Weapons (by class), Gadgets (grenades, cameras and drones,
  explosives, support) and Utilities (fortify, breach and supply, armor).
* Utilities: frag, flashbang (blinding plus tinnitus), smoke that blocks vision and puts out
  fire, Molotov / Incendiary, decoy, and an original **Recon Pulse** gadget that reveals
  nearby enemies through walls.
* **Gadgets and a camera network**, in the style of Siege / Operation One:
  * Recon Drone you drive yourself.
  * Throwable Sticky Cam.
  * Auto-scanning Flock Cam.
  * Trip Mine with a laser.
  * Barbed Wire.
  * Bulletproof Deployable Shield.
  * EMP grenade.
  * Building CCTV for Defenders.
  * Pings that outline enemies through walls.
* **Tilt aim / lean** (Q/E) that moves your hitboxes, ADS on non-scoped guns, and two-level
  sniper scopes.
* Source-style movement: acceleration, counter-strafing, friction, air-strafing, silent
  walking, smooth crouching, **crouch-jumping** onto higher ledges, jump stamina (spamming
  jump makes each hop lower), buffered jump presses, stepping up ledges, and fall damage.
* **Mantling:** hold jump while moving into a ledge up to 1.75 m high to climb onto it.
  **Coyote time:** a jump pressed just after running off an edge still works.
* Being shot flinches your aim; a death cam turns to your killer, with a damage report for
  the round.
* Weapon drops and pickups, bomb drop and recovery, and spectating teammates after death.

**Bots**
* A* navigation, team strategies (rush, execute, split, default with a lurker), Defender
  setups, rotations, and grouped retakes.
* They hear footsteps and gunfire, counter-strafe, burst-fire at range, throw utility, plant,
  defuse, and save when a defuse is hopeless.
* They buy and use the new arsenal: stim themselves and shoot darts at hurt teammates, call
  in killstreaks, quick-melee at point blank, board up doorways in front of their holds, and
  hack through enemy barricades.
* Four difficulty levels.

**Presentation**
* CS-style menus:
  * Title screen with a fly-through of the map.
  * **Agents:** six presets plus full color, gear and headgear customization, with a live 3D
    preview.
  * **Loadout:** ten weapon finishes per weapon, with a rotating 3D preview.
  * **Settings:** sensitivity, FOV, audio, graphics presets, key rebinding, and a crosshair
    editor.
  * **How to play** page.
* HUD:
  * Health, armor, money (with change pop-ups) and ammo.
  * Team alive bars, round timer and bomb indicator.
  * Rotating radar, kill feed with headshot and assist icons, and teammate name tags.
  * Plant / defuse progress bars and damage-direction indicator.
  * Flash and smoke screen effects, sniper scope overlay, and a dynamic crosshair.
* Buy menu, scoreboard (K/A/D, HS%, ADR, MVPs, round history), pause menu, and a match-end
  screen with career stats.
* Synthesized 3D positional audio: gunshot types, surface-specific footsteps, bomb beeps,
  explosions, and UI sounds.
* Beveled weapons with separate magazines, slides and bolts; shaped sleeves and gloves,
  ejected brass, staged reloads, and restrained movement sway.
* Rounded character silhouettes and industrial props, reflection lighting for weapons,
  architectural trim and service pipes. High adds PBR surface normal and roughness maps;
  Medium preserves the lighter shading path for integrated GPUs.
* **Baked global illumination:** an offline light baker (`npm run bake`) traces every room
  fixture, sun and sky with soft shadows, ambient occlusion and bounce light into a lightmap
  atlas plus a light-probe grid. Characters, props and your weapon pick up the light of
  where they stand.
* Blood sprays onto the wall behind hits, and soft contact shadows ground characters in the
  baked lighting. Kill feed entries use weapon silhouettes. A low-health heartbeat and
  desaturation warn you when you're nearly dead.
* Models for every new item: LMGs with box magazines and bipods, a break-action 40 mm
  launcher, an RPG with a visible warhead, the stim pistol, C4, plank and steel barricades
  that work loose as they take damage, an ammo crate, a quadcopter with spinning rotors, a
  cruise missile and a circling UAV. Rockets leave smoke trails; explosions scale with their
  blast radius.

## Project structure

```
ACI-SND/
├─ .github/
│  ├─ workflows/ci.yml     # typecheck, tests, build, browser boot check (every push / PR)
│  ├─ workflows/deploy.yml # CI, then publish to GitHub Pages (push to main)
│  └─ ISSUE_TEMPLATE/, pull_request_template.md, dependabot.yml, CODEOWNERS
├─ index.html              # page shell (canvas + UI root)
├─ src/
│  ├─ main.ts              # bootstrap + loading screen
│  ├─ app/                 # application layer
│  │  ├─ App.ts            #   state machine: title → menu → match; menu showcase camera
│  │  ├─ GameSession.ts    #   one running match: fixed 64-tick loop, overlays, spectating
│  │  ├─ Input.ts          #   keyboard/mouse, pointer lock, key capture for rebinding
│  │  ├─ PlayerController.ts  # input → AgentCommand (mouse look, lean, ADS, one-shot actions)
│  │  ├─ AimAssist.ts      #   optional slow-down + pull near visible enemies (player only)
│  │  └─ Profile.ts        #   saved profile/settings (localStorage)
│  ├─ config/              # tunable data tables
│  │  ├─ rules.ts          #   match rules and lengths
│  │  ├─ economy.ts
│  │  ├─ movement.ts       #   Source-unit movement constants
│  │  ├─ weapons.ts        #   all guns: stats, spread, recoil
│  │  ├─ utilities.ts      #   grenades and gear
│  │  ├─ gadgets.ts        #   drones, cameras, traps, shield, EMP
│  │  ├─ cosmetics.ts      #   agents, finishes, crosshair defaults
│  │  ├─ difficulty.ts
│  │  └─ controls.ts       #   default key bindings
│  ├─ core/                # engine-agnostic helpers: math, seeded RNG, typed EventBus
│  ├─ sim/                 # deterministic game simulation (no DOM/WebGL; runs in Node tests)
│  │  ├─ maps/aciHq.ts     #   the map: grid, doors, props, spawns, sites, AI data
│  │  ├─ world/            #   MapDef types; World = colliders + nav + zone queries
│  │  ├─ physics/          #   AABB collision world (grid + DDA raycast), Source-style motor
│  │  ├─ entities/         #   Agent (player/bot state, inventory, hitboxes, commands)
│  │  ├─ combat/           #   damage model, spray patterns, ballistics + penetration, weapon state machine,
│  │  │                    #   Ordnance (rockets, 40 mm shells, stim darts), Explosion
│  │  ├─ utility/          #   grenade physics, smoke/fire/flash/decoy/pulse effects
│  │  ├─ gadget/           #   drones, cameras, CCTV, trip mines, wire, shields, EMP
│  │  ├─ ai/               #   NavGrid + A*, BotController, TeamCoach, BotBuy
│  │  ├─ mode/             #   Match (S&D rules, rounds, bomb, economy), Economy, Killstreaks, types
│  │  ├─ events.ts         #   simulation event types (consumed by render/audio/UI)
│  │  └─ SimContext.ts
│  ├─ render/              # Three.js presentation
│  │  ├─ Renderer.ts       #   world pass + view-model pass, quality presets
│  │  ├─ MapMesh.ts        #   map geometry with lightmaps, lights, decals, signs, sky
│  │  ├─ lighting/         #   LightLayout (atlas packing), LightBaker (offline GI), BakedLighting (runtime)
│  │  ├─ Props.ts          #   procedural furniture, machines, vehicles
│  │  ├─ Materials.ts      #   material library, geometry batching/merging
│  │  ├─ Textures.ts       #   procedural canvas textures (incl. weapon finishes)
│  │  ├─ CharacterModel.ts #   animated humanoid agents
│  │  ├─ WeaponModels.ts   #   procedural weapons, grenades, bomb
│  │  ├─ GadgetModels.ts   #   drones, cameras, mine, wire, shield, stim, C4, barricades, killstreaks
│  │  ├─ ViewModel.ts      #   first-person arms/weapon animation
│  │  ├─ Effects.ts        #   particles, tracers, decals, smoke volumes, fire, lights
│  │  └─ MatchView.ts      #   binds a Match to visuals/audio; camera; interpolation
│  ├─ audio/Sfx.ts         # WebAudio synthesizer for every sound
│  └─ ui/                  # DOM UI
│     ├─ screens/          #   title, main menu (play/agents/loadout/help), settings panel
│     ├─ hud/              #   HUD, radar, crosshair, buy menu, scoreboard, pause, match end
│     ├─ components.ts, dom.ts
│     └─ styles/main.css
├─ tests/                  # Vitest: map validity, physics, combat, economy, full bot matches
├─ scripts/
│  ├─ boot-check.mjs       # CI: boots the build from /ACI-SND/ like GitHub Pages
│  ├─ lib/browser.mjs      # shared Chromium launch (GPU locally, SwiftShader on CI)
│  ├─ smoke-test.mjs       # headless Chromium end-to-end test + screenshots
│  ├─ bake-lighting.mjs    # offline lightmap + probe baker (npm run bake)
│  ├─ look.mjs             # quick in-game views at one quality preset
│  ├─ arsenal-look.mjs     # buy menu, new view models, barricades, killstreak views
│  ├─ screenshots.mjs      # map & view-model visual tour
│  ├─ balance.mjs          # long bot-vs-bot balance report
│  └─ print-map.mjs        # ASCII map dump
├─ docs/                   # plan, design and map docs
└─ public/                 # favicon, scanned surfaces, baked lightmaps (public/lightmaps/)
```

**Design rule:** `src/sim` never touches the DOM or WebGL. The renderer, audio and UI subscribe
to the simulation's `EventBus` and read its state each frame. Because of this, entire
bot-vs-bot matches can run in Node tests, and the simulation can later move to an authoritative
multiplayer server unchanged.

## Testing & verification

| Command | What it does |
|---|---|
| `npm run check` | Typecheck + tests + production build: exactly what CI runs on every push |
| `npm run check:boot` | Serves the build from `/ACI-SND/` (like GitHub Pages), boots it in headless Chromium, starts a match and fails on any missing file or error. Runs in CI; needs a build first |
| `npm run typecheck` | Strict TypeScript checks |
| `npm test` | 130 unit and simulation tests (plus an optional balance report), including prone and slide (clearance, hitboxes, crouch modes), Gunsmith attachments, rebuy/auto-buy, mantling, coyote time, burst fire, stun, throwing knives, the heartbeat sensor, pings and killcam recording, including movement (crouch-jump, stamina), wallbangs, foot placement, weapon handling, input buffering, aim assist, every gadget, the stim pistol, barricades, launchers, C4 and killstreaks. They cover map connectivity, prop/wall overlap, raycasts, damage/armor, spray patterns, economy, and **complete bot-vs-bot matches** (rounds, plants, halftime swap, money limits) |
| `npm run smoke` | Builds, serves, and drives the real game in headless Chromium: title → every menu page → start match → buy menu purchase → quality presets with FPS readout → an accelerated all-bot match until it ends. Fails on any console error and saves screenshots to `screenshots/` |
| `npm run screenshots` | Visual tour of 16 map locations and 8 view models (`screenshots/tour/`) |
| `npm run perf` | FPS per graphics preset on your GPU |
| `npm run bake` | Re-bake the map's lightmaps after changing the map (about 10 s) |
| `node scripts/arsenal-look.mjs` | Screenshots of the buy menu, new view models, barricades, RPG blast and missile view (`screenshots/arsenal/`) |
| `npm run test:handling` | Real keyboard/mouse movement, jump, crouch, hold-to-prone, release-to-stand, slide/cooldown, automatic fire, reload and ADS checks, plus screenshots and graphics-preset measurements in `screenshots/handling/` |
| `npm run test:visual` | High-quality character poses, architecture, weapon animation, WebGL errors and repeated gadget cleanup; screenshots, a motion-review video and a JSON report in `screenshots/visual/` |
| `npm run test:keys` | Presses the new combat keys in the real game (quick melee, self-stim, killstreak, C4 detonate, cameras, ping, stim dart, weapon light) and checks each one works |
| `node scripts/qol-look.mjs` | Screenshots of the round tips, Rebuy / Auto-buy, objective markers and the settings page (`screenshots/qol/`) |
| `node scripts/frame-cost.mjs` | Per-frame CPU cost (simulation, view, HUD, render) per quality preset – unaffected by other load on the machine |
| `node scripts/gunsmith-look.mjs` | Buys and fits attachments through the real buy menu, then screenshots the Gunsmith tab, a kitted rifle, red-dot / holo / ACOG aiming, an enemy laser and an enemy light (`screenshots/gunsmith/`) |
| `node scripts/moments-look.mjs` | Screenshots of the new guns, gear, heartbeat screen, pings, stun, multi-kill banner and the killcam, then checks the next round starts (`screenshots/moments/`) |
| `npm run balance [difficulty] [seeds]` | Win-rate and kill statistics over ~60 simulated rounds |
| `npm run verify` | Full pre-release pass: `check` + `check:boot` + smoke test + real-key check (needs a GPU) |

`npx playwright install chromium` downloads the headless browser that the smoke test uses. It
is already installed on this machine. Add `--swiftshader` to any browser script to use
software rendering like CI does.

## Deployment

GitHub Actions runs on every push and pull request and publishes `main` to GitHub Pages:

| Event | What runs |
|---|---|
| Push to any other branch / open a PR | **CI**: typecheck, tests, build, then a browser boot check of the build |
| Push to `main` (or Actions → *Deploy to GitHub Pages* → Run workflow) | **CI**, then the tested build is published to https://ceenguyen05.github.io/ACI-SND/ |

A failing check stops the deploy, so the live site keeps the last good version.
`/version.json` on the site shows which commit is live. The one-time Pages setting, rollback,
custom domains and troubleshooting are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Performance

Measured on this machine (Intel UHD 620 integrated graphics, 1280×720):

| Quality | FPS |
|---|---|
| Low | 60 (vsync cap) |
| Medium (default) | 50–60 |
| High | 30–45 |

If the game stutters:
* Lower **Settings → Video → Graphics quality** or **Resolution scale**.
* By default the game renders at window size and ignores Windows display scaling. Raise the
  resolution scale above 100% only on a strong GPU.

## Troubleshooting

* **The mouse doesn't turn the camera.** Click inside the game. Browsers only allow mouse
  capture after a click.
* **No sound.** Click once on the page first; browsers block audio until you interact with it.
* **Black screen or "Failed to start".** WebGL is disabled. Enable hardware acceleration in the
  browser settings.
* **Reset all saved settings.** Clear the site data for `localhost:5173`; the key is
  `aci-snd-profile-v1`.

## Roadmap

See [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md#8-future-work-post-v1):
* online multiplayer (authoritative server reusing `src/sim`);
* more maps;
* destructible soft walls (breach charges already open barricades);
* more killstreaks (care package, sentry);
* weapon inspect animations;
* demo replays;
* controller support.
