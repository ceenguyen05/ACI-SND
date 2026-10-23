# Development Plan — ACI: Search & Destroy

## 1. Goal

A CS:GO / CS2-style **Search & Destroy** (bomb defusal) tactical shooter that runs in the
browser, built around one map: **ACI HQ**, a single-story building where the west half is an
office (meeting rooms, engineering cubicles, bullpen, server room) and the east half is a
manufacturing floor, warehouse, and shipping / loading dock.

Version 1 is **offline 5v5 against bots**. The player is one of the five on their team; the
other nine slots are AI bots.

## 2. Technology decision

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Unity / Unreal | Full engines, editors | Need GUI editors and binary assets; hard to build and verify from code alone; large installs | ✗ |
| Godot 4 | Free, scriptable | Scenes are mostly built in the editor; harder to test automatically | ✗ |
| Python (Ursina/Panda3D) | Simple | Python 3.9 here; weaker FPS feel and performance; awkward to ship | ✗ |
| **TypeScript + Three.js + Vite** | Runs in any browser; quick to build and iterate; everything (geometry, textures, audio) can be generated in code; testable in headless Chromium | We write the game systems ourselves | **✓** |

Toolchain (checked on this machine): Node 22.20, npm 10.9, Git 2.51, VS Code 1.143.
Packages: `three`, `vite`, `typescript`, `vitest` (unit tests), `playwright` (headless smoke tests).

Models and animation are authored in code, and audio is synthesized with WebAudio. The
visual overhaul adds three locally bundled CC0 scanned surface sets alongside the canvas
textures. See [ASSETS.md](ASSETS.md) for sources, licensing and the reproducible fetch script.

## 3. Research notes (CS2 competitive defaults we model)

| Rule | Value |
|---|---|
| Match format | MR12: first to 13 rounds wins, sides swap after round 12 (option: MR8 short match) |
| Freeze time | 15 s (option) |
| Buy time | 20 s from round start, only inside your spawn buy zone |
| Round time | 1:55 |
| Bomb timer | 40 s · plant 3.2 s · defuse 10 s (5 s with a kit) |
| Start money / cap | $800 / $16,000 |
| Round win | $3,250 by elimination or time · $3,500 by bomb detonation or defuse |
| Loss bonus | $1,400 → $1,900 → $2,400 → $2,900 → $3,400 (streak drops by one after a win) |
| Plant bonus | +$800 to each attacker when the bomb was planted but the attackers lost the round · planter +$300 · defuser +$300 |
| Kill rewards | $300 by default · SMG $600 · shotgun $900 · heavy sniper $100 · knife $1,500 · grenade $300 |
| Movement | 250 u/s with a knife (≈6.35 m/s); weapon weight lowers top speed; walking ×0.52, crouching ×0.34 |
| Hit groups | head ×4 · chest ×1 · stomach ×1.25 · legs ×0.75; armor absorbs part of the damage, and a helmet protects the head |
| Accuracy | Standing still is accurate; moving, jumping, and spraying add spread; crouching improves accuracy; each gun has a fixed spray pattern you learn to pull against |

## 4. Architecture

```
main.ts → App (state machine: Title → MainMenu → Match → back)
                 │
     ┌───────────┼──────────────────────────────────┐
     UI layer    Match (game/)                      Engine (engine/)
     (DOM/CSS)   ├─ RoundManager / Economy / Bomb   ├─ Renderer (world + view-model pass)
     screens,    ├─ Agents (player + bots)          ├─ Procedural textures & materials
     HUD, buy    ├─ Weapons / Ballistics            ├─ Synth audio (positional)
     menu,       ├─ Utilities (grenades, gadgets)   └─ Particles / decals / tracers
     radar       ├─ AI (nav grid, A*, bot brain)
                 └─ World (map data → geometry + colliders + nav)
```

* **Fixed-step simulation** (64 ticks/s, like CS "64 tick"), with rendering at display refresh.
* **Data-driven content.** Weapons, utilities, economy, rules, map layout, and cosmetics are
  plain data tables in `src/config` and `src/world/maps`.
* **EventBus** decouples the simulation from UI and audio (kill feed, sounds, banners).
* **Collision** uses static AABBs (walls and props) in a spatial grid. Characters use swept-AABB
  movement with step-up. Bullets use ray-vs-AABB tests and per-bone hitboxes.
* **AI** uses a 0.5 m nav grid built from the map, A\* with path smoothing, and an FSM bot brain
  (buy → execute a strategy → fight → plant or defuse → retake).

## 5. Milestones

| # | Milestone | Deliverables | Done when | Status |
|---|---|---|---|---|
| M0 | Pre-game & structure | Folder layout, toolchain, docs, plan | `npm install` and `npm run dev` work | ✅ |
| M1 | Engine core | Renderer, input, pointer lock, fixed loop, procedural textures, audio | Empty scene renders at 60+ FPS | ✅ |
| M2 | Map: ACI HQ | Grid layout, props, materials, lighting, colliders, callouts, spawns, bomb sites | Walkable map; nav-connectivity tests pass | ✅ |
| M3 | Player controller | Source-style movement (accel, friction, air strafe), crouch, walk, jump, **lean / tilt-aim (Q/E)** | Movement feels like CS; can't clip through walls | ✅ |
| M4 | Weapons | 13 weapons + knife, spray patterns, recoil, spread, view model, reload, scope, damage model | Ballistics & damage tests pass | ✅ |
| M5 | Utilities & gadgets | Frag, flash, smoke, incendiary, decoy, Recon Pulse sensor, armor, defuse kit | Grenades bounce; effects apply | ✅ |
| M6 | Game mode | Rounds, freeze/buy time, economy, bomb carry/plant/defuse/explode, halftime, win conditions | Economy & round tests pass; full bot-vs-bot match completes | ✅ |
| M7 | Bots | Nav, buy logic, T strategies (site executes), CT setups, combat, plant/defuse, rotations | Bots win and lose rounds both ways | ✅ |
| M8 | UI | Title, main menu, match setup, customization (agents, weapon finishes, crosshair), settings, HUD, radar, buy menu, scoreboard, pause | Every screen reachable and working | ✅ |
| M9 | QA | Unit tests, typecheck, production build, headless Playwright smoke test, auto-simulated match | All green | ✅ |
| M10 | Movement and presentation polish | Counter-strafe / landing tuning, cadence fixes, weapon animations, shaped models, material detail, contact shadows and architectural detail | Handling regressions, full suite, browser smoke and visual review | ✅ |

## 6. Testing strategy

* `npm test` runs **Vitest** unit tests for pure logic: economy, round resolution, damage and
  armor math, collision sweeps, nav connectivity between spawns and sites, map validity, and
  determinism of spray patterns.
* `npm run typecheck` runs strict TypeScript checks.
* `npm run smoke` builds the game, serves it, and drives headless Chromium with Playwright
  through Title → Menu → Match. It then runs an accelerated **bot-only simulation**
  (`?autotest=1`) until rounds finish, fails on any console error, and saves screenshots to
  `screenshots/`.

## 7. Decisions made during implementation

* **Tilt aim** is a Rainbow-Six-style **lean** (Q/E). It rolls the camera and shifts the
  player's hitboxes. Right-click also gives a light **aim-down-sights** zoom on non-scoped guns.
* **Crouch defaults to C**, because Ctrl+W closes the browser tab.
* **Graphics presets** (Low / Medium / High) were added after measuring on an Intel UHD 620.
  Medium uses Lambert shading and 2K static sun shadows. High adds PBR surface maps, 4K soft
  shadows, reflection lighting and depth-based contact shading. All presets share the new
  geometry, scanned diffuse surfaces and staged animation. Performance varies by scene and
  GPU; the browser checks record measurements instead of promising a fixed frame rate.
  Static geometry is batched in spatial tiles and room lighting uses a fixed pool of four
  nearby lights. See [POLISH.md](POLISH.md) for verification and design notes.
* **Bot balance** was tuned with `npm run balance`. The changes:
  * counter-strafing before shooting;
  * a reaction advantage for bots holding a pre-aimed angle;
  * Defenders rotating when a teammate dies at a site;
  * grouped retakes;
  * saving when the bomb can't be defused in time;
  * Defender utility thrown at pushes they can hear.

  These moved the Attacker win rate from about 89% to about 45%.

* **Arsenal expansion (v1.2).**
  * The buy menu is split into Weapons / Gadgets / Utilities tabs with class columns.
  * New weapons: Mako PDW, Reaper Auto-12, Bulwark and Anvil LMGs, Thumper 40 mm and Hammer RPG.
  * New gadgets and utilities: Stim Pistol, C4, Wooden and Steel Barricades, Crowbar, Ammo
    Box and Armor Plate.
  * Also added: quick melee, killstreaks and optional aim assist.

  Design choices:
  * Launchers, darts and rockets are simulated projectiles (`sim/combat/Ordnance.ts`)
    rather than hitscan, so they drop, bounce and can be dodged.
  * Barricades snap to the doorway in front of you and become dynamic colliders that also
    block the nav grid, so bots route around them or break them.
  * Killstreak thresholds are one lower than CoD's at the low end, because S&D has no
    respawns.
  * Getting shot still kicks you off camera feeds but not off a missile you're steering;
    dying is the only interruption there, as in CoD.
  * Quick melee moved camera feeds from V to T. Saved profiles are migrated.
* **Doorway frames** for single-cell doors now face the right way. Before this, east-west
  doorways were drawn with frame panels across the opening, so they looked closed even
  though you could walk through them.

* **S&D moments (v1.3).** This release adds the final killcam, clutch / multi-kill / ace
  callouts with an announcer, pings, mantling and coyote time, three guns (burst rifle,
  machine pistol, DMR), stun grenades, throwing knives and a heartbeat sensor. Visual
  additions are kill-feed silhouettes, weapon inspect, blood decals, contact shadows and
  low-health feedback.
  * **The killcam is a presentation-side recording.** The render layer records snapshots
    every tick after the simulation steps. The simulation stays deterministic and knows
    nothing about replays; the session pauses stepping while the clip plays and then
    shortens the round-end delay.
  * **Mantling only triggers when a jump wouldn't clear the ledge**, so CS-style hops onto
    crates feel the same as before.
  * **Throwing knives reuse the projectile system** (`Ordnance.ts`), so they hit players,
    gadgets and walls with the same tracing as darts and rockets.

* **Gunsmith (v1.4).**
  * An attachment changes a gun by deriving a modified `WeaponDef` (cached per gun and
    loadout). Every system that already read `weapon.def` (spread, recoil, damage, range,
    magazine, reload, speed, sound) picks the changes up with no special cases. Spray
    patterns are cached per loadout.
  * Ownership lives on the player per gun (`agent.loadouts`), not on the dropped weapon.
    That is how attachments survive death and are re-applied when the gun is bought again.
    The gun instance also carries its fitted attachments, so pickups keep them.
  * The limit of five and the CoD-style radar ping for unsuppressed fire make the trade-offs
    matter: a suppressor costs range, and a 5 mW laser gives your position away.

### Research used for v1.4

* **CoD Gunsmith.**
  * Modern Warfare (2019) allows 5 attachments out of 9 slots.
  * Slots cover muzzle, barrel, underbarrel, laser, optic, stock, rear grip, magazine and
    ammo.
  * Muzzles trade recoil for concealment, barrels change range, magazines trade capacity for
    reload speed, and optics change zoom.
  * The 1 mW laser is invisible to enemies, while the 5 mW laser is stronger but reveals you.
  * [mp1st – MW gun attachments and slots](https://mp1st.com/news/call-of-duty-modern-warfare-gun-attachments-and-gun-perks-listed-heres-what-we-know-for-each-attachment-slot)
  * [mp1st – 5-attachment limit](https://mp1st.com/news/call-of-duty-modern-warfare-gunsmith-tease-confirms-guns-will-feature-5-attachments)
  * [Charlie Intel – MW2 Gunsmith explained](https://www.charlieintel.com/call-of-duty-modern-warfare-2/modern-warfare-2-gunsmith-attachments-explained-198462/)
  * [ProGameGuides – Vanguard attachments](https://progameguides.com/call-of-duty/call-of-duty-vanguard-all-attachments-explained/)
  * [GamesHedge – MW attachments guide](https://www.gameshedge.com/call-of-duty-modern-warfare-gunsmith-attachments/)
* **Rainbow Six Siege muzzles and barrels.**
  * The muzzle brake cuts first-shot recoil and the compensator tightens horizontal spread.
  * Flash hiders hide muzzle flash. Suppressors cost damage.
  * The extended barrel reduces the range damage penalty by about 20%.
  * [Rainbow Six Wiki – Muzzle Brake](https://rainbowsix.fandom.com/wiki/Muzzle_Brake)
  * [Gfinity – Siege barrel attachments](https://www.gfinityesports.com/rainbow-six-siege/rainbow-six-siege-weapon-attachments-guide-best-guns-operators-tier-list/)
* **CS:GO / CS2 silencers.** They are quieter and hide tracers and muzzle flash.
  * [Counter-Strike Wiki – M4A1-S](https://counterstrike.fandom.com/wiki/M4A1-S)
  * [CSDB – M4A4 vs M4A1-S](https://csdb.gg/cs2-m4a4-vs-m4a1-s-comparison/)
* **Operation One.** We found no reliable public documentation of its attachments, so the
  design follows CoD and Siege, which Operation One is modelled on.

### Research used for v1.3

* **Final killcam.** Call of Duty players value it for its randomness and spectacle.
  Black Ops Cold War brought it back after replacing it with "best play" proved unpopular.
  * [Charlie Intel – final killcam returning to Cold War](https://www.charlieintel.com/black-ops-cold-war/treyarch-dev-confirms-final-killcam-is-returning-to-black-ops-cold-war-75459/)
  * [GameRevolution – why S&D works](https://www.gamerevolution.com/?p=12925)
* **Game feel.** We applied coyote time, weapon lag/sway, layered hit feedback and
  responsive input.
  * [StraySpark – what makes an FPS feel good](https://www.strayspark.studio/blog/fps-game-design-fundamentals-ue5)
  * [Wayline – game feel polish](https://www.wayline.io/blog/game-feel-sucks-polish)
* **Tactical equipment.**
  * The stun grenade slows aim and movement in roughly a 6 m radius; we use 7 m with
    falloff.
  * The heartbeat sensor is a tablet showing rough enemy positions. Siege's HB-5 reads
    9 m through walls; we use 24 m in a front cone because our rounds are longer-range.
  * CoD throwing knives are one-hit kills.
  * [ProGameGuides – MW2 tactical equipment](https://progameguides.com/call-of-duty/modern-warfare-2-all-tactical-equipment-items-explained/)
  * [Rainbow Six Wiki – Pulse](https://rainbowsix.fandom.com/wiki/Pulse_(Siege))
  * [comicbook.com – throwing knife kills](https://comicbook.com/gaming/news/call-of-duty-modern-warfare-player-luckiest-throwing-knife-kill/)
* **Clutch and ace terminology.**
  * [CSDB – CS2 terminology](https://csdb.gg/blog/guides/cs2-terminology-the-must-know-cs2-terms)

### Research used for v1.2

* Killstreak costs: in Modern Warfare II (2022) the UAV costs 4 kills, the Counter-UAV 5
  and the Cruise Missile 6.
  * [esports.gg – Breakdown of the 20 killstreaks in MW2](https://esports.gg/news/call-of-duty/breakdown-of-the-20-different-killstreaks-in-call-of-duty-mw2)
  * [Upcomer – all killstreaks in the MW2 beta](https://upcomer.com/all-killstreaks-in-the-call-of-duty-modern-warfare-2-beta)
* Barricades in Rainbow Six Siege break in three melee hits, while reinforced walls need
  breaching gadgets. We used this for wood versus steel.
  * [Rainbow Six Wiki – Destruction](https://rainbowsix.fandom.com/wiki/Destruction)
  * [Tom Clancy Wiki – Barricade](https://tomclancy.wiki.gg/wiki/Rainbow_Six:Barricade)
* Roblox *Operation One* is a 4v4 Siege-inspired tactical shooter. The stim-pistol numbers
  (1 + 2 darts, +60 / +15 HP over 5 s, a third dart with an ammo box, diminishing returns,
  dropping projectile, melee and gadget breaking) come from the request, because public
  documentation of its utilities is sparse.
  * [Dexerto – Operation One](https://www.dexerto.fr/roblox/codes-operation-one-1661623/)

## 8. Future work (post v1)

Online multiplayer (authoritative WebSocket server reusing the `src/sim` simulation),
more maps, destructible soft walls, more killstreaks (care package, sentry), inspect
animations, demo replay, controller support (aim assist is already in place), and a
dedicated-server build.
