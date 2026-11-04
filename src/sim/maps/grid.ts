import type { DoorDef, FloorLine, PropDef, SignDef } from '../world/MapTypes';

/** Builds a map's cell grid: rooms are filled rectangles, doors are carved openings with a lintel. */
export class GridBuilder {
  cells: string[][];
  doors: DoorDef[] = [];
  constructor(cols: number, rows: number, fill: string) {
    this.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
  }
  /** Fill inclusive cell rect. */
  rect(c0: number, r0: number, c1: number, r1: number, ch: string) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r][c] = ch;
    return this;
  }
  /** Carve a door opening through a wall; `lintel` = height of the top of the opening. */
  door(c0: number, r0: number, c1: number, r1: number, ch: string, lintel: number) {
    this.rect(c0, r0, c1, r1, ch);
    this.doors.push({ c0, r0, c1, r1, lintel });
    return this;
  }
  rows(): string[] { return this.cells.map((r) => r.join('')); }
}

/** Prop shorthand: kind, centre x / z, size w (X) × d (Z) × h. */
export const P = (kind: PropDef['kind'], x: number, z: number, w: number, d: number, h: number, extra: Partial<PropDef> = {}): PropDef =>
  ({ kind, x, z, w, d, h, ...extra });

/** Sign faces look along: S = +Z (south), N = -Z, E = +X, W = -X. */
export const FACE = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 } as const;

export const sign = (text: string, x: number, y: number, z: number, rot: number, w = 2.2, h = 0.42, bg?: string, fg?: string): SignDef =>
  ({ text, x, y, z, rot, w, h, bg, fg });

export const line = (x0: number, z0: number, x1: number, z1: number, color: FloorLine['color'], width?: number): FloorLine =>
  ({ x0, z0, x1, z1, color, width });
