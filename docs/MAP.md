# Map — ACI HQ

The map is a single-story headquarters, 120 m × 80 m, defined in [`src/sim/maps/aciHq.ts`](../src/sim/maps/aciHq.ts).
Run `npm run map:ascii` to reprint the grid below.

* **West half:** office. Engineering bullpen (**B site**), two conference rooms, an engineering
  cubicle block, break room, server room, mail room, and the main lobby (**Defender spawn**).
* **East half:** manufacturing. Assembly line (**A site**), factory floor, warehouse racking,
  and shipping & receiving with three loading docks.
* **South strip:** outdoor loading yard (**Attacker spawn**), with trucks, a trailer, barriers
  and a dumpster.

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
 34 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 35 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 36 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 37 #yyyyyyyyyyyyyyyyyyyyyyyTTTTTTTTTTTTTyyyyyyyyyyyyyyyyyyyyyy#
 38 #yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy#
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
| `C` | CT spawn | `A` | bombsite A |
| `w` | warehouse / shipping | `y` | loading yard |
| `T` | T spawn | | |

Each cell is 2 m. North is up (−Z).

## Callouts

| Callout | Where | Notes |
|---|---|---|
| **A Site** | NE assembly line | Conveyor (crouch cover), two CNC machines, a caged robot cell, crate stack, pillars |
| **A Long** | Factory floor → A's south opening | Long sightline, hydraulic press, forklift, CNC rows |
| **A Short** | Warehouse racks | Connects mid, A, the factory floor and shipping; tall racking with tight aisles |
| **CT Lobby** | North center | Defender spawn; reception desk; doors to A ("ASSEMBLY · A") and Conference |
| **Mid** | Central N–S hallway | 48 m sightline from the yard to the lobby, broken by the "mid doors" partition |
| **B Site** | NW engineering bullpen | Four cubicle pods (1.4 m partitions: crouch to hide), whiteboard, cabinets |
| **B Hall** | North hall | Copier and vending machines; connects mid, Conference and B |
| **Cubicles** | West center | Engineering cubicles; links mid, B Hall, Break Room and Mail Room |
| **Break Room** | West | Kitchen counter, tables, vending; two doors into B |
| **Server Room** | SW ("B tunnels") | Server rack rows; yard → server → break room → B |
| **Mail Room** | SW center | Sorting shelves and packing tables |
| **Shipping** | SE | Pallet racks, pallets, a shipping container, three dock doors to the yard |
| **T Spawn / Loading Yard** | South, outdoors | Box truck, trailer, jersey barriers, light poles |

## Building CCTV (Defenders)

| Camera | Mount | Watches |
|---|---|---|
| CCTV · A Site | NW corner of the assembly line, 5.5 m up | A site and the conveyor |
| CCTV · A Long | SE corner of the factory floor | The A Long approach |
| CCTV · Mid | North end of the mid hallway | Down mid toward the yard |
| CCTV · B Site | SE corner of the bullpen | B site cubicles |
| CCTV · Shipping | West wall of shipping | The docks and pallets |
| CCTV · Loading Yard | Building façade above the mail room | Attacker spawn |

Positions are listed in `cctv` in `src/sim/maps/aciHq.ts`.

## Main routes

| Route | Path | Run time |
|---|---|---|
| Attackers → A Long | Yard → Dock 1 → Shipping → Factory floor → A | ≈15 s |
| Attackers → A Short | Yard → Mid → Warehouse → A | ≈12 s |
| Attackers → B Tunnels | Yard → Server Room → Break Room → B | ≈15 s |
| Attackers → B Main | Yard → Mail Room → Cubicles → Break Room → B | ≈13 s |
| Attackers → Mid to B | Yard → Mid → B Hall → B | ≈14 s |
| Defenders → A | Lobby → A door | ≈3 s |
| Defenders → B | Lobby → Conference 2 → Conference 1 → B | ≈7 s |

Automated checks in `tests/map.test.ts` cover:
* every spawn, plant spot and AI waypoint is walkable;
* both spawns can reach both sites;
* every bot route is traversable;
* no solid prop intersects a wall.

## Editing the map

* **Rooms:** `g.rect(c0, r0, c1, r1, char)` fills a block of cells.
* **Doors:** `g.door(...)` carves an opening and records a lintel height.
* **Props:** world-space boxes `P(kind, x, z, w, d, h)`. Their visuals come from
  [`src/render/Props.ts`](../src/render/Props.ts), and their collision comes from the box itself.
* **Lights, spawns, buy zones, sites, plant spots, callouts and bot hold spots / routes** are
  plain data in the same file.

Run `npm test` after editing to re-validate connectivity.
