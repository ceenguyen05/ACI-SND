# Maps

Search & Destroy has two maps. When starting or creating a match, players pick **ACI HQ**,
**ACI Building 2** or **Randomize** (the game picks one when the match starts). Zombies is always
played on ACI HQ.

| Map | File | Size | Character |
|---|---|---|---|
| [ACI HQ](#aci-hq) | [`src/sim/maps/aciHq.ts`](../src/sim/maps/aciHq.ts) | 120 × 80 m | Offices west, radar plant east: cubicle fights at B, long factory sightlines at A |
| [ACI Building 2](#aci-building-2) | [`src/sim/maps/aciB2.ts`](../src/sim/maps/aciB2.ts) | 106 × 76 m | Engineering offices only: the café at B, the prototype lab at A, a parking-lot attack |

The pool lives in [`src/sim/maps/index.ts`](../src/sim/maps/index.ts). Online, a room keeps its owner's
choice. Public queues match "Randomize" with any map and narrow the room to the first specific choice
that joins; the server rolls "Randomize" when the match starts.

## Spawns

Spawns change every round on both maps:

* **Attackers** start together in one of three areas at the back of the yard or lot, never the same
  area two rounds in a row.
* **Defenders** start on the bombsites. The team is split at random between **A Defence** and
  **B Defence** (2/3 or 3/2 in a 5v5; a lone Defender starts at A or B at random).
* Every player gets a spot they did not have the round before, nudged up to 0.75 m, and faces the
  site entrances (Defenders) or the building (Attackers).
* The areas in use that round are the buy zones; the radar shades your team's zones during buy time.
* No Attacker spawn can see a Defender spawn.

Areas are `spawnAreas` in each map file; `tests/game/spawns.test.ts` checks the per-round rules.

## ACI HQ

ACI HQ is a single-story headquarters, 120 m × 80 m. Run `npm run map:ascii` to reprint the grid below.

It is modelled on a 1981 single-story flex / R&D building in Richardson, Texas (about 40,000 sq ft
on a 2.8-acre lot) where traffic radar, lidar and speed-sign electronics are designed, built and
tested. The playable map is roughly 2.5× the real floor area, so the layout is game-first: the
real building informs what is inside each room, not the room sizes.

* **West half:** office. Engineering bullpen (**B site**), two conference rooms, an engineering
  cubicle block, break room, server room, mail room, and the main lobby.
* **East half:** production. Radar assembly line (**A site**), a test floor with environmental
  chambers, burn-in racks and an RF test chamber, warehouse racking, and shipping & receiving
  with three loading docks.
* **South strip:** outdoor loading yard (**Attacker spawns**: the back of the yard, the staff
  parking or the docks), with trucks, a trailer, barriers, a dumpster, and staff parking (a demo
  patrol car, a sedan and a radar speed trailer).
* **Defender spawns:** A Defence (the assembly line) and B Defence (the bullpen).

```
    0         1         2         3         4         5         
    012345678901234567890123456789012345678901234567890123456789
  0 ############################################################
  1 #oooooooooooooo#cccc#ccc#llllllllllllll#fffffffffffffffffff#
  2 #oooooooooooooo#cccc#ccc#lCCCCCCCllllll#fffffffffffffffffff#
  3 #oooBBBBBBBBooo#cccc#ccc#lCCCCCCCllllll#fffffAAAAAAAAAAffff#
  4 #oooBBBBBBBBooocccccccccllCCCCCCCllllll#fffffAAAAAAAAAAffff#
  5 #oooBBBBBBBBooo#cccc#ccc#lCCCCCCCllllllffffffAAAAAAAAAAffff#
  6 #oooBBBBBBBBooo#cccc#ccc#llllllllllllllffffffAAAAAAAAAAffff#
  7 #oooBBBBBBBBooo#cccc#ccc#llllllllllllll#fffffAAAAAAAAAAffff#
  8 #oooBBBBBBBBooo##t####t#####ttt#########fffffAAAAAAAAAAffff#
  9 #oooBBBBBBBBooo#ttttttttttt#ttt#wwwwwww#fffffAAAAAAAAAAffff#
 10 #oooBBBBBBBBoootttttttttttttttt#wwwwwwwffffffffffffffffffff#
 11 #ooooooooooooootttttttttttttttt#wwwwwwwffffffffffffffffffff#
 12 #oooooooooooooo#####oo######ttt#wwwwwww#fffffffffffffffffff#
 13 #oooooooooooooo#ooooooooooo#ttt#wwwwwww################ffff#
 14 ###kk######kk###ooooooooooo#ttt#wwwwwww#fffffffffffffffffff#
 15 #kkkkkkkkkkkkkk#ooooooooooo#tttwwwwwwww#fffffffffffffffffff#
 16 #kkkkkkkkkkkkkk#ooooooooooo#tttwwwwwwww#fffffffffffffffffff#
 17 #kkkkkkkkkkkkkk#ooooooooooo#ttt#wwwwwwwffffffffffffffffffff#
 18 #kkkkkkkkkkkkkkoooooooooooo#ttt#wwwwwwwffffffffffffffffffff#
 19 #kkkkkkkkkkkkkkooooooooooootttt#wwwwwww#fffffffffffffffffff#
 20 #kkkkkkkkkkkkkk#oooooooooootttt#wwwwwww#fffffffffffffffffff#
 21 #kkkkkkkkkkkkkk#ooooooooooo#ttt#wwwwwww#fffffffffffffffffff#
 22 #kkkkkkkkkkkkkk#ooooooooooo#ttt#wwwwwww#fffffffffffffffffff#
 23 ###ss###############mm######ttt###www#############wwww######
 24 #sssssssss#mmmmmmmmmmmmmmmm#ttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 25 #sssssssss#mmmmmmmmmmmmmmmmtttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 26 #sssssssss#mmmmmmmmmmmmmmmmtttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 27 #sssssssssmmmmmmmmmmmmmmmmm#ttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 28 #sssssssssmmmmmmmmmmmmmmmmm#ttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 29 #sssssssss#mmmmmmmmmmmmmmmm#ttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 30 #sssssssss#mmmmmmmmmmmmmmmm#ttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 31 #sssssssss#mmmmmmmmmmmmmmmm#ttt#wwwwwwwwwwwwwwwwwwwwwwwwwww#
 32 ######ss##########mm########ttt#####www#######www#####www###
 33 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 34 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 35 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 36 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 37 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 38 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 39 ############################################################
```

Legend:

| Char | Area | Char | Area |
|---|---|---|---|
| `#` | wall | `t` | hallway |
| `o` | office | `k` | break room |
| `B` | bombsite B | `s` | server room |
| `c` | conference | `m` | mail room |
| `l` | lobby | `f` | factory |
| `C` | lobby centre | `A` | bombsite A |
| `w` | warehouse / shipping | `y` | loading yard |
| `T` | T spawn | | |

Each cell is 2 m. North is up (−Z).

### Callouts

| Callout | Where | Notes |
|---|---|---|
| **A Site** | NE assembly line | Conveyor (crouch cover) carrying radar units, two environmental test chambers, a caged robot test cell, crate stack, pillars |
| **A Long** | Test floor → A's south opening | Long sightline, RF test chamber, forklift, rows of test chambers and burn-in racks |
| **A Short** | Warehouse racks | Connects mid, A, the factory floor and shipping; tall racking with tight aisles |
| **Lobby** | North center | Reception desk; doors to A ("ASSEMBLY · A"), Conference and mid |
| **Mid** | Central N–S hallway | 48 m sightline from the yard to the lobby, broken by the "mid doors" partition |
| **B Site** | NW engineering bullpen | Four cubicle pods (1.4 m partitions: crouch to hide; each desk has a 1 m entrance beside the spine), whiteboard, cabinets |
| **B Hall** | North hall | Copier and vending machines; connects mid, Conference and B |
| **Cubicles** | West center | Engineering cubicles; links mid, B Hall, Break Room and Mail Room |
| **Break Room** | West | Kitchen counter, tables, vending; two doors into B |
| **Server Room** | SW ("B tunnels") | Server rack rows; yard → server → break room → B |
| **Mail Room** | SW center | Sorting shelves and packing tables |
| **Shipping** | SE | Pallet racks, pallets, a shipping container, three dock doors to the yard |
| **T Spawn / Loading Yard** | South, outdoors | Box truck, trailer, jersey barriers, light poles |

### Building CCTV (Defenders)

| Camera | Mount | Watches |
|---|---|---|
| CCTV · A Site | NW corner of the assembly line, 5.5 m up | A site and the conveyor |
| CCTV · A Long | SE corner of the factory floor | The A Long approach |
| CCTV · Mid | North end of the mid hallway | Down mid toward the yard |
| CCTV · B Site | SE corner of the bullpen | B site cubicles |
| CCTV · Shipping | West wall of shipping | The docks and pallets |
| CCTV · Loading Yard | Building façade above the mail room | Attacker spawn |

Positions are listed in `cctv` in `src/sim/maps/aciHq.ts`.

Traffic products on show: a radar speed sign and product showcases (traffic and sports radar) in the
lobby, a pole-mounted radar test rig and a lidar tripod on the test floor, a plate-reader camera
watching the yard lane, and a radar speed-feedback sign and speed trailer by the staff parking.

### Main routes

| Route | Path | Run time |
|---|---|---|
| Attackers → A Long | Yard → Dock 1 → Shipping → Factory floor → A | ≈11–15 s |
| Attackers → A Short | Yard → Mid → Warehouse → A | ≈12 s |
| Attackers → B Tunnels | Yard → Server Room → Break Room → B | ≈11–17 s |
| Attackers → B Main | Yard → Mail Room → Cubicles → Break Room → B | ≈13 s |
| Attackers → Mid to B | Yard → Mid → B Hall → B | ≈14 s |
| Defender rotation A ↔ B | Assembly line → Lobby → Conference rooms → Bullpen | ≈16–17 s |

Run times depend on the round's Attacker area: the staff parking is closest to B, the docks to A.

Automated checks in `tests/game/map.test.ts` run on every map and cover:
* every spawn spot, plant spot and AI waypoint is walkable; spawn spots have room to stand (with the
  random offset), are 3 m apart and inside their area; no Attacker spawn can see a Defender spawn;
* every Attacker area reaches both sites in 8–25 s, Defenders start on site and rotate in under 20 s,
  and every bot route is traversable from every Attacker area;
* every room is reachable, every doorway can be walked through, every floor cell has a callout;
* no solid prop intersects a wall or another prop, every prop fits under its ceiling, and wall-hung
  props, signs, cameras and lights are on a wall or inside a room.

`tests/game/props.test.ts` builds every prop kind in all four facings and checks that its parts stay
inside the footprint (except listed overhangs, such as chairs pulled up to a table).

## ACI Building 2

ACI Building 2 is the company's single-story engineering office: 106 m × 76 m including its front
parking lot. It is strictly offices and engineering labs, with no production floor and no warehouse.
It is modelled on a 1980s Richardson-area office building of about 25,000 sq ft. Like ACI HQ, the game
map is about 2.4× the real floor area, so realism goes into what each room holds. Run
`npm run map:ascii -- aci_b2` to reprint the grid (`--props` overlays solid props).

* **North:** the café (**B site**, B Defence spawn), boardroom and a coffee bar, the skylit atrium,
  executive conference and a second coffee bar, and the prototype lab (**A site**, A Defence spawn).
* **Middle:** party room, restrooms, wellness room and janitor's closet, the main hall (**mid**) with
  security turnstiles, server room, copy & mail, and the engineering bullpen.
* **South:** mechanical/electrical room, training room, main lobby, private offices and the RF /
  antenna lab.
* **Outside:** the front parking lot (**Attacker spawns**: front plaza, west lot or east lot) with the entrance canopy, monument sign,
  staff cars, the demo patrol car, a radar speed trailer, field-test radar poles, plate-reader cameras,
  a photo-enforcement camera and a radar speed-feedback sign.

```
    0         1         2         3         4         5  
    01234567890123456789012345678901234567890123456789012
  0 #####################################################
  1 #kkkkkkkkkkkkk#ccccc#aaaaaaaaaaa#ccccc#eeeeeeeeeeeee#
  2 #kkBBBBBBBBBkk#ccccc#aaCCCCCCCaa#ccccc#eeAAAAAAAAAee#
  3 #kkBBBBBBBBBkkcccccc#aaCCCCCCCaa#cccccceeAAAAAAAAAee#
  4 #kkBBBBBBBBBkk#ccccc#aaCCCCCCCaa#ccccc#eeAAAAAAAAAee#
  5 #kkBBBBBBBBBkk#ccccc#aaCCCCCCCaa#ccccc#eeAAAAAAAAAee#
  6 #kkBBBBBBBBBkk###q###aaaaaaaaaaa###q###eeAAAAAAAAAee#
  7 #kkBBBBBBBBBkkqqqqqqqaaaaaaaaaaaqqqqqqqeeAAAAAAAAAee#
  8 #kkkkkkkkkkkkkqqqqqqqaaaaaaaaaaaqqqqqqqeeeeeeeeeeeee#
  9 #kkkkkkkkkkkkk#qqqqq#aaaaaaaaaaa#qqqqq#eeeeeeeeeeeee#
 10 #####p######t############ttt############t######o#####
 11 #ppppppppp#tt#rrrrr#rrrr#ttttttttttttttttt#ooooooooo#
 12 #pppppppppptt#rrrrr#rrrr#ttttttttttttttttt#ooooooooo#
 13 #pppppppppptt#rrrrr#rrrr#ttt###s####mm##tt#ooooooooo#
 14 #ppppppppp#tt###r####r###ttt#sssss#mmmm#tt#ooooooooo#
 15 #ppppppppp#ttttttttttttttttt#sssss#mmmm#tt#ooooooooo#
 16 #ppppppppp#ttttttttttttttttt#sssss#mmmm#ttoooooooooo#
 17 #ppppppppp#tt###o####j###ttt#sssss#mmmm#ttoooooooooo#
 18 #ppppppppp#tt#ooooo#jjjj#ttt#sssss#mmmm#tt#ooooooooo#
 19 #ppppppppp#tt#ooooo#jjjj#ttt#sssss#mmmm#tt#ooooooooo#
 20 ##hh#######tt############ttt############tt#######ff##
 21 #hhhhh#ttttttttttttttllllllllllltttttttttttttt#fffff#
 22 #hhhhh#ttttttttttttttllllllllllltttttttttttttt#fffff#
 23 #hhhhh#tt####g###g###lllllllllll##o###o##o##tt#fffff#
 24 #hhhhh#tt#gggggggggg#lllllllllll#ooo#ooo#oo#tt#fffff#
 25 #hhhhh#tt#gggggggggg#lllllllllll#ooo#ooo#oo#tt#fffff#
 26 #hhhhh#tt#gggggggggg#lllllllllll#ooo#ooo#oo#tt#fffff#
 27 ##hh###tt################lll################tt###ff##
 28 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 29 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 30 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 31 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 32 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
 33 #yyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyy#
 34 #yyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyy#
 35 #yyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyy#
 36 #yyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyy#
 37 #####################################################
```

Legend: `#` wall · `k` café · `B` bombsite B · `c` conference · `q` coffee bar · `a` atrium · `C` atrium centre ·
`e` prototype lab · `A` bombsite A · `p` party room · `t` hallway · `r` restroom · `o` office / bullpen ·
`j` janitor · `s` server room · `m` copy & mail · `h` mechanical · `g` training room · `l` lobby ·
`f` RF lab · `y` parking lot · `T` T spawn. Each cell is 2 m; north is up.

### Callouts

| Callout | Where | Notes |
|---|---|---|
| **B Site** | NW café | Booth islands (crouch cover), high-tops, coffee bar, kitchen, vending; one door from the party room, one from B Hall |
| **Boardroom / B Coffee** | Between the atrium and B | Defender rotation into B (a coffee bar door and a boardroom door) |
| **Atrium** | North centre | Video wall, traffic and sports-radar showcases, a live speed-sign demo, a pitching-net display; links mid and both coffee bars |
| **Exec Conference / A Coffee** | Between the atrium and A | Defender rotation into A |
| **A Site** | NE prototype lab | ESD benches with scopes and radar units under test, double-sided bench islands, an environmental chamber, a lidar tripod and a pole-mount rig |
| **Party Room** | West middle | Ping pong, foosball, arcade cabinets, TV lounge; doors to B, B Hall and Mechanical |
| **B Hall** | West hallway | Runs from the west corridor to B; phone booth and water fountain |
| **Restroom Hall** | Mid → B Hall | Men's and women's restrooms, wellness room, janitor |
| **Mid** | Main hall | Lobby → security turnstiles → atrium; the main Defender sightline |
| **Lab Hall** | Mid → A Hall | Product history case; server room and copy & mail open off it |
| **A Hall** | East hallway | Runs from the east corridor to A |
| **Bullpen** | East middle | Engineering cubicles; doors to A, A Hall and the RF lab |
| **Mechanical** | SW | Air handler, switchgear, water heaters; service door from the lot ("B Service") |
| **Training Room / West Entrance** | South-west | Class tables facing a projection screen; west entrance vestibule |
| **Lobby** | South centre | Reception in front of a logo wall that blocks the entrance-to-mid sightline, showcases, lounges |
| **Offices / East Entrance** | South-east | Three private offices; east entrance vestibule |
| **RF Lab** | SE | Shielded RF chamber, benches, lidar tripod; field-test door to the lot ("A Long") |
| **T Spawn / Parking Lot** | Outside | Entrance plaza, two parking rows, a drive aisle; poles and cameras at the ends |

### Main routes

| Route | Path |
|---|---|
| Attackers → B Service | Lot → service door → Mechanical → Party Room → B |
| Attackers → B Hall | Lot → west entrance → west corridor → B Hall → B |
| Attackers → Mid to B | Lot → lobby → mid → restroom hall → B Hall → B |
| Attackers → A Long | Lot → field-test door → RF Lab → Bullpen → A |
| Attackers → A Hall | Lot → east entrance → east corridor → A Hall → A |
| Attackers → Mid to A | Lot → lobby → mid → lab hall → A Hall → A |
| Defender rotation A ↔ B | Lab → coffee bar → atrium → coffee bar → café, about 15 s |

Attackers reach a site in about 10–16 s depending on the round's area (the west lot is closest to B,
the east lot to A).

### Building CCTV (Defenders)

| Camera | Watches |
|---|---|
| CCTV · A Site / B Site | Each site from its back corner |
| CCTV · Mid | Down the main hall toward the lobby |
| CCTV · Party Room / Bullpen | The B and A approaches |
| CCTV · Lobby | The main entrance |
| CCTV · Parking Lot | Attacker spawn, from the façade |

## Editing a map

* **Rooms:** `g.rect(c0, r0, c1, r1, char)` fills a block of cells.
* **Doors:** `g.door(...)` carves an opening and records a lintel height.
* **Props:** world-space boxes `P(kind, x, z, w, d, h)`. Their visuals come from
  [`src/render/Props.ts`](../src/render/Props.ts), and their collision comes from the box itself.
  Cubicle pods and the speed trailer are compound: their partitions, desks and panels come from
  [`src/sim/world/PropShapes.ts`](../src/sim/world/PropShapes.ts), which both collision and visuals
  read, so what you see is what you collide with.
* **Motion:** fans, conveyor products, the test-cell robot, status LEDs and speed displays are
  animated by [`src/render/MapAnimation.ts`](../src/render/MapAnimation.ts). It is cosmetic,
  driven by wall-clock time, and never touches the simulation.
* **Signs and floor paint** are `signs` / `floorLines` in the map file.
* **Lighting:** prop changes alter the bake hash. Run `npm run bake` (all maps) or
  `npm run bake -- aci_b2` after editing a map.
* **Lights, spawn areas (which are also the buy zones), sites, plant spots, callouts and bot hold spots / routes** are
  plain data in the same file.

Run `npm test` after editing to re-validate connectivity and placement. A new map also needs an
entry in `src/sim/maps/index.ts` and a bake.
