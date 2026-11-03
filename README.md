# ACI: Series 1

[![CI](https://github.com/ceenguyen05/ACI-SND/actions/workflows/ci.yml/badge.svg)](https://github.com/ceenguyen05/ACI-SND/actions/workflows/ci.yml)
[![Deploy](https://github.com/ceenguyen05/ACI-SND/actions/workflows/deploy.yml/badge.svg)](https://github.com/ceenguyen05/ACI-SND/actions/workflows/deploy.yml)

**▶ Play in the browser: https://ceenguyen05.github.io/ACI-SND/** (the latest `main`, deployed
automatically)

A first-person shooter with two game modes on one original map, **ACI HQ**. ACI HQ is a
single-story building where the west half is offices (meeting rooms, engineering cubicles,
B-site bullpen) and the east half is manufacturing (A-site assembly line, factory floor,
warehouse, shipping docks).

* **Search & Destroy:** CS-style bomb defusal, offline with bots or online in casual 1v1–5v5 and ranked 3v3–5v5 rooms.
* **Zombies (ACI HQ: Outbreak):** round-based survival, offline with allied bots or online
  with 1–5 human/bot survivors against AI zombies. Start with a knife and a pistol and earn your way to perks,
  wonder weapons and an exfil. See [docs/ZOMBIES.md](docs/ZOMBIES.md).

It runs in the browser using TypeScript, Three.js and Vite. Models, animation and audio are
generated in code, with three locally bundled CC0 scanned surface sets for the buildings.
Play offline with bots, or choose **Play Online** for Search & Destroy public matchmaking
and private rooms with five-digit invitation codes. Teams support 1v1 through 5v5;
rooms start when full, when the owner chooses Play now, or after three minutes with
bots filling the open spots. Online play requires the included persistent game server;
see [multiplayer setup and Vercel hosting](docs/MULTIPLAYER.md).
Both modes earn career XP for kills, objectives, completions, wins and daily play.
Online Ranked S&D adds placements, skill-based queues and Iron–Champion divisions;
see [progression, ranks and persistence](docs/PROGRESSION.md).

| Topic | Document |
|---|---|
| Step-by-step free GitHub + Vercel + Render + MySQL deployment | [docs/ONLINE_DEPLOYMENT.md](docs/ONLINE_DEPLOYMENT.md) |
| Online multiplayer, rooms and Vercel setup | [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) |
| XP, daily streaks, ranks and fair matchmaking | [docs/PROGRESSION.md](docs/PROGRESSION.md) |
| Development plan | [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) |
| Game design (rules, weapons, economy, bots) | [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) |
| Zombies mode (waves, zombie types, perks, prices, exfil, research) | [docs/ZOMBIES.md](docs/ZOMBIES.md) |
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
npm run dev:online   # frontend + multiplayer server (for public/private online matches)
```

Click the title screen. The main menu has **Play Now** (offline), **Play Online**, **Career & Rank**,
**Settings** and **About** (arrow keys and Enter work too), plus quick links to **Operators**
(character customization), **Loadout** and **How to play**.

1. **Play Now** opens the mode select. Pick **Search & Destroy** or **Zombies**.
2. Set up the match (S&D: side, team size, difficulty, length; Zombies: squad, difficulty,
   game length).
3. Press **Start match**, or **Watch bots** to spectate.
4. Click the game window to capture the mouse. Press **Esc** at any time to pause and release
   it.

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

**In Zombies** the Use key (**F**) buys:

* At a wall weapon, a shutter, a perk machine, the Mystery Box, the Prototype Forge or the
  power switch, it buys or uses it.
* At the Armory, it opens the Armory menu (number keys buy).
* Next to a downed teammate, hold it to revive them.
* **Tab** shows the squad board.

**Aim assist** (Settings → Game): Off / Low (default) / Medium / High. Your aim slows down over a
visible enemy, and you get a gentle, speed-limited pull toward the nearest part of their body
(it never drags you off a headshot). While you move the mouse or strafe, it also helps you
track a strafing target. It measures from where your bullets actually go, recoil included,
and scopes soften the pull. Walls, smoke, flashes and teammates switch it off, and it never
applies to bots.

**Crosshair and sights.** The crosshair sits where your next bullet goes. It climbs with the
recoil the camera doesn't show (turn off *Follow recoil* in Settings → Crosshair for a fixed
one). Its gap is the real spread, including shotgun pellets and sniper no-scopes. Iron sights,
red dots, holo, ACOG and sniper reticles all line up on the same point. Every gun's sight
picture is clear. The Thumper and the Hammer's 2× scope show range marks for their shells'
drop.

## Features

**Zombies: ACI HQ: Outbreak** (full design: [docs/ZOMBIES.md](docs/ZOMBIES.md))
* **Round-based CoD-style waves.** Wave counts, health, spawn rate and the walk → run → sprint
  speed ramp come from the Black Ops 2 zombies scripts.
* **Specials:** frenzy waves (sprinters, crawlers and bombers, ending in a Max Ammo) and
  Juggernaut boss waves.
* **Ten zombie types:**
  * Shambler, Sprinter and Crawler.
  * Brute.
  * Bloater: a gas cloud when it dies.
  * Bomber: explodes and wrecks wire.
  * Spitter: acid pools.
  * Firefighter: an armored helmet and plates you shoot off.
  * Shrieker: enrages the horde and calls more.
  * Juggernaut boss: charge, ground slam, and dazed into double damage.
* **Squads of 1, 3 or 5.** Bot teammates revive you, kite, prioritise threats, grab power-ups
  and buy their own perks and guns.
* **Points:** 10 per hit, 50–130 per kill and a wave-clear bonus. Start with a knife and a
  pistol.
* **Buying:**
  * 15 shutters unlock 8 zones of ACI HQ.
  * 14 wall weapons.
  * The Mystery Box (with the teddy-bear move rule and the **Disruptor** plasma wonder
    weapon).
  * The **Prototype Forge** (Pack-a-Punch style upgrades with a glowing camo).
  * 8 perks (4 at a time) that need the power switched on.
  * The **Armory:** armor, frags, stuns, Molotovs, lure beacons, trip mines, wire, barricades,
    stims, an ammo crate, a self-revive kit.
* **Power-ups:** Max Ammo, Insta-Kill, Double Points, Nuke, Carpenter, Fire Sale, Bonus Points.
* **Going down:** downed players shoot their pistol and wait for a revive, or bleed out and
  return next wave. Solo players start with one free self-revive.
* **Exfil to win** (Short: from wave 10, Long: from wave 20): call the chopper on the lobby
  radio, reach the landing zone and hold it. Endless mode has no way out.
* **Four difficulties** (Casual → Nightmare). Your best wave per difficulty is saved.
* **Mood:** the building is dim until you turn the power on, and frenzy waves turn the air
  red. Groans, screams, roars, a music-box Mystery Box and perk jingles are all synthesized.
* **Zombies HUD:** a CoD-style wave counter (tally marks for 1–5), squad points with "+10"
  popups, perk icons, power-up timers, prompts with prices, revive and bleed-out bars, a boss
  health bar and an exfil objective.

**Search & Destroy gameplay**
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
* Menus:
  * Animated **ACI: Series 1** title over a fly-through of the map.
  * Main menu with **Play Now / Settings / About**: staggered slide-ins, hover sweeps, mouse
    parallax, keyboard navigation, a featured Zombies card and career stats.
  * **Mode select:** two big 3D-tilting cards (Search & Destroy, Zombies). Picking one slides
    in its setup, with your operator or a zombie posing behind it.
  * **Operators:** six presets plus full color, gear and headgear customization, with a live 3D
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
  * Flash and smoke screen effects; sniper, ACOG and rocket scopes; and a dynamic crosshair that
    follows the recoil to where the bullet goes.
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
├─ Dockerfile, render.yaml # game server container / Render Blueprint (see docs/ONLINE_DEPLOYMENT.md)
├─ .env.example            # every server and build setting, documented
├─ server/                 # authoritative multiplayer server (Node + ws); runs src/sim headless
│  ├─ index.ts             #   HTTP + WebSocket entry point, 64 Hz tick loop, /health and /ready
│  ├─ LobbyService.ts      #   rooms, codes, matchmaking queue, bot fill, rewards, rank settlement
│  ├─ matchmaking.ts       #   pure queue / skill-window / team-balance rules
│  ├─ AccountStore.ts      #   anonymous device profiles and server-owned careers
│  └─ MySqlPersistence.ts  #   optional MySQL storage adapter
├─ src/
│  ├─ main.ts              # bootstrap + loading screen
│  ├─ app/                 # application layer
│  │  ├─ App.ts            #   state machine: title → menu → match; menu showcase camera
│  │  ├─ GameSession.ts    #   one running match (offline or online): fixed 64-tick loop, overlays
│  │  ├─ Input.ts          #   keyboard/mouse, pointer lock, key capture for rebinding
│  │  ├─ PlayerController.ts  # input → AgentCommand (mouse look, lean, ADS, one-shot actions)
│  │  ├─ AimAssist.ts      #   optional slow-down + pull near visible enemies (player only)
│  │  └─ Profile.ts        #   saved profile/settings (localStorage)
│  ├─ net/                 # online client: protocol + validation, snapshots, prediction replicas
│  ├─ progression/         # XP, levels, daily challenges, ranks (shared by browser and server)
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
│  │  ├─ maps/aciHqZombies.ts # Zombies layout: zones, shutters, wall-buys, machine spots
│  │  ├─ world/            #   MapDef types; World = colliders + nav + zone queries
│  │  ├─ physics/          #   AABB collision world (grid + DDA raycast), Source-style motor
│  │  ├─ entities/         #   Agent (player/bot state, inventory, hitboxes, commands)
│  │  ├─ combat/           #   damage model, spray patterns, ballistics + penetration, weapon state machine,
│  │  │                    #   Ordnance (rockets, 40 mm shells, stim darts), Explosion
│  │  ├─ utility/          #   grenade physics, smoke/fire/flash/decoy/pulse effects
│  │  ├─ gadget/           #   drones, cameras, CCTV, trip mines, wire, shields, EMP
│  │  ├─ ai/               #   NavGrid + A*, BotController, TeamCoach, BotBuy
│  │  ├─ mode/             #   Match (S&D rules, rounds, bomb, economy), Economy, Killstreaks, types
│  │  ├─ zombies/          #   ZombiesMatch (waves, zombie AI, points, machines, downs, exfil),
│  │  │                    #   AllyBot, FlowField (horde pathfinding), zweapons, types
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
│  │  ├─ ZombieModel.ts    #   procedural zombies (10 kinds) and their animation
│  │  ├─ ZombiesModels.ts, ZombiesView.ts # machines, shutters, power-ups, hazards, chopper
│  │  ├─ WeaponModels.ts   #   procedural weapons, grenades, bomb
│  │  ├─ GadgetModels.ts   #   drones, cameras, mine, wire, shield, stim, C4, barricades, killstreaks
│  │  ├─ ViewModel.ts      #   first-person arms/weapon animation
│  │  ├─ Effects.ts        #   particles, tracers, decals, smoke volumes, fire, lights
│  │  └─ MatchView.ts      #   binds a Match to visuals/audio; camera; interpolation
│  ├─ audio/Sfx.ts         # WebAudio synthesizer for every sound
│  └─ ui/                  # DOM UI
│     ├─ screens/          #   title, main menu, ModeSelect, Play Online, Career & Rank
│     ├─ hud/              #   HUD, radar, crosshair, buy menu, scoreboard, pause, match end,
│     │                    #   ZombiesHUD, Armory menu, zombies scoreboard / end screen
│     ├─ components.ts, dom.ts
│     └─ styles/main.css
├─ tests/                  # Vitest (npm test)
│  ├─ game/                #   map, physics, combat, economy, bots, complete bot-vs-bot matches
│  ├─ zombies/             #   waves, machines, revives, models, long soak runs
│  └─ online/              #   rooms, matchmaking, replication, real WebSocket server, storage, careers
├─ scripts/                # Node + Playwright tooling (npm scripts wrap the common ones)
│  ├─ lib/browser.mjs      #   shared Chromium launch (GPU locally, SwiftShader on CI)
│  ├─ checks/              #   pass/fail browser checks: boot (CI), smoke, keys, handling, visual,
│  │                       #   gunplay, Zombies and the two-browser online check
│  ├─ visual/              #   screenshot tours for manual review (map, arsenal, sights, Gunsmith…)
│  ├─ perf/                #   FPS, frame cost, draw calls, Zombies horde performance
│  └─ tools/               #   light baker, surface-asset fetch, balance report, ASCII map,
│                          #   dev:online launcher, diag (console/overlay dump)
├─ docs/                   # design, map, Zombies, multiplayer, progression and deployment guides
└─ public/                 # favicon, scanned surfaces, baked lightmaps (public/lightmaps/)
```

**Design rule:** `src/sim` never touches the DOM or WebGL. The renderer, audio and UI subscribe
to the simulation's `EventBus` and read its state each frame. Because of this, entire
bot-vs-bot matches run in Node tests, and the same simulation runs unchanged inside the
authoritative multiplayer server.

## Testing & verification

| Command | What it does |
|---|---|
| `npm run check` | Typecheck + tests + production build: exactly what CI runs on every push |
| `npm run check:boot` | Serves the build from `/ACI-SND/` (like GitHub Pages), boots it in headless Chromium, starts a Search & Destroy match and a Zombies game, and fails on any missing file or error. Runs in CI; needs a build first |
| `npm run typecheck` | Strict TypeScript checks |
| `npm test` | 320+ unit, simulation and server tests. `tests/online/` covers rooms, matchmaking, input validation, snapshot replication and prediction, a real WebSocket server, MySQL/file storage, XP and ranks. `tests/zombies/` has the Zombies tests (formulas, layout validity, waves, points, purchases, perks, revives, specials, power-ups, box and forge, every zombie kind, a bot squad, motor tunnelling) plus the Search & Destroy suite (plus an optional balance report), including prone and slide (clearance, hitboxes, crouch modes), Gunsmith attachments, rebuy/auto-buy, mantling, coyote time, burst fire, stun, throwing knives, the heartbeat sensor, pings and killcam recording, including movement (crouch-jump, stamina), wallbangs, foot placement, weapon handling, input buffering, aim assist, every gadget, the stim pistol, barricades, launchers, C4 and killstreaks. They cover map connectivity, prop/wall overlap, raycasts, damage/armor, spray patterns, economy, and **complete bot-vs-bot matches** (rounds, plants, halftime swap, money limits) |
| `npm run smoke` | Builds, serves, and drives the real game in headless Chromium: title → every menu page → start match → buy menu purchase → quality presets with FPS readout → an accelerated all-bot match until it ends. Fails on any console error and saves screenshots to `screenshots/` |
| `npm run screenshots` | Visual tour of 16 map locations and 8 view models (`screenshots/tour/`) |
| `npm run perf` | FPS per graphics preset on your GPU |
| `npm run bake` | Re-bake the map's lightmaps after changing the map (about 10 s) |
| `node scripts/visual/arsenal-look.mjs` | Screenshots of the buy menu, new view models, barricades, RPG blast and missile view (`screenshots/arsenal/`) |
| `node scripts/visual/sights-look.mjs [--spray] [--dpr=1.5]` | Every gun at the hip and aimed at a target, with 3× centre crops marked at the exact screen centre. `--spray` fires real bursts and prints how far the crosshair sits from the last impact (`screenshots/sights/`) |
| `npm run test:handling` | Real keyboard/mouse movement, jump, crouch, hold-to-prone, release-to-stand, slide/cooldown, automatic fire, reload and ADS checks, plus screenshots and graphics-preset measurements in `screenshots/handling/` |
| `npm run test:visual` | High-quality character poses, architecture, weapon animation, WebGL errors and repeated gadget cleanup; screenshots, a motion-review video and a JSON report in `screenshots/visual/` |
| `npm run test:keys` | Presses the new combat keys in the real game (quick melee, self-stim, killstreak, C4 detonate, cameras, ping, stim dart, weapon light) and checks each one works |
| `node scripts/visual/qol-look.mjs` | Screenshots of the round tips, Rebuy / Auto-buy, objective markers and the settings page (`screenshots/qol/`) |
| `node scripts/perf/frame-cost.mjs` | Per-frame CPU cost (simulation, view, HUD, render) per quality preset – unaffected by other load on the machine |
| `node scripts/visual/gunsmith-look.mjs` | Buys and fits attachments through the real buy menu, then screenshots the Gunsmith tab, a kitted rifle, red-dot / holo / ACOG aiming, an enemy laser and an enemy light (`screenshots/gunsmith/`) |
| `node scripts/visual/moments-look.mjs` | Screenshots of the new guns, gear, heartbeat screen, pings, stun, multi-kill banner and the killcam, then checks the next round starts (`screenshots/moments/`) |
| `npm run balance [difficulty] [seeds]` | Win-rate and kill statistics over ~60 simulated rounds |
| `npm run test:zombies` | Plays Zombies in the browser through the new menus with a bot squad, then stages every zombie type, the machines, power-ups, hazards, downed / revive, armory, exfil and end screen; reports horde FPS and fails on console errors (`screenshots/zombies/`) |
| `SOAK=1 npx vitest run tests/zombies/zombies-soak.test.ts --silent=false` | Long all-bot Zombies games: progression, per-system timings, no stalled waves, nobody stuck in a closed area |
| `npm run test:online` | Only the online/server/progression tests (`tests/online/`) |
| `npm run test:online:browser` | Two real browsers against the real game server: private room, Play now, purchases, gunfire, movement, bot takeover, public queue, co-op Zombies revive/Armory and online XP |
| `npm run test:gunplay` | Real-browser gunplay regression with visual evidence |
| `npm run diag` | Loads the build in Chromium and prints console output and any fatal-error overlay (`-- --dev` for readable dev-server stacks) |
| `npm run verify` | Full pre-release pass: `check` + `check:boot` + smoke, real-key, Zombies and two-browser online checks (needs a GPU) |

`npx playwright install chromium` downloads the headless browser that the smoke test uses. It
is already installed on this machine. Add `--swiftshader` to any browser script to use
software rendering like CI does.

## Deployment

GitHub Actions runs on every push and pull request:

| Event | What runs |
|---|---|
| Push to any other branch / open a PR | **CI**: typecheck, tests, build, then a browser boot check of the build |
| Push to `main` (or Actions → *Deploy to GitHub Pages* → Run workflow) | **CI**, then the tested build is published to https://ceenguyen05.github.io/ACI-SND/ (set the Actions variable `DEPLOY_GITHUB_PAGES=false` to skip Pages) |

A failing check stops the deploy, so the live site keeps the last good version.
`/version.json` on the site shows which commit is live.

| Piece | Host | Deploys |
|---|---|---|
| Game website | Vercel (Git integration) or GitHub Pages | Static `dist/` from `npm run build`; set `VITE_MULTIPLAYER_URL` to the game server's `wss://…/online` |
| Multiplayer server | Render (`render.yaml`) or any Node/Docker host | `npm start`; Render redeploys `main` after CI passes |
| Online profiles | MySQL (Aiven) or a persistent `DATA_DIR` volume | Server-only credentials, never `VITE_*` |

Step-by-step setup: [docs/ONLINE_DEPLOYMENT.md](docs/ONLINE_DEPLOYMENT.md). CI, Pages, rollback
and troubleshooting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
* rejoining a running online match after a disconnect;
* more maps;
* destructible soft walls (breach charges already open barricades);
* more killstreaks (care package, sentry);
* weapon inspect animations;
* demo replays;
* controller support.
