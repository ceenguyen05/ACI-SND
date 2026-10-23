import type { DoorDef, FloorType, MapDef, PropDef } from '../world/MapTypes';

/**
 * ACI HQ — single-story office + manufacturing plant.
 *
 * World: 120 m (X, west→east) × 80 m (Z, north→south). Grid cell = 2 m, 60 × 40 cells.
 * West half  : office (B site bullpen, conference rooms, engineering cubicles, break room, server room, mail room).
 * East half  : manufacturing (A site assembly line, factory floor, warehouse racks, shipping & receiving).
 * South strip: outdoor loading yard (Attacker spawn). CT spawn: main lobby (north-center).
 */

const COLS = 60, ROWS = 40, CELL = 2, OX = -60, OZ = -40;

class GridBuilder {
  cells: string[][];
  doors: DoorDef[] = [];
  constructor(cols: number, rows: number, fill: string) {
    this.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
  }
  /** Fill inclusive cell rect. */
  rect(c0: number, r0: number, c1: number, r1: number, ch: string) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r][c] = ch;
    return this;
  }
  /** Carve a door opening through a wall; `lintel` = height of the top of the opening. */
  door(c0: number, r0: number, c1: number, r1: number, ch: string, lintel: number) {
    this.rect(c0, r0, c1, r1, ch);
    this.doors.push({ c0, r0, c1, r1, lintel });
    return this;
  }
  rows(): string[] { return this.cells.map((r) => r.join('')); }
}

const FLOORS: Record<string, FloorType> = {
  o: { name: 'Office', ceiling: 3.4, material: 'carpet', wallMaterial: 'office' },
  B: { name: 'Bombsite B', ceiling: 3.4, material: 'carpetSite', wallMaterial: 'office' },
  c: { name: 'Conference', ceiling: 3.4, material: 'confCarpet', wallMaterial: 'office' },
  l: { name: 'Lobby', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
  C: { name: 'CT Spawn', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
  t: { name: 'Hallway', ceiling: 3.4, material: 'tile', wallMaterial: 'office' },
  k: { name: 'Break Room', ceiling: 3.4, material: 'checker', wallMaterial: 'office' },
  s: { name: 'Server Room', ceiling: 3.4, material: 'serverFloor', wallMaterial: 'office' },
  m: { name: 'Mail Room', ceiling: 3.4, material: 'lino', wallMaterial: 'office' },
  f: { name: 'Factory', ceiling: 9, material: 'concrete', wallMaterial: 'factory' },
  A: { name: 'Bombsite A', ceiling: 9, material: 'concreteSite', wallMaterial: 'factory' },
  w: { name: 'Warehouse', ceiling: 9, material: 'warehouse', wallMaterial: 'factory' },
  y: { name: 'Loading Yard', ceiling: null, material: 'asphalt', wallMaterial: 'exterior' },
  T: { name: 'T Spawn', ceiling: null, material: 'asphaltSpawn', wallMaterial: 'exterior' },
};

function buildGrid() {
  const g = new GridBuilder(COLS, ROWS, '#');
  // ---- rooms -------------------------------------------------------------
  g.rect(1, 1, 14, 13, 'o').rect(4, 3, 11, 10, 'B');        // B site – engineering bullpen
  g.rect(16, 1, 19, 7, 'c').rect(21, 1, 23, 7, 'c');        // conference rooms 1 & 2
  g.rect(25, 1, 38, 7, 'l').rect(26, 2, 32, 5, 'C');        // main lobby / CT spawn
  g.rect(40, 1, 58, 12, 'f').rect(45, 3, 54, 9, 'A');       // A site – assembly line
  g.rect(16, 9, 26, 11, 't');                               // north hall
  g.rect(28, 9, 30, 31, 't');                               // mid corridor
  g.rect(32, 9, 38, 22, 'w');                               // warehouse racks (A short)
  g.rect(16, 13, 26, 22, 'o');                              // engineering cubicles
  g.rect(1, 15, 14, 22, 'k');                               // break room
  g.rect(40, 14, 58, 22, 'f');                              // factory floor (A long)
  g.rect(1, 24, 9, 31, 's');                                // server room (B tunnels)
  g.rect(11, 24, 26, 31, 'm');                              // mail room
  g.rect(32, 24, 58, 31, 'w');                              // shipping & receiving
  g.rect(1, 33, 58, 38, 'y').rect(24, 34, 36, 37, 'T');     // loading yard / T spawn
  // ---- doors -------------------------------------------------------------
  g.door(15, 4, 15, 4, 'c', 2.4);      // bullpen ↔ conf 1
  g.door(20, 4, 20, 4, 'c', 2.4);      // conf 1 ↔ conf 2
  g.door(24, 4, 24, 4, 'l', 2.4);      // conf 2 ↔ lobby
  g.door(17, 8, 17, 8, 't', 2.4);      // conf 1 → north hall
  g.door(22, 8, 22, 8, 't', 2.4);      // conf 2 → north hall
  g.door(28, 8, 30, 8, 't', 3.0);      // lobby → mid
  g.door(39, 5, 39, 6, 'f', 3.0);      // lobby → A (CT ramp)
  g.door(15, 10, 15, 11, 't', 2.4);    // bullpen ↔ north hall (B hall)
  g.door(27, 10, 27, 11, 't', 2.4);    // north hall ↔ mid
  g.door(20, 12, 21, 12, 'o', 2.4);    // north hall ↔ cubicles
  g.door(3, 14, 4, 14, 'k', 2.4);      // bullpen ↔ break room (west)
  g.door(11, 14, 12, 14, 'k', 2.4);    // bullpen ↔ break room (east)
  g.door(15, 18, 15, 19, 'o', 2.4);    // break room ↔ cubicles
  g.door(27, 19, 27, 20, 't', 2.4);    // cubicles ↔ mid
  g.door(3, 23, 4, 23, 's', 2.4);      // break room ↔ server room
  g.door(20, 23, 21, 23, 'm', 2.4);    // cubicles ↔ mail room
  g.door(10, 27, 10, 28, 'm', 2.4);    // server ↔ mail room
  g.door(27, 25, 27, 26, 't', 2.4);    // mail room ↔ mid
  g.door(31, 15, 31, 16, 'w', 3.0);    // mid ↔ warehouse
  g.door(39, 10, 39, 11, 'f', 3.5);    // warehouse → A (A short)
  g.door(39, 17, 39, 18, 'f', 3.5);    // warehouse ↔ factory floor
  g.door(55, 13, 58, 13, 'f', 5.0);    // factory → A (A long)
  g.door(34, 23, 36, 23, 'w', 4.0);    // warehouse ↔ shipping
  g.door(50, 23, 53, 23, 'w', 5.0);    // factory ↔ shipping
  g.door(6, 32, 7, 32, 's', 2.4);      // yard → server room (B tunnels)
  g.door(18, 32, 19, 32, 'm', 2.4);    // yard → mail room
  g.door(28, 32, 30, 32, 't', 3.0);    // yard → mid
  g.door(36, 32, 38, 32, 'w', 4.2);    // loading dock 1
  g.door(46, 32, 48, 32, 'w', 4.2);    // loading dock 2
  g.door(54, 32, 56, 32, 'w', 4.2);    // loading dock 3
  return g;
}

const P = (kind: PropDef['kind'], x: number, z: number, w: number, d: number, h: number, extra: Partial<PropDef> = {}): PropDef =>
  ({ kind, x, z, w, d, h, ...extra });

const PROPS: PropDef[] = [
  // ---- B site: engineering bullpen ---------------------------------------
  P('cubicle', -49, -31, 5, 4.4, 1.4), P('cubicle', -39, -31, 5, 4.4, 1.4),
  P('cubicle', -49, -21.5, 5, 4.4, 1.4), P('cubicle', -39, -21.5, 5, 4.4, 1.4),
  P('whiteboard', -44, -26.2, 3, 0.2, 2.0),
  P('cabinet', -57.4, -26, 0.8, 5, 1.3, { facing: 1 }),
  P('pillar', -44, -36, 0.8, 0.8, 3.4),
  P('copier', -33, -36.5, 1.6, 1, 1.2, { facing: 2 }),
  P('planter', -31, -13.4, 0.8, 0.8, 1.2),
  P('counter', -55, -16, 4, 1.2, 1.0),
  P('tv', -44, -37.85, 3, 0.15, 1.6, { y: 1.0, solid: false, facing: 2 }),
  // ---- conference rooms ----------------------------------------------------
  P('confTable', -24, -33, 1.8, 5, 0.76),
  P('tv', -24, -37.85, 3, 0.15, 1.7, { y: 0.9, solid: false, facing: 2 }),
  P('confTable', -15, -34, 1.6, 4, 0.76),
  P('whiteboard', -15, -37.85, 2.6, 0.15, 1.3, { y: 0.9, solid: false, facing: 2 }),
  // ---- lobby / CT spawn ----------------------------------------------------
  P('reception', 8, -27, 6, 1.2, 1.1, { facing: 0 }),
  P('pillar', -6, -27, 1, 1, 6), P('pillar', 12, -33, 1, 1, 6),
  P('sofa', -7, -36.9, 3, 1, 0.8, { facing: 2 }),
  P('sofa', 15.5, -36.9, 3, 1, 0.8, { facing: 2 }),
  P('planter', 16.6, -24.8, 0.8, 0.8, 1.4), P('planter', -9.2, -24.8, 0.8, 0.8, 1.4),
  P('logo', 4, -37.9, 7, 0.1, 2.2, { y: 2.2, solid: false, facing: 2 }),
  // ---- north hall -------------------------------------------------------------
  P('vending', -10, -21.4, 1.2, 0.8, 1.9, { facing: 2 }),
  P('copier', -21, -21.5, 1.4, 0.8, 1.2, { facing: 2 }),
  P('cooler', -8, -21.6, 0.5, 0.5, 1.2),
  P('bench', -25, -16.5, 2.5, 0.6, 0.5),
  // ---- mid ----------------------------------------------------------------------
  P('partition', -3.2, -13, 1.6, 0.5, 3.4), P('partition', 1.2, -13, 1.6, 0.5, 3.4),
  P('crate', 0.9, 18, 1.2, 1.2, 1.2),
  P('cart', -3.2, 6, 0.7, 1.2, 1.1),
  // ---- cubicles -------------------------------------------------------------------
  P('cubicle', -24, -9, 6, 6, 1.4), P('cubicle', -11, -9, 6, 6, 1.4),
  P('cubicle', -24, 4.2, 6, 2.6, 1.4), P('cubicle', -11, 4.2, 6, 2.6, 1.4),
  P('pillar', -17.5, -9, 0.8, 0.8, 3.4),
  // ---- break room -------------------------------------------------------------------
  P('counter', -57.3, -3, 1.4, 8, 1.0, { facing: 1 }),
  P('fridge', -57.3, 3, 1.2, 1, 2.0, { facing: 1 }),
  P('table', -47, -5, 2.4, 1.2, 0.76), P('table', -41, -5, 2.4, 1.2, 0.76),
  P('table', -47, 1, 2.4, 1.2, 0.76), P('table', -41, 1, 2.4, 1.2, 0.76),
  P('vending', -36, 5.4, 1.2, 0.8, 1.9, { facing: 0 }), P('vending', -34.5, 5.4, 1.2, 0.8, 1.9, { facing: 0 }),
  P('sofa', -32, -9, 3, 1, 0.8, { facing: 2 }),
  P('pillar', -44, -2, 0.8, 0.8, 3.4),
  // ---- server room ------------------------------------------------------------------
  P('serverRack', -52, 12, 7, 1, 2.2), P('serverRack', -52, 16, 7, 1, 2.2), P('serverRack', -52, 20, 7, 1, 2.2),
  P('crac', -41.5, 10, 1.4, 1, 2.0),
  P('ups', -56.8, 22.8, 1.2, 1.6, 1.4),
  // ---- mail room --------------------------------------------------------------------
  P('mailShelf', -32, 9.6, 5, 0.6, 1.9, { facing: 2 }), P('mailShelf', -32, 22.6, 5, 0.6, 1.9, { facing: 0 }),
  P('packTable', -27, 16, 3, 1.4, 0.9), P('packTable', -12, 18, 3, 1.4, 0.9),
  P('pillar', -20, 16, 0.8, 0.8, 3.4),
  P('crate', -8, 22, 1.4, 1.4, 1.2),
  P('cabinet', -36.8, 11.5, 0.8, 3, 1.3, { facing: 1 }),
  // ---- warehouse (A short) ----------------------------------------------------------
  P('rack', 8, -16, 1.2, 8, 4.2), P('rack', 12.5, -16, 1.2, 8, 4.2),
  P('rack', 8, 0, 1.2, 6, 4.2), P('rack', 12.5, 0, 1.2, 6, 4.2),
  P('crate', 16, -9, 1.4, 1.4, 1.4), P('crate', 5.5, -19, 1.2, 1.2, 2.4),
  P('forklift', 16.5, 2, 1.4, 2.6, 2.2, { facing: 0 }),
  // ---- A site: assembly line ----------------------------------------------------------
  P('conveyor', 34, -23, 18, 1.4, 1.0),
  P('cnc', 28, -34, 4, 3, 2.6, { facing: 2 }), P('cnc', 45, -35, 5, 3, 2.6, { facing: 2 }),
  P('robotCell', 53, -27, 4, 4, 3.2),
  P('crate', 39, -29, 1.6, 1.6, 1.6), P('crate', 40.6, -29.5, 1.2, 1.2, 1.2),
  P('pallet', 24, -19, 2, 2, 1.2),
  P('pillar', 32, -16, 1, 1, 9), P('pillar', 48, -16, 1, 1, 9),
  P('console', 49, -21, 2, 1, 1.2, { facing: 3 }),
  P('barrels', 56.5, -36.5, 1.2, 1.2, 1.0),
  // ---- factory floor (A long) ----------------------------------------------------------
  P('cnc', 26, -9, 4, 3, 2.6), P('cnc', 34, -9, 4, 3, 2.6),
  P('cnc', 26, 3, 4, 3, 2.6, { facing: 2 }), P('cnc', 34, 3, 4, 3, 2.6, { facing: 2 }),
  P('press', 45, -6, 5, 4, 4),
  P('conveyor', 50, 3, 10, 1.2, 1.0),
  P('forklift', 54, -4, 1.4, 2.6, 2.2, { facing: 2 }),
  P('barrels', 57, -10, 1.6, 1.6, 1.0),
  P('crate', 38, -10.5, 1.4, 1.4, 1.4),
  // ---- shipping & receiving -------------------------------------------------------------
  P('rack', 24, 10.2, 10, 1.2, 3.6), P('rack', 54, 10.2, 6, 1.2, 3.6),
  P('pallet', 10, 17, 1.4, 1.4, 1.4), P('pallet', 22, 19, 2.6, 1.4, 1.0), P('pallet', 30, 15.5, 1.4, 2.8, 1.6),
  P('crate', 41, 18, 2, 2, 2.0), P('pallet', 50, 16, 2, 1.4, 1.2),
  P('packTable', 16, 13.5, 3, 1.2, 0.95), P('packTable', 36, 12.5, 3, 1.2, 0.95),
  P('container', 6.5, 20, 2.4, 6, 2.6),
  // ---- loading yard (T spawn) -------------------------------------------------------------
  P('trailer', 56, 32, 3, 10, 3.8),
  P('boxTruck', 30, 34.3, 9, 2.8, 3.2, { facing: 1 }),
  P('dumpster', -30, 27.6, 2.2, 1.4, 1.4),
  P('car', -42, 34, 4.4, 2, 1.4, { facing: 1 }),
  P('barrier', -4, 29, 3, 0.6, 0.9), P('barrier', 8, 29.5, 3, 0.6, 0.9),
  P('pallet', 20, 28, 1.4, 1.4, 1.2), P('pallet', -16, 30, 1.4, 1.4, 1.0),
  P('barrels', -55, 28, 1.6, 1.6, 1.0),
  P('lightPole', -20, 37.5, 0.3, 0.3, 6), P('lightPole', 14, 37.5, 0.3, 0.3, 6), P('lightPole', 44, 37.5, 0.3, 0.3, 6),
];

const g = buildGrid();

export const ACI_HQ: MapDef = {
  id: 'aci_hq',
  name: 'ACI HQ',
  description: 'Single-story headquarters: offices to the west, manufacturing and shipping to the east.',
  cellSize: CELL, originX: OX, originZ: OZ, cols: COLS, rows: ROWS,
  grid: g.rows(),
  floorTypes: FLOORS,
  doors: g.doors,
  props: PROPS,
  yardWallHeight: 4.5,
  facadeHeight: 6,
  spawns: {
    T: [-8, -4, 0, 4, 8].flatMap((x) => [{ x, z: 33, yaw: 0 }, { x: x + 2, z: 35.5, yaw: 0 }]),
    CT: [-6, -3, 0, 3, 6].flatMap((x) => [{ x, z: -32.5, yaw: Math.PI }, { x: x + 1.5, z: -35, yaw: Math.PI }]),
  },
  buyZones: {
    T: { x0: -14, z0: 27, x1: 16, z1: 38 },
    CT: { x0: -10, z0: -38, x1: 18, z1: -24 },
  },
  sites: {
    A: { x0: 30, z0: -34, x1: 50, z1: -20 },
    B: { x0: -52, z0: -34, x1: -36, z1: -18 },
  },
  plantSpots: {
    A: [{ x: 34, z: -28 }, { x: 44, z: -26 }, { x: 36, z: -32 }],
    B: [{ x: -44, z: -29 }, { x: -44, z: -23.5 }, { x: -50, z: -26 }],
  },
  callouts: [
    { name: 'B Site', rect: { x0: -58, z0: -38, x1: -30, z1: -12 } },
    { name: 'Conference', rect: { x0: -28, z0: -38, x1: -12, z1: -24 } },
    { name: 'CT Lobby', rect: { x0: -10, z0: -38, x1: 18, z1: -24 } },
    { name: 'A Site', rect: { x0: 20, z0: -38, x1: 58, z1: -14 } },
    { name: 'B Hall', rect: { x0: -28, z0: -22, x1: -6, z1: -16 } },
    { name: 'Mid', rect: { x0: -4, z0: -24, x1: 2, z1: 26 } },
    { name: 'Cubicles', rect: { x0: -28, z0: -14, x1: -6, z1: 6 } },
    { name: 'Break Room', rect: { x0: -58, z0: -10, x1: -30, z1: 6 } },
    { name: 'Server Room', rect: { x0: -58, z0: 8, x1: -40, z1: 24 } },
    { name: 'Mail Room', rect: { x0: -38, z0: 8, x1: -6, z1: 24 } },
    { name: 'A Short', rect: { x0: 4, z0: -22, x1: 18, z1: 6 } },
    { name: 'A Long', rect: { x0: 20, z0: -12, x1: 58, z1: 6 } },
    { name: 'Shipping', rect: { x0: 4, z0: 8, x1: 58, z1: 24 } },
    { name: 'T Spawn', rect: { x0: -14, z0: 26, x1: 16, z1: 38 } },
    { name: 'Loading Yard', rect: { x0: -58, z0: 26, x1: 58, z1: 38 } },
  ],
  cctv: [
    { name: 'CCTV · A Site', x: 20.6, y: 5.5, z: -37.4, lookX: 40, lookY: 0.5, lookZ: -24 },
    { name: 'CCTV · A Long', x: 57.4, y: 4.5, z: 5.4, lookX: 35, lookY: 0.5, lookZ: -10 },
    { name: 'CCTV · Mid', x: -3.6, y: 3.0, z: -21.6, lookX: -1, lookY: 0.5, lookZ: 20 },
    { name: 'CCTV · B Site', x: -30.6, y: 3.0, z: -12.6, lookX: -46, lookY: 0.5, lookZ: -30 },
    { name: 'CCTV · Shipping', x: 4.6, y: 5.0, z: 23.4, lookX: 35, lookY: 0.5, lookZ: 12 },
    { name: 'CCTV · Loading Yard', x: -8, y: 5.2, z: 26.4, lookX: 5, lookY: 0.5, lookZ: 34 },
  ],
  lights: [
    { x: 2, y: 5.2, z: -31, color: 0xfff1d6, intensity: 60, distance: 26 },
    { x: -44, y: 3.0, z: -26, color: 0xeaf2ff, intensity: 45, distance: 24 },
    { x: 39, y: 8, z: -26, color: 0xffe2b0, intensity: 120, distance: 34 },
    { x: -1, y: 3.0, z: 0, color: 0xeaf0ff, intensity: 30, distance: 22 },
    { x: 30, y: 8, z: 16, color: 0xffe8c0, intensity: 110, distance: 34 },
    { x: 11, y: 8, z: -8, color: 0xffe2b0, intensity: 70, distance: 22 },
    { x: 38, y: 8, z: -4, color: 0xfff0d0, intensity: 100, distance: 30 },
    { x: -48, y: 3.0, z: 16, color: 0x7ab0ff, intensity: 30, distance: 16 },
  ],
  ai: {
    holds: [
      { id: 'A Default', zone: 'A', x: 42, z: -31.5, lookX: 54, lookZ: -13 },
      { id: 'A Short', zone: 'A', x: 28, z: -26, lookX: 19, lookZ: -18 },
      { id: 'A Pillar', zone: 'A', x: 36, z: -17, lookX: 54, lookZ: -13 },
      { id: 'B Back', zone: 'B', x: -53, z: -35, lookX: -52, lookZ: -12 },
      { id: 'B Window', zone: 'B', x: -34.5, z: -34, lookX: -35, lookZ: -12 },
      { id: 'B Hall', zone: 'B', x: -44, z: -16.5, lookX: -29, lookZ: -18 },
      { id: 'Mid Doors', zone: 'mid', x: -1, z: -20, lookX: -1, lookZ: 20 },
      { id: 'Warehouse', zone: 'mid', x: 15, z: -10.5, lookX: 3, lookZ: -8 },
    ],
    routes: [
      { id: 'a-long', name: 'A Long', site: 'A', via: [[14, 20], [44, 0], [54, -11]] },
      { id: 'a-short', name: 'A Short', site: 'A', via: [[-1, 20], [-1, -8], [10, -8], [16, -18]] },
      { id: 'b-tunnels', name: 'B Tunnels', site: 'B', via: [[-46, 21], [-45, 10], [-52, 4], [-52, -11]] },
      { id: 'b-main', name: 'B Main', site: 'B', via: [[-22, 20], [-18, 0], [-31, -2], [-36, -11]] },
      { id: 'b-mid', name: 'Mid to B', site: 'B', via: [[-1, 10], [-1, -18], [-20, -19], [-31, -18]] },
    ],
    postPlant: {
      A: [
        { id: 'A Long Corner', zone: 'A', x: 52.5, z: -19, lookX: 40, lookZ: -27 },
        { id: 'A Short Pallet', zone: 'A', x: 23, z: -24, lookX: 40, lookZ: -27 },
        { id: 'A Back CNC', zone: 'A', x: 36, z: -36.5, lookX: 40, lookZ: -27 },
      ],
      B: [
        { id: 'B Bench', zone: 'B', x: -56, z: -15, lookX: -44, lookZ: -26 },
        { id: 'B Window', zone: 'B', x: -33, z: -24, lookX: -44, lookZ: -26 },
        { id: 'B Back', zone: 'B', x: -46, z: -36.5, lookX: -44, lookZ: -26 },
      ],
    },
  },
};
