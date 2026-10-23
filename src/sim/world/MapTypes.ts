import type { Rect } from '../../core/math';
import type { Team } from '../../config/rules';
import type { CctvDef } from '../../config/gadgets';

export type SiteId = 'A' | 'B';

export type FloorMaterial =
  | 'carpet' | 'carpetSite' | 'confCarpet' | 'marble' | 'tile' | 'checker' | 'serverFloor' | 'lino'
  | 'concrete' | 'concreteSite' | 'warehouse' | 'asphalt' | 'asphaltSpawn';

export interface FloorType {
  name: string;
  /** Ceiling height in meters, or null for open sky. */
  ceiling: number | null;
  material: FloorMaterial;
  wallMaterial: 'office' | 'lobby' | 'factory' | 'exterior';
}

export type PropKind =
  | 'cubicle' | 'confTable' | 'reception' | 'sofa' | 'pillar' | 'planter' | 'vending' | 'copier' | 'cabinet'
  | 'whiteboard' | 'counter' | 'fridge' | 'table' | 'serverRack' | 'crac' | 'mailShelf' | 'crate' | 'pallet'
  | 'rack' | 'cnc' | 'press' | 'robotCell' | 'conveyor' | 'forklift' | 'barrels' | 'trailer' | 'boxTruck'
  | 'dumpster' | 'car' | 'barrier' | 'partition' | 'tv' | 'logo' | 'packTable' | 'container' | 'console'
  | 'bench' | 'cooler' | 'ups' | 'lightPole' | 'cart';

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
}

export interface DoorDef { c0: number; r0: number; c1: number; r1: number; lintel: number }

export interface Spot { x: number; z: number; yaw?: number }

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
  spawns: Record<Team, Spot[]>;
  buyZones: Record<Team, Rect>;
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
}
