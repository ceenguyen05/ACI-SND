import { CollisionWorld, type Box, type SurfaceKind } from '../physics/CollisionWorld';
import { NavGrid } from '../ai/NavGrid';
import { inRect } from '../../core/math';
import type { Team } from '../../config/rules';
import type { FloorType, MapDef, PropDef, PropKind, SiteId } from './MapTypes';

export interface WallBlock { c0: number; r0: number; c1: number; r1: number; height: number; material: FloorType['wallMaterial'] }
export interface CeilingBlock { c0: number; r0: number; c1: number; r1: number; height: number; key: string }

const PROP_SURFACE: Partial<Record<PropKind, SurfaceKind>> = {
  cubicle: 'fabric', sofa: 'fabric', confTable: 'wood', table: 'wood', reception: 'wood', counter: 'wood',
  crate: 'wood', pallet: 'wood', packTable: 'wood', bench: 'wood', pillar: 'concrete', barrier: 'concrete', partition: 'wall',
};

/** Runtime world: geometry queries derived from a MapDef. Shared by simulation and renderer. */
export class World {
  readonly map: MapDef;
  readonly collision = new CollisionWorld();
  readonly nav: NavGrid;
  readonly walls: WallBlock[];
  readonly ceilings: CeilingBlock[];

  /** `extra`: additional static colliders (Zombies machines and boarded-up doorways). */
  constructor(map: MapDef, extra: Omit<Box, 'id'>[] = []) {
    this.map = map;
    this.walls = computeWallBlocks(map);
    this.ceilings = computeCeilingBlocks(map);
    const { cellSize: cs, originX: ox, originZ: oz } = map;
    const W = map.cols * cs, D = map.rows * cs;

    // floor slab
    this.collision.add({ minX: ox, minY: -1, minZ: oz, maxX: ox + W, maxY: 0, maxZ: oz + D, surface: 'floor' });
    // walls
    for (const w of this.walls) {
      this.collision.add({
        minX: ox + w.c0 * cs, minZ: oz + w.r0 * cs, maxX: ox + (w.c1 + 1) * cs, maxZ: oz + (w.r1 + 1) * cs,
        minY: 0, maxY: w.height, surface: 'wall',
      });
    }
    // ceilings (stop grenades flying through)
    for (const c of this.ceilings) {
      this.collision.add({
        minX: ox + c.c0 * cs, minZ: oz + c.r0 * cs, maxX: ox + (c.c1 + 1) * cs, maxZ: oz + (c.r1 + 1) * cs,
        minY: c.height, maxY: c.height + 0.5, surface: 'ceiling',
      });
    }
    // door lintels
    for (const d of map.doors) {
      const ceil = this.ceilingAtCell(d.c0, d.r0);
      if (ceil === null || ceil <= d.lintel + 0.05) continue;
      this.collision.add({
        minX: ox + d.c0 * cs, minZ: oz + d.r0 * cs, maxX: ox + (d.c1 + 1) * cs, maxZ: oz + (d.r1 + 1) * cs,
        minY: d.lintel, maxY: ceil, surface: 'wall',
      });
    }
    // props
    for (const p of map.props) {
      if (p.solid === false) continue;
      const b = propBounds(p);
      this.collision.add({ ...b, surface: PROP_SURFACE[p.kind] ?? 'metal' });
    }
    for (const b of extra) this.collision.add(b);
    this.collision.build(4);
    this.nav = new NavGrid(this.collision, { minX: ox, minZ: oz, maxX: ox + W, maxZ: oz + D }, 0.5);
  }

  cellAt(x: number, z: number): { c: number; r: number } {
    return { c: Math.floor((x - this.map.originX) / this.map.cellSize), r: Math.floor((z - this.map.originZ) / this.map.cellSize) };
  }
  charAt(c: number, r: number): string {
    if (r < 0 || r >= this.map.rows || c < 0 || c >= this.map.cols) return '#';
    return this.map.grid[r][c];
  }
  floorAt(x: number, z: number): FloorType | null {
    const { c, r } = this.cellAt(x, z);
    return this.map.floorTypes[this.charAt(c, r)] ?? null;
  }
  ceilingAtCell(c: number, r: number): number | null {
    const f = this.map.floorTypes[this.charAt(c, r)];
    return f ? f.ceiling : null;
  }
  isOutdoors(x: number, z: number): boolean {
    const f = this.floorAt(x, z);
    return !!f && f.ceiling === null;
  }

  calloutAt(x: number, z: number): string {
    for (const c of this.map.callouts) if (inRect(c.rect, x, z)) return c.name;
    return '';
  }
  siteAt(x: number, z: number): SiteId | null {
    if (inRect(this.map.sites.A, x, z)) return 'A';
    if (inRect(this.map.sites.B, x, z)) return 'B';
    return null;
  }
  inBuyZone(team: Team, x: number, z: number): boolean {
    return inRect(this.map.buyZones[team], x, z);
  }
}

export function propBounds(p: PropDef) {
  const y = p.y ?? 0;
  return { minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2, minY: y, maxY: y + p.h };
}

/** Wall cells merged greedily into rectangles; height = tallest neighbouring ceiling. */
export function computeWallBlocks(map: MapDef): WallBlock[] {
  const { cols, rows, grid, floorTypes } = map;
  const isWall = (c: number, r: number) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] === '#';
  const heights: number[] = new Array(cols * rows).fill(0);
  const mats: FloorType['wallMaterial'][] = new Array(cols * rows).fill('office');
  const MAT_RANK = { exterior: 0, office: 1, lobby: 2, factory: 3 } as const;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!isWall(c, r)) continue;
    let h = 0, mat: FloorType['wallMaterial'] = 'office', rank = -1;
    let touchesIndoor = false, touchesSky = false;
    const consider = (cc: number, rr: number) => {
      if (isWall(cc, rr)) return;
      const f = floorTypes[grid[rr][cc]];
      if (!f) return;
      if (f.ceiling === null) touchesSky = true; else { touchesIndoor = true; h = Math.max(h, f.ceiling); }
      if (MAT_RANK[f.wallMaterial] > rank) { rank = MAT_RANK[f.wallMaterial]; mat = f.wallMaterial; }
    };
    consider(c + 1, r); consider(c - 1, r); consider(c, r + 1); consider(c, r - 1);
    if (!touchesIndoor && !touchesSky) {
      for (const [dc, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) consider(c + dc, r + dr);
    }
    if (touchesSky) h = touchesIndoor ? Math.max(h, map.facadeHeight) : Math.max(h, map.yardWallHeight);
    if (h === 0) h = 3.4;
    heights[r * cols + c] = h;
    mats[r * cols + c] = mat;
  }
  // greedy merge rows then columns for equal height & material
  const used = new Uint8Array(cols * rows);
  const blocks: WallBlock[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (!isWall(c, r) || used[i]) continue;
    const h = heights[i], m = mats[i];
    let c1 = c;
    while (c1 + 1 < cols && isWall(c1 + 1, r) && !used[r * cols + c1 + 1] && heights[r * cols + c1 + 1] === h && mats[r * cols + c1 + 1] === m) c1++;
    let r1 = r;
    outer: while (r1 + 1 < rows) {
      for (let cc = c; cc <= c1; cc++) {
        const j = (r1 + 1) * cols + cc;
        if (!isWall(cc, r1 + 1) || used[j] || heights[j] !== h || mats[j] !== m) break outer;
      }
      r1++;
    }
    for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) used[rr * cols + cc] = 1;
    blocks.push({ c0: c, r0: r, c1, r1, height: h, material: m });
  }
  return blocks;
}

/** Floor cells with a ceiling, merged per (char) into rectangles. */
export function computeCeilingBlocks(map: MapDef): CeilingBlock[] {
  const { cols, rows, grid, floorTypes } = map;
  const used = new Uint8Array(cols * rows);
  const out: CeilingBlock[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = grid[r][c];
    const f = floorTypes[ch];
    if (!f || f.ceiling === null || used[r * cols + c]) continue;
    const h = f.ceiling;
    const same = (cc: number, rr: number) => {
      const f2 = floorTypes[grid[rr][cc]];
      return !!f2 && f2.ceiling === h && !used[rr * cols + cc];
    };
    let c1 = c;
    while (c1 + 1 < cols && same(c1 + 1, r)) c1++;
    let r1 = r;
    outer: while (r1 + 1 < rows) {
      for (let cc = c; cc <= c1; cc++) if (!same(cc, r1 + 1)) break outer;
      r1++;
    }
    for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) used[rr * cols + cc] = 1;
    out.push({ c0: c, r0: r, c1, r1, height: h, key: ch });
  }
  return out;
}
