import type { NavGrid } from '../ai/NavGrid';

const INF = 0x3fffffff;
const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP = [10, 10, 10, 10, 14, 14, 14, 14];
/** Extra cost for walking through a cell held by a barricade / shield (zombies smash through). */
export const DEVICE_COST = 300;

/**
 * Multi-source Dijkstra "flow field" over the bot nav grid. One pass gives every zombie the
 * way to the nearest player, so the cost doesn't grow with the size of the horde (the
 * classic horde technique). Cells held by player barricades stay passable at a high cost:
 * zombies walk around them when they can and tear through them when they can't.
 */
export class FlowField {
  readonly dist: Int32Array;
  private buckets: number[][] = [];
  /** Cells currently blocked only by a destructible device. */
  readonly device: Uint8Array;
  computedAt = -1;

  constructor(readonly nav: NavGrid) {
    const n = nav.cols * nav.rows;
    this.dist = new Int32Array(n).fill(INF);
    this.device = new Uint8Array(n);
  }

  passable(i: number) { return this.nav.walk[i] === 1 || this.device[i] === 1; }

  /** Recompute from the given source points (world x/z). */
  compute(sources: { x: number; z: number }[]) {
    const nav = this.nav, cols = nav.cols, rows = nav.rows, d = this.dist;
    d.fill(INF);
    const B = 16 + 14 + DEVICE_COST + 1;
    if (this.buckets.length !== B) this.buckets = Array.from({ length: B }, () => []);
    for (const b of this.buckets) b.length = 0;
    let pending = 0;
    for (const s of sources) {
      const c = nav.nearestWalkable(s.x, s.z, 6);
      if (!c) continue;
      const i = c.r * cols + c.c;
      if (d[i] === 0) continue;
      d[i] = 0;
      this.buckets[0].push(i);
      pending++;
    }
    let cur = 0;
    const clr = nav.clearance;
    while (pending > 0) {
      const bucket = this.buckets[cur % B];
      if (!bucket.length) { cur++; continue; }
      const i = bucket.pop()!;
      pending--;
      if (d[i] !== cur) continue;
      const cc = i % cols, cr = (i - cc) / cols;
      for (let k = 0; k < 8; k++) {
        const nc = cc + DC[k], nr = cr + DR[k];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (!this.passable(ni)) continue;
        if (k >= 4 && (!this.passable(cr * cols + nc) || !this.passable(nr * cols + cc))) continue; // no corner cutting
        const c2 = clr[ni];
        const cost = STEP[k] + (c2 <= 1 ? 16 : c2 === 2 ? 5 : 0) + (this.device[ni] ? DEVICE_COST : 0);
        const nd = cur + cost;
        if (nd < d[ni]) { d[ni] = nd; this.buckets[nd % B].push(ni); pending++; }
      }
    }
  }

  private cellOf(x: number, z: number): number {
    const nav = this.nav;
    let c = nav.colOf(x), r = nav.rowOf(z);
    if (!nav.inBounds(c, r) || this.dist[r * nav.cols + c] >= INF) {
      const w = nav.nearestWalkable(x, z, 4);
      if (!w) return -1;
      c = w.c; r = w.r;
    }
    return r * nav.cols + c;
  }

  /** Path distance to the nearest source in metres (Infinity when unreachable). */
  distanceAt(x: number, z: number): number {
    const i = this.cellOf(x, z);
    if (i < 0 || this.dist[i] >= INF) return Infinity;
    return (this.dist[i] / 10) * this.nav.cell;
  }

  /**
   * Where to walk next: greedy descent along the field, then the furthest cell on that chain
   * that can be walked to in a straight line. Returns false when already at a source or lost.
   * `blocked` is set when the next cell is held by a barricade (smash it).
   */
  steer(x: number, z: number, out: { x: number; z: number; blocked: boolean }, lookahead = 10): boolean {
    const nav = this.nav, cols = nav.cols, d = this.dist;
    let i = this.cellOf(x, z);
    out.blocked = false;
    if (i < 0 || d[i] >= INF) return false;
    if (d[i] === 0) return false;
    const chain: number[] = [];
    for (let s = 0; s < lookahead; s++) {
      const cc = i % cols, cr = (i - cc) / cols;
      let best = -1, bestD = d[i];
      for (let k = 0; k < 8; k++) {
        const nc = cc + DC[k], nr = cr + DR[k];
        if (!nav.inBounds(nc, nr)) continue;
        const ni = nr * cols + nc;
        if (d[ni] < bestD) { bestD = d[ni]; best = ni; }
      }
      if (best < 0) break;
      if (s === 0 && this.device[best] && nav.walk[best] !== 1) out.blocked = true;
      chain.push(best);
      i = best;
      if (d[i] === 0) break;
    }
    if (!chain.length) return false;
    for (let k = chain.length - 1; k >= 0; k--) {
      const ci = chain[k], c = ci % cols, r = (ci - c) / cols;
      const p = nav.center(c, r);
      if (k === 0 || nav.walkLine(x, z, p.x, p.z)) { out.x = p.x; out.z = p.z; return true; }
    }
    return false;
  }
}
