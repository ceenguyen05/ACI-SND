import { Vector3 } from 'three';

export type SurfaceKind = 'wall' | 'floor' | 'ceiling' | 'wood' | 'metal' | 'concrete' | 'glass' | 'fabric' | 'vehicle';

export interface Box {
  id: number;
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  surface: SurfaceKind;
  /** Set on dynamic boxes owned by a gadget (e.g. deployable shield). */
  device?: number;
}

export interface RayHit {
  t: number;
  point: Vector3;
  normal: Vector3;
  box: Box;
}

const EPS = 1e-4;

/**
 * Static world made of axis-aligned boxes, indexed by a uniform 2D (XZ) grid for fast
 * overlap queries and DDA ray traversal.
 */
export class CollisionWorld {
  readonly boxes: Box[] = [];
  /** Runtime colliders (shields). Few in number, so they are brute-forced. */
  readonly dynamic: Box[] = [];
  private dynCounter = 0;
  private cellSize = 4;
  private minX = 0; private minZ = 0; private cols = 1; private rows = 1;
  private cells: number[][] = [];
  private stamp: Uint32Array = new Uint32Array(0);
  private stampId = 1;

  add(b: Omit<Box, 'id'>): Box {
    const box = { ...b, id: this.boxes.length } as Box;
    this.boxes.push(box);
    return box;
  }

  addDynamic(b: Omit<Box, 'id'>): Box {
    const box = { ...b, id: -1 - this.dynCounter++ } as Box;
    this.dynamic.push(box);
    return box;
  }
  removeDynamic(box: Box) {
    const i = this.dynamic.indexOf(box);
    if (i >= 0) this.dynamic.splice(i, 1);
  }
  clearDynamic() { this.dynamic.length = 0; }

  /** Call after all boxes are added. */
  build(cellSize = 4): void {
    this.cellSize = cellSize;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of this.boxes) {
      minX = Math.min(minX, b.minX); minZ = Math.min(minZ, b.minZ);
      maxX = Math.max(maxX, b.maxX); maxZ = Math.max(maxZ, b.maxZ);
    }
    this.minX = minX - 1; this.minZ = minZ - 1;
    this.cols = Math.ceil((maxX - this.minX + 1) / cellSize);
    this.rows = Math.ceil((maxZ - this.minZ + 1) / cellSize);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    for (const b of this.boxes) {
      const c0 = this.col(b.minX), c1 = this.col(b.maxX), r0 = this.row(b.minZ), r1 = this.row(b.maxZ);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(b.id);
    }
    this.stamp = new Uint32Array(this.boxes.length);
    this.flat = new Float64Array(this.boxes.length * 6);
    this.boxes.forEach((b, i) => this.flat.set([b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ], i * 6));
  }
  private flat = new Float64Array(0);

  /**
   * Allocation-free "does anything block this ray within maxT?" test (static boxes only).
   * Used by the light baker, which casts tens of millions of shadow rays. A ray that starts
   * inside a box counts as blocked.
   */
  occludes(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): boolean {
    const cs = this.cellSize, f = this.flat;
    let cx = this.col(ox), cz = this.row(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const ix = Math.abs(dx) < 1e-12 ? 1e12 : 1 / dx, iy = Math.abs(dy) < 1e-12 ? 1e12 : 1 / dy, iz = Math.abs(dz) < 1e-12 ? 1e12 : 1 / dz;
    let tMaxX = Math.abs(dx) < 1e-12 ? Infinity : (this.minX + (cx + (stepX > 0 ? 1 : 0)) * cs - ox) * ix;
    let tMaxZ = Math.abs(dz) < 1e-12 ? Infinity : (this.minZ + (cz + (stepZ > 0 ? 1 : 0)) * cs - oz) * iz;
    const tDX = Math.abs(dx) < 1e-12 ? Infinity : cs * Math.abs(ix), tDZ = Math.abs(dz) < 1e-12 ? Infinity : cs * Math.abs(iz);
    for (let guard = 0; guard < 4096; guard++) {
      if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return false;
      const list = this.cells[cz * this.cols + cx];
      for (let k = 0; k < list.length; k++) {
        const o = list[k] * 6;
        let t0 = (f[o] - ox) * ix, t1 = (f[o + 3] - ox) * ix;
        let tmin = t0 < t1 ? t0 : t1, tmax = t0 < t1 ? t1 : t0;
        t0 = (f[o + 1] - oy) * iy; t1 = (f[o + 4] - oy) * iy;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
        if (t0 > tmin) tmin = t0;
        if (t1 < tmax) tmax = t1;
        t0 = (f[o + 2] - oz) * iz; t1 = (f[o + 5] - oz) * iz;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
        if (t0 > tmin) tmin = t0;
        if (t1 < tmax) tmax = t1;
        if (tmax >= Math.max(0, tmin) && tmin <= maxT) return true;
      }
      const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if (tExit > maxT) return false;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
    }
    return false;
  }

  /** Is the point inside any static box? */
  inside(x: number, y: number, z: number): boolean {
    const f = this.flat;
    for (const id of this.cells[this.row(z) * this.cols + this.col(x)]) {
      const o = id * 6;
      if (x > f[o] && x < f[o + 3] && y > f[o + 1] && y < f[o + 4] && z > f[o + 2] && z < f[o + 5]) return true;
    }
    return false;
  }

  private col(x: number) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cellSize))); }
  private row(z: number) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cellSize))); }
  private nextStamp() {
    if (++this.stampId >= 0xffffffff) { this.stamp.fill(0); this.stampId = 1; }
    return this.stampId;
  }

  /** Collect boxes overlapping the given AABB (strictly, with small epsilon). */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Box[] = []): Box[] {
    out.length = 0;
    const s = this.nextStamp();
    const c0 = this.col(minX), c1 = this.col(maxX), r0 = this.row(minZ), r1 = this.row(maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const id of this.cells[r * this.cols + c]) {
          if (this.stamp[id] === s) continue;
          this.stamp[id] = s;
          const b = this.boxes[id];
          if (minX < b.maxX - EPS && maxX > b.minX + EPS && minY < b.maxY - EPS && maxY > b.minY + EPS &&
              minZ < b.maxZ - EPS && maxZ > b.minZ + EPS) out.push(b);
        }
      }
    }
    for (const b of this.dynamic) {
      if (minX < b.maxX - EPS && maxX > b.minX + EPS && minY < b.maxY - EPS && maxY > b.minY + EPS &&
          minZ < b.maxZ - EPS && maxZ > b.minZ + EPS) out.push(b);
    }
    return out;
  }

  overlaps(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    return this.query(minX, minY, minZ, maxX, maxY, maxZ, this.tmp).length > 0;
  }
  private tmp: Box[] = [];

  /** Ray cast. `dir` must be normalized. Returns nearest hit within maxDist. */
  raycast(origin: Vector3, dir: Vector3, maxDist: number): RayHit | null {
    const s = this.nextStamp();
    let best: Box | null = null;
    let bestT = maxDist;
    let bestAxis = 0;

    // DDA over XZ grid
    const cs = this.cellSize;
    let cx = this.col(origin.x), cz = this.row(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const nextBoundX = this.minX + (cx + (stepX > 0 ? 1 : 0)) * cs;
    const nextBoundZ = this.minZ + (cz + (stepZ > 0 ? 1 : 0)) * cs;
    let tMaxX = Math.abs(dir.x) < 1e-9 ? Infinity : (nextBoundX - origin.x) / dir.x;
    let tMaxZ = Math.abs(dir.z) < 1e-9 ? Infinity : (nextBoundZ - origin.z) / dir.z;
    const tDeltaX = Math.abs(dir.x) < 1e-9 ? Infinity : cs / Math.abs(dir.x);
    const tDeltaZ = Math.abs(dir.z) < 1e-9 ? Infinity : cs / Math.abs(dir.z);
    let tCell = 0;

    for (let guard = 0; guard < 4096; guard++) {
      if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) break;
      for (const id of this.cells[cz * this.cols + cx]) {
        if (this.stamp[id] === s) continue;
        this.stamp[id] = s;
        const b = this.boxes[id];
        const r = rayBox(origin, dir, b, bestT);
        if (r && r.t < bestT) { bestT = r.t; best = b; bestAxis = r.axis; }
      }
      const tExit = Math.min(tMaxX, tMaxZ);
      if (best && bestT <= tExit) break;
      if (tExit > bestT || tCell > maxDist) break;
      tCell = tExit;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; } else { cz += stepZ; tMaxZ += tDeltaZ; }
    }
    for (const b of this.dynamic) {
      const r = rayBox(origin, dir, b, bestT);
      if (r && r.t < bestT) { bestT = r.t; best = b; bestAxis = r.axis; }
    }
    if (!best) return null;
    const point = new Vector3().copy(origin).addScaledVector(dir, bestT);
    const normal = new Vector3();
    if (bestAxis === 0) normal.x = -Math.sign(dir.x);
    else if (bestAxis === 1) normal.y = -Math.sign(dir.y);
    else normal.z = -Math.sign(dir.z);
    return { t: bestT, point, normal, box: best };
  }

  /** True if anything blocks the straight segment a → b. */
  segmentBlocked(a: Vector3, b: Vector3): boolean {
    const d = this.tmpV.subVectors(b, a);
    const len = d.length();
    if (len < 1e-6) return false;
    d.divideScalar(len);
    return this.raycast(a, d, len - 0.01) !== null;
  }
  private tmpV = new Vector3();

  /** Highest box top under (x,z) whose top is <= maxY. Returns 0 if only floor. */
  groundHeight(x: number, z: number, maxY: number): number {
    let h = -Infinity;
    for (const b of this.query(x - 0.01, -10, z - 0.01, x + 0.01, maxY + 0.01, z + 0.01, this.tmp)) {
      if (b.maxY <= maxY + 0.01 && b.maxY > h) h = b.maxY;
    }
    return h === -Infinity ? 0 : h;
  }
}

/** Slab test. Returns entry t and axis (0=x,1=y,2=z) or null. Origin inside box → null. */
export interface AABB { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

export function rayBox(o: Vector3, d: Vector3, b: AABB, maxT: number): { t: number; axis: number } | null {
  let tmin = 0, tmax = maxT, axis = -1;
  // X
  if (Math.abs(d.x) < 1e-12) { if (o.x < b.minX || o.x > b.maxX) return null; }
  else {
    let t1 = (b.minX - o.x) / d.x, t2 = (b.maxX - o.x) / d.x;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) { tmin = t1; axis = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Y
  if (Math.abs(d.y) < 1e-12) { if (o.y < b.minY || o.y > b.maxY) return null; }
  else {
    let t1 = (b.minY - o.y) / d.y, t2 = (b.maxY - o.y) / d.y;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) { tmin = t1; axis = 1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Z
  if (Math.abs(d.z) < 1e-12) { if (o.z < b.minZ || o.z > b.maxZ) return null; }
  else {
    let t1 = (b.minZ - o.z) / d.z, t2 = (b.maxZ - o.z) / d.z;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) { tmin = t1; axis = 2; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis === -1) return null; // started inside
  return { t: tmin, axis };
}
