import { describe, expect, it } from 'vitest';
import { BoxGeometry, CylinderGeometry, Euler, Group, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { buildProp, hasBuilder } from '../../src/render/Props';
import type { Batcher } from '../../src/render/Materials';
import type { MapAnimator } from '../../src/render/MapAnimation';
import type { PropDef, PropKind } from '../../src/sim/world/MapTypes';

/**
 * Placement sweep for every prop builder: each one is drawn into a recording batcher and every
 * primitive (boxes, cylinders, raw geometry, LEDs, animated parts, speed displays) must stay
 * inside the prop's collision footprint, except where a builder deliberately reaches out (chairs
 * pulled up to a table, a tree crown, a mast arm over the road). Those allowances are listed per
 * kind below, so an object drawn in the wrong place, floating or sunk into the floor fails here.
 */

interface Rec { mat: string; min: Vector3; max: Vector3; src: string }

class RecordingBatcher {
  recs: Rec[] = [];
  /** Builders never need materials; a stub keeps the fake DOM-free. */
  readonly lib = { baked: null, worldSize: () => ({ w: 1, h: 1 }), probeLit: () => false, get: () => null };
  private add(mat: string, geo: BufferGeometry, x: number, y: number, z: number, rotY: number, rotX: number, rotZ: number, src: string) {
    const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rotX, rotY, rotZ)), new Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    this.recs.push({ mat, min: bb.min.clone(), max: bb.max.clone(), src });
    geo.dispose();
  }
  addGeometry(mat: string, geo: BufferGeometry, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0) { this.add(mat, geo, x, y, z, rotY, rotX, rotZ, 'geo'); }
  box(mat: string, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) { this.add(mat, new BoxGeometry(w, h, d), x, y + h / 2, z, rotY, 0, 0, 'box'); }
  roundedBox(mat: string, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) { this.add(mat, new BoxGeometry(w, h, d), x, y + h / 2, z, rotY, 0, 0, 'box'); }
  cylinder(mat: string, r: number, h: number, x: number, y: number, z: number, seg = 14, rotX = 0, rotZ = 0, rTop = r) {
    this.add(mat, new CylinderGeometry(rTop, r, h, seg), x, y + h / 2, z, 0, rotX, rotZ, 'cyl');
  }
}

class RecordingAnimator {
  frames: ((t: number) => void)[] = [];
  constructor(private b: RecordingBatcher) {}
  blinker(x: number, y: number, z: number, w: number, h: number, d: number, rotY: number) {
    this.b.addGeometry('blinker', new BoxGeometry(w, h, d), x, y + h / 2, z, rotY);
  }
  part(_x: number, _y: number, _z: number, draw: (b: Batcher) => void) { draw(this.b as unknown as Batcher); return new Group(); }
  instanced(_x: number, _y: number, _z: number, _count: number, draw: (b: Batcher) => void, place: (i: number, t: number, out: Matrix4) => void) {
    draw(this.b as unknown as Batcher);
    place(0, 0, new Matrix4());
  }
  onFrame(fn: (t: number) => void) { this.frames.push(fn); }
  speedDisplay(x: number, y: number, z: number, rotY: number, w: number, h: number) {
    this.b.addGeometry('speedDisplay', new BoxGeometry(w, h, 0.002), x, y, z, rotY);
  }
  finish() {}
}

/** Every prop kind, with the sizes the maps use. `facing` is the one the map uses. */
const SAMPLES: PropDef[] = ([
  ['cubicle', 5, 4.4, 1.4], ['cubicle', 6, 2.6, 1.4], ['confTable', 1.8, 5, 0.76], ['reception', 6, 1.2, 1.1], ['sofa', 3, 1, 0.8],
  ['pillar', 1, 1, 6], ['pillar', 0.8, 0.8, 3.4], ['planter', 0.8, 0.8, 1.4], ['vending', 1.2, 0.8, 1.9], ['copier', 1.6, 1, 1.2],
  ['cabinet', 0.8, 5, 1.3, { facing: 1 }], ['whiteboard', 3, 0.2, 2.0], ['whiteboard', 2.6, 0.15, 1.3, { y: 0.9, solid: false }],
  ['counter', 4, 1.2, 1.0], ['kitchenette', 1.4, 8, 1.0, { facing: 1 }], ['fridge', 1.2, 1, 2.0], ['table', 2.4, 1.2, 0.76],
  ['serverRack', 7, 1, 2.2], ['crac', 1.4, 1, 2.0], ['mailShelf', 5, 0.6, 1.9], ['crate', 1.2, 1.2, 1.2], ['crate', 1.2, 1.2, 2.4],
  ['pallet', 2, 2, 1.2], ['rack', 1.2, 8, 4.2], ['rack', 10, 1.2, 3.6], ['chamber', 4, 3, 2.6, { facing: 2 }], ['burnIn', 4, 3, 2.6],
  ['rfChamber', 5, 4, 4], ['robotCell', 4, 4, 3.2], ['conveyor', 18, 1.4, 1.0], ['conveyor', 10, 1.2, 1.0], ['forklift', 1.4, 2.6, 2.2],
  ['barrels', 1.2, 1.2, 1.0], ['barrels', 1.6, 1.6, 1.0], ['trailer', 3, 10, 3.8], ['boxTruck', 9, 2.8, 3.2, { facing: 1 }],
  ['dumpster', 2.2, 1.4, 1.4], ['car', 2, 4.4, 1.4, { facing: 2 }], ['patrolCar', 2, 4.4, 1.4], ['speedTrailer', 1.6, 3.2, 2.75],
  ['barrier', 3, 0.6, 0.9], ['partition', 1.6, 0.5, 3.4], ['tv', 3, 0.15, 1.6, { y: 1.0, solid: false, facing: 2 }],
  ['logo', 7, 0.1, 2.2, { y: 2.2, solid: false, facing: 2 }], ['packTable', 3, 1.4, 0.9], ['container', 2.4, 6, 2.6],
  ['console', 2, 1, 1.2, { facing: 3 }], ['bench', 2.5, 0.6, 0.5], ['cooler', 0.5, 0.5, 1.2], ['ups', 1.2, 1.6, 1.4],
  ['lightPole', 0.3, 0.3, 6], ['cart', 0.7, 1.2, 1.1], ['display', 2.4, 0.5, 2.0, { facing: 2 }],
  ['display', 2.4, 0.5, 2.0, { facing: 2, variant: 'sports' }], ['speedSign', 0.14, 0.9, 1.55, { y: 1.05, solid: false, facing: 1 }],
  ['fan', 6, 6, 1.1, { y: 7.3, solid: false }],
  // engineering office and traffic products
  ['booth', 2.0, 1.9, 1.15], ['highTop', 1.2, 1.2, 1.05], ['coffeeBar', 4.0, 0.75, 0.95, { facing: 2 }], ['pingPong', 2.74, 1.525, 0.76],
  ['foosball', 1.5, 0.8, 0.92], ['arcade', 0.75, 0.85, 1.85], ['stalls', 5.0, 1.6, 1.85], ['stalls', 6.0, 1.6, 1.85],
  ['urinals', 2.4, 0.5, 1.3], ['vanity', 3.0, 0.6, 0.9], ['execDesk', 2.2, 1.9, 0.76], ['bookcase', 1.0, 0.4, 2.0],
  ['labBench', 2.4, 0.9, 0.92], ['poleMount', 0.5, 0.5, 4.2], ['poleMount', 0.5, 0.5, 3.2], ['alprCam', 0.35, 0.35, 3.8],
  ['speedCamera', 0.4, 0.4, 3.6], ['lidarTripod', 0.8, 0.8, 1.6], ['speedSignPole', 0.4, 0.4, 3.6], ['pitchNet', 2.6, 0.8, 2.4],
  ['tree', 0.6, 0.6, 7], ['tree', 0.6, 0.6, 6], ['bollard', 0.3, 0.3, 1.0], ['monument', 4.0, 0.8, 1.6],
  ['canopy', 10, 5, 0.35, { y: 3.3, solid: false }], ['hvacUnit', 1.2, 1.2, 1.1], ['generator', 3.4, 1.4, 1.7],
  ['transformer', 1.6, 1.4, 1.3], ['trashCan', 0.5, 0.5, 0.9], ['trashCan', 0.5, 0.5, 0.9, { variant: 'recycle' }],
  ['podium', 0.6, 0.5, 1.15], ['classTable', 0.6, 1.8, 0.74, { facing: 3 }], ['phoneBooth', 1.1, 1.1, 2.25],
  ['waterFountain', 0.9, 0.5, 1.0], ['shelving', 1.2, 0.6, 2.0], ['shelving', 1.2, 0.6, 2.0, { variant: 'it' }],
  ['shelving', 1.2, 0.6, 2.0, { variant: 'janitor' }], ['switchgear', 3.0, 0.8, 2.2], ['airHandler', 3.0, 1.6, 2.4],
  ['waterHeater', 0.7, 0.7, 1.8], ['balloons', 0.8, 0.8, 2.2, { solid: false, y: 0.76 }], ['fireExt', 0.3, 0.15, 0.7, { y: 0.9, solid: false }],
  ['mopSink', 0.9, 0.7, 0.5], ['projScreen', 3.0, 0.12, 1.8, { y: 0.9, solid: false }], ['armchair', 0.85, 0.85, 0.85],
  ['coffeeTable', 1.2, 0.6, 0.42], ['credenza', 2.0, 0.5, 0.8], ['credenza', 2.0, 0.5, 0.8, { variant: 'catering' }],
  ['turnstile', 0.3, 1.6, 1.0],
] as [PropKind, number, number, number, Partial<PropDef>?][]).map(([kind, w, d, h, extra]) => ({ kind, x: 3.7, z: -2.3, w, d, h, ...extra }));

/** Local-frame region (relative to the footprint) where parts may legitimately sit. */
interface Region { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
type Allow = (W: number, D: number, H: number) => Region[];
const R = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): Region => ({ x0, x1, z0, z1, y0, y1 });
/** The footprint itself, optionally with things standing on top of it. */
const fp = (W: number, D: number, H: number, top = 0) => R(-W / 2, W / 2, -D / 2, D / 2, 0, H + top);
const onTop = (top: number): Allow => (W, D, H) => [fp(W, D, H, top)];
/** Chairs pulled up beyond the footprint by `reach` on the given sides (below seat-back height). */
const chairs = (reach: number, sides: { x?: boolean; z?: boolean; front?: boolean; back?: boolean }, top = 0.3): Allow => (W, D, H) => [
  fp(W, D, H, top),
  R(sides.x ? -W / 2 - reach : -W / 2, sides.x ? W / 2 + reach : W / 2,
    sides.z || sides.front ? -D / 2 - reach : -D / 2, sides.z || sides.back ? D / 2 + reach : D / 2, 0, 1.15),
];
/** Above height `y`, parts may reach out by `out` (mast arms, sign panels, crowns). */
const above = (y: (H: number) => number, out: { x?: number; front?: number; back?: number; top?: number }): Allow => (W, D, H) => [
  fp(W, D, H),
  R(-W / 2 - (out.x ?? 0), W / 2 + (out.x ?? 0), -D / 2 - (out.front ?? 0), D / 2 + (out.back ?? 0), y(H), H + (out.top ?? 0)),
];
/** Wall fittings rising above a counter within the back `depth` of the footprint, up to height `y`. */
const wallAbove = (depth: number, y: number, top = 0.3): Allow => (W, D, H) => [fp(W, D, H, top), R(-W / 2, W / 2, D / 2 - depth, D / 2, 0, y)];

/** Small fittings (handles, lips, ribs, mirrors) standing proud of the faces by `x` (sides), `f` (front), `b` (back). */
const proud = (x: number, f: number, b = f, top = 0): Allow => (W, D, H) => [R(-W / 2 - x, W / 2 + x, -D / 2 - f, D / 2 + b, 0, H + top)];
const ALLOW: Partial<Record<PropKind, Allow>> = {
  // ---- existing builders (measured): chairs at tables, things stood on top, fittings proud of faces ----
  confTable: chairs(0.8, { x: true, z: true }, 0.36), table: chairs(0.8, { x: true, z: true }, 0.36),
  cubicle: onTop(0.05), reception: proud(0.05, 0.05, 0.05, 0.55), counter: onTop(0.5), packTable: onTop(0.35), console: onTop(0.05),
  kitchenette: (W, D, H) => [fp(W, D, H, 0.45), R(-W / 2, W / 2, D / 2 - 0.36, D / 2, 0, 2.25)],
  chamber: proud(0.08, 0.13, 0.06, 0.35), burnIn: proud(0.06, 0, 0, 0.1), serverRack: onTop(0.09),
  rfChamber: (W, D, H) => [...proud(0.05, 0.13, 0.03, 0.45)(W, D, H), R(-W / 2, W / 2, -D / 2 - 0.41, D / 2, 0, 0.06)],
  conveyor: onTop(0.55), robotCell: onTop(0.15), speedTrailer: onTop(0.05), planter: proud(0.08, 0.08),
  fridge: proud(0, 0.05, 0), rack: proud(0.05, 0.05), trailer: proud(0, 0, 0.05), boxTruck: proud(0, 0.05, 0),
  car: proud(0.11, 0.07), patrolCar: proud(0.11, 0.14, 0.07, 0.4), container: proud(0.05, 0.07),
  forklift: (W, D, H) => [fp(W, D, H, 0.12), R(-W / 2, W / 2, -D / 2 - 0.16, D / 2, 0, 0.12)],
  lightPole: above((H) => H - 0.3, { front: 0.95, x: 0.03, top: 0.03 }),
  // Mobile whiteboard: its 0.5 m feet are wider than the 0.2 m collision board (see report).
  whiteboard: (W, D, H) => [fp(W, D, H), R(-W / 2, W / 2, -0.25, 0.25, 0, 0.8)],
  // ---- new builders: the documented visual overhangs ----
  coffeeBar: wallAbove(0.35, 2.4, 0.7), foosball: (W, D, H) => [fp(W, D, H, 0.02), R(-W / 2, W / 2, -D / 2 - 0.2, D / 2 + 0.2, H - 0.12, H - 0.04)],
  vanity: wallAbove(0.2, 2.05, 0.2), execDesk: chairs(0.7, { front: true }, 0.75), labBench: (W, D, H) => [...chairs(0.6, { front: true }, 0.55)(W, D, H), R(-W / 2, W / 2, D / 2 - 0.35, D / 2, 0, 1.8)],
  poleMount: above((H) => H - 1.0, { front: 1.45 }), alprCam: above((H) => 0.6 * H, { x: 0.35, front: 0.35, back: 0.35 }),
  speedCamera: above((H) => H - 0.75, { front: 0.4 }), speedSignPole: above((H) => H - 1.8, { x: 0.35 }),
  tree: (W, D, H) => [fp(W, D, H), R(-6, 6, -6, 6, 2.4, H), R(-1.2, 1.2, -1.2, 1.2, 0, 0.15)],
  monument: (W, D, H) => [fp(W, D, H), R(-W / 2, W / 2, -D / 2 - 0.5, D / 2 + 0.5, 0, 0.5)],
  generator: onTop(0.4), highTop: onTop(0.1), booth: onTop(0.05), pingPong: onTop(0.18), coffeeTable: onTop(0.06),
  podium: onTop(0.3), classTable: chairs(0.7, { back: true }, 0.25), waterFountain: wallAbove(0.2, 1.9),
  switchgear: onTop(3.45 - 2.2), airHandler: onTop(3.45 - 2.4), mopSink: wallAbove(0.15, 1.22), credenza: onTop(0.75),
  turnstile: (W, D, H) => [fp(W, D, H, 0.02), R(-W / 2 - 0.15, W / 2 + 0.15, -D / 2, D / 2, 0, H)],
};

const TOL = 0.03;

/** World AABB of a record → prop-local AABB (quarter turns are exact). */
function toLocal(p: PropDef, rec: Rec) {
  const rot = -(p.facing ?? 0) * Math.PI / 2, c = Math.round(Math.cos(rot)), s = Math.round(Math.sin(rot));
  const xs: number[] = [], zs: number[] = [];
  for (const wx of [rec.min.x, rec.max.x]) for (const wz of [rec.min.z, rec.max.z]) {
    const dx = wx - p.x, dz = wz - p.z;
    xs.push(c * dx - s * dz); zs.push(s * dx + c * dz);
  }
  const y0 = p.y ?? 0;
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: rec.min.y - y0, y1: rec.max.y - y0 };
}
const inside = (b: Region, r: Region) => b.x0 >= r.x0 - TOL && b.x1 <= r.x1 + TOL && b.z0 >= r.z0 - TOL && b.z1 <= r.z1 + TOL && b.y0 >= r.y0 - TOL && b.y1 <= r.y1 + TOL;

function draw(p: PropDef) {
  const b = new RecordingBatcher(), a = new RecordingAnimator(b);
  buildProp(b as unknown as Batcher, p, 7, a as unknown as MapAnimator);
  for (const f of a.frames) { f(0); f(3.7); }
  return b.recs;
}

/** The sample in all four facings, keeping the local W x D the builder sees. */
function facings(p: PropDef): PropDef[] {
  const f0 = p.facing ?? 0;
  return [0, 1, 2, 3].map((k) => ({ ...p, facing: ((f0 + k) % 4) as 0 | 1 | 2 | 3, w: k % 2 ? p.d : p.w, d: k % 2 ? p.w : p.d }));
}

describe('prop placement sweep', () => {
  it('covers every prop kind with a dedicated builder', () => {
    const kinds = new Set(SAMPLES.map((s) => s.kind));
    const missing = ALL_KINDS.filter((k) => !kinds.has(k));
    expect(missing).toEqual([]);
    expect(ALL_KINDS.filter((k) => !hasBuilder(k))).toEqual([]);
  });

  it('every primitive is finite, above the floor and inside its footprint (or a documented overhang)', async () => {
    const bad: string[] = [];
    for (const sample of SAMPLES) for (const p of facings(sample)) {
      const odd = (p.facing ?? 0) % 2 === 1, W = odd ? p.d : p.w, D = odd ? p.w : p.d;
      const regions = (ALLOW[p.kind] ?? ((w, d, h) => [fp(w, d, h)]))(W, D, p.h);
      for (const rec of draw(p)) {
        const at = `${p.kind}${p.variant ? `/${p.variant}` : ''} f${p.facing} ${rec.src} ${rec.mat}`;
        if (![rec.min.x, rec.min.y, rec.min.z, rec.max.x, rec.max.y, rec.max.z].every(Number.isFinite)) { bad.push(`${at}: NaN`); continue; }
        const b = toLocal(p, rec);
        if (b.y0 < -0.01) bad.push(`${at}: below floor y=${b.y0.toFixed(3)}`);
        else if (!regions.some((r) => inside(b, r))) {
          bad.push(`${at}: x ${b.x0.toFixed(2)}..${b.x1.toFixed(2)} z ${b.z0.toFixed(2)}..${b.z1.toFixed(2)} y ${b.y0.toFixed(2)}..${b.y1.toFixed(2)} (W ${W} D ${D} H ${p.h})`);
        }
      }
    }
    // PROPS_REPORT=<file> dumps every violation (not just the first 40) for tuning allowances.
    if (process.env.PROPS_REPORT) (await import('node:fs')).writeFileSync(process.env.PROPS_REPORT, [...new Set(bad)].join('\n'));
    expect([...new Set(bad)].slice(0, 40)).toEqual([]);
  });

  it('pole-mounted products keep their hardware under the pole top, indoors and out', () => {
    for (const kind of ['poleMount', 'alprCam', 'speedCamera', 'speedSignPole'] as const) for (const h of [3.2, 3.6, 4.2]) {
      const top = Math.max(...draw({ kind, x: 0, z: 0, w: 0.4, d: 0.4, h }).map((r) => r.max.y));
      expect(top, `${kind} h=${h}`).toBeLessThanOrEqual(h + TOL);
    }
  });
});

/** Exhaustive at compile time: adding a PropKind without listing it here fails `npm run typecheck`. */
const KIND_TABLE: Record<PropKind, true> = {
  cubicle: true, confTable: true, reception: true, sofa: true, pillar: true, planter: true, vending: true, copier: true, cabinet: true,
  whiteboard: true, counter: true, kitchenette: true, fridge: true, table: true, serverRack: true, crac: true, mailShelf: true, crate: true,
  pallet: true, rack: true, chamber: true, burnIn: true, rfChamber: true, robotCell: true, conveyor: true, forklift: true, barrels: true,
  trailer: true, boxTruck: true, dumpster: true, car: true, patrolCar: true, speedTrailer: true, barrier: true, partition: true, tv: true,
  logo: true, packTable: true, container: true, console: true, bench: true, cooler: true, ups: true, lightPole: true, cart: true,
  display: true, speedSign: true, fan: true,
  booth: true, highTop: true, coffeeBar: true, pingPong: true, foosball: true, arcade: true, stalls: true, urinals: true, vanity: true,
  execDesk: true, bookcase: true, labBench: true, poleMount: true, alprCam: true, speedCamera: true, lidarTripod: true, speedSignPole: true,
  pitchNet: true, tree: true, bollard: true, monument: true, canopy: true, hvacUnit: true, generator: true, transformer: true, trashCan: true,
  podium: true, classTable: true, phoneBooth: true, waterFountain: true, shelving: true, switchgear: true, airHandler: true, waterHeater: true,
  balloons: true, fireExt: true, mopSink: true, projScreen: true, armchair: true, coffeeTable: true, credenza: true, turnstile: true,
};
const ALL_KINDS = Object.keys(KIND_TABLE) as PropKind[];
