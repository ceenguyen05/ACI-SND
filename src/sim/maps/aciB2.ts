import type { FloorType, MapDef, PropDef, SignDef, FloorLine } from '../world/MapTypes';
import { FACE, GridBuilder, P, line, sign } from './grid';

/**
 * ACI Building 2 — the company's single-story engineering office, a 1980s Richardson-area
 * office building on its own parking lot. Strictly offices and engineering labs: no
 * production floor and no warehouse. The game map is about 2.4× the real floor area, so
 * realism goes into what each room holds, not its size.
 *
 * World: 106 m (X, west→east) × 76 m (Z, north→south). Grid cell = 2 m, 53 × 38 cells.
 * North : the café (B site), boardroom, coffee bars, a skylit atrium (Defender spawn),
 *         executive conference and the prototype lab (A site).
 * Middle: party room, restrooms, wellness and janitor rooms, the main hall (mid), server room,
 *         copy & mail, and the engineering bullpen.
 * South : mechanical room, training room, main lobby, private offices and the RF / antenna lab.
 * Outside: the front parking lot (Attacker spawn) with field-test poles and plate-reader cameras.
 *
 * Cell (c, r) spans x ∈ [2c − 53, 2c − 51], z ∈ [2r − 38, 2r − 36].
 */

const COLS = 53, ROWS = 38, CELL = 2, OX = -53, OZ = -38;

const FLOORS: Record<string, FloorType> = {
  k: { name: 'Café', ceiling: 3.4, material: 'lvt', wallMaterial: 'office' },
  B: { name: 'Bombsite B', ceiling: 3.4, material: 'lvt', wallMaterial: 'office' },
  c: { name: 'Conference', ceiling: 3.4, material: 'confCarpet', wallMaterial: 'office' },
  q: { name: 'Coffee Bar', ceiling: 3.4, material: 'lvt', wallMaterial: 'office' },
  a: { name: 'Atrium', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
  C: { name: 'Atrium Centre', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
  e: { name: 'Prototype Lab', ceiling: 3.4, material: 'esd', wallMaterial: 'office' },
  A: { name: 'Bombsite A', ceiling: 3.4, material: 'esd', wallMaterial: 'office' },
  p: { name: 'Party Room', ceiling: 3.4, material: 'lvt', wallMaterial: 'office' },
  t: { name: 'Hallway', ceiling: 3.4, material: 'tile', wallMaterial: 'office' },
  r: { name: 'Restroom', ceiling: 3.4, material: 'porcelain', wallMaterial: 'office' },
  o: { name: 'Office', ceiling: 3.4, material: 'carpet', wallMaterial: 'office' },
  j: { name: 'Janitor', ceiling: 3.4, material: 'lino', wallMaterial: 'office' },
  s: { name: 'Server Room', ceiling: 3.4, material: 'serverFloor', wallMaterial: 'office' },
  m: { name: 'Copy & Mail', ceiling: 3.4, material: 'lino', wallMaterial: 'office' },
  h: { name: 'Mechanical', ceiling: 3.4, material: 'concrete', wallMaterial: 'office' },
  g: { name: 'Training Room', ceiling: 3.4, material: 'confCarpet', wallMaterial: 'office' },
  l: { name: 'Lobby', ceiling: 6, material: 'marble', wallMaterial: 'lobby' },
  f: { name: 'RF Lab', ceiling: 3.4, material: 'esd', wallMaterial: 'office' },
  y: { name: 'Parking Lot', ceiling: null, material: 'asphalt', wallMaterial: 'exterior' },
  T: { name: 'T Spawn', ceiling: null, material: 'asphaltSpawn', wallMaterial: 'exterior' },
};

function buildGrid() {
  const g = new GridBuilder(COLS, ROWS, '#');
  // ---- north band (rows 1-9) -------------------------------------------------
  g.rect(1, 1, 13, 9, 'k').rect(3, 2, 11, 7, 'B');          // café (B site)
  g.rect(15, 1, 19, 5, 'c');                                // boardroom
  g.rect(15, 7, 19, 9, 'q');                                // west coffee bar
  g.rect(21, 1, 31, 9, 'a').rect(23, 2, 29, 5, 'C');        // atrium / Defender spawn
  g.rect(33, 1, 37, 5, 'c');                                // executive conference
  g.rect(33, 7, 37, 9, 'q');                                // east coffee bar
  g.rect(39, 1, 51, 9, 'e').rect(41, 2, 49, 7, 'A');        // prototype lab (A site)
  // ---- middle band (rows 11-19) ----------------------------------------------
  g.rect(1, 11, 9, 19, 'p');                                // party room
  g.rect(11, 11, 12, 19, 't');                              // west hall ("B Hall")
  g.rect(14, 11, 18, 13, 'r').rect(20, 11, 23, 13, 'r');    // men's / women's restrooms
  g.rect(13, 15, 24, 16, 't');                              // restroom corridor (mid ↔ B Hall)
  g.rect(14, 18, 18, 19, 'o').rect(20, 18, 23, 19, 'j');    // wellness room / janitor
  g.rect(25, 11, 27, 19, 't');                              // main hall (mid)
  g.rect(28, 11, 39, 12, 't');                              // lab hall (mid ↔ A Hall)
  g.rect(29, 14, 33, 19, 's');                              // server room
  g.rect(35, 14, 38, 19, 'm');                              // copy & mail
  g.rect(40, 11, 41, 19, 't');                              // east hall ("A Hall")
  g.rect(43, 11, 51, 19, 'o');                              // engineering bullpen
  // ---- south band (rows 21-26) -----------------------------------------------
  g.rect(1, 21, 5, 26, 'h');                                // mechanical / electrical
  g.rect(7, 21, 19, 22, 't').rect(7, 23, 8, 26, 't');       // west corridor + west entrance
  g.rect(10, 24, 19, 26, 'g');                              // training room
  g.rect(21, 21, 31, 26, 'l');                              // main lobby
  g.rect(33, 21, 45, 22, 't').rect(44, 23, 45, 26, 't');    // east corridor + east entrance
  g.rect(33, 24, 35, 26, 'o').rect(37, 24, 39, 26, 'o').rect(41, 24, 42, 26, 'o'); // private offices
  g.rect(47, 21, 51, 26, 'f');                              // RF / antenna lab
  // ---- front parking lot (rows 28-36) ----------------------------------------
  g.rect(1, 28, 51, 36, 'y').rect(20, 33, 32, 36, 'T');     // main T spawn at the back of the plaza
  // ---- doors -----------------------------------------------------------------
  g.door(14, 3, 14, 3, 'c', 2.4);      // café ↔ boardroom
  g.door(14, 7, 14, 8, 'q', 2.4);      // café ↔ west coffee bar
  g.door(17, 6, 17, 6, 'q', 2.4);      // boardroom ↔ west coffee bar
  g.door(20, 7, 20, 8, 'q', 2.6);      // west coffee bar ↔ atrium (Defender rotation to B)
  g.door(32, 7, 32, 8, 'q', 2.6);      // atrium ↔ east coffee bar (Defender rotation to A)
  g.door(35, 6, 35, 6, 'q', 2.4);      // executive conference ↔ east coffee bar
  g.door(38, 7, 38, 8, 'q', 2.4);      // east coffee bar ↔ lab
  g.door(38, 3, 38, 3, 'c', 2.4);      // executive conference ↔ lab
  g.door(5, 10, 5, 10, 'p', 2.4);      // party room ↔ café (single door: a choke into B)
  g.door(12, 10, 12, 10, 't', 2.6);    // B Hall ↔ café (single door at the end of the hall)
  g.door(25, 10, 27, 10, 't', 3.0);    // atrium ↔ main hall
  g.door(40, 10, 40, 10, 't', 2.6);    // A Hall ↔ lab (single door at the end of the hall)
  g.door(47, 10, 47, 10, 'o', 2.4);    // bullpen ↔ lab (single door: a choke into A)
  g.door(10, 12, 10, 13, 'p', 2.4);    // party room ↔ B Hall
  g.door(16, 14, 16, 14, 'r', 2.2);    // men's room
  g.door(21, 14, 21, 14, 'r', 2.2);    // women's room
  g.door(16, 17, 16, 17, 'o', 2.2);    // wellness room
  g.door(21, 17, 21, 17, 'j', 2.2);    // janitor
  g.door(31, 13, 31, 13, 's', 2.2);    // server room
  g.door(36, 13, 37, 13, 'm', 2.4);    // copy & mail
  g.door(42, 16, 42, 17, 'o', 2.4);    // bullpen ↔ A Hall
  g.door(2, 20, 3, 20, 'h', 2.4);      // party room ↔ mechanical
  g.door(11, 20, 12, 20, 't', 2.6);    // B Hall ↔ west corridor
  g.door(25, 20, 27, 20, 't', 3.0);    // main hall ↔ lobby (security gates)
  g.door(40, 20, 41, 20, 't', 2.6);    // A Hall ↔ east corridor
  g.door(49, 20, 50, 20, 'f', 2.4);    // bullpen ↔ RF lab
  g.door(20, 21, 20, 22, 't', 2.8);    // west corridor ↔ lobby
  g.door(32, 21, 32, 22, 't', 2.8);    // lobby ↔ east corridor
  g.door(13, 23, 13, 23, 'g', 2.2);    // training room (rear door)
  g.door(17, 23, 17, 23, 'g', 2.2);    // training room (front door)
  g.door(34, 23, 34, 23, 'o', 2.2);    // private office 1
  g.door(38, 23, 38, 23, 'o', 2.2);    // private office 2
  g.door(41, 23, 41, 23, 'o', 2.2);    // private office 3
  g.door(2, 27, 3, 27, 'h', 2.6);      // service door (mechanical)
  g.door(7, 27, 8, 27, 't', 2.6);      // west entrance
  g.door(25, 27, 27, 27, 'l', 3.2);    // main entrance
  g.door(44, 27, 45, 27, 't', 2.6);    // east entrance
  g.door(49, 27, 50, 27, 'f', 2.6);    // RF lab field-test door
  return g;
}

const PROPS: PropDef[] = [
  // ---- B site: café ----------------------------------------------------------------------
  P('kitchenette', -45, -35.45, 7, 1.1, 1.0, { facing: 2 }),
  P('fridge', -40.4, -35.5, 1.0, 0.9, 2.0, { facing: 2 }), P('fridge', -39.3, -35.5, 1.0, 0.9, 2.0, { facing: 2 }),
  P('planter', -50.3, -35.3, 0.8, 0.8, 1.4),
  P('booth', -35.5, -35.05, 2.0, 1.9, 1.15), P('booth', -31.5, -35.05, 2.0, 1.9, 1.15), P('booth', -27.5, -35.05, 2.0, 1.9, 1.15),
  P('tv', -31.5, -35.93, 2.4, 0.1, 1.3, { y: 1.55, solid: false, facing: 2 }),
  P('coffeeBar', -50.62, -26, 0.75, 4.0, 0.95, { facing: 1 }),
  P('trashCan', -50.7, -28.7, 0.5, 0.5, 0.9), P('trashCan', -50.7, -29.3, 0.5, 0.5, 0.9, { variant: 'recycle', solid: false }),
  P('vending', -50.6, -23.2, 0.8, 1.2, 1.9, { facing: 1 }), P('vending', -50.6, -21.8, 0.8, 1.2, 1.9, { facing: 1 }),
  P('booth', -43, -28.5, 2.0, 1.9, 1.15), P('booth', -37, -28.5, 2.0, 1.9, 1.15),
  P('highTop', -46.5, -23.6, 1.2, 1.2, 1.05), P('highTop', -40, -23.2, 1.2, 1.2, 1.05), P('highTop', -33.5, -23.8, 1.2, 1.2, 1.05),
  P('table', -31, -29.5, 2.4, 1.2, 0.76),
  P('armchair', -25.5, -28.4, 0.85, 0.85, 0.85, { facing: 3 }), P('armchair', -25.5, -25.6, 0.85, 0.85, 0.85, { facing: 3 }),
  P('coffeeTable', -26.9, -27, 0.6, 1.2, 0.42, { facing: 1 }),
  P('planter', -25.6, -18.6, 0.8, 0.8, 1.4), P('planter', -48.2, -18.6, 0.8, 0.8, 1.4),
  P('fireExt', -38, -18.1, 0.3, 0.15, 0.7, { y: 0.9, solid: false, facing: 0 }),
  // ---- boardroom ---------------------------------------------------------------------------
  P('confTable', -18, -31, 2.0, 6.0, 0.76),
  P('tv', -18, -35.93, 3.0, 0.1, 1.7, { y: 0.9, solid: false, facing: 2 }),
  P('credenza', -13.25, -31, 0.5, 2.0, 0.8, { facing: 3, variant: 'catering' }),
  P('whiteboard', -22.92, -27.8, 0.15, 2.2, 1.3, { y: 0.9, solid: false, facing: 1 }),
  P('planter', -13.6, -35.4, 0.8, 0.8, 1.4), P('planter', -22.4, -35.4, 0.8, 0.8, 1.4),
  // ---- west coffee bar (Defender rotation to B) ---------------------------------------------
  P('coffeeBar', -18, -18.38, 4.0, 0.75, 0.95),
  P('fridge', -14.2, -18.5, 1.0, 0.8, 2.0),
  P('trashCan', -21.6, -18.3, 0.5, 0.5, 0.9), P('trashCan', -22.2, -18.3, 0.5, 0.5, 0.9, { variant: 'recycle' }),
  P('waterFountain', -15, -23.75, 0.9, 0.5, 1.0, { facing: 2 }),
  // ---- atrium / Defender spawn ---------------------------------------------------------------
  P('tv', 0, -35.93, 6, 0.12, 2.6, { y: 1.3, solid: false, facing: 2 }),
  P('sofa', -8.5, -35.4, 3, 1, 0.8, { facing: 2 }), P('sofa', 8.5, -35.4, 3, 1, 0.8, { facing: 2 }),
  P('coffeeTable', -8.5, -33.6, 1.2, 0.6, 0.42), P('coffeeTable', 8.5, -33.6, 1.2, 0.6, 0.42),
  P('display', -10.7, -30.5, 0.5, 2.4, 2.0, { facing: 1 }),
  P('display', 10.7, -30.5, 0.5, 2.4, 2.0, { facing: 3, variant: 'sports' }),
  P('pitchNet', 10.55, -26.4, 0.8, 2.6, 2.4, { facing: 3 }),
  P('speedSignPole', -10.6, -26, 0.4, 0.4, 3.6, { facing: 1 }),
  P('pillar', -5, -22, 0.8, 0.8, 6), P('pillar', 5, -22, 0.8, 0.8, 6),
  P('planter', -9.6, -19, 1.0, 1.0, 1.8), P('planter', 9.6, -19, 1.0, 1.0, 1.8),
  P('bench', -5, -19.0, 2.4, 0.6, 0.5), P('bench', 5, -19.0, 2.4, 0.6, 0.5),
  P('planter', -10.45, -35.45, 0.8, 0.8, 1.8), P('planter', 10.45, -35.45, 0.8, 0.8, 1.8),
  // ---- executive conference ------------------------------------------------------------------
  P('confTable', 18, -31, 1.8, 5, 0.76),
  P('tv', 18, -35.93, 2.6, 0.1, 1.5, { y: 1.0, solid: false, facing: 2 }),
  P('credenza', 13.25, -31, 0.5, 2.0, 0.8, { facing: 1 }),
  P('bookcase', 22.8, -35.2, 0.4, 1.0, 2.0, { facing: 3 }),
  P('planter', 13.6, -35.4, 0.8, 0.8, 1.4),
  // ---- east coffee bar (Defender rotation to A) -----------------------------------------------
  P('vending', 14.4, -18.4, 1.2, 0.8, 1.9),
  P('coffeeBar', 18, -18.38, 4.0, 0.75, 0.95),
  P('fridge', 21.6, -18.5, 1.0, 0.8, 2.0),
  P('copier', 21.6, -23.4, 1.4, 0.8, 1.2, { facing: 2 }),
  P('waterFountain', 15, -23.75, 0.9, 0.5, 1.0, { facing: 2 }),
  // ---- A site: prototype lab -----------------------------------------------------------------
  P('labBench', 28, -35.55, 2.4, 0.9, 0.92, { facing: 2 }), P('labBench', 31, -35.55, 2.4, 0.9, 0.92, { facing: 2 }),
  P('labBench', 34, -35.55, 2.4, 0.9, 0.92, { facing: 2 }),
  P('chamber', 46.5, -35.1, 3, 1.8, 2.4, { facing: 2 }),
  P('labBench', 50.55, -32.6, 0.9, 2.4, 0.92, { facing: 3 }), P('labBench', 50.55, -29.4, 0.9, 2.4, 0.92, { facing: 3 }),
  // double-sided bench islands in the middle of the site
  P('labBench', 35, -28.45, 2.4, 0.9, 0.92), P('labBench', 35, -27.55, 2.4, 0.9, 0.92, { facing: 2 }),
  P('labBench', 42, -28.45, 2.4, 0.9, 0.92), P('labBench', 42, -27.55, 2.4, 0.9, 0.92, { facing: 2 }),
  P('pillar', 38.5, -21.5, 0.6, 0.6, 3.4),
  P('lidarTripod', 46, -21.4, 0.8, 0.8, 1.6, { facing: 3 }),
  P('poleMount', 50.2, -19.4, 0.5, 0.5, 3.2, { facing: 3 }),
  P('shelving', 34, -18.3, 1.2, 0.6, 2.0, { variant: 'it' }), P('shelving', 35.4, -18.3, 1.2, 0.6, 2.0),
  P('cart', 37.6, -19.2, 0.7, 1.2, 1.1),
  P('whiteboard', 25.08, -26, 0.15, 2.4, 1.3, { y: 0.9, solid: false, facing: 1 }),
  P('fireExt', 25.08, -34, 0.15, 0.3, 0.7, { y: 0.9, solid: false, facing: 1 }),
  // ---- party room ------------------------------------------------------------------------------
  P('tv', -50.93, -11, 0.1, 2.6, 1.5, { y: 1.2, solid: false, facing: 1 }),
  P('coffeeTable', -49.3, -11, 0.6, 1.2, 0.42, { facing: 1 }),
  P('sofa', -47.6, -11, 1, 3, 0.8, { facing: 3 }),
  P('armchair', -49.2, -14.6, 0.85, 0.85, 0.85, { facing: 2 }),
  P('pingPong', -40.6, -3, 2.74, 1.525, 0.76),
  P('foosball', -47.5, -2, 1.5, 0.8, 0.92),
  P('arcade', -33.45, -1.2, 0.85, 0.75, 1.85, { facing: 3 }), P('arcade', -33.45, -2.1, 0.85, 0.75, 1.85, { facing: 3 }),
  P('arcade', -33.45, -3.0, 0.85, 0.75, 1.85, { facing: 3 }),
  P('credenza', -48.5, -15.75, 2.0, 0.5, 0.8, { facing: 2, variant: 'catering' }),
  P('table', -37.5, -12.5, 2.4, 1.2, 0.76),
  P('balloons', -36.4, -12.6, 0.8, 0.8, 2.2, { y: 0.76, solid: false }),
  P('balloons', -50.4, -15.4, 0.8, 0.8, 2.6, { solid: false }),
  P('fridge', -33.55, -7.5, 0.9, 1.0, 2.0, { facing: 3 }),
  P('planter', -50.4, 1.4, 0.8, 0.8, 1.4),
  // ---- B Hall (west hall) ------------------------------------------------------------------------
  P('waterFountain', -27.25, -14, 0.5, 0.9, 1.0, { facing: 3 }),
  P('phoneBooth', -30.4, -1.5, 1.1, 1.1, 2.25, { facing: 1 }),
  P('fireExt', -30.92, -8.5, 0.15, 0.3, 0.7, { y: 0.9, solid: false, facing: 1 }),
  // ---- restrooms ----------------------------------------------------------------------------------
  P('stalls', -20, -15.2, 5.0, 1.6, 1.85, { facing: 2 }),
  P('urinals', -24.75, -12.5, 0.5, 2.4, 1.3, { facing: 1 }),
  P('vanity', -15.3, -12.5, 0.6, 3.0, 0.9, { facing: 3 }),
  P('trashCan', -22.6, -10.4, 0.5, 0.5, 0.9, { solid: false }),
  P('stalls', -9, -15.2, 6.0, 1.6, 1.85, { facing: 2 }),
  P('vanity', -5.3, -12.2, 0.6, 3.0, 0.9, { facing: 3 }),
  P('trashCan', -12.5, -10.4, 0.5, 0.5, 0.9, { solid: false }),
  // ---- restroom corridor ---------------------------------------------------------------------------
  P('cart', -13.5, -4.55, 1.2, 0.7, 1.1, { facing: 1 }),
  P('fireExt', -16, -7.92, 0.3, 0.15, 0.7, { y: 0.9, solid: false, facing: 2 }),
  // ---- wellness room / janitor --------------------------------------------------------------------
  P('sofa', -22.5, 1.45, 2.4, 0.9, 0.8),
  P('armchair', -16.6, 1.35, 0.85, 0.85, 0.85),
  P('planter', -24.4, -1.4, 0.8, 0.8, 1.4),
  P('shelving', -7.2, 1.65, 1.2, 0.6, 2.0, { variant: 'janitor' }), P('shelving', -12.3, 1.65, 1.2, 0.6, 2.0, { variant: 'janitor' }),
  P('mopSink', -5.4, -1.2, 0.7, 0.9, 0.5, { facing: 3 }),
  P('waterHeater', -5.4, 1.4, 0.7, 0.7, 1.8),
  // ---- main hall (mid) -------------------------------------------------------------------------------
  P('turnstile', -1.5, 0.3, 0.3, 1.6, 1.0), P('turnstile', 1.5, 0.3, 0.3, 1.6, 1.0),
  P('bench', 2.65, -9, 0.6, 2.5, 0.5, { facing: 3 }),
  P('planter', -2.5, -15.4, 0.8, 0.8, 1.4),
  // ---- lab hall ----------------------------------------------------------------------------------------
  P('display', 8, -15.75, 2.4, 0.5, 2.0, { facing: 2 }),
  P('bookcase', 15.2, -15.8, 1.0, 0.4, 2.0, { facing: 2 }), P('bookcase', 16.3, -15.8, 1.0, 0.4, 2.0, { facing: 2 }),
  P('trashCan', 25.6, -12.4, 0.5, 0.5, 0.9, { solid: false }),
  P('fireExt', 20, -15.92, 0.3, 0.15, 0.7, { y: 0.9, solid: false, facing: 2 }),
  // ---- server room ---------------------------------------------------------------------------------------
  P('serverRack', 10, -6, 7, 1, 2.2), P('serverRack', 10, -2.5, 7, 1, 2.2),
  P('crac', 5.5, -8.5, 1.0, 1.4, 2.0, { facing: 1 }),
  P('ups', 14.3, 1.1, 1.2, 1.6, 1.4),
  P('shelving', 7.5, 1.65, 1.2, 0.6, 2.0, { variant: 'it' }),
  // ---- copy & mail ------------------------------------------------------------------------------------------
  P('copier', 17.5, -6.5, 1.0, 1.6, 1.2, { facing: 1 }), P('copier', 17.5, -3.6, 1.0, 1.4, 1.2, { facing: 1 }),
  P('mailShelf', 21, 1.7, 4, 0.6, 1.9),
  P('packTable', 22, -3.5, 2.4, 1.2, 0.9),
  P('shelving', 24.65, -7, 0.6, 1.2, 2.0, { facing: 3 }),
  // ---- A Hall (east hall) --------------------------------------------------------------------------------------
  P('phoneBooth', 30.4, -10, 1.1, 1.1, 2.25, { facing: 3 }),
  P('waterFountain', 27.25, -4, 0.5, 0.9, 1.0, { facing: 1 }),
  P('fireExt', 30.92, 0.5, 0.15, 0.3, 0.7, { y: 0.9, solid: false, facing: 3 }),
  // ---- engineering bullpen ------------------------------------------------------------------------------------
  P('cubicle', 38, -11, 5, 4.4, 1.4), P('cubicle', 38, -4, 5, 4.4, 1.4),
  P('cubicle', 46.5, -11, 5, 4.4, 1.4), P('cubicle', 46.5, -4, 5, 4.4, 1.4),
  P('copier', 35, -15.5, 1.4, 0.8, 1.2, { facing: 2 }),
  P('whiteboard', 49, -15.92, 2.6, 0.15, 1.3, { y: 0.9, solid: false, facing: 2 }),
  P('phoneBooth', 34.2, 1.35, 1.1, 1.1, 2.25),
  P('planter', 50.4, 1.4, 0.8, 0.8, 1.4), P('planter', 33.6, -15.4, 0.8, 0.8, 1.4),
  // ---- mechanical / electrical ---------------------------------------------------------------------------------
  P('switchgear', -41.4, 9, 0.8, 3.0, 2.2, { facing: 3 }),
  P('airHandler', -50.2, 10, 1.6, 3.0, 2.4, { facing: 1 }),
  P('waterHeater', -50.6, 5.0, 0.7, 0.7, 1.8), P('waterHeater', -50.6, 14.8, 0.7, 0.7, 1.8),
  P('shelving', -43, 15.65, 1.2, 0.6, 2.0),
  P('pallet', -42.6, 5.4, 1.2, 1.2, 1.0),
  // ---- west corridor / west entrance -------------------------------------------------------------------------------
  P('waterFountain', -22, 4.25, 0.9, 0.5, 1.0, { facing: 2 }),
  P('bench', -38.65, 12, 0.6, 2.4, 0.5, { facing: 1 }),
  P('fireExt', -34.5, 4.08, 0.3, 0.15, 0.7, { y: 0.9, solid: false, facing: 2 }),
  // ---- training room -------------------------------------------------------------------------------------------------
  P('projScreen', -32.94, 13, 0.12, 3.2, 1.8, { y: 0.9, solid: false, facing: 1 }),
  P('podium', -31.4, 10.9, 0.5, 0.6, 1.15, { facing: 1 }),
  ...[-28, -24, -20, -16].flatMap((x) => [
    P('classTable', x, 12.1, 0.6, 1.8, 0.74, { facing: 3 }), P('classTable', x, 13.9, 0.6, 1.8, 0.74, { facing: 3 })]),
  P('credenza', -13.25, 13, 0.5, 2.0, 0.8, { facing: 3, variant: 'catering' }),
  // ---- main lobby ---------------------------------------------------------------------------------------------------------
  P('partition', 0, 8.2, 6, 0.4, 3.6),
  P('reception', 0, 10.4, 5, 1.2, 1.1, { facing: 2 }),
  P('display', -7, 4.3, 2.4, 0.5, 2.0, { facing: 2 }), P('display', 7, 4.3, 2.4, 0.5, 2.0, { facing: 2, variant: 'sports' }),
  P('speedSign', -10.93, 11.5, 0.14, 0.9, 1.55, { y: 1.05, solid: false, facing: 1 }),
  P('sofa', -10.4, 12.6, 1, 3, 0.8, { facing: 1 }), P('armchair', -7.6, 11.4, 0.85, 0.85, 0.85, { facing: 3 }),
  P('armchair', -7.6, 13.8, 0.85, 0.85, 0.85, { facing: 3 }), P('coffeeTable', -9, 12.6, 0.6, 1.2, 0.42, { facing: 1 }),
  P('sofa', 10.4, 12.6, 1, 3, 0.8, { facing: 3 }), P('armchair', 7.6, 11.4, 0.85, 0.85, 0.85, { facing: 1 }),
  P('armchair', 7.6, 13.8, 0.85, 0.85, 0.85, { facing: 1 }), P('coffeeTable', 9, 12.6, 0.6, 1.2, 0.42, { facing: 1 }),
  P('planter', -10.4, 15.4, 0.8, 0.8, 1.6), P('planter', 10.4, 15.4, 0.8, 0.8, 1.6),
  P('planter', -4.2, 15.4, 0.8, 0.8, 1.6), P('planter', 4.2, 15.4, 0.8, 0.8, 1.6),
  // ---- east corridor / east entrance ----------------------------------------------------------------------------------------
  P('waterFountain', 20, 4.25, 0.9, 0.5, 1.0, { facing: 2 }),
  P('bench', 38.65, 12, 0.6, 2.4, 0.5, { facing: 3 }),
  P('fireExt', 34.5, 4.08, 0.3, 0.15, 0.7, { y: 0.9, solid: false, facing: 2 }),
  // ---- private offices ------------------------------------------------------------------------------------------------------------
  P('execDesk', 16, 13.6, 2.2, 1.9, 0.76), P('bookcase', 18.75, 12, 0.4, 1.0, 2.0, { facing: 3 }), P('planter', 13.6, 15.4, 0.8, 0.8, 1.2),
  P('execDesk', 24, 13.6, 2.2, 1.9, 0.76), P('bookcase', 21.25, 12, 0.4, 1.0, 2.0, { facing: 1 }), P('planter', 26.4, 15.4, 0.8, 0.8, 1.2),
  P('execDesk', 30.4, 13.6, 1.8, 1.7, 0.76), P('bookcase', 32.75, 11.2, 0.4, 1.0, 2.0, { facing: 3 }),
  // ---- RF / antenna lab ---------------------------------------------------------------------------------------------------------------
  P('rfChamber', 42.8, 9, 3.6, 4.4, 3.2, { facing: 1 }),
  P('labBench', 50.55, 8, 0.9, 2.4, 0.92, { facing: 3 }), P('labBench', 50.55, 11.4, 0.9, 2.4, 0.92, { facing: 3 }),
  P('lidarTripod', 49.6, 5.2, 0.8, 0.8, 1.6, { facing: 3 }),
  P('shelving', 42.2, 15.65, 1.2, 0.6, 2.0, { variant: 'it' }),
  P('poleMount', 42.6, 14.6, 0.5, 0.5, 3.2, { facing: 1 }),
  // ---- front parking lot: entrance plaza (Attacker spawn) -----------------------------------------------------------------------------------
  P('canopy', 0, 20, 9, 4, 0.35, { y: 3.3, solid: false }),
  P('pillar', -4, 21.6, 0.4, 0.4, 3.3), P('pillar', 4, 21.6, 0.4, 0.4, 3.3),
  P('bollard', -3.2, 22.6, 0.3, 0.3, 1.0), P('bollard', -1.1, 22.6, 0.3, 0.3, 1.0), P('bollard', 1.1, 22.6, 0.3, 0.3, 1.0), P('bollard', 3.2, 22.6, 0.3, 0.3, 1.0),
  P('monument', -10, 22.6, 4, 0.8, 1.6),
  P('trashCan', -5.6, 18.6, 0.5, 0.5, 0.9), P('trashCan', 5.6, 18.6, 0.5, 0.5, 0.9, { variant: 'recycle' }),
  P('tree', -15.6, 21.8, 0.6, 0.6, 7), P('tree', 15.6, 21.8, 0.6, 0.6, 7.5),
  P('tree', -15.6, 34.2, 0.6, 0.6, 7.2), P('tree', 15.6, 34.2, 0.6, 0.6, 6.8),
  // west lot: staff cars nose-in, a radar speed trailer, the generator yard
  P('car', -43.2, 23, 2, 4.4, 1.4), P('car', -30, 23, 2, 4.4, 1.4), P('car', -24.4, 23, 2, 4.4, 1.4),
  P('car', -46.4, 33.2, 2, 4.4, 1.4, { facing: 2 }), P('car', -40.8, 33.2, 2, 4.4, 1.4, { facing: 2 }),
  P('car', -26.8, 33.2, 2, 4.4, 1.4, { facing: 2 }), P('car', -21.2, 33.2, 2, 4.4, 1.4, { facing: 2 }),
  P('speedTrailer', -33.8, 33.1, 1.6, 3.2, 2.75),
  P('generator', -50.2, 25.5, 1.4, 3.4, 1.7, { facing: 1 }),
  P('transformer', -50.1, 31.6, 1.4, 1.6, 1.3, { facing: 1 }),
  P('hvacUnit', -31.4, 19.3, 1.2, 1.2, 1.1), P('hvacUnit', -28.8, 19.3, 1.2, 1.2, 1.1),
  P('alprCam', -50.6, 28.6, 0.35, 0.35, 3.8, { facing: 1 }),
  P('speedCamera', -16.8, 30.8, 0.4, 0.4, 3.6, { facing: 3 }),
  P('lightPole', -36.6, 30.8, 0.3, 0.3, 7), P('lightPole', -22.6, 30.8, 0.3, 0.3, 7),
  // east lot: staff cars, the demo patrol car with in-car radar, field-test poles, plate reader, speed sign
  P('car', 21.6, 23, 2, 4.4, 1.4), P('car', 27.2, 23, 2, 4.4, 1.4), P('car', 40.4, 23, 2, 4.4, 1.4),
  P('car', 18.4, 33.2, 2, 4.4, 1.4, { facing: 2 }), P('car', 24, 33.2, 2, 4.4, 1.4, { facing: 2 }), P('car', 32.4, 33.2, 2, 4.4, 1.4, { facing: 2 }),
  P('patrolCar', 43.6, 33.2, 2, 4.4, 1.4),
  P('poleMount', 42.6, 19.5, 0.5, 0.5, 4.2, { facing: 2 }), P('poleMount', 50.4, 19.5, 0.5, 0.5, 4.2, { facing: 2 }),
  P('hvacUnit', 28.8, 19.3, 1.2, 1.2, 1.1), P('hvacUnit', 31.4, 19.3, 1.2, 1.2, 1.1),
  P('alprCam', 50.6, 27.4, 0.35, 0.35, 3.8, { facing: 3 }),
  P('speedSignPole', 36.6, 30.8, 0.4, 0.4, 3.6, { facing: 1 }),
  P('dumpster', 48.6, 34.8, 2.2, 1.4, 1.4),
  P('lightPole', 22.6, 30.8, 0.3, 0.3, 7), P('lightPole', 30.2, 30.8, 0.3, 0.3, 7),
];

const g = buildGrid();
const { S, N, E, W } = FACE;
const BLUE = '#1f3550', RED = '#7a1c18', YEL = '#e8b818', INK = '#151515', SLATE = '#384549', PALE = '#d5d7c6';

const SIGNS: SignDef[] = [
  // café / B
  sign('B', -50.94, 2.2, -32, E, 1.2, 1.5, '#3c6476', '#e4e7dc'),
  sign('CAFÉ  ·  B', -42, 2.75, -15.97, S, 2.4, 0.42, RED, '#ffffff'),
  sign('B SITE ↑', -28, 3.0, -15.97, S, 2.0, 0.4, RED, '#ffffff'),
  sign('COMMONS CAFÉ', -38.5, 2.75, -35.94, S, 3.4, 0.5, '#2c3a2f', '#f1e7cf'),
  // north rooms
  sign('BOARDROOM', -18, 2.9, -23.97, S, 1.8),
  sign('COFFEE', -18, 2.85, -18.03, N, 1.6, 0.38, '#3b2a20', '#f1e2c4'),
  sign('EXECUTIVE CONFERENCE', 18, 2.9, -23.97, S, 2.6),
  sign('COFFEE', 18, 2.85, -18.03, N, 1.6, 0.38, '#3b2a20', '#f1e2c4'),
  sign('ACI  ·  ENGINEERING CENTER', 0, 4.6, -35.93, S, 7, 0.6, '#14181f', '#f0a020'),
  sign('POLICE RADAR  ·  LIDAR', -10.93, 2.55, -30.5, E, 2.4, 0.42, SLATE, PALE),
  sign('SPORTS RADAR', 10.93, 2.55, -30.5, W, 2.4, 0.42, SLATE, PALE),
  sign('SPEED AWARENESS', -10.93, 4.1, -26, E, 2.2, 0.4, SLATE, PALE),
  sign('MADE IN TEXAS  ·  U.S.A.', -2.94, 2.3, -12, E, 2.6, 0.5, RED, '#f4f1e6'),
  // A / prototype lab
  sign('A', 50.94, 2.3, -25, W, 1.2, 1.5, '#a95735', '#ede3d2'),
  sign('PROTOTYPE LAB  ·  A', 42, 2.75, -15.97, S, 3.0, 0.42, YEL, INK),
  sign('A SITE ↑', 28, 3.0, -15.97, S, 2.0, 0.4, YEL, INK),
  sign('ESD PROTECTED AREA', 25.07, 2.6, -21.5, E, 2.4, 0.45, '#f2c230', INK),
  sign('ESD PROTECTED AREA', 38, 2.7, -35.94, S, 2.4, 0.45, '#f2c230', INK),
  // middle band
  sign('PARTY ROOM', -36, 2.8, -15.97, S, 2.0, 0.4, '#5a2a6e', '#ffe6ff'),
  sign('HAPPY BIRTHDAY!', -48.5, 2.5, -15.97, S, 3.0, 0.5, '#e8b818', '#7a1c18'),
  sign('MEN', -18.6, 2.3, -7.97, S, 0.9, 0.34),
  sign('WOMEN', -7.8, 2.3, -7.97, S, 1.1, 0.34),
  sign('WELLNESS', -18.6, 2.3, -4.03, N, 1.2, 0.34),
  sign('JANITOR', -7.8, 2.3, -4.03, N, 1.1, 0.34),
  sign('LOBBY ↓', 0, 3.2, 1.97, N, 1.6, 0.36),
  sign('SERVER ROOM', 12.6, 2.4, -12.03, N, 2.0, 0.38, '#2a2a2a', '#7ad0ff'),
  sign('COPY & MAIL', 21, 2.75, -12.03, N, 2.0, 0.38),
  sign('ENGINEERING', 43, 2.85, 1.97, N, 2.4, 0.42, BLUE, '#f2f2f2'),
  sign('RF LAB ↓', 47, 2.8, 1.97, N, 1.6, 0.38, SLATE, PALE),
  // south band
  sign('MECHANICAL', -47, 2.75, 1.97, N, 1.8, 0.38, '#2a2a2a', '#f2c230'),
  sign('TRAINING', -22, 2.6, 7.97, N, 1.6, 0.38),
  sign('← LOBBY', -14.6, 2.9, 7.97, N, 1.6, 0.38),
  sign('LOBBY →', 14.6, 2.9, 7.97, N, 1.6, 0.38),
  sign('A-CONCEPTS INDUSTRIES', 0, 1.97, 8.42, S, 4.6, 0.34, '#14181f', '#c8ccd4'),
  sign('TRAFFIC  ·  RADAR  ·  LIDAR  ·  SPORTS', 0, 1.63, 8.42, S, 4.6, 0.26, '#14181f', '#f0a020'),
  sign('MAIN HALL', 0, 3.6, 4.03, S, 2.4, 0.42),
  sign('RF / ANTENNA LAB', 46, 2.8, 15.97, N, 2.2, 0.4, SLATE, PALE),
  sign('ISO 9001:2015 CERTIFIED', 3.6, 4.6, 4.03, S, 4.2, 0.55, BLUE, '#f2f2f2'),
  // outside
  sign('A-CONCEPTS INDUSTRIES', -10, 1.15, 22.93, S, 3.0, 0.38, '#1b2028', '#e9edf2'),
  sign('ENGINEERING CENTER  ·  BUILDING 2', -10, 0.72, 22.93, S, 3.0, 0.24, '#1b2028', '#f0a020'),
  sign('ACI', 0, 3.47, 22.03, S, 3.0, 0.32, '#14181f', '#f0a020'),
  sign('SERVICE', -47, 2.9, 18.02, S, 1.4, 0.34, '#2a2a2a', '#f2f2f2'),
  sign('FIELD TEST', 47, 2.9, 18.02, S, 1.6, 0.34, YEL, INK),
  sign('VISITOR PARKING', -10, 3.6, 18.02, S, 2.6, 0.4, BLUE, '#f2f2f2'),
];

const FLOOR_LINES: FloorLine[] = [
  // stall lines: north row noses toward the building, south row toward the screen wall
  ...[-44.6, -41.8, -39, -34.2, -31.4, -28.6, -25.8, -23, -20.2, -17.4].map((x) => line(x, 20.6, x, 25.4, 'white')),
  ...[17.4, 20.2, 23, 25.8, 28.6, 31.4, 34.2, 39, 41.8, 44.6].map((x) => line(x, 20.6, x, 25.4, 'white')),
  ...[-47.8, -45, -42.2, -39.4, -36.6, -33.8, -31, -28.2, -25.4, -22.6, -19.8, -17].map((x) => line(x, 31, x, 35.8, 'white')),
  ...[17, 19.8, 22.6, 25.4, 28.2, 31, 33.8, 36.6, 39.4, 42.2, 45, 47.8].map((x) => line(x, 31, x, 35.8, 'white')),
  // fire-lane curb along the sidewalk, crosswalks at each door, accessible stalls by the plaza
  line(-51, 20.3, -16.4, 20.3, 'yellow', 0.18), line(16.4, 20.3, 51, 20.3, 'yellow', 0.18),
  ...[-48.6, -48, -47.4, -46.8, -46.2, -45.6].map((x) => line(x, 20.4, x, 30.6, 'white', 0.3)),
  ...[-38.6, -38, -37.4, -36.8, -36.2, -35.6].map((x) => line(x, 20.4, x, 25.4, 'white', 0.3)),
  ...[35.6, 36.2, 36.8, 37.4, 38, 38.6].map((x) => line(x, 20.4, x, 25.4, 'white', 0.3)),
  ...[45.6, 46.2, 46.8, 47.4, 48, 48.6].map((x) => line(x, 20.4, x, 30.6, 'white', 0.3)),
  line(-20.2, 23, -17.4, 23, 'blue', 0.4), line(17.4, 23, 20.2, 23, 'blue', 0.4),
  // drive-aisle centre line
  line(-51, 28, -16.6, 28, 'yellow'), line(16.6, 28, 51, 28, 'yellow'),
  // ESD aisle tape in the prototype lab
  line(25.6, -19.2, 50, -19.2, 'yellow', 0.08),
];

export const ACI_B2: MapDef = {
  id: 'aci_b2',
  name: 'ACI Building 2',
  description: 'Single-story engineering office: a café at B, the prototype lab at A, attackers come in from the front parking lot.',
  cellSize: CELL, originX: OX, originZ: OZ, cols: COLS, rows: ROWS,
  grid: g.rows(),
  floorTypes: FLOORS,
  doors: g.doors,
  props: PROPS,
  yardWallHeight: 3.2,
  facadeHeight: 6,
  signs: SIGNS,
  floorLines: FLOOR_LINES,
  logo: { x: 0, y: 2.82, z: 8.41, rot: S, w: 4.2, h: 1.3 },
  scenerySeed: 1700,
  // Attackers start at the back of the lot (plaza, west lot or east lot — a different one each round);
  // Defenders are split between the café (B) and the prototype lab (A).
  spawnAreas: {
    T: [
      { id: 'plaza', name: 'Front Plaza', zone: { x0: -14, z0: 30, x1: 14, z1: 36 }, face: { x: 0, z: 17 },
        spots: [...[-10, -6, -2, 2, 6, 10].map((x) => ({ x, z: 34.8 })), ...[-8, -4, 0, 4, 8].map((x) => ({ x, z: 32.2 }))] },
      { id: 'west-lot', name: 'West Lot', zone: { x0: -51, z0: 26, x1: -17, z1: 36 }, face: { x: -38, z: 17 },
        spots: [{ x: -44, z: 27.5 }, { x: -38, z: 27.5 }, { x: -32, z: 27.5 }, { x: -26, z: 27.5 }, { x: -20, z: 27.5 }, { x: -47, z: 29.5 },
          { x: -41, z: 29.8 }, { x: -43.6, z: 33 }, { x: -38, z: 33 }, { x: -29.6, z: 33 }, { x: -24, z: 33.5 }] },
      { id: 'east-lot', name: 'East Lot', zone: { x0: 17, z0: 26, x1: 51, z1: 36 }, face: { x: 42, z: 17 },
        spots: [{ x: 20, z: 27.5 }, { x: 26, z: 27.5 }, { x: 32, z: 27.5 }, { x: 38, z: 27.5 }, { x: 44, z: 27.5 }, { x: 47.2, z: 29.8 },
          { x: 41, z: 29.8 }, { x: 21.2, z: 33 }, { x: 28.2, z: 33 }, { x: 35.2, z: 33 }, { x: 39, z: 33.2 }, { x: 46, z: 32.8 }] },
    ],
    CT: [
      { id: 'a-defence', name: 'A Defence', site: 'A', zone: { x0: 25, z0: -36, x1: 51, z1: -18 }, face: { x: 36, z: -16 },
        spots: [{ x: 27, z: -33.5 }, { x: 31, z: -32.5 }, { x: 38.5, z: -33 }, { x: 43, z: -33 }, { x: 48.5, z: -32.5 },
          { x: 27.5, z: -24 }, { x: 32, z: -24.5 }, { x: 38.5, z: -25 }, { x: 45, z: -24.5 }, { x: 48.5, z: -25.5 }] },
      { id: 'b-defence', name: 'B Defence', site: 'B', zone: { x0: -51, z0: -36, x1: -25, z1: -18 }, face: { x: -36, z: -16 },
        spots: [{ x: -46.5, z: -32.5 }, { x: -40, z: -32.5 }, { x: -33.5, z: -32.5 }, { x: -28, z: -32 }, { x: -47.5, z: -27 },
          { x: -39.5, z: -26.5 }, { x: -29, z: -25.5 }, { x: -44, z: -20.5 }, { x: -36.5, z: -20.5 }, { x: -30, z: -21 }] },
    ],
  },
  sites: {
    A: { x0: 29, z0: -34, x1: 47, z1: -22 },
    B: { x0: -47, z0: -34, x1: -29, z1: -22 },
  },
  plantSpots: {
    A: [{ x: 38.5, z: -32 }, { x: 31, z: -24 }, { x: 45, z: -25.5 }],
    B: [{ x: -40, z: -31.6 }, { x: -31, z: -25.5 }, { x: -45.5, z: -26 }],
  },
  callouts: [
    { name: 'B Site', rect: { x0: -51, z0: -36, x1: -25, z1: -18 } },
    { name: 'Boardroom', rect: { x0: -23, z0: -36, x1: -13, z1: -26 } },
    { name: 'B Coffee', rect: { x0: -23, z0: -26, x1: -13, z1: -18 } },
    { name: 'Atrium', rect: { x0: -13, z0: -36, x1: 13, z1: -18 } },
    { name: 'Exec Conference', rect: { x0: 13, z0: -36, x1: 23, z1: -26 } },
    { name: 'A Coffee', rect: { x0: 13, z0: -26, x1: 23, z1: -18 } },
    { name: 'A Site', rect: { x0: 23, z0: -36, x1: 51, z1: -18 } },
    { name: 'Party Room', rect: { x0: -51, z0: -18, x1: -33, z1: 2 } },
    { name: 'B Hall', rect: { x0: -33, z0: -18, x1: -27, z1: 4 } },
    { name: 'Restrooms', rect: { x0: -25, z0: -16, x1: -5, z1: -8 } },
    { name: 'Restroom Hall', rect: { x0: -27, z0: -8, x1: -3, z1: -4 } },
    { name: 'Wellness', rect: { x0: -25, z0: -4, x1: -15, z1: 2 } },
    { name: 'Janitor', rect: { x0: -15, z0: -4, x1: -5, z1: 2 } },
    { name: 'Mid', rect: { x0: -3, z0: -18, x1: 3, z1: 4 } },
    { name: 'Lab Hall', rect: { x0: 3, z0: -16, x1: 27, z1: -12 } },
    { name: 'Server Room', rect: { x0: 5, z0: -12, x1: 15, z1: 2 } },
    { name: 'Copy Room', rect: { x0: 17, z0: -12, x1: 25, z1: 2 } },
    { name: 'A Hall', rect: { x0: 27, z0: -18, x1: 31, z1: 4 } },
    { name: 'Bullpen', rect: { x0: 31, z0: -18, x1: 51, z1: 2 } },
    { name: 'Mechanical', rect: { x0: -51, z0: 2, x1: -41, z1: 16 } },
    { name: 'West Entrance', rect: { x0: -39, z0: 4, x1: -13, z1: 8 } },
    { name: 'West Entrance', rect: { x0: -39, z0: 8, x1: -35, z1: 18 } },
    { name: 'Training Room', rect: { x0: -33, z0: 8, x1: -13, z1: 16 } },
    { name: 'Lobby', rect: { x0: -13, z0: 4, x1: 13, z1: 18 } },
    { name: 'East Entrance', rect: { x0: 13, z0: 4, x1: 39, z1: 8 } },
    { name: 'East Entrance', rect: { x0: 35, z0: 8, x1: 39, z1: 18 } },
    { name: 'Offices', rect: { x0: 13, z0: 8, x1: 33, z1: 16 } },
    { name: 'RF Lab', rect: { x0: 41, z0: 2, x1: 51, z1: 18 } },
    { name: 'T Spawn', rect: { x0: -16, z0: 18, x1: 16, z1: 36 } },
    { name: 'Parking Lot', rect: { x0: -51, z0: 18, x1: 51, z1: 36 } },
  ],
  cctv: [
    { name: 'CCTV · A Site', x: 25.6, y: 3.0, z: -35.4, lookX: 40, lookY: 0.5, lookZ: -24 },
    { name: 'CCTV · B Site', x: -25.6, y: 3.0, z: -35.4, lookX: -40, lookY: 0.5, lookZ: -24 },
    { name: 'CCTV · Mid', x: 2.6, y: 3.0, z: -15.4, lookX: 0, lookY: 0.5, lookZ: 8 },
    { name: 'CCTV · Party Room', x: -33.6, y: 3.0, z: 1.4, lookX: -44, lookY: 0.5, lookZ: -10 },
    { name: 'CCTV · Bullpen', x: 33.6, y: 3.0, z: 1.4, lookX: 44, lookY: 0.5, lookZ: -10 },
    { name: 'CCTV · Lobby', x: 10.4, y: 5.2, z: 4.6, lookX: 0, lookY: 0.5, lookZ: 14 },
    { name: 'CCTV · Parking Lot', x: -14, y: 5.0, z: 18.4, lookX: 0, lookY: 0.5, lookZ: 30 },
  ],
  lights: [
    { x: 0, y: 5.2, z: -27, color: 0xfff1d6, intensity: 60, distance: 26 },
    { x: -38, y: 3.0, z: -27, color: 0xfff0dc, intensity: 45, distance: 24 },
    { x: 38, y: 3.0, z: -27, color: 0xeaf2ff, intensity: 45, distance: 24 },
    { x: 0, y: 3.0, z: -7, color: 0xeaf0ff, intensity: 30, distance: 22 },
    { x: 0, y: 5.2, z: 10, color: 0xfff1d6, intensity: 50, distance: 24 },
    { x: -42, y: 3.0, z: -7, color: 0xfff0dc, intensity: 30, distance: 18 },
    { x: 42, y: 3.0, z: -7, color: 0xeaf2ff, intensity: 30, distance: 18 },
    { x: 10, y: 3.0, z: -4, color: 0x7ab0ff, intensity: 30, distance: 14 },
    { x: -42, y: 2.8, z: -12, color: 0xc77dff, intensity: 24, distance: 12 },
  ],
  ai: {
    holds: [
      { id: 'A Island', zone: 'A', x: 42, z: -30.2, lookX: 42, lookZ: -17 },
      { id: 'A Benches', zone: 'A', x: 35, z: -30.2, lookX: 28, lookZ: -17 },
      { id: 'A Back', zone: 'A', x: 48.6, z: -32.6, lookX: 42, lookZ: -17 },
      { id: 'B Island', zone: 'B', x: -42, z: -30.2, lookX: -42, lookZ: -17 },
      { id: 'B Booths', zone: 'B', x: -36, z: -30.2, lookX: -28, lookZ: -17 },
      { id: 'B Back', zone: 'B', x: -48.6, z: -32.6, lookX: -42, lookZ: -17 },
      { id: 'Mid Top', zone: 'mid', x: 1.6, z: -14.6, lookX: 0, lookZ: 8 },
      { id: 'Atrium Door', zone: 'mid', x: -2.2, z: -19.6, lookX: 0, lookZ: 4 },
    ],
    routes: [
      { id: 'b-service', name: 'B Service', site: 'B', via: [[-47, 21.5], [-47, 9], [-45.5, -6], [-42, -13]] },
      { id: 'b-hall', name: 'B Hall', site: 'B', via: [[-37, 21.5], [-37, 6], [-29, 5.5], [-28.4, -12]] },
      { id: 'b-mid', name: 'Mid to B', site: 'B', via: [[0, 21.5], [-6, 7], [0, -4], [-20, -6], [-29, -9]] },
      { id: 'a-long', name: 'A Long', site: 'A', via: [[47, 21.5], [47, 9], [43, -0.5], [42, -13]] },
      { id: 'a-hall', name: 'A Hall', site: 'A', via: [[37, 21.5], [37, 6], [29, 5.5], [28.4, -10]] },
      { id: 'a-mid', name: 'Mid to A', site: 'A', via: [[0, 21.5], [6, 7], [0, -6], [0, -14], [16, -14], [28, -13]] },
    ],
    postPlant: {
      A: [
        { id: 'A Bullpen Door', zone: 'A', x: 42, z: -13.5, lookX: 38, lookZ: -28 },
        { id: 'A Hall', zone: 'A', x: 29, z: -12.5, lookX: 38, lookZ: -28 },
        { id: 'A Corner', zone: 'A', x: 48.4, z: -22.6, lookX: 38, lookZ: -28 },
      ],
      B: [
        { id: 'B Party Door', zone: 'B', x: -42, z: -13.5, lookX: -38, lookZ: -28 },
        { id: 'B Hall', zone: 'B', x: -29, z: -12.5, lookX: -38, lookZ: -28 },
        { id: 'B Corner', zone: 'B', x: -48.4, z: -19.6, lookX: -38, lookZ: -28 },
      ],
    },
  },
};
