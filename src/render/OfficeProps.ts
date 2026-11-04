import { CylinderGeometry, IcosahedronGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { PropDef } from '../sim/world/MapTypes';
import { type Ctx, type Prims, cafeChair, faceTo, monitor, officeChair, tiltedBox } from './propKit';

/**
 * Builders for the engineering-office props (ACI Building 2) and the traffic products that
 * stand around it: ALPR and enforcement cameras, radar pole mounts, speed signs, lidar.
 * Same local frame and rules as Props.ts: front faces -Z, origin at the footprint centre,
 * y = 0 at the base, and everything solid stays inside the W x D x H collision box except the
 * documented visual overhangs (chairs pulled up to tables, crowns, mast arms, wall-mounted
 * fittings above a counter).
 */

type V3 = [number, number, number];
const UP = new Vector3(0, 1, 0);

/** Thin cylinder from a to b (prop-local). */
function strut(c: Prims, mat: string, a: V3, b: V3, r: number, seg = 6) {
  const dir = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  if (len < 1e-4) return;
  const g = new CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  c.geo(mat, g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}
/** Horizontal cylinder along local Z, centred at (x, y, z). */
function rodZ(c: Prims, mat: string, x: number, y: number, z: number, r: number, len: number, seg = 10) {
  const g = new CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  c.geo(mat, g, x, y, z);
}
function sphere(c: Prims, mat: string, x: number, y: number, z: number, r: number, squash = 1, seg = 10) {
  const g = new SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75)));
  if (squash !== 1) g.scale(1, squash, 1);
  c.geo(mat, g, x, y, z);
}
/** Low-poly foliage blob (shrubs, tree crowns). */
function blob(c: Prims, mat: string, x: number, y: number, z: number, r: number, squash: number, spin = 0) {
  const g = new IcosahedronGeometry(r, 1);
  g.scale(1, squash, 1);
  c.geo(mat, g, x, y, z, spin);
}
/** Tripod: three legs from a hub at `top` to feet on a circle of radius `spread`. */
function tripod(c: Prims, x: number, z: number, top: number, spread: number, mat = 'p:#26292d') {
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3 + 0.5;
    strut(c, mat, [x + Math.sin(a) * 0.04, top, z + Math.cos(a) * 0.04], [x + Math.sin(a) * spread, 0.01, z + Math.cos(a) * spread], 0.012, 5);
    c.plain('rubber', x + Math.sin(a) * spread, 0, z + Math.cos(a) * spread, 0.035, 0.02, 0.035);
  }
  c.cyl(mat, x, top - 0.08, z, 0.03, 0.1, 8);
}
/** Laptop on a surface at height y; the user sits on the +Z side (screen faces +Z) unless `dir` is -1. */
function laptop(c: Prims, x: number, y: number, z: number, dir: 1 | -1 = 1, shell = 'p:#9aa0a6') {
  c.plain(shell, x, y, z, 0.32, 0.018, 0.22);
  c.plain('rubber', x, y + 0.018, z + dir * 0.02, 0.27, 0.002, 0.12);
  const t = 0.28, half = 0.105;
  const hz = z - dir * 0.11; // hinge on the far edge
  const cy = y + 0.018 + half * Math.cos(t), cz = hz - dir * half * Math.sin(t);
  tiltedBox(c.geo, shell, x, cy, cz, 0.32, 0.21, 0.012, dir * t);
  tiltedBox(c.geo, 'screen', x, cy + 0.007 * Math.sin(t), cz + dir * 0.007 * Math.cos(t), 0.29, 0.18, 0.003, dir * t);
}
/** Potted plant: pot of radius `r` on the surface at height y. */
function pottedPlant(c: Prims, x: number, y: number, z: number, r: number, h: number) {
  c.cyl('p:#2c2c30', x, y, z, r, h * 0.35, 12);
  c.cyl('p:#3a2a1e', x, y + h * 0.35 - 0.01, z, r * 0.9, 0.012, 12);
  for (let k = 0; k < 3; k++) blob(c, 'foliage', x + Math.sin(k * 2.1) * r * 0.35, y + h * (0.5 + k * 0.14), z + Math.cos(k * 2.1) * r * 0.35, r * (1.05 - k * 0.2), 0.8, k);
}
/** Upholstery colours shared by booths, sofas and lounge chairs. */
const UPHOLSTERY = ['#7a3b2e', '#2f5d62', '#4a4f7a', '#8a6a3a', '#3c4a5a'];

export const OFFICE_BUILDERS: Partial<Record<PropDef['kind'], (c: Ctx) => void>> = {
  booth: (c) => {
    // Café booth: a fixed table between two high-back benches (backs on the long ±Z edges).
    const { W, D, H, box, plain, cyl, r } = c;
    const fab = 'p:' + r.pick(UPHOLSTERY);
    for (const s of [-1, 1]) {
      box('darkWood', 0, 0, s * (D / 2 - 0.29), W, 0.4, 0.5);
      box(fab, 0, 0.4, s * (D / 2 - 0.3), W - 0.06, 0.1, 0.48);
      box('darkWood', 0, 0, s * (D / 2 - 0.06), W, H, 0.12);
      box(fab, 0, 0.52, s * (D / 2 - 0.16), W - 0.08, H - 0.62, 0.08);
      for (let k = 1; k < 4; k++) plain('rubber', -W / 2 + k * W / 4, 0.55, s * (D / 2 - 0.205), 0.012, H - 0.68, 0.004);
    }
    const tw = W - 0.14, td = D - 1.24;
    cyl('m:#3a3e44', 0, 0, 0, 0.05, 0.72, 10);
    box('m:#3a3e44', 0, 0, 0, 0.6, 0.03, td * 0.7);
    box('p:#e6e3dc', 0, 0.72, 0, tw, 0.04, td);
    plain('rubber', 0, 0.735, -td / 2 - 0.004, tw, 0.022, 0.008);
    plain('rubber', 0, 0.735, td / 2 + 0.004, tw, 0.022, 0.008);
    // a napkin dispenser, cups and maybe a laptop someone left open
    plain('chrome', 0, 0.76, 0, 0.12, 0.13, 0.08);
    for (let k = 0; k < 2; k++) if (r.chance(0.7)) cyl(r.pick(['p:#f2f0ea', 'p:#b02a2a', 'p:#2a2d31']), r.range(-tw / 2 + 0.2, tw / 2 - 0.2), 0.76, (k ? 1 : -1) * td * 0.25, 0.04, 0.1, 10);
    if (r.chance(0.4)) laptop(c, r.range(-0.4, 0.4), 0.76, r.chance(0.5) ? td * 0.1 : -td * 0.1, r.chance(0.5) ? 1 : -1);
  },

  highTop: (c) => {
    // Bar-height table with stools tucked in.
    const { W, D, H, cyl, plain, r } = c;
    const rad = Math.min(W, D) / 2;
    cyl('m:#2f3337', 0, 0, 0, 0.26, 0.03, 16);
    cyl('m:#2f3337', 0, 0.03, 0, 0.04, H - 0.07, 10);
    cyl('wood', 0, H - 0.04, 0, rad * 0.6, 0.04, 20);
    const n = 2 + r.int(1, 2), a0 = r.range(0, Math.PI);
    const seat = 'p:' + r.pick(['#2a2d31', '#7a3b2e', '#2f5d62']);
    for (let k = 0; k < n; k++) {
      const a = a0 + k * Math.PI * 2 / n, R = rad - 0.19;
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      cyl('m:#2f3337', x, 0, z, 0.17, 0.02, 14);
      cyl('chrome', x, 0.02, z, 0.022, 0.66, 8);
      for (const q of [0, Math.PI / 2]) plain('chrome', x, 0.3, z, 0.26, 0.015, 0.015, q);
      cyl(seat, x, 0.68, z, 0.17, 0.06, 14);
    }
    if (r.chance(0.6)) cyl('p:#f2f0ea', r.range(-0.1, 0.1), H, r.range(-0.1, 0.1), 0.04, 0.1, 10);
  },

  coffeeBar: (c) => {
    // Coffee bar on a wall (back = +Z): cabinets, quartz top, espresso, brewers, shelves, menu board.
    const { W, D, H, box, plain, cyl, r, world, rot, anim } = c;
    const back = D / 2;
    box('p:#2f3a40', 0, 0.1, 0.02, W, H - 0.14, D - 0.04);
    box('rubber', 0, 0, 0.06, W - 0.05, 0.1, D - 0.12);
    box('p:#ecebe6', 0, H - 0.04, 0, W, 0.04, D);
    const n = Math.max(2, Math.round(W / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * W / n;
      plain('p:#232c31', x - W / n / 2, 0.14, -D / 2 + 0.037, 0.012, H - 0.26, 0.006);
      plain('chrome', x + W / n / 2 - 0.08, H - 0.32, -D / 2 + 0.027, 0.02, 0.14, 0.025);
    }
    // under-counter fridge (glass door)
    box('m:#3a3f45', W * 0.36, 0.12, -D / 2 + 0.03, 0.6, 0.7, 0.03);
    plain('glass', W * 0.36, 0.17, -D / 2 + 0.012, 0.5, 0.6, 0.006);
    for (const y of [0.3, 0.5]) for (let k = 0; k < 4; k++) cyl(r.pick(['p:#d6dee6', 'p:#f2c230', 'p:#b02a2a']), W * 0.36 - 0.18 + k * 0.12, y, -D / 2 + 0.12, 0.03, 0.14, 8);
    // espresso machine: body, cup warmer, two group heads, steam wand, drip tray
    const ex = -W * 0.3;
    box('chrome', ex, H, 0.06, 0.72, 0.42, 0.46);
    box('p:#1c1e21', ex, H + 0.42, 0.06, 0.72, 0.03, 0.46);
    plain('screen', ex, H + 0.3, 0.06 - 0.232, 0.16, 0.06, 0.004);
    for (const s of [-1, 1]) {
      cyl('chrome', ex + s * 0.18, H + 0.2, -0.17, 0.045, 0.06, 12);
      plain('rubber', ex + s * 0.18, H + 0.17, -0.24, 0.035, 0.03, 0.14);
    }
    plain('m:#5d656b', ex, H, -0.2, 0.62, 0.03, 0.12);
    strut(c, 'chrome', [ex + 0.33, H + 0.3, -0.16], [ex + 0.36, H + 0.08, -0.22], 0.008);
    // grinder
    cyl('p:#2a2d31', ex - 0.52, H, 0.05, 0.08, 0.28, 12);
    cyl('glass', ex - 0.52, H + 0.28, 0.05, 0.09, 0.2, 12);
    cyl('p:#5a3a22', ex - 0.52, H + 0.29, 0.05, 0.07, 0.1, 12);
    // two drip brewers with airpots
    for (const bx of [W * 0.04, W * 0.17]) {
      box('p:#2a2d31', bx, H, 0.1, 0.24, 0.5, 0.34);
      plain('chrome', bx, H + 0.34, -0.075, 0.2, 0.06, 0.02);
      cyl('chrome', bx, H, -0.13, 0.07, 0.3, 12);
      plain('rubber', bx, H + 0.3, -0.13, 0.06, 0.03, 0.12);
    }
    // cup stacks and a condiment caddy
    for (let k = 0; k < 3; k++) cyl(k === 2 ? 'p:#2a2d31' : 'p:#f2f0ea', W * 0.28 + k * 0.1, H, -0.12, 0.045, 0.3 + k * 0.04, 10);
    box('p:#2a2d31', W / 2 - 0.25, H, -0.08, 0.32, 0.12, 0.22);
    for (let k = 0; k < 4; k++) plain(r.pick(['p:#f2f0ea', 'p:#c9ad78', 'p:#d84a3a', 'p:#5a8a3a']), W / 2 - 0.36 + k * 0.075, H + 0.12, -0.08, 0.05, 0.08, 0.16);
    // wall: open shelves with mugs, a menu board and an under-shelf light
    for (const y of [1.55, 1.92]) {
      box('wood', -W * 0.19, y, back - 0.13, W * 0.55, 0.035, 0.24);
      for (let k = 0; k < 7; k++) if (r.chance(0.8)) cyl('p:' + r.pick(['#f2f0ea', '#2a5aa8', '#b02a2a', '#2a2d31', '#e8b818']), -W * 0.19 - W * 0.24 + k * W * 0.08, y + 0.035, back - 0.14, 0.04, 0.1, 10);
    }
    plain('e:#fff1d6', -W * 0.19, 1.545, back - 0.2, W * 0.5, 0.008, 0.03);
    box('p:#1f2422', W * 0.27, 1.25, back - 0.025, W * 0.36, 1.05, 0.04);
    plain('wood', W * 0.27, 1.23, back - 0.025, W * 0.38, 0.03, 0.05);
    for (let k = 0; k < 7; k++) plain('e:#e8e4d8', W * 0.27 - W * 0.12 + (k % 2) * 0.05, 2.12 - k * 0.12, back - 0.047, W * (k === 0 ? 0.2 : 0.12 + (k % 3) * 0.03), 0.018, 0.003);
    const [lx, ly, lz] = world(ex + 0.3, H + 0.31, 0.06 - 0.235);
    anim.blinker(lx, ly, lz, 0.02, 0.02, 0.008, rot, '#3dff7a', 1, 1);
  },

  pingPong: (c) => {
    const { W, D, box, plain, cyl, r } = c;
    const top = 0.76;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('m:#2a2d31', sx * (W / 2 - 0.3), 0, sz * (D / 2 - 0.16), 0.045, top - 0.04, 0.045);
    for (const sx of [-1, 1]) box('m:#2a2d31', sx * (W / 2 - 0.3), 0.12, 0, 0.04, 0.04, D - 0.32);
    box('m:#3a3e44', 0, top - 0.1, 0, W - 0.4, 0.04, 0.06);
    box('p:#1f4f7a', 0, top - 0.04, 0, W, 0.04, D);
    const y = top + 0.0005;
    for (const s of [-1, 1]) {
      plain('p:#f2f2f2', 0, y, s * (D / 2 - 0.01), W, 0.002, 0.02);
      plain('p:#f2f2f2', s * (W / 2 - 0.01), y, 0, 0.02, 0.002, D);
    }
    plain('p:#f2f2f2', 0, y, 0, W, 0.002, 0.004);
    // net across the middle with its two clamps
    plain('p:#f4f4f0', 0, top + 0.02, 0, 0.006, 0.13, D - 0.06);
    plain('p:#f4f4f0', 0, top + 0.14, 0, 0.012, 0.015, D - 0.06);
    for (const s of [-1, 1]) plain('m:#2a2d31', 0, top, s * (D / 2 - 0.02), 0.03, 0.16, 0.03);
    for (const s of [-1, 1]) {
      const px = s * r.range(0.5, 0.9), pz = r.range(-0.35, 0.35);
      cyl(s < 0 ? 'p:#b02020' : 'p:#1c1d1f', px, top, pz, 0.075, 0.012, 14);
      plain('wood', px + s * 0.1, top, pz, 0.1, 0.02, 0.03);
    }
    sphere(c, 'p:#f8f8f4', r.range(-0.6, 0.6), top + 0.02, r.range(-0.4, 0.4), 0.02, 1, 8);
  },

  foosball: (c) => {
    const { W, D, H, box, plain, cyl } = c;
    const y0 = 0.62;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('wood', sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), 0.08, y0, 0.08);
    box('darkWood', 0, y0, 0, W, H - y0, D);
    box('p:#2e7d32', 0, H - 0.2, 0, W - 0.1, 0.012, D - 0.1);
    plain('p:#f2f2f2', 0, H - 0.187, 0, 0.006, 0.002, D - 0.12);
    for (const s of [-1, 1]) plain('rubber', s * (W / 2 - 0.004), H - 0.18, 0, 0.012, 0.08, 0.22);
    // eight rods: goalie, defence, midfield, attack per side; handles stick out of the cabinet
    const rods = [[1, 'p:#c0392b'], [2, 'p:#1e4fb0'], [3, 'p:#c0392b'], [5, 'p:#1e4fb0'], [5, 'p:#c0392b'], [3, 'p:#1e4fb0'], [2, 'p:#c0392b'], [1, 'p:#1e4fb0']] as const;
    rods.forEach(([men, team], i) => {
      const x = -W / 2 + 0.12 + i * (W - 0.24) / 7;
      rodZ(c, 'chrome', x, H - 0.08, 0, 0.008, D + 0.3, 8);
      rodZ(c, 'rubber', x, H - 0.08, (team === 'p:#c0392b' ? -1 : 1) * (D / 2 + 0.1), 0.018, 0.1, 10);
      for (let k = 0; k < men; k++) {
        const z = -(D - 0.2) / 2 + (k + 0.5) * (D - 0.2) / men;
        plain(team, x, H - 0.17, z, 0.025, 0.11, 0.04);
        plain(team, x, H - 0.09, z, 0.03, 0.04, 0.03);
      }
    });
    sphere(c, 'p:#f2f2f2', 0.08, H - 0.17, 0.05, 0.017, 1, 8);
    cyl('chrome', W / 2 - 0.06, H, 0, 0.03, 0.01, 10);
  },

  arcade: (c) => {
    const { W, D, H, box, plain, cyl, r, world, rot, anim } = c;
    const side = 'p:' + r.pick(['#1b1f3a', '#3a1b2c', '#1b3a2a']);
    const neon = r.pick(['#ff4fb0', '#33d6ff', '#ffd23a']);
    for (const s of [-1, 1]) box(side, s * (W / 2 - 0.015), 0, 0, 0.03, H, D);
    box('p:#141518', 0, 0, 0.06, W - 0.06, H - 0.02, D - 0.12);
    box('p:#141518', 0, 0, -D / 2 + 0.08, W - 0.06, 0.82, 0.12);
    plain('chrome', 0, 0.3, -D / 2 + 0.018, 0.24, 0.3, 0.004);
    for (const s of [-1, 1]) plain('e:#ff3030', s * 0.05, 0.47, -D / 2 + 0.015, 0.025, 0.04, 0.003);
    // control panel, joystick, buttons
    tiltedBox(c.geo, 'p:#26292e', 0, 0.9, -D / 2 + 0.2, W - 0.06, 0.05, 0.3, -0.18);
    cyl('rubber', -0.14, 0.92, -D / 2 + 0.2, 0.012, 0.08, 8);
    sphere(c, 'p:#c0392b', -0.14, 1.01, -D / 2 + 0.2, 0.022, 1, 8);
    for (let k = 0; k < 6; k++) cyl(['p:#c0392b', 'p:#1e4fb0', 'p:#f2c230'][k % 3], 0.02 + (k % 3) * 0.07, 0.925 + (k < 3 ? 0.01 : 0), -D / 2 + 0.16 + (k < 3 ? 0 : 0.07), 0.016, 0.015, 8);
    // screen in a bezel, leaning back
    tiltedBox(c.geo, 'rubber', 0, 1.33, -D / 2 + 0.2, W - 0.08, 0.5, 0.03, -0.22);
    tiltedBox(c.geo, 'screen', 0, 1.335, -D / 2 + 0.184, W - 0.18, 0.4, 0.004, -0.22);
    box('p:#141518', 0, 1.58, -D / 2 + 0.12, W - 0.06, 0.04, 0.2);
    // lit marquee
    box('e:' + neon, 0, H - 0.27, -D / 2 + 0.07, W - 0.08, 0.2, 0.03);
    plain('rubber', 0, H - 0.07, -D / 2 + 0.07, W - 0.06, 0.06, 0.06);
    const [mx, my, mz] = world(0, 0.47, -D / 2 + 0.012);
    anim.blinker(mx, my, mz, 0.04, 0.02, 0.004, rot, '#ffb020', 1.6, 0.5, r.next());
  },

  stalls: (c) => {
    // Restroom stalls: back on the wall (+Z), doors on the -Z face, partitions off the floor.
    const { W, D, H, box, plain, cyl } = c;
    const n = Math.max(1, Math.round(W / 0.95)), sw = W / n;
    const panel = 'p:#a9b6bf', door = 'p:#5f7d95', gap = 0.3, front = -D / 2 + 0.025;
    for (let i = 0; i <= n; i++) {
      const x = Math.max(-W / 2 + 0.0125, Math.min(W / 2 - 0.0125, -W / 2 + i * sw));
      box(panel, x, gap, 0.02, 0.025, H - gap - 0.08, D - 0.04);
      box(panel, x, 0.06, front, 0.06, H - 0.08, 0.05);
      plain('chrome', x, 0, front, 0.07, 0.06, 0.06);
    }
    box('chrome', 0, H - 0.05, front, W, 0.04, 0.05);
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + (i + 0.5) * sw;
      box(door, cx, gap, front, sw - 0.09, H - gap - 0.1, 0.025);
      plain('chrome', cx + sw / 2 - 0.12, 1.0, front - 0.02, 0.05, 0.08, 0.02);
      plain(i % 3 === 1 ? 'p:#c0392b' : 'p:#2fbf5a', cx + sw / 2 - 0.12, 1.1, front - 0.016, 0.04, 0.02, 0.004);
      // toilet, flush valve and paper holder
      cyl('p:#f4f4f2', cx, 0, D / 2 - 0.42, 0.17, 0.38, 14);
      cyl('p:#f4f4f2', cx, 0.38, D / 2 - 0.42, 0.2, 0.03, 14);
      box('p:#f4f4f2', cx, 0.2, D / 2 - 0.12, 0.34, 0.25, 0.2);
      cyl('chrome', cx, 0.45, D / 2 - 0.05, 0.02, 0.45, 8);
      plain('chrome', cx - sw / 2 + 0.12, 0.72, D / 2 - 0.6, 0.08, 0.12, 0.12);
    }
  },

  urinals: (c) => {
    const { W, D, box, plain, cyl } = c;
    const n = Math.max(1, Math.round(W / 0.8)), sp = W / n;
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + (i + 0.5) * sp;
      box('p:#f4f4f2', cx, 0.42, D / 2 - 0.19, 0.36, 0.62, 0.34);
      plain('p:#dfe3e3', cx, 0.62, D / 2 - 0.361, 0.24, 0.3, 0.004);
      plain('m:#9aa0a3', cx, 0.47, D / 2 - 0.3, 0.06, 0.004, 0.06);
      cyl('chrome', cx, 1.04, D / 2 - 0.05, 0.02, 0.2, 8);
      plain('chrome', cx, 1.18, D / 2 - 0.09, 0.05, 0.05, 0.1);
      plain('chrome', cx, 1.02, D / 2 - 0.13, 0.03, 0.02, 0.1);
    }
    for (let i = 1; i < n; i++) box('p:#a9b6bf', -W / 2 + i * sp, 0.3, D / 2 - 0.23, 0.025, 1.0, 0.44);
  },

  vanity: (c) => {
    // Sink counter on a wall (+Z): cabinet, quartz top, basins, faucets; mirror and towels on the wall.
    const { W, D, H, box, plain, cyl } = c;
    const back = D / 2;
    box('darkWood', 0, 0.1, 0.02, W, H - 0.18, D - 0.04);
    box('rubber', 0, 0, 0.05, W - 0.05, 0.1, D - 0.1);
    box('p:#e8e6e0', 0, H - 0.08, 0, W, 0.04, D);
    box('p:#e8e6e0', 0, H - 0.04, back - 0.01, W, 0.1, 0.02);
    const n = Math.max(1, Math.round(W / 0.8)), sp = W / n;
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + (i + 0.5) * sp;
      plain('p:#f4f4f2', cx, H - 0.045, -0.03, 0.42, 0.006, 0.32);
      plain('m:#9aa0a3', cx, H - 0.04, -0.03, 0.32, 0.002, 0.22);
      cyl('chrome', cx, H - 0.04, back - 0.11, 0.018, 0.2, 8);
      plain('chrome', cx, H + 0.14, back - 0.17, 0.03, 0.025, 0.13);
      plain('chrome', cx + sp * 0.32, H - 0.04, back - 0.08, 0.05, 0.16, 0.05);
    }
    // mirror and a paper-towel dispenser at the end
    const mw = W - 0.5;
    plain('m:#5d656b', -0.2, 1.0, back - 0.008, mw + 0.04, 1.0, 0.012);
    plain('chrome', -0.2, 1.02, back - 0.016, mw, 0.96, 0.006);
    box('m:#b9bec4', W / 2 - 0.17, 1.12, back - 0.07, 0.28, 0.38, 0.12);
    plain('rubber', W / 2 - 0.17, 1.13, back - 0.132, 0.16, 0.02, 0.004);
  },

  execDesk: (c) => {
    // Visitors sit on -Z facing the modesty panel; the occupant works from the +Z side.
    const { W, D, box, plain, r } = c;
    const dd = 0.85, dz = -D / 2 + dd / 2;
    box('darkWood', 0, 0.72, dz, W, 0.04, dd);
    box('darkWood', 0, 0.1, -D / 2 + 0.03, W - 0.1, 0.62, 0.03);
    for (const s of [-1, 1]) box('darkWood', s * (W / 2 - 0.03), 0, dz, 0.06, 0.72, dd);
    box('p:#3d2a1c', W / 2 - 0.3, 0, dz + 0.05, 0.42, 0.68, dd - 0.15);
    for (let k = 0; k < 3; k++) plain('chrome', W / 2 - 0.3, 0.15 + k * 0.2, dz + 0.05 + (dd - 0.15) / 2 + 0.006, 0.12, 0.015, 0.012);
    // monitors face the occupant (+Z), keyboard, phone, nameplate facing visitors, papers
    monitor(box, -0.3, 0.76, dz - 0.18, 1);
    monitor(box, 0.26, 0.76, dz - 0.18, 1);
    plain('rubber', 0, 0.76, dz + 0.2, 0.44, 0.02, 0.14);
    plain('rubber', 0.3, 0.76, dz + 0.22, 0.06, 0.025, 0.1);
    box('p:#2a2d31', -W / 2 + 0.25, 0.76, dz + 0.1, 0.2, 0.06, 0.18);
    plain('m:#b99656', 0, 0.76, -D / 2 + 0.08, 0.3, 0.06, 0.02);
    plain('p:#f2f0ea', -0.7, 0.76, dz + 0.15, 0.22, 0.02, 0.3, r.range(-0.3, 0.3));
    // credenza along the back edge with books, a plant and a radar award
    box('darkWood', 0, 0, D / 2 - 0.24, W, 0.68, 0.46);
    for (let k = 1; k < 4; k++) plain('p:#2e1f14', -W / 2 + k * W / 4, 0.05, D / 2 - 0.473, 0.008, 0.58, 0.006);
    pottedPlant(c, W / 2 - 0.25, 0.68, D / 2 - 0.24, 0.12, 0.6);
    for (let k = 0; k < 8; k++) plain('p:' + r.pick(['#2a4a7a', '#7a2a2a', '#2a5a3a', '#d8d4cc', '#2a2d31']), -0.5 + k * 0.045, 0.68, D / 2 - 0.2, 0.04, r.range(0.2, 0.28), 0.22);
    plain('glass', 0.3, 0.68, D / 2 - 0.2, 0.12, 0.22, 0.06);
    plain('m:#b99656', 0.3, 0.68, D / 2 - 0.2, 0.14, 0.04, 0.08);
    // occupant chair (high back) and two guest chairs pulled up on the visitor side
    officeChair(c, r.range(-0.15, 0.15), D / 2 - 0.8, faceTo(0, -1) + r.range(-0.15, 0.15), 'p:#1e1f22');
    for (const s of [-1, 1]) cafeChair(c, s * 0.5, -D / 2 - 0.36, faceTo(0, 1) + s * 0.12, 'p:#5a4a3a');
  },

  bookcase: (c) => {
    const { W, D, H, box, plain, r } = c;
    const wood = r.chance(0.5) ? 'darkWood' : 'wood';
    for (const s of [-1, 1]) box(wood, s * (W / 2 - 0.01), 0, 0, 0.02, H, D);
    box(wood, 0, 0, D / 2 - 0.01, W - 0.04, H, 0.02);
    box(wood, 0, H - 0.02, 0, W, 0.02, D);
    box(wood, 0, 0, 0, W - 0.04, 0.08, D);
    const levels = 5, lh = (H - 0.1) / levels;
    for (let k = 1; k < levels; k++) plain(wood, 0, 0.08 + k * lh - 0.02, 0, W - 0.04, 0.02, D - 0.02);
    for (let k = 0; k < levels; k++) {
      const y = 0.08 + k * lh;
      let x = -W / 2 + 0.03;
      if (k === 1 && r.chance(0.7)) {
        // an award on its own shelf
        plain('glass', 0, y, 0, 0.12, 0.24, 0.06);
        plain('m:#b99656', 0, y, 0, 0.14, 0.04, 0.08);
        continue;
      }
      while (x < W / 2 - 0.08) {
        const bw = r.range(0.025, 0.06), bh = Math.min(lh - 0.04, r.range(0.18, 0.3));
        if (r.chance(0.08)) { x += 0.1; continue; }
        const binder = r.chance(0.25);
        plain('p:' + r.pick(binder ? ['#1e4fb0', '#2a2d31', '#f2f0ea'] : ['#2a4a7a', '#7a2a2a', '#2a5a3a', '#c9ad78', '#5a4a3a', '#d8d4cc']), x + bw / 2, y, D / 2 - 0.14, binder ? 0.06 : bw, binder ? Math.min(lh - 0.03, 0.3) : bh, 0.22);
        x += (binder ? 0.06 : bw) + 0.004;
      }
    }
  },

  labBench: (c) => {
    // ESD test bench: operator on -Z, instruments on a riser along the back (+Z).
    const { W, D, box, plain, cyl, r, world, rot, anim } = c;
    const top = 0.9, back = D / 2, frame = 'm:#5b6670';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(frame, sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.04), 0.05, top - 0.04, 0.05);
    box('m:#6b7680', 0, 0.15, 0.04, W - 0.1, 0.03, D - 0.16);
    box('p:#d9dcd8', 0, top - 0.04, 0, W, 0.04, D);
    plain('p:#3f6f8a', 0, top, -0.06, W - 0.1, 0.006, D - 0.3);
    plain('rubber', -W / 2 + 0.25, top - 0.06, -D / 2 + 0.01, 0.4, 0.04, 0.02);
    plain('p:#f2c230', -W / 2 + 0.12, top - 0.05, -D / 2 + 0.008, 0.03, 0.03, 0.01);
    // riser: uprights, two shelves, pegboard back with an outlet strip
    const rz = back - 0.17;
    for (const s of [-1, 1]) box(frame, s * (W / 2 - 0.03), top, rz, 0.04, 0.9, 0.04);
    for (const y of [1.2, 1.55]) box('m:#7b8690', 0, y, rz, W - 0.03, 0.025, 0.32);
    plain('p:#c8ccc6', 0, top, back - 0.012, W - 0.08, 0.88, 0.016);
    plain('m:#9aa2a6', 0, top + 0.18, back - 0.03, W - 0.2, 0.05, 0.03);
    const inst = (x: number, y: number, w: number, h: number, d: number, body: string, screenW: number) => {
      box(body, x, y, back - 0.02 - d / 2, w, h, d);
      plain('screen', x - w * 0.12, y + h * 0.18, back - 0.022 - d - 0.002, screenW, h * 0.62, 0.004);
      for (let k = 0; k < 3; k++) plain('rubber', x + w / 2 - 0.05 - k * 0.04, y + h * 0.3, back - 0.022 - d - 0.002, 0.025, 0.025, 0.006);
      return back - 0.022 - d;
    };
    // bench top: power supply; lower shelf: oscilloscope + function generator; top shelf: spectrum analyser
    const ps = inst(-W / 2 + 0.3, top + 0.006, 0.3, 0.16, 0.3, 'p:#e2e4e0', 0.14);
    const scope = inst(-0.35, 1.225, 0.42, 0.24, 0.28, 'p:#3a4a5a', 0.24);
    inst(0.25, 1.225, 0.32, 0.12, 0.28, 'p:#e2e4e0', 0.14);
    inst(-0.15, 1.575, 0.46, 0.2, 0.3, 'p:#2f3640', 0.26);
    const [sx, sy, sz] = world(-W / 2 + 0.42, top + 0.12, ps - 0.003);
    anim.blinker(sx, sy, sz, 0.015, 0.015, 0.006, rot, '#3dff7a', 1, 1);
    const [ox, oy, oz] = world(-0.17, 1.42, scope - 0.003);
    anim.blinker(ox, oy, oz, 0.015, 0.015, 0.006, rot, '#ffb020', r.range(0.8, 1.6), 0.5, r.next());
    // soldering station, DMM, monitor, unit under test with probe leads, task lamp
    box('p:#2a2d31', 0.55, top + 0.006, -0.05, 0.18, 0.09, 0.16);
    plain('e:#ff6a2a', 0.55, top + 0.07, -0.131, 0.06, 0.02, 0.003);
    cyl('chrome', 0.72, top + 0.006, -0.05, 0.03, 0.12, 8);
    box('p:#e8b818', 0.25, top + 0.006, -0.18, 0.09, 0.03, 0.17);
    plain('screen', 0.25, top + 0.037, -0.21, 0.06, 0.002, 0.05);
    monitor(box, W / 2 - 0.35, top + 0.006, back - 0.4, -1);
    plain('p:#2e7d32', -0.05, top + 0.006, -0.12, 0.26, 0.012, 0.18);
    for (let k = 0; k < 4; k++) plain('rubber', -0.12 + (k % 2) * 0.12, top + 0.018, -0.16 + Math.floor(k / 2) * 0.08, 0.04, 0.006, 0.04);
    box('p:#e9eaeb', -0.42, top + 0.006, -0.1, 0.22, 0.12, 0.14);
    plain('p:#d4d7d9', -0.42, top + 0.02, -0.172, 0.18, 0.09, 0.004);
    strut(c, 'p:#c0392b', [-0.3, 1.27, scope - 0.002], [-0.1, top + 0.03, -0.1], 0.004, 4);
    strut(c, 'rubber', [-0.4, 1.27, scope - 0.002], [-0.02, top + 0.03, -0.14], 0.004, 4);
    strut(c, 'p:#2f3640', [-W / 2 + 0.3, top + 0.05, ps - 0.002], [-0.42, top + 0.06, -0.03], 0.004, 4);
    cyl('p:#2a2d31', W / 2 - 0.12, top + 0.006, -0.2, 0.06, 0.02, 10);
    strut(c, 'p:#2a2d31', [W / 2 - 0.12, top + 0.02, -0.2], [W / 2 - 0.15, top + 0.42, -0.08], 0.01);
    strut(c, 'p:#2a2d31', [W / 2 - 0.15, top + 0.42, -0.08], [W / 2 - 0.4, top + 0.5, -0.2], 0.01);
    box('p:#2a2d31', W / 2 - 0.44, top + 0.44, -0.22, 0.14, 0.06, 0.14);
    plain('e:#fff4dc', W / 2 - 0.44, top + 0.437, -0.22, 0.11, 0.004, 0.11);
    // ESD lab stool just in front
    const stx = r.range(-0.4, 0.2), stz = -D / 2 - 0.3;
    cyl('m:#2f3337', stx, 0, stz, 0.21, 0.03, 12);
    cyl('chrome', stx, 0.03, stz, 0.022, 0.58, 8);
    cyl('p:#24384a', stx, 0.6, stz, 0.18, 0.06, 14);
  },

  poleMount: (c) => {
    // Radar test pole: galvanised pole, junction box, and a mast arm carrying a forward-fire
    // traffic sensor and a camera aimed down the "road" (local -Z).
    const { H, box, plain, cyl } = c;
    const galv = 'm:#a9b0b3';
    box('m:#6d7477', 0, 0, 0, 0.5, 0.04, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('m:#5d6466', sx * 0.18, 0.04, sz * 0.18, 0.015, 0.06, 6);
    cyl(galv, 0, 0.04, 0, 0.085, H - 0.08, 14);
    cyl(galv, 0, H - 0.04, 0, 0.095, 0.04, 14);
    const jy = 0.6 * H - 0.17; // junction box centred at ~0.6 H
    cyl('m:#8a9296', 0.12, 0.04, 0, 0.02, jy - 0.04, 8);
    box('m:#9aa2a6', 0, jy, 0.14, 0.24, 0.34, 0.1);
    plain('hazard', 0, jy + 0.25, 0.191, 0.08, 0.06, 0.004);
    const ay = H - 0.4;
    rodZ(c, galv, 0, ay, -0.7, 0.045, 1.4);
    plain(galv, 0, ay - 0.08, -0.05, 0.22, 0.2, 0.22);
    // forward-fire radar: white housing, flat radome on -Z, sun visor
    plain(galv, 0, ay - 0.25, -1.25, 0.04, 0.22, 0.04);
    box('p:#e9eaeb', 0, ay - 0.55, -1.25, 0.24, 0.3, 0.12);
    plain('p:#d4d7d9', 0, ay - 0.53, -1.313, 0.2, 0.26, 0.006);
    plain('p:#e9eaeb', 0, ay - 0.25, -1.27, 0.28, 0.02, 0.18);
    // camera mid-arm
    plain(galv, 0, ay - 0.15, -0.8, 0.03, 0.12, 0.03);
    box('p:#2a2d31', 0, ay - 0.32, -0.78, 0.12, 0.12, 0.26);
    plain('p:#2a2d31', 0, ay - 0.2, -0.8, 0.16, 0.015, 0.32);
    rodZ(c, 'glass', 0, ay - 0.26, -0.915, 0.035, 0.012, 12);
    strut(c, 'rubber', [0, ay - 0.05, -1.2], [0, ay - 0.05, -0.1], 0.008, 4);
    strut(c, 'rubber', [0, ay - 0.05, -0.1], [0, jy + 0.36, -0.095], 0.008, 4);
  },

  alprCam: (c) => {
    // License-plate reader on a slim pole: solar panel on top, camera aimed down the lane (-Z).
    const { H, box, plain, cyl, world, rot, anim, r } = c;
    const dark = 'p:#24272b';
    box('m:#4a4f55', 0, 0, 0, 0.3, 0.06, 0.3);
    cyl(dark, 0, 0.06, 0, 0.05, H - 0.38, 12);
    cyl(dark, 0, H - 0.32, 0, 0.055, 0.03, 12);
    // solar panel on a tilted bracket
    const t = 0.6, py = H - 0.18;
    plain(dark, 0, H - 0.32, 0, 0.06, 0.14, 0.06);
    tiltedBox(c.geo, 'm:#8d9599', 0, py, 0.02, 0.6, 0.035, 0.45, t);
    tiltedBox(c.geo, 'p:#1b3561', 0, py + 0.019 * Math.cos(t), 0.02 - 0.019 * Math.sin(t), 0.56, 0.004, 0.41, t);
    // camera housing with a hood, lens and IR illuminator
    const cy = H - 0.62, cz = -0.11;
    plain(dark, 0, cy + 0.05, -0.03, 0.05, 0.22, 0.05);
    tiltedBox(c.geo, 'p:#2b2e33', 0, cy, cz, 0.14, 0.13, 0.3, 0.15);
    tiltedBox(c.geo, 'p:#2b2e33', 0, cy + 0.08, cz - 0.03, 0.16, 0.012, 0.34, 0.15);
    rodZ(c, 'rubber', 0.025, cy - 0.02, cz - 0.15, 0.032, 0.03, 12);
    rodZ(c, 'glass', 0.025, cy - 0.02, cz - 0.166, 0.026, 0.004, 12);
    plain('p:#3a1414', -0.04, cy - 0.015, cz - 0.152, 0.04, 0.05, 0.006);
    // battery / comms box low on the pole
    const by = 0.54 * H;
    box('p:#2b2e33', 0, by, 0.1, 0.22, 0.34, 0.14);
    plain('m:#8d9599', 0, by + 0.37, 0.07, 0.03, 0.08, 0.02);
    const [lx, ly, lz] = world(-0.04, cy + 0.035, cz - 0.15);
    anim.blinker(lx, ly, lz, 0.012, 0.012, 0.006, rot, '#ff3a2a', 3, 0.08, r.next());
  },

  speedCamera: (c) => {
    // Fixed photo-enforcement unit: lidar window, camera lens and IR flash in a sun-shielded housing.
    const { H, box, plain, cyl, world, rot, anim, r } = c;
    const y0 = H - 0.65, hz = -0.13, front = hz - 0.25;
    box('m:#6d7477', 0, 0, 0, 0.36, 0.05, 0.36);
    cyl('m:#8e979b', 0, 0.05, 0, 0.07, y0 - 0.03, 14);
    box('p:#9aa2a6', 0, 0.75, 0.115, 0.3, 0.5, 0.14);
    plain('hazard', 0, 1.15, 0.187, 0.1, 0.06, 0.004);
    plain('m:#6d7477', 0, y0 - 0.06, 0, 0.18, 0.1, 0.18);
    box('p:#e6e7e2', 0, y0, hz, 0.36, 0.44, 0.5);
    box('p:#d0d2cc', 0, y0 + 0.44, hz - 0.02, 0.4, 0.03, 0.54);
    plain('p:#1a1d22', 0, y0 + 0.06, front - 0.003, 0.32, 0.3, 0.006);
    plain('p:#2a2f36', -0.09, y0 + 0.24, front - 0.006, 0.1, 0.07, 0.004);
    rodZ(c, 'rubber', 0.07, y0 + 0.24, front - 0.02, 0.05, 0.04, 14);
    rodZ(c, 'glass', 0.07, y0 + 0.24, front - 0.041, 0.04, 0.004, 14);
    plain('p:#3a1414', 0, y0 + 0.1, front - 0.006, 0.28, 0.08, 0.004);
    plain('p:#f2f2ee', 0, y0 + 0.025, front - 0.006, 0.2, 0.03, 0.002);
    const [lx, ly, lz] = world(0.13, y0 + 0.36, front - 0.008);
    anim.blinker(lx, ly, lz, 0.02, 0.02, 0.006, rot, '#ff2a2a', 2, 0.12, r.next());
  },

  lidarTripod: (c) => {
    // Tripod-mounted lidar speed camera aimed down the road (-Z).
    const { box, plain, cyl } = c;
    tripod(c, 0, 0, 1.18, 0.34);
    cyl('p:#26292d', 0, 1.16, 0, 0.022, 0.16, 8);
    plain('p:#26292d', 0, 1.31, 0, 0.12, 0.02, 0.12);
    box('p:#2a2d31', 0, 1.33, 0.02, 0.2, 0.16, 0.3);
    rodZ(c, 'rubber', 0.04, 1.41, -0.15, 0.055, 0.04, 16);
    rodZ(c, 'glass', 0.04, 1.41, -0.171, 0.046, 0.004, 16);
    rodZ(c, 'rubber', -0.06, 1.44, -0.14, 0.018, 0.02, 10);
    rodZ(c, 'p:#1c1e21', 0, 1.52, 0.0, 0.022, 0.22, 10);
    plain('screen', 0, 1.36, 0.172, 0.16, 0.1, 0.004);
    box('rubber', 0, 1.49, 0.08, 0.1, 0.03, 0.16);
  },

  speedSignPole: (c) => {
    // Pole-mounted radar speed feedback sign facing traffic (-Z).
    const { H, box, plain, cyl, world, rot, anim, p } = c;
    const steel = 'm:#9aa2a6';
    box('m:#6d7477', 0, 0, 0, 0.36, 0.05, 0.36);
    cyl(steel, 0, 0.05, 0, 0.055, H - 0.12, 12);
    box('p:#d8d9d4', 0, 0.25 * H, 0.1, 0.24, 0.38, 0.14);
    // LED display cabinet with its live readout (heights hang off the pole top)
    const dy = H - 1.72, py = H - 1.0;
    box('p:#f2f2ee', 0, dy, -0.12, 0.9, 0.64, 0.12);
    plain('rubber', 0, dy + 0.06, -0.183, 0.8, 0.52, 0.006);
    const [x, y, z] = world(0, dy + 0.32, -0.19);
    anim.speedDisplay(x, y, z, rot + Math.PI, 0.74, 0.46, 30, Math.round(p.x * 11 + p.z * 3));
    // regulatory plate above
    plain('p:#f3f3ee', 0, py, -0.075, 0.64, 0.76, 0.012);
    plain('label:speedLimit', 0, py + 0.02, -0.085, 0.6, 0.72, 0.006);
    for (const yy of [dy + 0.1, dy + 0.52, py + 0.15, py + 0.6]) plain(steel, 0, yy, -0.05, 0.12, 0.04, 0.06);
    // solar panel on top and amber flashers
    const t = 0.6;
    tiltedBox(c.geo, 'm:#8d9599', 0, H - 0.14, 0.02, 0.5, 0.03, 0.4, t);
    tiltedBox(c.geo, 'p:#1b3561', 0, H - 0.14 + 0.016 * Math.cos(t), 0.02 - 0.016 * Math.sin(t), 0.46, 0.004, 0.36, t);
    for (const s of [-1, 1]) {
      const [fx, fy, fz] = world(s * 0.36, dy + 0.56, -0.19);
      anim.blinker(fx, fy, fz, 0.08, 0.08, 0.02, rot, '#ffb020', 0.9, 0.18, s < 0 ? 0 : 0.5);
    }
  },

  pitchNet: (c) => {
    // Sports-radar pitching backstop: framed net, strike-zone target, radar on a tripod, ball bucket.
    const { W, D, H, box, plain, cyl, r } = c;
    const steel = 'm:#2a2d31', nz = D / 2 - 0.12;
    for (const s of [-1, 1]) {
      box(steel, s * (W / 2 - 0.03), 0, nz, 0.05, H, 0.05);
      box(steel, s * (W / 2 - 0.03), 0, 0, 0.05, 0.04, D - 0.04);
      strut(c, steel, [s * (W / 2 - 0.03), 0.04, -D / 2 + 0.05], [s * (W / 2 - 0.03), H * 0.6, nz], 0.018);
    }
    box(steel, 0, H - 0.05, nz, W, 0.05, 0.05);
    box(steel, 0, 0, nz, W, 0.04, 0.05);
    plain('net', 0, 0.04, nz, W - 0.08, H - 0.09, 0.006);
    // strike-zone target hung in front of the net
    plain('p:#f2f2ee', 0, 0.5, nz - 0.04, 0.5, 0.66, 0.012);
    for (const s of [-1, 1]) {
      plain('p:#c0392b', s * 0.083, 0.52, nz - 0.047, 0.012, 0.62, 0.002);
      plain('p:#c0392b', 0, 0.5 + 0.33 + s * 0.11, nz - 0.047, 0.46, 0.012, 0.002);
    }
    // radar gun on a short tripod facing the pitcher (-Z)
    const tx = W / 2 - 0.4, tz = -D / 2 + 0.2;
    tripod(c, tx, tz, 0.95, 0.15);
    box('p:#1d4f9a', tx, 0.96, tz, 0.08, 0.08, 0.15);
    rodZ(c, 'p:#1d4f9a', tx, 1.0, tz - 0.12, 0.045, 0.1, 12);
    rodZ(c, 'rubber', tx, 1.0, tz - 0.175, 0.04, 0.01, 12);
    plain('screen', tx, 1.0, tz + 0.077, 0.06, 0.04, 0.004);
    // bucket of baseballs
    const bx = -W / 2 + 0.35, bz = -D / 2 + 0.22;
    cyl('p:#e8e8e2', bx, 0, bz, 0.15, 0.36, 14);
    for (let k = 0; k < 6; k++) sphere(c, 'p:#f2efe6', bx + r.range(-0.08, 0.08), 0.37 + r.range(0, 0.03), bz + r.range(-0.08, 0.08), 0.037, 1, 8);
  },

  tree: (c) => {
    // Parking-island live oak: trunk inside the footprint, broad crown well above head height.
    const { H, cyl, plain, r } = c;
    const trunk = Math.max(2.8, H * 0.42);
    cyl('p:#4a3626', 0, 0, 0, 1.0, 0.05, 16);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, R = 1.02;
      plain('concrete', Math.sin(a) * R, 0, Math.cos(a) * R, 0.84, 0.12, 0.14, a);
    }
    const g = new CylinderGeometry(0.13, 0.21, trunk, 9);
    c.geo('p:#5b4a3b', g, 0, trunk / 2, 0);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + r.range(0, 1);
      strut(c, 'p:#5b4a3b', [0, trunk - 0.25, 0], [Math.sin(a) * 1.1, trunk + 0.5, Math.cos(a) * 1.1], 0.07, 6);
    }
    const spread = H * 0.42, blobs = 4 + Math.floor(r.range(0, 3));
    for (let k = 0; k < blobs; k++) {
      const a = r.range(0, Math.PI * 2), d = k === 0 ? 0 : r.range(0.35, 0.8) * spread;
      const rad = r.range(0.42, 0.62) * spread, squash = r.range(0.55, 0.7);
      blob(c, k % 2 ? 'p:#34502b' : 'p:#2a4224', Math.sin(a) * d, trunk + rad * 0.62 + r.range(0, 0.5), Math.cos(a) * d, rad, squash, r.range(0, 6));
    }
  },

  bollard: ({ H, cyl }) => {
    cyl('m:#6d7477', 0, 0, 0, 0.15, 0.02, 14);
    cyl('p:#e8b818', 0, 0.02, 0, 0.12, H - 0.08, 14);
    cyl('p:#e8b818', 0, H - 0.06, 0, 0.1, 0.06, 14);
    for (const y of [H * 0.62, H * 0.78]) cyl('p:#f2f2f2', 0, y, 0, 0.123, 0.05, 14);
  },

  monument: (c) => {
    // Entrance monument: stone plinth and pier with dark sign faces (text is drawn by MapMesh).
    const { W, D, H, box, plain } = c;
    box('concrete', 0, 0, 0, W, 0.25, D);
    box('masonry', 0, 0.25, 0, W - 0.3, H - 0.35, D - 0.2);
    box('concrete', 0, H - 0.1, 0, W - 0.2, 0.1, D - 0.1);
    for (const s of [-1, 1]) {
      plain('p:#1d2228', 0, 0.45, s * (D / 2 - 0.095), W - 0.9, 0.95, 0.01);
      plain('m:#b99656', 0, 0.43, s * (D / 2 - 0.095), W - 0.86, 0.02, 0.012);
      for (const x of [-W * 0.3, W * 0.3]) {
        plain('rubber', x, 0, s * (D / 2 + 0.25), 0.12, 0.06, 0.08);
        plain('e:#fff1d6', x, 0.06, s * (D / 2 + 0.25) - s * 0.03, 0.08, 0.004, 0.03);
      }
      for (let k = 0; k < 4; k++) blob(c, 'foliage', -W * 0.42 + k * W * 0.28, 0.18, s * (D / 2 + 0.26), 0.24, 0.75, k);
    }
  },

  canopy: ({ W, D, H, box, plain, cyl }) => {
    // Entrance canopy (non-solid): roof deck, aluminium fascia, soffit with downlights.
    box('m:#7d868b', 0, H - 0.04, 0, W, 0.04, D);
    for (const s of [-1, 1]) {
      box('m:#aab3b8', 0, 0, s * (D / 2 - 0.03), W, H, 0.06);
      box('m:#aab3b8', s * (W / 2 - 0.03), 0, 0, 0.06, H, D - 0.12);
    }
    plain('p:#d9dbd8', 0, 0.03, 0, W - 0.12, 0.03, D - 0.12);
    for (let x = -W / 2 + 0.9; x < W / 2 - 0.5; x += 1.5) for (let z = -D / 2 + 0.8; z < D / 2 - 0.4; z += 1.4) cyl('e:#ffe6b0', x, 0.022, z, 0.08, 0.008, 10);
    plain('m:#5d656b', 0, H - 0.02, -D / 2 + 0.03, W, 0.02, 0.08);
  },

  hvacUnit: (c) => {
    // Condensing unit on a pad: louvred coil guard, top grille over a turning fan.
    const { W, D, H, box, plain, cyl, world, into, anim, r } = c;
    const shell = 'p:#c9cbc4';
    box('concrete', 0, 0, 0, W, 0.1, D);
    box(shell, 0, 0.1, 0, W - 0.1, 0.1, D - 0.1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(shell, sx * (W / 2 - 0.08), 0.2, sz * (D / 2 - 0.08), 0.06, H - 0.32, 0.06);
    for (let y = 0.26; y < H - 0.15; y += 0.07) for (const s of [-1, 1]) {
      plain('m:#6f756f', 0, y, s * (D / 2 - 0.07), W - 0.2, 0.02, 0.01);
      plain('m:#6f756f', s * (W / 2 - 0.07), y, 0, 0.01, 0.02, D - 0.2);
    }
    box(shell, 0, H - 0.12, 0, W - 0.1, 0.05, D - 0.1);
    cyl('p:#2a2d31', 0, H - 0.1, 0, 0.42, 0.04, 20);
    for (let k = -3; k <= 3; k++) plain('rubber', k * 0.11, H - 0.03, 0, 0.012, 0.012, 0.86);
    plain('rubber', 0, H - 0.03, 0, 0.86, 0.012, 0.012);
    const [x, y, z] = world(0, H - 0.07, 0);
    const rotor = anim.part(x, y, z, (b) => {
      const q = into(b);
      q.cyl('p:#2a2d31', 0, H - 0.08, 0, 0.06, 0.04, 10);
      for (let k = 0; k < 3; k++) q.plain('m:#3a3e44', Math.sin(k * 2.094) * 0.2, H - 0.075, Math.cos(k * 2.094) * 0.2, 0.12, 0.012, 0.34, k * 2.094 + 0.3);
    });
    const speed = r.range(5, 7), phase = r.range(0, 6);
    anim.onFrame((t) => { rotor.rotation.y = t * speed + phase; });
    // refrigerant lines and the service disconnect on the wall side
    for (const s of [-1, 1]) cyl(s < 0 ? 'm:#b87333' : 'rubber', W / 2 - 0.2 + s * 0.05, 0.2, D / 2 - 0.035, 0.016, 0.45, 8);
    box('m:#9aa2a6', -W / 2 + 0.22, 0.55, D / 2 - 0.04, 0.2, 0.28, 0.06);
  },

  generator: (c) => {
    const { W, D, H, box, plain, cyl } = c;
    const shell = 'p:#d8d6c8';
    box('m:#3a3e44', 0, 0, 0, W, 0.3, D);
    box(shell, 0, 0.3, 0, W - 0.06, H - 0.4, D - 0.06);
    box(shell, 0, H - 0.1, 0, W, 0.1, D);
    for (const s of [-1, 1]) for (let y = 0.5; y < H - 0.3; y += 0.08) plain('m:#8a8f88', s * (W / 2 - 0.025), y, 0, 0.01, 0.03, D - 0.3);
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + (i + 0.5) * W / 3;
      plain('p:#b9b7aa', x - W / 6 + 0.02, 0.35, -D / 2 + 0.025, 0.012, H - 0.5, 0.006);
      plain('chrome', x + W / 6 - 0.12, 0.95, -D / 2 + 0.02, 0.04, 0.16, 0.03);
      plain('hazard', x, 1.25, -D / 2 + 0.028, 0.22, 0.12, 0.004);
    }
    plain('screen', -W / 2 + 0.5, 1.0, -D / 2 + 0.028, 0.22, 0.14, 0.004);
    plain('p:#c0392b', W / 2 - 0.45, 1.42, -D / 2 + 0.028, 0.3, 0.08, 0.004);
    cyl('m:#5a5f63', W / 2 - 0.4, H, D / 2 - 0.35, 0.08, 0.4, 12);
    cyl('rubber', W / 2 - 0.4, H + 0.38, D / 2 - 0.35, 0.085, 0.02, 12);
  },

  transformer: ({ W, D, H, box, plain }) => {
    box('concrete', 0, 0, 0, W, 0.12, D);
    box('p:#3f6b48', 0, 0.12, 0.05, W - 0.1, H - 0.12, D - 0.25);
    plain('p:#355a3d', 0, 0.16, -D / 2 + 0.175, 0.012, H - 0.22, 0.006);
    for (const s of [-1, 1]) plain('m:#9aa2a6', s * 0.12, 0.7, -D / 2 + 0.17, 0.04, 0.12, 0.03);
    plain('hazard', -W * 0.25, 0.85, -D / 2 + 0.172, 0.24, 0.16, 0.004);
    plain('p:#f2f2ee', W * 0.25, 0.85, -D / 2 + 0.172, 0.22, 0.14, 0.004);
    plain('p:#c0392b', W * 0.25, 0.95, -D / 2 + 0.171, 0.2, 0.03, 0.003);
    for (let k = 0; k < 6; k++) plain('p:#355a3d', -W / 2 + 0.2 + k * (W - 0.4) / 5, 0.3, D / 2 - 0.08, 0.03, H - 0.45, 0.12);
  },

  trashCan: ({ H, cyl, plain, p }) => {
    const recycle = p.variant === 'recycle';
    const body = recycle ? 'p:#1e5fb0' : 'p:#4a4f55';
    cyl(body, 0, 0, 0, 0.21, H - 0.08, 16);
    cyl(recycle ? 'p:#2a6fc4' : 'p:#3a3e44', 0, H - 0.08, 0, 0.23, 0.07, 16);
    cyl('rubber', 0, H - 0.008, 0, 0.11, 0.008, 12);
    if (recycle) plain('p:#f2f2f2', 0, H * 0.5, -0.205, 0.14, 0.14, 0.01);
  },

  podium: (c) => {
    // Lectern: audience on -Z, reading slope falls toward the speaker (+Z).
    const { W, D, H, box, plain, cyl } = c;
    box('darkWood', 0, 0, 0, W, 0.06, D);
    const sy = H - 0.09; // centre of the reading slope
    box('darkWood', 0, 0.06, 0.02, W - 0.06, sy - 0.1, D - 0.1);
    plain('m:#b9bec4', 0, sy * 0.57, -D / 2 + 0.065, W * 0.62, 0.18, 0.01);
    plain('e:#f0a020', 0, sy * 0.57 + 0.08, -D / 2 + 0.059, W * 0.4, 0.02, 0.004);
    tiltedBox(c.geo, 'darkWood', 0, sy, 0.0, W, 0.03, D - 0.06, -0.25);
    tiltedBox(c.geo, 'p:#f2f0ea', 0.02, sy + 0.017 * Math.cos(0.25), 0.017 * Math.sin(0.25), 0.22, 0.004, 0.28, -0.25);
    cyl('rubber', W / 2 - 0.1, sy, -D / 2 + 0.12, 0.008, 0.07, 6);
    strut(c, 'rubber', [W / 2 - 0.1, sy + 0.07, -D / 2 + 0.12], [W / 2 - 0.16, sy + 0.26, -D / 2 + 0.22], 0.006, 5);
    sphere(c, 'rubber', W / 2 - 0.16, sy + 0.27, -D / 2 + 0.23, 0.016, 1, 8);
  },

  classTable: (c) => {
    // Training table: modesty panel toward the front of the room (-Z), seats on +Z.
    const { W, D, H, box, plain, r } = c;
    box('p:#e6e4de', 0, H - 0.03, 0, W, 0.03, D);
    for (const s of [-1, 1]) {
      box('m:#3a3e44', s * (W / 2 - 0.12), 0, 0, 0.05, H - 0.03, 0.05);
      box('m:#3a3e44', s * (W / 2 - 0.12), 0, 0, 0.06, 0.03, D - 0.06);
    }
    plain('p:#c9c7c0', 0, 0.3, -D / 2 + 0.03, W - 0.3, 0.38, 0.015);
    const seat = 'p:' + r.pick(['#2c6f73', '#3d5a80', '#5a4a6a']);
    for (const s of [-1, 1]) {
      const x = s * W / 4;
      if (r.chance(0.45)) laptop(c, x, H, D / 2 - 0.22, 1);
      else {
        plain('p:#f2f0ea', x + r.range(-0.08, 0.08), H, D / 2 - 0.2, 0.21, 0.012, 0.28, r.range(-0.2, 0.2));
        plain('p:#2a5aa8', x + 0.15, H + 0.012, D / 2 - 0.2, 0.012, 0.012, 0.14);
      }
      cafeChair(c, x + r.range(-0.06, 0.06), D / 2 + 0.3, faceTo(0, -1) + r.range(-0.12, 0.12), seat);
    }
  },

  phoneBooth: ({ W, D, H, box, plain, cyl, r }) => {
    const shell = 'p:' + r.pick(['#3b4046', '#2f4a5a', '#5a3b3b']);
    const felt = 'p:' + r.pick(['#6b8f71', '#8a7a5a', '#5a6b8f']);
    box(shell, 0, 0, 0, W, 0.05, D);
    box(shell, 0, 0.05, D / 2 - 0.025, W, H - 0.13, 0.05);
    for (const s of [-1, 1]) box(shell, s * (W / 2 - 0.025), 0.05, 0.025, 0.05, H - 0.13, D - 0.05);
    box(shell, 0, H - 0.08, 0, W, 0.08, D);
    plain(felt, 0, 0.1, D / 2 - 0.055, W - 0.12, H - 0.25, 0.01);
    for (const s of [-1, 1]) plain(felt, s * (W / 2 - 0.055), 0.1, 0.03, 0.01, H - 0.25, D - 0.16);
    // glass door with a frame and handle
    for (const s of [-1, 1]) plain('m:#2a2d31', s * (W / 2 - 0.045), 0.05, -D / 2 + 0.02, 0.04, H - 0.13, 0.04);
    plain('glass', 0, 0.05, -D / 2 + 0.02, W - 0.13, H - 0.13, 0.012);
    plain('chrome', W / 2 - 0.13, 0.9, -D / 2 + 0.002, 0.02, 0.4, 0.02);
    // shelf, stool, lit ceiling and the vent on the roof
    box('wood', 0, 0.95, D / 2 - 0.2, W - 0.14, 0.03, 0.3);
    cyl('m:#2f3337', 0, 0.05, -0.05, 0.16, 0.02, 12);
    cyl('chrome', 0, 0.07, -0.05, 0.02, 0.5, 8);
    cyl(felt, 0, 0.57, -0.05, 0.15, 0.06, 12);
    plain('e:#fff4dc', 0, H - 0.09, 0, W - 0.24, 0.008, D - 0.24);
    plain('rubber', 0, H - 0.005, 0.1, 0.5, 0.005, 0.3);
  },

  waterFountain: ({ W, D, box, plain, cyl, world, rot, anim }) => {
    // Hi-lo stainless fountain cantilevered off the wall (+Z) with a bottle filler above.
    const ss = 'm:#c4c9cc', back = D / 2;
    plain('m:#b0b6ba', 0, 0.35, back - 0.015, W, 0.6, 0.03);
    for (const [x, y0] of [[-W / 4, 0.6], [W / 4, 0.8]] as const) {
      box(ss, x, y0, 0, W / 2 - 0.03, 0.2, D - 0.04);
      plain('m:#8a9094', x, y0 + 0.199, -0.03, W / 2 - 0.15, 0.003, D - 0.2);
      cyl('chrome', x, y0 + 0.2, -0.03, 0.015, 0.03, 8);
      plain('chrome', x, y0 + 0.06, -D / 2 + 0.015, 0.16, 0.08, 0.012);
      cyl('m:#9aa0a3', x, y0 - 0.2, back - 0.1, 0.02, 0.2, 8);
    }
    box(ss, W / 4, 1.1, back - 0.1, 0.32, 0.75, 0.16);
    plain('m:#5d656b', W / 4, 1.2, back - 0.181, 0.24, 0.32, 0.004);
    plain('rubber', W / 4, 1.62, back - 0.181, 0.1, 0.05, 0.003);
    const [lx, ly, lz] = world(W / 4, 1.7, back - 0.182);
    anim.blinker(lx, ly, lz, 0.05, 0.02, 0.004, rot, '#3dff7a', 1, 1);
  },

  shelving: (c) => {
    const { W, D, H, plain, cyl, axle, r, p } = c;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('chrome', sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), 0.012, H, 6);
    const levels = 5;
    for (let k = 0; k < levels; k++) {
      const y = 0.12 + k * (H - 0.2) / (levels - 1);
      plain('chrome', 0, y, 0, W - 0.02, 0.01, D - 0.02);
      for (const s of [-1, 1]) plain('chrome', 0, y + 0.01, s * (D / 2 - 0.015), W - 0.02, 0.03, 0.006);
      if (k === levels - 1) continue;
      const ly = y + 0.01, room = (H - 0.2) / (levels - 1) - 0.06;
      if (p.variant === 'it') {
        if (k % 2 === 0) for (let i = 0; i < 2; i++) {
          plain('p:#2a2d31', -W / 4 + i * W / 2, ly, 0, W / 2 - 0.08, 0.045, D - 0.15);
          for (let j = 0; j < 6; j++) plain(r.chance(0.7) ? 'e:#3dff7a' : 'e:#ffb020', -W / 4 + i * W / 2 - 0.2 + j * 0.06, ly + 0.02, -D / 2 + 0.07, 0.01, 0.01, 0.004);
        } else for (let i = 0; i < 3; i++) axle(r.pick(['p:#1e5fb0', 'p:#e8b818', 'p:#c0392b']), -W / 2 + 0.2 + i * (W - 0.4) / 2, ly, 0, Math.min(0.16, room / 2), 0.12, 14);
      } else if (p.variant === 'janitor') {
        for (let i = 0; i < 5; i++) {
          const x = -W / 2 + 0.13 + i * (W - 0.26) / 4;
          if (k % 2) cyl('p:#f4f4f2', x, ly, 0, 0.1, Math.min(0.24, room), 10);
          else { cyl(r.pick(['p:#1e5fb0', 'p:#2fbf5a', 'p:#e8b818']), x, ly, -0.1, 0.035, 0.22, 8); plain('p:#f4f4f2', x, ly, 0.12, 0.18, 0.12, 0.22); }
        }
      } else {
        let x = -W / 2 + 0.03;
        while (x < W / 2 - 0.2) {
          const bw = r.range(0.25, 0.45), bh = Math.min(room, r.range(0.18, 0.3));
          if (x + bw > W / 2 - 0.03) break;
          plain(r.chance(0.7) ? 'cardboard' : 'p:#3a5a7a', x + bw / 2, ly, 0, bw - 0.02, bh, D - 0.1);
          x += bw + 0.02;
        }
      }
    }
  },

  switchgear: ({ W, D, H, box, plain, cyl, world, rot, anim, r }) => {
    // Main switchboard lineup (front -Z) with conduits rising to the deck.
    const grey = 'p:#b9bdb5', f = -D / 2;
    box('m:#3a3e44', 0, 0, 0, W, 0.08, D);
    box(grey, 0, 0.08, 0, W, H - 0.08, D);
    const n = Math.max(1, Math.round(W / 0.75)), sw = W / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * sw;
      if (i) plain('p:#8f938c', x - sw / 2, 0.1, f - 0.004, 0.01, H - 0.14, 0.008);
      for (const [y0, h] of [[0.12, 0.95], [1.12, 0.95]] as const) {
        plain('p:#a7aba3', x, y0, f - 0.004, sw - 0.08, h, 0.006);
        plain('chrome', x + sw / 2 - 0.1, y0 + h * 0.45, f - 0.012, 0.03, 0.14, 0.024);
      }
      plain('p:#f2f2ee', x, 2.0, f - 0.008, sw * 0.5, 0.06, 0.003);
      plain(i % 2 ? 'hazard' : 'p:#e86a10', x - sw * 0.15, 1.55, f - 0.008, 0.16, 0.1, 0.003);
      if (i === 0) plain('e:#9fe0ff', x - 0.1, 1.75, f - 0.008, 0.14, 0.07, 0.003);
      const [lx, ly, lz] = world(x + 0.12, 1.78, f - 0.01);
      anim.blinker(lx, ly, lz, 0.025, 0.025, 0.008, rot, i % 3 === 2 ? '#ff3a2a' : '#3dff7a', 1, 1, r.next());
      cyl('m:#8a9296', x - sw * 0.2, H, 0, 0.04, 3.4 - H, 8);
      cyl('m:#8a9296', x + sw * 0.15, H, 0.12, 0.03, 3.4 - H, 8);
    }
  },

  airHandler: ({ W, D, H, box, plain }) => {
    const shell = 'p:#c7cac3', galv = 'm:#b8bdc0', f = -D / 2;
    box('m:#3a3e44', 0, 0, 0, W, 0.12, D);
    box(shell, 0, 0.12, 0, W, H - 0.12, D);
    const doors = 3;
    for (let i = 0; i < doors; i++) {
      const x = -W / 2 + (i + 0.5) * W / doors;
      plain('p:#b5b8b0', x, 0.25, f - 0.004, W / doors - 0.12, H - 0.45, 0.006);
      for (const y of [0.6, H - 0.6]) plain('chrome', x + W / doors / 2 - 0.14, y, f - 0.012, 0.05, 0.1, 0.024);
    }
    plain('p:#f2f2ee', -W / 3, H - 0.32, f - 0.008, 0.36, 0.1, 0.003);
    plain('m:#d0d4d6', W / 3, 1.5, f - 0.009, 0.12, 0.12, 0.006);
    box(galv, W * 0.22, H, 0, 1.0, 3.4 - H, 0.8);
    plain('rubber', W * 0.22, H, 0, 1.04, 0.12, 0.84);
    box(galv, -W * 0.25, H, 0.2, 0.8, 3.4 - H, 0.6);
    plain('rubber', -W * 0.25, H, 0.2, 0.84, 0.12, 0.64);
  },

  waterHeater: ({ H, cyl, plain }) => {
    cyl('m:#5a5f63', 0, 0, 0, 0.31, 0.06, 18);
    cyl('p:#e8e6df', 0, 0.06, 0, 0.3, H - 0.3, 18);
    cyl('p:#d8d6cf', 0, H - 0.24, 0, 0.3, 0.06, 18);
    cyl('m:#9aa0a3', 0, H - 0.18, 0, 0.07, 0.18, 10);
    for (const s of [-1, 1]) cyl('m:#b87333', s * 0.14, H - 0.18, 0.08, 0.016, 0.18, 8);
    plain('chrome', 0.27, H - 0.45, 0, 0.06, 0.05, 0.05);
    cyl('m:#b87333', 0.315, 0.15, 0, 0.013, H - 0.62, 8);
    plain('p:#2a2d31', 0, 0.35, -0.3, 0.14, 0.14, 0.06);
    plain('p:#c0392b', 0, 0.45, -0.334, 0.04, 0.03, 0.006);
  },

  balloons: (c) => {
    // Party balloon cluster on a weight (non-solid); respects p.y via the frame.
    const { H, plain, r } = c;
    plain('p:#c0392b', 0, 0, 0, 0.1, 0.06, 0.1);
    const n = 5 + r.int(0, 2);
    for (let k = 0; k < n; k++) {
      const a = k * 2.4 + r.range(0, 0.5), d = k === 0 ? 0 : r.range(0.08, 0.2);
      const rad = r.range(0.14, 0.17), y = H - 0.22 - r.range(0, 0.45);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      strut(c, 'p:#f2f2f2', [0, 0.06, 0], [x, y - rad * 1.15, z], 0.0025, 3);
      sphere(c, 'p:' + r.pick(['#e8452c', '#f2c230', '#2a8fd8', '#3cbf5a', '#c04aa8', '#f2f2f2']), x, y, z, rad, 1.15, 12);
    }
  },

  fireExt: ({ W, D, H, box, plain, cyl }) => {
    box('p:#c0392b', 0, 0, 0, W, H, D);
    plain('p:#2a1010', 0, 0.04, -D / 2 + 0.01, W - 0.06, H - 0.08, 0.004);
    cyl('p:#d0201a', 0, 0.06, -0.005, 0.065, 0.42, 12);
    cyl('rubber', 0, 0.48, -0.005, 0.03, 0.06, 8);
    plain('glass', 0, 0.03, -D / 2 + 0.004, W - 0.04, H - 0.06, 0.004);
    plain('p:#f2f2f2', 0, H - 0.12, -D / 2 - 0.001, W - 0.08, 0.06, 0.002);
  },

  mopSink: ({ W, D, box, plain, cyl }) => {
    const back = D / 2;
    box('p:#e8e6df', -0.15, 0, 0, W - 0.3, 0.3, D);
    plain('m:#8a9094', -0.15, 0.3, 0.02, W - 0.42, 0.003, D - 0.16);
    for (const s of [-1, 1]) cyl('chrome', -0.15 + s * 0.12, 0.3, back - 0.06, 0.015, 0.8, 8);
    plain('chrome', -0.15, 1.06, back - 0.06, 0.3, 0.04, 0.04);
    plain('chrome', -0.15, 0.95, back - 0.1, 0.03, 0.12, 0.06);
    box('p:#e8b818', W / 2 - 0.14, 0, -0.12, 0.26, 0.32, 0.36);
    plain('p:#3a3e44', W / 2 - 0.14, 0.32, -0.18, 0.22, 0.1, 0.12);
    cyl('p:#9aa0a3', W / 2 - 0.08, 0.32, back - 0.07, 0.012, 0.88, 6);
  },

  projScreen: ({ W, D, H, box, plain }) => {
    // Wall projection screen (non-solid) showing a slide: title bar and a bar chart.
    box('p:#e8e8e4', 0, H - 0.1, 0, W, 0.1, D);
    const sw = W - 0.12, sh = H - 0.18, y0 = 0.05, z = -D / 2 + 0.03;
    plain('e:#e9eef4', 0, y0, z, sw, sh, 0.004);
    plain('rubber', 0, y0 + sh - 0.04, z - 0.001, sw, 0.04, 0.004);
    plain('rubber', 0, y0, z - 0.001, sw, 0.04, 0.004);
    for (const s of [-1, 1]) plain('rubber', s * (sw / 2 - 0.02), y0, z - 0.001, 0.04, sh, 0.004);
    plain('p:#2a2d31', 0, 0.02, z, sw + 0.02, 0.03, 0.02);
    plain('e:#1d3c66', 0, y0 + sh * 0.82, z - 0.003, sw * 0.86, sh * 0.08, 0.002);
    const bars = [0.35, 0.5, 0.42, 0.62, 0.71];
    bars.forEach((v, i) => plain(i === bars.length - 1 ? 'e:#f0a020' : 'e:#3a78c8', -sw * 0.3 + i * sw * 0.14, y0 + sh * 0.12, z - 0.003, sw * 0.09, sh * 0.6 * v, 0.002));
  },

  armchair: ({ W, D, H, box, plain, r }) => {
    const fab = 'p:' + r.pick(UPHOLSTERY);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) plain('darkWood', sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.05, 0.12, 0.05);
    box(fab, 0, 0.12, 0.02, W, 0.3, D - 0.04);
    box(fab, 0, 0.42, -0.04, W - 0.26, 0.1, D - 0.22);
    box(fab, 0, 0.42, D / 2 - 0.11, W, H - 0.42, 0.22);
    for (const s of [-1, 1]) box(fab, s * (W / 2 - 0.08), 0.42, 0, 0.16, 0.22, D);
  },

  coffeeTable: ({ W, D, H, box, plain, cyl, r }) => {
    box('wood', 0, H - 0.04, 0, W, 0.04, D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('m:#2a2d31', sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), 0.04, H - 0.04, 0.04);
    box('m:#2a2d31', 0, 0.1, 0, W - 0.14, 0.02, D - 0.14);
    for (let k = 0; k < 3; k++) plain('p:' + r.pick(['#c0392b', '#2a5aa8', '#f2f0ea', '#2a2d31']), r.range(-W / 4, W / 4), H + k * 0.008, r.range(-0.08, 0.08), 0.22, 0.007, 0.29, r.range(-0.6, 0.6));
    cyl('p:#d8d4cc', W / 2 - 0.2, H, 0, 0.08, 0.06, 12);
  },

  credenza: (c) => {
    const { W, D, H, box, plain, cyl, r, p } = c;
    box('rubber', 0, 0, 0.02, W - 0.04, 0.06, D - 0.06);
    box('darkWood', 0, 0.06, 0, W, H - 0.1, D);
    box(p.variant === 'catering' ? 'p:#e8e6e0' : 'darkWood', 0, H - 0.04, 0, W, 0.04, D);
    const n = Math.max(2, Math.round(W / 0.5));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * W / n;
      if (i) plain('p:#2e1f14', x - W / n / 2, 0.08, -D / 2 - 0.002, 0.008, H - 0.14, 0.004);
      plain('chrome', x + (i % 2 ? -1 : 1) * (W / n / 2 - 0.06), H - 0.28, -D / 2 - 0.012, 0.02, 0.12, 0.02);
    }
    if (p.variant === 'catering') {
      // coffee urn, cups, a pastry tray, napkins and a water pitcher
      cyl('chrome', -W / 2 + 0.3, H, 0, 0.13, 0.42, 14);
      cyl('rubber', -W / 2 + 0.3, H + 0.42, 0, 0.06, 0.04, 10);
      plain('rubber', -W / 2 + 0.3, H + 0.08, -0.15, 0.04, 0.04, 0.06);
      for (let k = 0; k < 3; k++) cyl('p:#f2f0ea', -W / 2 + 0.6 + k * 0.1, H, -0.05, 0.04, 0.12 + k * 0.03, 10);
      plain('m:#c4c9cc', 0.15, H, 0, 0.5, 0.02, 0.32);
      for (let k = 0; k < 8; k++) sphere(c, r.pick(['p:#c9963a', 'p:#a8692a', 'p:#e2c48a']), -0.05 + (k % 4) * 0.13, H + 0.04, -0.07 + Math.floor(k / 4) * 0.14, 0.045, 0.6, 8);
      plain('p:#f2f2f2', W / 2 - 0.45, H, 0, 0.18, 0.05, 0.18);
      cyl('glass', W / 2 - 0.18, H, 0, 0.07, 0.24, 12);
    } else {
      pottedPlant(c, W / 2 - 0.2, H, 0, 0.13, 0.7);
      for (const [x, h] of [[-W / 2 + 0.25, 0.22], [-W / 2 + 0.42, 0.18]] as const) {
        plain('m:#2a2d31', x, H, 0, 0.1, 0.03, 0.08);
        plain('glass', x, H + 0.03, 0, 0.08, h, 0.04);
      }
      tiltedBox(c.geo, 'darkWood', 0, H + 0.13, 0.05, 0.3, 0.24, 0.02, -0.15);
      tiltedBox(c.geo, 'p:#d8d4cc', 0, H + 0.13, 0.038, 0.24, 0.18, 0.004, -0.15);
    }
  },

  turnstile: ({ W, D, H, box, plain, world, rot, anim, r }) => {
    // Lobby security turnstile pedestal (long axis along Z) with retracted glass wings.
    const ss = 'm:#c4c9cc';
    box('m:#3a3e44', 0, 0, 0, W, 0.04, D);
    box(ss, 0, 0.04, 0, W, H - 0.08, D);
    box(ss, 0, H - 0.04, 0, W, 0.04, D);
    plain('p:#15181c', 0, H, 0, W - 0.06, 0.004, D - 0.3);
    plain('rubber', 0, H, -D / 2 + 0.2, 0.14, 0.012, 0.14);
    plain('e:#5aa8ff', 0, H + 0.012, -D / 2 + 0.2, 0.06, 0.002, 0.06);
    for (const s of [-1, 1]) {
      plain('glass', s * (W / 2 + 0.065), 0.45, 0.1, 0.13, 0.42, 0.012);
      plain('chrome', s * (W / 2 + 0.128), 0.45, 0.1, 0.006, 0.42, 0.016);
      plain('rubber', s * (W / 2 + 0.002), 0.3, 0, 0.004, 0.5, D - 0.4);
      // green "go" arrow on each end face
      const [lx, ly, lz] = world(0, H - 0.14, s * (D / 2 + 0.004));
      anim.blinker(lx, ly, lz, 0.06, 0.06, 0.006, rot, '#3dff7a', 1, 1, r.next());
    }
  },
};

