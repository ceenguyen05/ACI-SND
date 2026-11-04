import type { Rect } from '../../core/math';
import type { Team } from '../../config/rules';
import type { CctvDef } from '../../config/gadgets';

export type SiteId = 'A' | 'B';

export type FloorMaterial =
  | 'carpet' | 'carpetSite' | 'confCarpet' | 'marble' | 'tile' | 'checker' | 'serverFloor' | 'lino'
  | 'concrete' | 'concreteSite' | 'warehouse' | 'asphalt' | 'asphaltSpawn'
  /** Wood-look luxury vinyl plank (café, party room), ESD lab tile, restroom porcelain. */
  | 'lvt' | 'esd' | 'porcelain';

export interface FloorType {
  name: string;
  /** Ceiling height in meters, or null for open sky. */
  ceiling: number | null;
  material: FloorMaterial;
  wallMaterial: 'office' | 'lobby' | 'factory' | 'exterior';
}

export type PropKind =
  | 'cubicle' | 'confTable' | 'reception' | 'sofa' | 'pillar' | 'planter' | 'vending' | 'copier' | 'cabinet'
  | 'whiteboard' | 'counter' | 'kitchenette' | 'fridge' | 'table' | 'serverRack' | 'crac' | 'mailShelf' | 'crate'
  | 'pallet' | 'rack' | 'chamber' | 'burnIn' | 'rfChamber' | 'robotCell' | 'conveyor' | 'forklift' | 'barrels'
  | 'trailer' | 'boxTruck' | 'dumpster' | 'car' | 'patrolCar' | 'speedTrailer' | 'barrier' | 'partition' | 'tv'
  | 'logo' | 'packTable' | 'container' | 'console' | 'bench' | 'cooler' | 'ups' | 'lightPole' | 'cart'
  | 'display' | 'speedSign' | 'fan'
  // ---- engineering office (ACI Building 2) and traffic products ----
  | 'booth' | 'highTop' | 'coffeeBar' | 'pingPong' | 'foosball' | 'arcade' | 'stalls' | 'urinals' | 'vanity'
  | 'execDesk' | 'bookcase' | 'labBench' | 'poleMount' | 'alprCam' | 'speedCamera' | 'lidarTripod' | 'speedSignPole'
  | 'pitchNet' | 'tree' | 'bollard' | 'monument' | 'canopy' | 'hvacUnit' | 'generator' | 'transformer' | 'trashCan'
  | 'podium' | 'classTable' | 'phoneBooth' | 'waterFountain' | 'shelving' | 'switchgear' | 'airHandler' | 'waterHeater'
  | 'balloons' | 'fireExt' | 'mopSink' | 'projScreen' | 'armchair' | 'coffeeTable' | 'credenza' | 'turnstile';

export interface PropDef {
  kind: PropKind;
  /** Center X / Z in meters. */
  x: number;
  z: number;
  /** Size along X (w), Z (d) and height (h). */
  w: number;
  d: number;
  h: number;
  /** Base height. */
  y?: number;
  /** Collidable? Defaults to true. */
  solid?: boolean;
  /** Visual facing: 0 = north, 1 = east, 2 = south, 3 = west. */
  facing?: 0 | 1 | 2 | 3;
  /** Builder-specific look (e.g. a showcase's product line). Never changes collision. */
  variant?: string;
}

/** Wall sign / placard drawn as a textured plane. `rot` is the yaw its face looks along (0 = +Z / south). */
export interface SignDef { text: string; x: number; y: number; z: number; rot: number; w?: number; h?: number; bg?: string; fg?: string }

/** Painted floor line (lane markings, parking bays). */
export interface FloorLine { x0: number; z0: number; x1: number; z1: number; color: 'yellow' | 'white' | 'blue'; width?: number }

export interface DoorDef { c0: number; r0: number; c1: number; r1: number; lintel: number }

export interface Spot { x: number; z: number; yaw?: number }

/**
 * A place a team can spawn. Each round the Attackers use one of their areas (never the same one
 * twice in a row) and the Defenders are split between their areas (one per bombsite). Players get
 * a random spot in the area plus a small random offset; the zones of the areas in use are that
 * round's buy zones.
 */
export interface SpawnArea {
  id: string;
  /** Shown to players, e.g. "West Lot", "A Defence". */
  name: string;
  /** Buy zone while the area is in use; every spot lies inside it. */
  zone: Rect;
  /** Spots at least 3 m apart (the random offset is ±0.75 m). */
  spots: Spot[];
  /** Spawned players face this point (± a little), e.g. the site entrances for Defenders. */
  face: { x: number; z: number };
  /** For Defender areas: the bombsite this area defends. */
  site?: SiteId;
}

export interface HoldSpot { id: string; zone: SiteId | 'mid'; x: number; z: number; lookX: number; lookZ: number }

export interface RouteDef { id: string; name: string; site: SiteId; via: [number, number][] }

export interface Callout { name: string; rect: Rect }

export interface MapLight { x: number; y: number; z: number; color: number; intensity: number; distance: number }

export interface MapDef {
  id: string;
  name: string;
  description: string;
  cellSize: number;
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  /** One string per row, one char per cell. '#' = wall. */
  grid: string[];
  floorTypes: Record<string, FloorType>;
  doors: DoorDef[];
  props: PropDef[];
  /** Attackers: areas well back from the building. Defenders: one area per bombsite. */
  spawnAreas: Record<Team, SpawnArea[]>;
  sites: Record<SiteId, Rect>;
  plantSpots: Record<SiteId, Spot[]>;
  callouts: Callout[];
  lights: MapLight[];
  /** Building security cameras available to Defenders. */
  cctv: CctvDef[];
  ai: {
    holds: HoldSpot[];
    routes: RouteDef[];
    postPlant: Record<SiteId, HoldSpot[]>;
  };
  /** Exterior perimeter wall height adjoining open-sky cells. */
  yardWallHeight: number;
  /** Height of building façade walls that face open sky. */
  facadeHeight: number;
  /** Signage and floor paint (visual only; not part of the lighting bake). */
  signs: SignDef[];
  floorLines: FloorLine[];
  /** Big wall logo plane carrying the company mark ("ACI"); captions are ordinary signs. */
  logo?: { x: number; y: number; z: number; rot: number; w: number; h: number };
  /** Seed for decorative scenery past the perimeter wall (trees). */
  scenerySeed?: number;
}
