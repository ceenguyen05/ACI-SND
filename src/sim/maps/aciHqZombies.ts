import type { WeaponId } from '../../config/weapons';
import type { PerkId } from '../../config/zombies';
import type { MapDef } from '../world/MapTypes';
import { ACI_HQ } from './aciHq';

/**
 * "ACI HQ: Outbreak" — the Search & Destroy map re-used for Zombies. Players start in the
 * lobby; security shutters (gates) cost points to open and unlock more of the building.
 * Some doorways are permanently boarded up so the map unfolds as a loop of zones.
 *
 * All positions are grid cells of ACI HQ (2 m, origin −60 / −40): an object placed at
 * `[col, row, side]` stands on that floor cell, against the wall on `side`.
 */

export type WallSide = 'N' | 'S' | 'E' | 'W';
export type CellRect = [number, number, number, number];
export type WallSpot = [number, number, WallSide];

export interface ZZoneDef { id: string; name: string; cells: CellRect[] }
export interface ZGateDef { id: string; name: string; cells: CellRect; price: number; zones: [string, string] }
export interface ZWallBuyDef { weapon: WeaponId; price: number; at: WallSpot }
export interface ZPerkSpot { perk: PerkId; at: WallSpot }

export interface ZombiesLayout {
  map: MapDef;
  name: string;
  startZone: string;
  zones: ZZoneDef[];
  gates: ZGateDef[];
  /** Doorways that never open. */
  blocked: CellRect[];
  wallBuys: ZWallBuyDef[];
  perks: ZPerkSpot[];
  boxSpots: WallSpot[];
  boxStart: number;
  forge: WallSpot;
  power: WallSpot;
  armory: WallSpot;
  /** Exfil radio (on the lobby reception desk) and landing zone. */
  radio: { x: number; y: number; z: number; yaw: number };
  lz: { x: number; z: number };
  /** Gate opened for free when an exfil is called (so the landing zone is always reachable). */
  lzGate: string;
  playerSpawns: { x: number; z: number; yaw: number }[];
}

export const ACI_HQ_ZOMBIES: ZombiesLayout = {
  map: ACI_HQ,
  name: 'ACI HQ: Outbreak',
  startZone: 'lobby',
  zones: [
    { id: 'lobby', name: 'Main Lobby', cells: [[25, 1, 38, 7]] },
    { id: 'offices', name: 'Conference & North Hall', cells: [[16, 1, 19, 7], [21, 1, 23, 7], [20, 4, 20, 4], [16, 9, 26, 11], [17, 8, 17, 8], [22, 8, 22, 8]] },
    { id: 'mid', name: 'Mid Corridor', cells: [[28, 9, 30, 31]] },
    { id: 'engineering', name: 'Engineering', cells: [[1, 1, 14, 13], [1, 15, 14, 22], [16, 13, 26, 22], [3, 14, 4, 14], [11, 14, 12, 14], [15, 18, 15, 19]] },
    { id: 'ops', name: 'Server & Mail Rooms', cells: [[1, 24, 9, 31], [11, 24, 26, 31], [10, 27, 10, 28]] },
    { id: 'plant', name: 'Assembly & Factory', cells: [[32, 9, 38, 22], [40, 1, 58, 12], [40, 14, 58, 22], [39, 10, 39, 11], [39, 17, 39, 18], [55, 13, 58, 13]] },
    { id: 'shipping', name: 'Shipping & Receiving', cells: [[32, 24, 58, 31]] },
    { id: 'yard', name: 'Loading Yard', cells: [[1, 33, 58, 38]] },
  ],
  gates: [
    { id: 'lobbyMid', name: 'Security Doors', cells: [28, 8, 30, 8], price: 750, zones: ['lobby', 'mid'] },
    { id: 'lobbyConf', name: 'Conference Door', cells: [24, 4, 24, 4], price: 750, zones: ['lobby', 'offices'] },
    { id: 'lobbyPlant', name: 'Assembly Ramp', cells: [39, 5, 39, 6], price: 1250, zones: ['lobby', 'plant'] },
    { id: 'hallMid', name: 'North Hall Door', cells: [27, 10, 27, 11], price: 1000, zones: ['offices', 'mid'] },
    { id: 'confBullpen', name: 'Bullpen Door', cells: [15, 4, 15, 4], price: 1000, zones: ['offices', 'engineering'] },
    { id: 'hallCubes', name: 'Cubicle Door', cells: [20, 12, 21, 12], price: 1000, zones: ['offices', 'engineering'] },
    { id: 'midCubes', name: 'Cubicle Side Door', cells: [27, 19, 27, 20], price: 1000, zones: ['mid', 'engineering'] },
    { id: 'breakServer', name: 'Server Room Door', cells: [3, 23, 4, 23], price: 1250, zones: ['engineering', 'ops'] },
    { id: 'cubesMail', name: 'Mail Room Door', cells: [20, 23, 21, 23], price: 1250, zones: ['engineering', 'ops'] },
    { id: 'midMail', name: 'Mail Room Side Door', cells: [27, 25, 27, 26], price: 1000, zones: ['mid', 'ops'] },
    { id: 'midWarehouse', name: 'Warehouse Door', cells: [31, 15, 31, 16], price: 1000, zones: ['mid', 'plant'] },
    { id: 'whShipping', name: 'Shipping Shutter', cells: [34, 23, 36, 23], price: 1250, zones: ['plant', 'shipping'] },
    { id: 'factoryShipping', name: 'Factory Shutter', cells: [50, 23, 53, 23], price: 1250, zones: ['plant', 'shipping'] },
    { id: 'midYard', name: 'Yard Gate', cells: [28, 32, 30, 32], price: 1500, zones: ['mid', 'yard'] },
    { id: 'dockYard', name: 'Loading Dock 2', cells: [46, 32, 48, 32], price: 1500, zones: ['shipping', 'yard'] },
  ],
  blocked: [
    [15, 10, 15, 11],  // bullpen ↔ north hall
    [6, 32, 7, 32],    // server room ↔ yard
    [18, 32, 19, 32],  // mail room ↔ yard
    [36, 32, 38, 32],  // loading dock 1
    [54, 32, 56, 32],  // loading dock 3
  ],
  wallBuys: [
    { weapon: 'judge', price: 500, at: [35, 1, 'N'] },
    { weapon: 'breacher', price: 750, at: [26, 7, 'S'] },
    { weapon: 'viper', price: 600, at: [23, 6, 'E'] },
    { weapon: 'vespa', price: 1000, at: [23, 9, 'N'] },
    { weapon: 'hornet', price: 1200, at: [28, 17, 'W'] },
    { weapon: 'tempest', price: 1700, at: [5, 1, 'N'] },
    { weapon: 'mako', price: 1300, at: [7, 15, 'N'] },
    { weapon: 'talon', price: 1800, at: [26, 15, 'E'] },
    { weapon: 'kestrel', price: 1500, at: [7, 24, 'N'] },
    { weapon: 'sentinel', price: 2400, at: [23, 31, 'S'] },
    { weapon: 'galeforce', price: 1600, at: [32, 13, 'W'] },
    { weapon: 'ravager', price: 2400, at: [41, 1, 'N'] },
    { weapon: 'reaper', price: 1800, at: [55, 22, 'S'] },
    { weapon: 'marshal', price: 2800, at: [46, 24, 'N'] },
  ],
  perks: [
    { perk: 'secondWind', at: [38, 2, 'E'] },
    { perk: 'quickHands', at: [16, 6, 'W'] },
    { perk: 'marathon', at: [30, 12, 'E'] },
    { perk: 'deadEye', at: [14, 7, 'E'] },
    { perk: 'ironGut', at: [10, 22, 'S'] },
    { perk: 'rapidFire', at: [24, 24, 'N'] },
    { perk: 'blastShield', at: [58, 18, 'E'] },
    { perk: 'shockCharge', at: [40, 8, 'W'] },
  ],
  boxSpots: [[35, 7, 'S'], [19, 7, 'S'], [7, 13, 'S'], [26, 29, 'E'], [40, 21, 'W'], [58, 28, 'E'], [10, 33, 'N']],
  boxStart: 0,
  forge: [42, 31, 'S'],
  power: [9, 30, 'E'],
  armory: [25, 2, 'W'],
  radio: { x: 8, y: 1.12, z: -27.25, yaw: 0 },
  lz: { x: 0, z: 34 },
  lzGate: 'midYard',
  playerSpawns: [
    { x: -3, z: -31, yaw: Math.PI }, { x: 1, z: -31, yaw: Math.PI }, { x: 5, z: -31, yaw: Math.PI },
    { x: -1, z: -34.5, yaw: Math.PI }, { x: 3, z: -34.5, yaw: Math.PI },
  ],
};

/** Floor-standing object against a wall: centre and facing (yaw looks away from the wall). */
export function wallPlace(map: MapDef, [c, r, side]: WallSpot, depth: number): { x: number; z: number; yaw: number } {
  const cs = map.cellSize, x0 = map.originX + c * cs, z0 = map.originZ + r * cs;
  const g = 0.02;
  switch (side) {
    case 'N': return { x: x0 + cs / 2, z: z0 + depth / 2 + g, yaw: Math.PI };
    case 'S': return { x: x0 + cs / 2, z: z0 + cs - depth / 2 - g, yaw: 0 };
    case 'W': return { x: x0 + depth / 2 + g, z: z0 + cs / 2, yaw: -Math.PI / 2 };
    case 'E': return { x: x0 + cs - depth / 2 - g, z: z0 + cs / 2, yaw: Math.PI / 2 };
  }
}

/** World rect of a cell rect. */
export function cellRectWorld(map: MapDef, [c0, r0, c1, r1]: CellRect) {
  const cs = map.cellSize;
  return { x0: map.originX + c0 * cs, z0: map.originZ + r0 * cs, x1: map.originX + (c1 + 1) * cs, z1: map.originZ + (r1 + 1) * cs };
}

/** Machine footprints (width along the wall, depth out from it, height). */
export const MACHINE_SIZE = {
  perk: { w: 1.2, d: 0.9, h: 2.15 },
  box: { w: 1.8, d: 0.8, h: 0.95 },
  forge: { w: 2.6, d: 1.5, h: 2.3 },
  armory: { w: 1.9, d: 0.85, h: 1.0 },
  power: { w: 1.1, d: 0.3, h: 2.0 },
  wallBuy: { w: 1.3, d: 0.08, h: 0.7 },
} as const;
