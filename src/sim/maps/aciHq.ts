import type { FloorLine, FloorType, MapDef, PropDef, SignDef } from '../world/MapTypes';
import { FACE, GridBuilder, P, line, sign } from './grid';

/**
 * ACI HQ — single-story office + manufacturing plant, modelled on a 1981 Richardson, TX
 * flex / R&D building where traffic radar, lidar and speed-sign electronics are designed,
 * built and tested. The game map is larger than the real ~40,000 sq ft building.
 *
 * World: 120 m (X, west→east) × 80 m (Z, north→south). Grid cell = 2 m, 60 × 40 cells.
 * West half  : office (B site bullpen, conference rooms, engineering cubicles, break room, server room, mail room).
 * East half  : production (A site assembly line, environmental / RF test floor, warehouse racks, shipping & receiving).
 * South strip: outdoor loading yard (Attacker spawn). CT spawn: main lobby (north-center).
 */

const COLS = 60, ROWS = 40, CELL = 2, OX = -60, OZ = -40;

const FLOORS: Record<string, FloorType> = {
  o: { name: 'Office', ceiling: 3.4, material: 'carpet', wallMaterial: 'office' },
  B: { name: 'Bombsite B', ceiling: 3.4, material: 'carpetSite', wallMaterial: 'office' },
  c: { name: 'Conference', ceiling: 3.4, material: 'confCarpet', wallMaterial: 'office' },
  l: { name: 'Lobby', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
  C: { name: 'Lobby Centre', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
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
  g.rect(1, 33, 58, 38, 'y').rect(24, 35, 36, 38, 'T');     // loading yard / main T spawn (back of the yard)
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
  P('tv', -44, -37.9, 3, 0.15, 1.6, { y: 1.0, solid: false, facing: 2 }),
  // ---- conference rooms ----------------------------------------------------
  P('confTable', -24, -33, 1.8, 5, 0.76),
  P('tv', -24, -37.9, 3, 0.15, 1.7, { y: 0.9, solid: false, facing: 2 }),
  P('confTable', -15, -34, 1.6, 4, 0.76),
  P('whiteboard', -15, -37.92, 2.6, 0.15, 1.3, { y: 0.9, solid: false, facing: 2 }),
  // ---- lobby / CT spawn ----------------------------------------------------
  P('reception', 8, -27, 6, 1.2, 1.1, { facing: 0 }),
  P('pillar', -6, -27, 1, 1, 6), P('pillar', 12, -33, 1, 1, 6),
  P('sofa', -7, -36.9, 3, 1, 0.8, { facing: 2 }),
  P('sofa', 15.5, -36.9, 3, 1, 0.8, { facing: 2 }),
  P('planter', 16.6, -24.8, 0.8, 0.8, 1.4), P('planter', -9.2, -24.8, 0.8, 0.8, 1.4),
  P('logo', 4, -37.9, 7, 0.1, 2.2, { y: 2.2, solid: false, facing: 2 }),
  P('display', -3, -37.7, 2.4, 0.5, 2.0, { facing: 2 }),
  P('speedSign', -9.93, -27.6, 0.14, 0.9, 1.55, { y: 1.05, solid: false, facing: 1 }),
  P('display', 11, -37.7, 2.4, 0.5, 2.0, { facing: 2, variant: 'sports' }),
  // ---- north hall -------------------------------------------------------------
  P('vending', -10, -21.4, 1.2, 0.8, 1.9, { facing: 2 }),
  P('copier', -21, -21.5, 1.4, 0.8, 1.2, { facing: 2 }),
  P('cooler', -8, -21.6, 0.5, 0.5, 1.2),
  P('bench', -25, -16.5, 2.5, 0.6, 0.5),
  P('fireExt', -18.6, -21.92, 0.3, 0.15, 0.7, { y: 0.9, solid: false, facing: 2 }),
  // ---- mid ----------------------------------------------------------------------
  P('partition', -3.2, -13, 1.6, 0.5, 3.4), P('partition', 1.2, -13, 1.6, 0.5, 3.4),
  P('crate', 0.9, 18, 1.2, 1.2, 1.2),
  P('cart', -3.2, 6, 0.7, 1.2, 1.1),
  // ---- cubicles -------------------------------------------------------------------
  P('cubicle', -24, -9, 6, 6, 1.4), P('cubicle', -11, -9, 6, 6, 1.4),
  P('cubicle', -24, 4.2, 6, 2.6, 1.4), P('cubicle', -11, 4.2, 6, 2.6, 1.4),
  P('pillar', -17.5, -9, 0.8, 0.8, 3.4),
  // ---- break room -------------------------------------------------------------------
  P('kitchenette', -57.3, -3, 1.4, 8, 1.0, { facing: 1 }),
  P('fridge', -57.3, 3, 1.2, 1, 2.0, { facing: 1 }),
  P('table', -47, -5, 2.4, 1.2, 0.76), P('table', -41, -5, 2.4, 1.2, 0.76),
  P('table', -47, 1, 2.4, 1.2, 0.76), P('table', -41, 1, 2.4, 1.2, 0.76),
  P('vending', -36, 5.4, 1.2, 0.8, 1.9, { facing: 0 }), P('vending', -34.5, 5.4, 1.2, 0.8, 1.9, { facing: 0 }),
  P('sofa', -32, -9, 3, 1, 0.8, { facing: 2 }),
  P('pillar', -44, -2, 0.8, 0.8, 3.4),
  P('trashCan', -57.5, 1.7, 0.5, 0.5, 0.9, { solid: false }), P('trashCan', -57.5, 2.25, 0.5, 0.5, 0.9, { solid: false, variant: 'recycle' }),
  P('fireExt', -30.08, -6, 0.15, 0.3, 0.7, { y: 0.9, solid: false, facing: 3 }),
  // ---- server room ------------------------------------------------------------------
  P('serverRack', -52, 12, 7, 1, 2.2), P('serverRack', -52, 16, 7, 1, 2.2), P('serverRack', -52, 20, 7, 1, 2.2),
  P('crac', -41.5, 10, 1.4, 1, 2.0),
  P('ups', -56.8, 22.8, 1.2, 1.6, 1.4),
  // ---- mail room --------------------------------------------------------------------
  P('mailShelf', -32, 9.6, 5, 0.6, 1.9, { facing: 2 }), P('mailShelf', -32, 22.6, 5, 0.6, 1.9, { facing: 0 }),
  P('packTable', -27, 16, 3, 1.4, 0.9), P('packTable', -12, 18, 3, 1.4, 0.9),
  P('pillar', -20, 16, 0.8, 0.8, 3.4),
  P('crate', -8, 22, 1.4, 1.4, 1.2),
  P('cabinet', -37.55, 11.5, 0.8, 3, 1.3, { facing: 1 }),
  // ---- warehouse (A short) ----------------------------------------------------------
  P('rack', 8, -16, 1.2, 8, 4.2), P('rack', 12.5, -16, 1.2, 8, 4.2),
  P('rack', 8, 0, 1.2, 6, 4.2), P('rack', 12.5, 0, 1.2, 6, 4.2),
  P('crate', 16, -9, 1.4, 1.4, 1.4), P('crate', 5.5, -19, 1.2, 1.2, 2.4),
  P('forklift', 16.5, 2, 1.4, 2.6, 2.2, { facing: 0 }),
  P('fan', 12, -10, 5, 5, 1.1, { y: 7.3, solid: false }),
  // ---- A site: assembly line ----------------------------------------------------------
  P('conveyor', 34, -23, 18, 1.4, 1.0),
  P('chamber', 28, -34, 4, 3, 2.6, { facing: 2 }), P('chamber', 45, -35, 5, 3, 2.6, { facing: 2 }),
  P('robotCell', 53, -27, 4, 4, 3.2),
  P('crate', 39, -29, 1.6, 1.6, 1.6), P('crate', 40.6, -29.5, 1.2, 1.2, 1.2),
  P('pallet', 24, -19, 2, 2, 1.2),
  P('pillar', 32, -16, 1, 1, 9), P('pillar', 48, -16, 1, 1, 9),
  P('console', 49, -21, 2, 1, 1.2, { facing: 3 }),
  P('barrels', 56.5, -36.5, 1.2, 1.2, 1.0),
  P('fan', 36, -28, 6, 6, 1.1, { y: 7.3, solid: false }), P('fan', 48, -28, 6, 6, 1.1, { y: 7.3, solid: false }),
  // ---- test floor (A long): environmental chambers, burn-in racks, RF chamber ------------
  // Same footprints as the old machine rows; doors and controls now face the walkway.
  P('chamber', 26, -9, 4, 3, 2.6, { facing: 2 }), P('burnIn', 34, -9, 4, 3, 2.6),
  P('burnIn', 26, 3, 4, 3, 2.6), P('chamber', 34, 3, 4, 3, 2.6),
  P('rfChamber', 45, -6, 5, 4, 4),
  P('fan', 42, -4, 6, 6, 1.1, { y: 7.3, solid: false }), P('fan', 30, 2, 6, 6, 1.1, { y: 7.3, solid: false }),
  P('conveyor', 50, 3, 10, 1.2, 1.0),
  P('forklift', 54, -4, 1.4, 2.6, 2.2, { facing: 2 }),
  P('barrels', 57, -10, 1.6, 1.6, 1.0),
  P('crate', 38, -10.5, 1.4, 1.4, 1.4),
  // traffic-radar field kit staged in the test floor's south-east corner
  P('poleMount', 57.3, 4.6, 0.5, 0.5, 4.2, { facing: 3 }),
  P('lidarTripod', 56.6, 1.2, 0.8, 0.8, 1.6, { facing: 3 }),
  P('fireExt', 57.92, -8, 0.15, 0.3, 0.7, { y: 0.9, solid: false, facing: 3 }),
  // ---- shipping & receiving -------------------------------------------------------------
  P('rack', 24, 10.2, 10, 1.2, 3.6), P('rack', 54, 10.2, 6, 1.2, 3.6),
  P('pallet', 10, 17, 1.4, 1.4, 1.4), P('pallet', 22, 19, 2.6, 1.4, 1.0), P('pallet', 30, 15.5, 1.4, 2.8, 1.6),
  P('crate', 41, 18, 2, 2, 2.0), P('pallet', 50, 16, 2, 1.4, 1.2),
  P('packTable', 16, 13.5, 3, 1.2, 0.95), P('packTable', 36, 12.5, 3, 1.2, 0.95),
  P('container', 6.5, 20, 2.4, 6, 2.6),
  P('fan', 24, 14, 6, 6, 1.1, { y: 7.3, solid: false }), P('fan', 48, 20, 6, 6, 1.1, { y: 7.3, solid: false }),
  // ---- loading yard (T spawn) -------------------------------------------------------------
  P('trailer', 56, 32, 3, 10, 3.8),
  P('boxTruck', 30, 34.3, 9, 2.8, 3.2, { facing: 1 }),
  P('dumpster', -30, 27.6, 2.2, 1.4, 1.4),
  // Parked inside the striped bays: a demo patrol car backed in, a staff car nose-in, a speed trailer.
  P('patrolCar', -43.5, 34.6, 2, 4.4, 1.4), P('car', -49.5, 34.6, 2, 4.4, 1.4, { facing: 2 }),
  P('speedTrailer', -37.5, 34.4, 1.6, 3.2, 2.75),
  P('barrier', -4, 29, 3, 0.6, 0.9), P('barrier', 8, 29.5, 3, 0.6, 0.9),
  P('pallet', 20, 28, 1.4, 1.4, 1.2), P('pallet', -16, 30, 1.4, 1.4, 1.0),
  P('barrels', -55, 28, 1.6, 1.6, 1.0),
  P('lightPole', -20, 37.5, 0.3, 0.3, 6), P('lightPole', 14, 37.5, 0.3, 0.3, 6), P('lightPole', 44, 37.5, 0.3, 0.3, 6),
  // plate-reader camera watching the yard lane, and a radar speed-feedback sign by the staff parking
  P('alprCam', -57.7, 26.7, 0.35, 0.35, 3.8, { facing: 1 }),
  P('speedSignPole', -26, 37.6, 0.4, 0.4, 3.6, { facing: 3 }),
];

const g = buildGrid();

const { S, N, E, W } = FACE;
const sg = sign;
const YEL = '#e8b818', INK = '#151515';

const SIGNS: SignDef[] = [
  sg('CONFERENCE 1', -25, 2.9, -21.98, S, 1.8),
  sg('CONFERENCE 2', -15, 2.9, -21.98, S, 1.8),
  sg('ENGINEERING · B', -27.98, 2.9, -18, E, 2.6),
  sg('SERVER ROOM', -46, 2.9, 26.02, S, 2.4, 0.42, '#2a2a2a', '#7ad0ff'),
  sg('MAIL ROOM', -22, 2.9, 26.02, S, 2.2),
  sg('MAIN HALL', -1, 3.4, 26.02, S, 2.8),
  sg('DOCK 1', 15, 4.75, 26.02, S, 2.0, 0.5, YEL, INK),
  sg('DOCK 2', 35, 4.75, 26.02, S, 2.0, 0.5, YEL, INK),
  sg('DOCK 3', 51, 4.75, 26.02, S, 2.0, 0.5, YEL, INK),
  sg('ASSEMBLY · A', 17.98, 3.5, -28, W, 2.6, 0.5, YEL, INK),
  sg('WAREHOUSE', 1.98, 3.2, -8, W, 2.0, 0.35),
  sg('BREAK ROOM', -36, 2.9, -12.02, N, 1.8),
  sg('B SITE', -28.02, 2.9, -31, E, 1.6, 0.38, '#7a1c18', '#ffffff'),
  sg('A LONG ↑', 54, 5.6, -11.98, S, 2.4, 0.5, YEL, INK),
  sg('A', 24, 3.2, -37.94, S, 1.7, 2.1, '#a95735', '#ede3d2'),
  sg('B', -52, 2.2, -37.94, S, 1.2, 1.5, '#3c6476', '#e4e7dc'),
  sg('02  /  ASSEMBLY', 39, 4.1, -37.93, S, 4.8, 0.55, '#384549', '#d5d7c6'),
  sg('SAFETY FIRST', 57.93, 2.5, -22, W, 2.4, 0.5, '#d4b25d', '#26302d'),
  sg('01  /  ENGINEERING', -40, 2.7, -37.93, S, 3.8, 0.42, '#3c6476', '#e4e7dc'),
  sg('A-CONCEPTS INDUSTRIES', 4, 1.95, -37.94, S, 5, 0.4, '#14181f', '#c8ccd4'),
  sg('RADAR  ·  LIDAR  ·  SPEED SENSORS', 4, 1.5, -37.94, S, 5, 0.3, '#14181f', '#f0a020'),
  // Electronics plant signage: ESD-safe assembly, quality certification, made-in-USA production.
  sg('ESD PROTECTED AREA', 20.02, 3.35, -28, E, 2.4, 0.45, '#f2c230', INK),
  sg('ESD PROTECTED AREA', 20.02, 3.85, -18, E, 2.4, 0.45, '#f2c230', INK),
  sg('ISO 9001:2015 CERTIFIED', 57.93, 5.2, -6, W, 4.4, 0.62, '#1f3550', '#f2f2f2'),
  sg('MADE IN TEXAS  ·  U.S.A.', 28, 5.6, 8.02, S, 5.2, 0.7, '#7a1c18', '#f4f1e6'),
  sg('RF TEST LAB', 45, 3.55, -8.03, N, 1.8, 0.42, '#384549', '#d5d7c6'),
];

const ln = line;
const FLOOR_LINES: FloorLine[] = [
  // factory walkway & shipping lanes
  ln(20.5, -6.4, 41, -6.4, 'yellow'), ln(20.5, 0.6, 41, 0.6, 'yellow'),
  ln(39.6, 6, 39.6, 23.5, 'yellow'), ln(48.4, 6, 48.4, 23.5, 'yellow'),
  ln(7.6, 6, 7.6, 23.5, 'yellow'), ln(14.4, 6, 14.4, 23.5, 'yellow'),
  // yard parking bays
  ...Array.from({ length: 9 }, (_, i) => ln(-54 + i * 3, 31.5, -54 + i * 3, 37.5, 'white')),
  ...[12, 18, 32, 38, 48, 54].map((x) => ln(x, 26.2, x, 31, 'white')),
];

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
  signs: SIGNS,
  floorLines: FLOOR_LINES,
  logo: { x: 4, y: 3.3, z: -37.95, rot: S, w: 7, h: 2.2 },
  scenerySeed: 855,
  // Attackers start at the back of the yard (centre, staff parking or docks — a different one each
  // round); Defenders are split between the two bombsites. No Attacker spot can see a Defender spot.
  spawnAreas: {
    T: [
      { id: 'yard', name: 'Yard', zone: { x0: -14, z0: 31, x1: 14, z1: 38 }, face: { x: -1, z: 25 },
        spots: [...[-10, -6, -2, 2, 6, 10].map((x) => ({ x, z: 36.8 })), ...[-8, -4, 0, 4, 8].map((x) => ({ x, z: 34.4 }))] },
      { id: 'yard-west', name: 'Staff Parking', zone: { x0: -58, z0: 29, x1: -27, z1: 38 }, face: { x: -38, z: 22 },
        spots: [{ x: -55.5, z: 36.6 }, { x: -52.5, z: 33.5 }, { x: -46.5, z: 35 }, { x: -40.5, z: 35 }, { x: -34.5, z: 35 }, { x: -29.5, z: 36.6 },
          { x: -55.5, z: 31.5 }, { x: -49.5, z: 30.4 }, { x: -43.5, z: 30.2 }, { x: -37.5, z: 30.6 }, { x: -31.5, z: 31.5 }] },
      { id: 'yard-east', name: 'Docks', zone: { x0: 34, z0: 28, x1: 54.4, z1: 38 }, face: { x: 44, z: 24 },
        spots: [{ x: 36.5, z: 29.8 }, { x: 40.5, z: 31.6 }, { x: 44.5, z: 29.8 }, { x: 48.5, z: 31.6 }, { x: 52.2, z: 29.8 }, { x: 37, z: 36.6 },
          { x: 41, z: 35.2 }, { x: 45, z: 34.4 }, { x: 49, z: 35.6 }, { x: 52.2, z: 33.6 }, { x: 52.2, z: 36.8 }] },
    ],
    CT: [
      { id: 'a-defence', name: 'A Defence', site: 'A', zone: { x0: 20, z0: -38, x1: 58, z1: -14 }, face: { x: 38, z: -14 },
        spots: [{ x: 22.5, z: -36.5 }, { x: 24, z: -31 }, { x: 33, z: -36.6 }, { x: 36.5, z: -30.5 }, { x: 40, z: -36.5 },
          { x: 50.5, z: -36 }, { x: 54.5, z: -33 }, { x: 51.2, z: -22.5 }, { x: 44, z: -19 }, { x: 28, z: -27 }] },
      { id: 'b-defence', name: 'B Defence', site: 'B', zone: { x0: -58, z0: -38, x1: -30, z1: -12 }, face: { x: -44, z: -12 },
        spots: [{ x: -55.5, z: -36 }, { x: -55.5, z: -31 }, { x: -55.5, z: -20 }, { x: -44, z: -33.8 }, { x: -44, z: -29.5 }, { x: -44, z: -23 },
          { x: -33.5, z: -33 }, { x: -33.5, z: -26 }, { x: -33.5, z: -18.5 }, { x: -38.5, z: -36.5 }, { x: -50, z: -36.5 }] },
    ],
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
    { name: 'Lobby', rect: { x0: -10, z0: -38, x1: 18, z1: -24 } },
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
