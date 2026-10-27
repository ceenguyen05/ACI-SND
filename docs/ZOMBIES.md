# Zombies — ACI HQ: Outbreak

Round-based co-op survival on ACI HQ, built in the style of Call of Duty Zombies with ideas
from Killing Floor, Left 4 Dead and Roblox *Operation One*'s Halloween zombies mode.

* Squads of **1, 3 or 5**. You plus bot teammates.
* Start with a **knife and a P-30 pistol**.
* Earn points for every hit, kill and cleared wave.
* Spend them to open the building, buy wall weapons and perks, roll the Mystery Box, upgrade
  guns in the Prototype Forge, and gear up at the Armory.
* Survive endlessly, or call the exfil and escape.

| Code | What it holds |
|---|---|
| `src/config/zombies.ts` | All tuning: zombie kinds, difficulty, formulas, perks, power-ups, prices, armory |
| `src/sim/maps/aciHqZombies.ts` | Map layout: zones, gates, boarded doorways, wall-buys and machine spots |
| `src/sim/zombies/ZombiesMatch.ts` | The mode: waves, spawning, zombie AI, damage and points, purchases, downs and revives, power-ups, exfil |
| `src/sim/zombies/AllyBot.ts` | Bot teammates |
| `src/sim/zombies/FlowField.ts` | Horde pathfinding: a multi-source Dijkstra flow field |
| `src/sim/zombies/zweapons.ts` | Zombies weapon stats: deeper reserves, forged upgrades, perk modifiers |
| `src/render/ZombieModel.ts` | Procedural zombie models and animation |
| `src/render/ZombiesModels.ts`, `ZombiesView.ts` | Machines, shutters, power-ups, hazards, helicopter; zombie audio and lighting mood |
| `src/ui/hud/ZombiesHUD.ts`, `ZombiesOverlays.ts` | Zombies HUD; Armory menu, scoreboard and end screen |
| `src/ui/screens/ModeSelect.ts` | The *Play Now* mode picker and Zombies setup |

## Research basis

The numbers come from primary sources wherever one exists. A research pass was run before
building the mode:

* **Call of Duty Black Ops 2 zombies scripts** (community-decompiled `_zm*.gsc`): wave count,
  health, spawn delay, the walk / run / sprint speed rule, points, 4-perk limit, power-up drop
  rule, Mystery Box teddy-bear rule, revive and bleed-out times, prices.
* **Killing Floor 1 source:** a wave-clear pot shared by the survivors, trader-style
  breathers and boss waves.
* **Left 4 Dead (Valve's AI Director talk):** spawn hordes where the players *can't* see,
  close to them.
* **Roblox Operation One zombies (Halloween 2026):** escalating waves, Bombers that destroy
  barbed wire, and barbed wire as a defense.
* **Black Ops Cold War / Black Ops 6:**
  * Armored zombies with plates you shoot off.
  * Exfil as a way to "win".
  * Armor vests and a crafting / Armory station.
  * A free self-revive for solo players.

### Review references and design choices (October 2026)

These are design references, not a claim that ACI reproduces another game's exact tuning.

| Primary source | Lesson applied in ACI |
|---|---|
| [Valve: The AI Systems of Left 4 Dead](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf), especially dramatic pacing and special-infected placement | Preserve wave breathers, cap concurrent specials even in frenzy waves, and help players find the last enemies instead of prolonging empty cleanup. |
| [Tripwire: Killing Floor 2 overview](https://killingfloor2.com/overview/) | Keep resupply and distinct enemy roles readable. Special windups now have grounded area / charge-lane warnings and short counterplay prompts. |
| [Treyarch: Black Ops 6 Zombies reveal](https://www.callofduty.com/blog/2024/08/call-of-duty-next-black-ops-6-reveal-zombies-liberty-falls-showcase-intel) | Make progression and survival objectives legible; provide a short recovery window after reviving and keep exfil an achievable end to a run. |
| [Nexon: Zombie Scenario team play announcement](https://store.steampowered.com/news/posts/?appids=273110&enddate=1435046368) | Teammates should support boss fights and extraction: allies now travel to and defend the landing zone instead of shopping or following a distant player. |

The October review also fixes swipes, charges, slams, revives and pickups through cover;
swipes switching targets mid-windup; abandoned revives blocking bleed-out; armor absorbing
more damage than it has left; missing radar updates; and simulation changes after game over.
Presentation fixes include frame-rate-independent forge rotation and acid effects, cached
weapon models staying invisible after forging, and pooled zombie animation state carrying
over into a fresh spawn. Facial details, clothing seams, torn fabric, badges and subtle
vertex shading reuse the existing merged body-part meshes.
Static machine and shutter pieces are batched by material while named animation pivots
remain intact. Prop lighting is applied once per material; wall weapons get local material
copies so their baked lighting cannot darken held weapons or later matches.
In the fixed 24-zombie medium-preset profile, batching reduced mode-prop submissions from
540 to 272 and total draw calls from 1,335 to 1,067. This measures submission reduction;
frame rate still varies with laptop load and the active scene.

## Waves

| Rule | Value (Normal) |
|---|---|
| Health | 150 at wave 1, +100 per wave to wave 9 (950), then ×1.1 per wave |
| Zombies per wave | `24 + 0.5·6·mult` solo, `24 + (n−1)·0.6·6·mult` with *n* players (bots count 0.6). `mult = max(1, wave/5)`, ×`0.15·wave` from wave 10. Waves 1–5 scale by 0.25 / 0.3 / 0.5 / 0.7 / 0.9. Solo: 6, 8, 13, 18, 24 … 33 at wave 10 |
| Max alive at once | 24 |
| Spawn delay | 2 s × 0.95 per wave (floor 0.12 s) |
| Speed | `8 × wave + rand(0..34)`: ≤35 walk, ≤70 run, else sprint. Wave 1 always walks; everything sprints by wave 9 |
| Between waves | 10 s (the first wave starts after 7 s) |
| Frenzy waves | 6, 11, 16…: sprinters, crawlers and bombers pour in fast. The last kill drops a Max Ammo |
| Boss waves | 10, 15, 20…: a Juggernaut joins the wave once a quarter of it has spawned |

**Spawning** follows the Left 4 Dead approach:

* Zombies climb out of the floor at points in **open** zones, between 9 and 42 m from the squad.
* Points in the squad's own zone or next to it are preferred.
* Points nobody can see are preferred.

Frenzy waves respect the per-type concurrent limits. Once every enemy has spawned and
three or fewer remain, the HUD marks those stragglers to keep cleanup moving.

**Safety rules** keep a wave from stalling:

* A zombie that can't reach anyone, or hasn't moved for 8 s while out of sight, climbs out
  somewhere else.
* If a wave goes 75 s without a kill, every unseen zombie re-emerges near the squad.

## Zombie types

| Type | Role | First wave (Normal) | Counterplay |
|---|---|---|---|
| **Shambler** | ACI staff in office, factory, lab-coat or security outfits. 50 damage a swipe; two hits down you | 1 | Headshots; knife the first waves |
| **Sprinter** | Always sprints, 0.75× health | 3 | Don't get flanked; SMGs and shotguns |
| **Crawler** | Crawls on the floor, small and low | 4 | Look down; explosives |
| **Brute** | 2.6× health, 75 damage a hit | 6 | Back up and headshot |
| **Bloater** | Bursts into a toxic gas cloud when it dies (9 HP/s, slows you) | 5 | Kill it at range, away from corridors you need |
| **Bomber** | Beeps and explodes next to you; also explodes when killed, wrecking nearby zombies, wire and barricades | 6 | Shoot it inside the horde |
| **Spitter** | Keeps its distance and lobs acid that leaves burning pools | 8 | Close in or break line of sight |
| **Firefighter** | Armored: the helmet blocks headshots, the plates soak body shots; immune to fire until stripped | 12 | Shoot the helmet off; explosives strip plates |
| **Shrieker** | Screams: nearby zombies enrage (+35% speed), you're rattled, and 2 more zombies join the wave | 10 | Priority target |
| **Juggernaut** (boss) | Roars, charges in a straight line (60 damage and a knockback), slams the ground. Dazed after hitting a wall, taking **double damage** | Boss waves | Sidestep the charge, then unload while it's dazed |

On other difficulties the special zombies arrive a few waves earlier (Hardened, Nightmare) or
later (Casual).

## Points and money

| Action | Points |
|---|---|
| Hit (non-lethal) | 10 |
| Kill: limb / body / head / knife / explosive | 50 / 60 / 100 / 130 / 50, plus a bonus for specials (30–50) |
| Juggernaut killed | 500 to every player |
| Revive a teammate | 50 |
| Wave cleared (each standing player) | `min(1000, 100 + 25 × wave)` |
| Nuke / Carpenter / Bonus Points | 400 / 200 / 500 each |
| Going down / bleeding out | Lose 5% / 10% |

Player guns do 2× their Search & Destroy damage to zombies. Knives do 3×, explosives 1.6× and
fire 2.5×.

## Buying things (press the Use key, F)

* **Doors:** 15 security shutters, 750–1,500 each. They unlock eight zones: Main Lobby (start),
  Conference & North Hall, Mid Corridor, Engineering, Server & Mail Rooms, Assembly & Factory,
  Shipping & Receiving, and the Loading Yard. Five doorways stay boarded up for good.
* **Wall weapons:** 14 guns mounted on the walls, 500–2,800. Ammo costs half the gun's price;
  a forged gun's ammo costs 2,500.
* **Mystery Box:** 950. Look for the blue light beam.
  * It gives a random gun, the Disruptor wonder weapon included, and never one you already
    carry.
  * Pulls 1–3 are safe. Pulls 4–7 have a 15% chance of the teddy bear; the box then moves and
    your points are refunded.
  * The 8th pull always moves it the first time. After that, pulls 8–12 move it 30% of the
    time and pull 13+ 50%.
* **Prototype Forge** (Pack-a-Punch): 5,000, needs power. The upgraded gun gets 2× damage, a
  1.5× magazine, 2× reserve, +10% fire rate, a new name and a glowing violet camo.
* **Perks** (4 at most; all need power except Second Wind):

| Perk | Price | Effect |
|---|---|---|
| Iron Gut | 2,500 | Max health 250 |
| Second Wind | 1,500 (solo 500) | Revive teammates twice as fast. Solo: get back up on your own (3 purchases) |
| Quick Hands | 3,000 | Reload and swap twice as fast |
| Rapid Fire | 2,000 | +33% fire rate, +20% damage |
| Marathon | 2,000 | Run 12% faster |
| Dead Eye | 1,500 | 35% tighter spread, +25% headshot damage |
| Blast Shield | 2,000 | Immune to your own explosives and falls; zombie blasts and gas hurt far less |
| Shock Charge | 2,000 | Reloading releases an electric blast (bigger when the magazine is emptier) |

* **Armory** (in the lobby):
  * Lethals: frags, stun grenades, Molotovs, and Lure Beacons (a zombie-luring tune that
    explodes).
  * Defenses: trip mines, barbed wire, barricades.
  * Support: Kevlar, armor plates, a stim pistol, an ammo crate, a self-revive kit.
  * Armor soaks half of every hit.
* **Power switch** (Server Room): turns on the perk machines and the forge, and lights up the
  building.

You also get 2 free frags every wave, up to 4.

## Power-ups

Every kill has a 2% chance of a drop (3% on Casual). A drop is also forced each time the
team's total points pass a threshold: 2,000 first, with each step 14% bigger than the last.
There are at most 4 drops per wave. Drops last 26 s and blink for the last 11.

* **Max Ammo:** full reserves for everyone.
* **Insta-Kill** (30 s): any hit kills; the Juggernaut takes 12% of its health per hit.
* **Double Points** (30 s).
* **Nuke:** every zombie dies, the boss takes 25%, +400 points each.
* **Carpenter:** repairs barricades and wire, +50 armor and +200 points each.
* **Fire Sale** (30 s): the Mystery Box costs 10.
* **Bonus Points:** +500 each.

## Going down

Health regenerates 3.5 s after the last hit, at 45 HP/s.

**When you drop to 0** you go down instead of dying:

* You keep shooting your pistol and crawl.
* Teammates revive you by holding F next to you: 3 s, or 1.5 s with Second Wind.
* You come back with half health but lose your perks.
* Reviving requires an unobstructed teammate on the same level. One teammate owns the
  revive at a time; going down or moving out of reach cancels it.
* Revives and next-wave respawns grant **2.5 s of damage protection**, with a HUD countdown,
  so the squad has time to move out of the horde.
* After 45 s you bleed out (60 on Casual, 35 Hardened, 25 Nightmare). You then spectate and
  respawn at the start of the next wave with a pistol.

**Solo:** you start with **one free self-revive kit**, and Second Wind or a kit from the
Armory gets you up again. Otherwise going down ends the game. With a squad, the game ends
only when everyone is down at once.

## Exfil (the way to win)

**Short** games unlock exfil from wave 10 (then 15, 20…), **Long** games from wave 20.
**Endless** has no exfil.

1. During an exfil wave, use the radio on the lobby reception desk.
2. The Yard Gate and the minimum additional shutters needed for a route from reception
   open for free. You have 75 s to reach the landing zone in the Loading Yard
   (red smoke, an H on the ground).
3. Hold it for 60 s while the horde keeps coming.
4. When the chopper lands, anyone standing in the zone gets out and you win. Failing either
   timer ends the game.

## Bot teammates

`AllyBot` uses the same aim model as the Search & Destroy bots (reaction time, aim error,
spray control). Allies are on *Hard* for Casual / Normal and *Normal* above that. In order of
priority, they:

1. Get away from lit bombers, gas and acid.
2. Revive downed teammates, unless they're being mauled and almost dead.
3. Shoot the most dangerous visible zombie (bombers, screamers and spitters first). They back
   away from anything within 4 m, throw frags into clusters, and quick-melee at point blank.
4. Pick up nearby power-ups.
5. Shop when it's quiet: perks (Iron Gut first), better wall weapons, ammo, armor, a forge
   upgrade when the power's on, and the box when their guns are poor.
6. Follow you in a loose formation and watch the directions you're not looking.

Bots take 20% less damage than players so they can carry their weight. In **Watch bots** an
all-bot squad also turns on the power and opens doors. With you in the squad, doors are your
call, and bots help with the power from wave 6.

Once exfil is called, allies prioritize reaching and defending the LZ while shooting.
They still avoid hazards and help downed teammates, but do not detour to shop or collect
power-ups during extraction.

## Difficulty

| | Casual | Normal | Hardened | Nightmare |
|---|---|---|---|---|
| Zombie health | ×0.7 (stops growing after wave 20) | ×1 | ×1.2 | ×1.45 |
| Zombie damage | ×0.7 (3 hits down) | ×1 | ×1.2 | ×1.4 |
| Speed rule | 6 × wave | 8 × wave | 9 × wave | 11 × wave |
| Zombie count | ×0.8 | ×1 | ×1.15 | ×1.3 |
| Specials | 2 waves later | — | 1 wave earlier | 2 waves earlier |
| Start points / bleed-out | 750 / 60 s | 500 / 45 s | 500 / 35 s | 500 / 25 s |

## Presentation

**Zombies:**

* Procedural humanoids with one merged, vertex-coloured mesh per body part (about 11 draw
  calls each).
* Glowing eyes coloured by type, and type-specific gear: hi-vis vests, fire helmets, gas
  canisters, a bloated belly, the Juggernaut's plates.
* Animations: shamble with a limp, sprint, crawl, two-stage swipe, scream, roar, charge,
  ground slam, climbing out of the floor, death falls, and corpses sinking away.
* Headshot kills pop the head.
* Bomber fuses and ground slams have radius rings; the Juggernaut's charge has a lane
  clipped against cover. These warnings are depth-tested so walls still obscure them.
* Off-screen body parts use frustum culling, and pooled spawns reset their gait state.

**World:**

* Rolling security shutters with price signs.
* Perk vending machines that light up with the power.
* A Mystery Box with a light beam, a music-box tune and cycling guns.
* The forge's spinning core, a power lever, power-up tokens, green gas, acid pools and spit.
* The exfil helicopter.

**Mood:**

* The building is dimmer until the power comes on.
* Frenzy waves turn the fog red.
* Wave numbers use CoD-style tally marks for 1–5, then a blood-red number.
* Synthesized groans, screams and roars are capped at 4 voices per half-second.

## Testing

| Command | What it covers |
|---|---|
| `npm test` | `tests/zombies.test.ts`: formulas, layout validity (machines against walls and clear of props, gates on real doorways, zones cover the floor, gates block nav), waves, points, purchases, perks, downs, revives and solo self-revive, bombers and bloaters, power-ups, box and forge, every zombie kind, a bot squad surviving on its own, and the motor never tunnelling through walls |
| `npx vitest run tests/zombies-review.test.ts` | Regression coverage for attacks through cover, committed swipes, armor capacity / feedback, revive cancellation / ownership / timing / protection, radar updates, frenzy caps, pickups through cover, a locked-lobby exfil route, bot extraction orders and post-game state |
| `npx vitest run tests/zombies-models.test.ts` | Material lighting isolation, batching while retaining animated pivots / LEDs, and cached geometry ownership |
| `SOAK=1 npx vitest run tests/zombies-soak.test.ts --silent=false` | Long all-bot games (5 / 3 / 1 bots). Checks no wave stalls and nobody ends up in a closed area, and prints progression and per-system timings. About 0.3–0.5 ms per simulation tick |
| `npm run check:boot` | CI: boots S&D *and* Zombies from the GitHub Pages sub-path |
| `npm run test:zombies` | Browser run through the new menus and a real game, then staged shots of every zombie type, the machines, power-ups, hazards, downed / revive, armory, exfil and the end screen, plus horde FPS. Fails on console errors. Screenshots go to `screenshots/zombies/` |
| `node scripts/zombies-perf.mjs --no-build` | A fixed 24-zombie scene with CPU update / render timings, draw-call counts, culling comparison and prop-cost isolation. Writes `screenshots/zombies/performance.json`. FPS varies with laptop load; compare submission counts as well as frame rate. |
