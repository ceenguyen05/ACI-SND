import type { World } from '../../sim/world/World';
import type { FloorType } from '../../sim/world/MapTypes';

/**
 * Shared, deterministic description of everything the light baker lights and the map
 * renderer draws: ceiling fixtures, wall faces and the lightmap atlas layout.
 * Pure data (no DOM / WebGL) so the offline baker (Node) and the browser agree exactly.
 */
export const BAKE_VERSION = 3;

export type Vec3 = [number, number, number];

export interface Fixture {
  kind: 'panel' | 'warm' | 'highbay' | 'accent';
  x: number; y: number; z: number;
  color: Vec3;
  intensity: number;
  range: number;
  /** Emitter directionality: 0 = omni, higher = more downward. */
  pow: number;
}

export interface WallFace {
  c: number; r: number;
  /** Corner points: [bottom-start, bottom-end, top-end, top-start]. */
  pts: Vec3[];
  normal: Vec3;
  height: number;
  floor: FloorType;
}

export interface Region {
  /** Atlas pixel of the region's first content texel (a 1 px border surrounds it). */
  px: number; py: number;
  tw: number; th: number;
  texel: number;
  origin: Vec3;
  u: Vec3; v: Vec3;
  normal: Vec3;
}

export interface LightLayout {
  width: number;
  height: number;
  floor: Region;
  ceiling: Region;
  walls: Region[];
  faces: WallFace[];
}

const FLOOR_TEXEL = 0.25, WALL_TEXEL = 0.25, CEIL_TEXEL = 0.5;
const ATLAS_W = 2048;

/** Office ceiling panels, lobby fixtures and factory high-bay lamps (mirrors the meshes drawn). */
export function fixtures(world: World): Fixture[] {
  const { cellSize: cs, originX: ox, originZ: oz } = world.map;
  const out: Fixture[] = [];
  for (const cb of world.ceilings) {
    const y = cb.height;
    for (let r = cb.r0; r <= cb.r1; r++) for (let c = cb.c0; c <= cb.c1; c++) {
      const cx = ox + (c + 0.5) * cs, cz = oz + (r + 0.5) * cs;
      if (y <= 4) {
        if ((c + r) % 2 === 0) out.push({ kind: 'panel', x: cx, y: y - 0.06, z: cz, color: [1, 0.98, 0.93], intensity: 2.6, range: 9, pow: 1 });
      } else if (y <= 7) {
        if (c % 2 === 0 && r % 2 === 0) out.push({ kind: 'warm', x: cx + 1, y: y - 0.08, z: cz + 1, color: [1, 0.9, 0.74], intensity: 6.2, range: 13, pow: 1 });
      } else if (c % 3 === 1 && r % 3 === 1) {
        out.push({ kind: 'highbay', x: cx, y: y - 1.82, z: cz, color: [1, 0.93, 0.8], intensity: 13, range: 22, pow: 1.6 });
      }
    }
  }
  // Coloured accent lights from the map definition (server room glow etc.) at reduced weight.
  for (const l of world.map.lights) {
    const col = [(l.color >> 16 & 255) / 255, (l.color >> 8 & 255) / 255, (l.color & 255) / 255] as Vec3;
    const accent = Math.abs(col[0] - col[2]) > 0.25;
    if (accent) out.push({ kind: 'accent', x: l.x, y: l.y, z: l.z, color: col, intensity: l.intensity * 0.06, range: l.distance, pow: 0 });
  }
  return out;
}

/** Every visible wall face (one per wall-cell edge that touches a floor cell). */
export function wallFaces(world: World): WallFace[] {
  const map = world.map;
  const { cellSize: cs, originX: ox, originZ: oz, cols, rows } = map;
  const heights = new Map<number, number>();
  for (const w of world.walls) for (let r = w.r0; r <= w.r1; r++) for (let c = w.c0; c <= w.c1; c++) heights.set(r * cols + c, w.height);
  const isWall = (c: number, r: number) => world.charAt(c, r) === '#';
  const faces: WallFace[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!isWall(c, r)) continue;
    const H = heights.get(r * cols + c) ?? 3.4;
    const x0 = ox + c * cs, x1 = x0 + cs, z0 = oz + r * cs, z1 = z0 + cs;
    const dirs: [number, number, Vec3[], Vec3][] = [
      [0, -1, [[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], [0, 0, -1]],
      [0, 1, [[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1]],
      [-1, 0, [[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0]],
      [1, 0, [[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], [1, 0, 0]],
    ];
    for (const [dc, dr, pts, normal] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || isWall(nc, nr)) continue;
      const floor = map.floorTypes[map.grid[nr][nc]];
      if (!floor) continue;
      faces.push({ c, r, pts, normal, height: H, floor });
    }
  }
  return faces;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Deterministic shelf packing of floor, ceiling and every wall face into one atlas. */
export function buildLayout(world: World): LightLayout {
  const map = world.map;
  const W = map.cols * map.cellSize, D = map.rows * map.cellSize;
  const faces = wallFaces(world);
  let shelfX = 0, shelfY = 0, shelfH = 0;
  const place = (tw: number, th: number) => {
    const w = tw + 2, h = th + 2;
    if (shelfX + w > ATLAS_W) { shelfX = 0; shelfY += shelfH; shelfH = 0; }
    const p = { px: shelfX + 1, py: shelfY + 1 };
    shelfX += w; shelfH = Math.max(shelfH, h);
    return p;
  };
  const floorTW = Math.round(W / FLOOR_TEXEL), floorTH = Math.round(D / FLOOR_TEXEL);
  const floor: Region = { ...place(floorTW, floorTH), tw: floorTW, th: floorTH, texel: FLOOR_TEXEL,
    origin: [map.originX, 0, map.originZ], u: [1, 0, 0], v: [0, 0, 1], normal: [0, 1, 0] };
  const ceilTW = Math.round(W / CEIL_TEXEL), ceilTH = Math.round(D / CEIL_TEXEL);
  const ceiling: Region = { ...place(ceilTW, ceilTH), tw: ceilTW, th: ceilTH, texel: CEIL_TEXEL,
    origin: [map.originX, 0, map.originZ], u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] };
  // Tall faces first keeps shelves tight; ties broken by stable face order.
  const order = faces.map((f, i) => i).sort((a, b) => faces[b].height - faces[a].height || a - b);
  const walls: Region[] = new Array(faces.length);
  for (const i of order) {
    const f = faces[i];
    const len = Math.hypot(f.pts[1][0] - f.pts[0][0], f.pts[1][2] - f.pts[0][2]);
    const tw = Math.round(len / WALL_TEXEL), th = Math.ceil(f.height / WALL_TEXEL);
    walls[i] = { ...place(tw, th), tw, th, texel: WALL_TEXEL, origin: f.pts[0], u: norm(sub(f.pts[1], f.pts[0])), v: [0, 1, 0], normal: f.normal };
  }
  const height = Math.ceil((shelfY + shelfH) / 64) * 64;
  return { width: ATLAS_W, height, floor, ceiling, walls, faces };
}

/** Atlas UV for a point given in a region's local metres (u along region.u, v along region.v). */
export function regionUV(layout: LightLayout, r: Region, u: number, v: number): [number, number] {
  return [(r.px + u / r.texel) / layout.width, (r.py + v / r.texel) / layout.height];
}

/** World-space point of a texel centre. */
export function texelPoint(r: Region, i: number, j: number): Vec3 {
  const u = (i + 0.5) * r.texel, v = (j + 0.5) * r.texel;
  return [r.origin[0] + r.u[0] * u + r.v[0] * v, r.origin[1] + r.u[1] * u + r.v[1] * v, r.origin[2] + r.u[2] * u + r.v[2] * v];
}

/** Stable fingerprint of everything that affects baked lighting. */
export function lightingHash(world: World): string {
  const m = world.map;
  const s = JSON.stringify([BAKE_VERSION, m.grid, m.doors, m.props, m.lights, m.floorTypes, m.facadeHeight, m.yardWallHeight]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Light-probe grid (for props, characters and the view model). */
export const PROBE_LEVELS = [0.3, 1.1, 1.9, 2.8, 4.5, 6.5, 8.5];
export const PROBE_SPACING = 1;
/** Encoded value = sRGB(irradiance / LIGHT_RANGE). */
export const LIGHT_RANGE = 3;
export const SUN_DIR: Vec3 = norm([40, 80, 90]);
