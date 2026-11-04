import { BoxGeometry, type BufferGeometry } from 'three';
import type { PropDef } from '../sim/world/MapTypes';
import type { Batcher } from './Materials';
import type { MapAnimator } from './MapAnimation';
import type { Random } from '../core/Random';

/**
 * Shared vocabulary for prop builders (Props.ts, OfficeProps.ts): the prop-local drawing
 * primitives and the furniture / product helpers several props reuse.
 *
 * Local frame: front faces -Z, origin at the footprint centre, y = 0 at the prop's base.
 */

/** `turn` rotates the box about Y on top of the prop's own facing (quarter turns or any angle). */
export type BoxFn = (mat: string, lx: number, ly: number, lz: number, w: number, h: number, d: number, turn?: number) => void;
export type CylFn = (mat: string, lx: number, ly: number, lz: number, r: number, h: number, seg?: number) => void;
/** Arbitrary geometry centred at the local point (already shaped / rotated in its own frame). */
export type GeoFn = (mat: string, geo: BufferGeometry, lx: number, ly: number, lz: number, turn?: number) => void;
/** `box` bevels its edges; `plain` is a sharp box for small parts repeated by the hundred (12 triangles, not ~108). */
export interface Prims { box: BoxFn; plain: BoxFn; cyl: CylFn; axle: CylFn; geo: GeoFn }
export interface Ctx extends Prims {
  W: number; D: number; H: number; r: Random; b: Batcher; p: PropDef;
  /** Prop rotation about Y; `world` maps prop-local points with it. */
  rot: number;
  world(lx: number, ly: number, lz: number): [number, number, number];
  /** The same primitives drawing into another batcher (geometry for animated parts). */
  into(target: Batcher): Prims;
  anim: MapAnimator;
}

/** Heading (for `turned` / chairs) whose front, local -Z, points along (dx, dz). */
export const faceTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** Box placer in a sub-frame at (x, z) turned by `face`: u across, v toward the back. */
export function turned(box: BoxFn, x: number, z: number, face: number): BoxFn {
  const co = Math.cos(face), si = Math.sin(face);
  return (mat, u, y, v, w, h, d, turn = 0) => box(mat, x + u * co + v * si, y, z - u * si + v * co, w, h, d, face + turn);
}

/**
 * A box tilted about its own X axis (positive tilt leans the top toward -Z), centred at
 * (lx, ly, lz). Plain UVs: use flat or untextured materials.
 */
export function tiltedBox(geo: GeoFn, mat: string, lx: number, ly: number, lz: number, w: number, h: number, d: number, tilt: number, turn = 0) {
  const g = new BoxGeometry(w, h, d);
  g.rotateX(-tilt);
  geo(mat, g, lx, ly, lz, turn);
}

export function monitor(box: BoxFn, x: number, y: number, z: number, faceZ: 1 | -1) {
  box('rubber', x, y, z, 0.18, 0.02, 0.15);
  box('rubber', x, y, z, 0.04, 0.22, 0.04);
  box('rubber', x, y + 0.18, z, 0.52, 0.32, 0.04);
  box('screen', x, y + 0.2, z + faceZ * 0.022, 0.48, 0.28, 0.005);
}

/** Swivel task chair: five-star base on casters, gas lift, seat, backrest and arms. Faces `face` (see faceTo). */
export function officeChair({ box, plain, cyl }: Prims, x: number, z: number, face: number, seat = 'fabric') {
  const part = turned(box, x, z, face), caster = turned(plain, x, z, face);
  const frame = 'p:#2b2d31';
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5 + 0.3, su = Math.sin(a), sv = Math.cos(a);
    part(frame, su * 0.15, 0.045, sv * 0.15, 0.045, 0.035, 0.3, a);
    caster('rubber', su * 0.29, 0, sv * 0.29, 0.04, 0.05, 0.06, a);
  }
  cyl('chrome', x, 0.08, z, 0.024, 0.3, 8);
  part(frame, 0, 0.37, 0, 0.34, 0.04, 0.32);
  part(seat, 0, 0.41, -0.02, 0.5, 0.08, 0.48);
  part(frame, 0, 0.4, 0.245, 0.06, 0.22, 0.035);
  part(seat, 0, 0.58, 0.27, 0.47, 0.52, 0.07);
  for (const s of [-1, 1]) {
    part(frame, s * 0.24, 0.45, 0.03, 0.03, 0.19, 0.035);
    part('rubber', s * 0.24, 0.64, 0.01, 0.06, 0.03, 0.26);
  }
}

/** Four-leg stacking chair for the break room. */
export function cafeChair({ box }: Prims, x: number, z: number, face: number, color: string) {
  const part = turned(box, x, z, face);
  for (const [u, v] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) part('m:#3a3e44', u, 0, v, 0.03, 0.45, 0.03);
  part(color, 0, 0.45, 0, 0.44, 0.04, 0.42);
  for (const s of [-1, 1]) part('m:#3a3e44', s * 0.19, 0.49, 0.19, 0.025, 0.36, 0.025);
  part(color, 0, 0.66, 0.2, 0.42, 0.2, 0.03);
}

/** Handheld traffic radar: antenna barrel along local X pointing `dir`, body with rear display, pistol grip. */
export function radarGun({ box, axle }: Prims, x: number, y: number, z: number, dir: 1 | -1 = 1) {
  box('rubber', x - dir * 0.05, y, z, 0.045, 0.12, 0.04);
  box('p:#2c3036', x - dir * 0.01, y + 0.1, z, 0.17, 0.1, 0.085);
  axle('p:#3a3f46', x + dir * 0.13, y + 0.09, z, 0.058, 0.13, 10);
  axle('rubber', x + dir * 0.2, y + 0.1, z, 0.05, 0.012, 10);
  box('screen', x - dir * 0.098, y + 0.12, z, 0.006, 0.05, 0.07);
}

/** Handheld lidar: twin lenses, sighting scope and grip. */
export function lidarGun({ box, axle }: Prims, x: number, y: number, z: number) {
  box('rubber', x - 0.05, y, z, 0.045, 0.12, 0.04);
  box('p:#34383d', x, y + 0.1, z, 0.22, 0.12, 0.1);
  for (const s of [-1, 1]) axle('rubber', x + 0.115, y + 0.14, z + s * 0.025, 0.02, 0.02, 12);
  box('rubber', x - 0.02, y + 0.22, z, 0.12, 0.04, 0.04);
  box('screen', x - 0.111, y + 0.13, z, 0.006, 0.06, 0.07);
}

/**
 * Sports radar gun (baseball scouting style): short barrel along local X pointing `dir`,
 * rear LCD and a pistol grip, in team colours.
 */
export function sportsRadarGun({ box, axle }: Prims, x: number, y: number, z: number, dir: 1 | -1 = 1, body = 'p:#1d4f9a') {
  box('rubber', x - dir * 0.04, y, z, 0.04, 0.11, 0.038);
  box(body, x - dir * 0.01, y + 0.09, z, 0.15, 0.09, 0.08);
  axle(body, x + dir * 0.11, y + 0.085, z, 0.05, 0.1, 12);
  axle('rubber', x + dir * 0.165, y + 0.09, z, 0.045, 0.01, 12);
  box('screen', x - dir * 0.088, y + 0.11, z, 0.006, 0.045, 0.06);
}
