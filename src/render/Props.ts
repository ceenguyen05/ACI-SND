import type { PropDef } from '../sim/world/MapTypes';
import type { Batcher } from './Materials';
import { Random } from '../core/Random';
import { CylinderGeometry } from 'three';

type BoxFn = (mat: string, lx: number, ly: number, lz: number, w: number, h: number, d: number) => void;
type CylFn = (mat: string, lx: number, ly: number, lz: number, r: number, h: number, seg?: number) => void;
interface Ctx { W: number; D: number; H: number; box: BoxFn; cyl: CylFn; axle: CylFn; r: Random; b: Batcher; p: PropDef }

/** Build a prop's visual geometry into the batcher. Local frame: front faces -Z, origin at footprint center, y=0 at base. */
export function buildProp(b: Batcher, p: PropDef, seed: number) {
  const f = p.facing ?? 0;
  const rot = -f * Math.PI / 2;
  const odd = f % 2 === 1;
  const W = odd ? p.d : p.w, D = odd ? p.w : p.d;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const y0 = p.y ?? 0;
  const box: BoxFn = (mat, lx, ly, lz, w, h, d) => {
    const rounded = Math.min(w, h, d) >= 0.045 && !['crate', 'cardboard', 'hazard', 'glass', 'screen'].includes(mat);
    if (rounded) b.roundedBox(mat, w, h, d, p.x + lx * cos + lz * sin, y0 + ly, p.z - lx * sin + lz * cos, rot);
    else b.box(mat, w, h, d, p.x + lx * cos + lz * sin, y0 + ly, p.z - lx * sin + lz * cos, rot);
  };
  const cyl: CylFn = (mat, lx, ly, lz, r, h, seg = 14) => {
    b.cylinder(mat, r, h, p.x + lx * cos + lz * sin, y0 + ly, p.z - lx * sin + lz * cos, seg);
  };
  const axle: CylFn = (mat, lx, ly, lz, radius, length, segments = 20) => {
    b.addGeometry(mat, new CylinderGeometry(radius, radius, length, segments),
      p.x + lx * cos + lz * sin, y0 + ly + radius, p.z - lx * sin + lz * cos, rot, 0, Math.PI / 2);
  };
  const ctx: Ctx = { W, D, H: p.h, box, cyl, axle, r: new Random(seed), b, p };
  (BUILDERS[p.kind] ?? fallback)(ctx);
}

const fallback = ({ W, D, H, box }: Ctx) => box('p:#888888', 0, 0, 0, W, H, D);

function monitor(box: BoxFn, x: number, y: number, z: number, faceZ: 1 | -1) {
  box('rubber', x, y, z, 0.18, 0.02, 0.15);
  box('rubber', x, y, z, 0.04, 0.22, 0.04);
  box('rubber', x, y + 0.18, z, 0.52, 0.32, 0.04);
  box('screen', x, y + 0.2, z + faceZ * 0.022, 0.48, 0.28, 0.005);
}

function chair(box: BoxFn, cyl: CylFn, x: number, z: number, faceZ: number) {
  cyl('rubber', x, 0, z, 0.03, 0.42, 6);
  box('fabric', x, 0.42, z, 0.48, 0.07, 0.46);
  box('fabric', x, 0.49, z + faceZ * 0.22, 0.46, 0.5, 0.06);
  box('rubber', x, 0.02, z, 0.5, 0.03, 0.08);
  box('rubber', x, 0.02, z, 0.08, 0.03, 0.5);
}

const BUILDERS: Partial<Record<PropDef['kind'], (c: Ctx) => void>> = {
  cubicle: ({ W, D, H, box, cyl, r }) => {
    const t = 0.06;
    box('fabric', 0, 0, -D / 2 + t / 2, W, H, t);
    box('fabric', 0, 0, D / 2 - t / 2, W, H, t);
    box('fabric', -W / 2 + t / 2, 0, 0, t, H, D - 2 * t);
    box('fabric', W / 2 - t / 2, 0, 0, t, H, D - 2 * t);
    box('m:#9aa0a8', 0, H, -D / 2 + t / 2, W, 0.03, t + 0.01);
    box('m:#9aa0a8', 0, H, D / 2 - t / 2, W, 0.03, t + 0.01);
    box('m:#9aa0a8', -W / 2 + t / 2, H, 0, t + 0.01, 0.03, D);
    box('m:#9aa0a8', W / 2 - t / 2, H, 0, t + 0.01, 0.03, D);
    const split = W >= 4 && D >= 4;
    box('fabric', 0, 0, 0, t, H * 0.95, D - 2 * t);
    if (split) box('fabric', 0, 0, 0, W - 2 * t, H * 0.95, t);
    const qs = split ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0]];
    for (const [sx, sz] of qs) {
      const qw = W / 2 - t * 1.5, qd = split ? D / 2 - t * 1.5 : D - 2 * t;
      const cx = sx * (W / 4), cz = sz * (D / 4);
      // desk along the outer wall of the quadrant
      const deskD = 0.75;
      const dz = split ? cz + sz * (qd / 2 - deskD / 2) : cz - (qd / 2 - deskD / 2);
      box('wood', cx, 0.72, dz, qw - 0.05, 0.04, deskD);
      box('m:#5a6068', cx - qw / 2 + 0.3, 0, dz, 0.45, 0.7, deskD - 0.05);
      const face = (split ? -sz : 1) as 1 | -1;
      monitor(box, cx + r.range(-0.3, 0.3), 0.76, dz + face * 0.05, face);
      if (r.chance(0.6)) box('cardboard', cx + qw / 2 - 0.35, 0.76, dz, 0.3, 0.22, 0.3);
      chair(box, cyl, cx + r.range(-0.4, 0.4), dz - face * 0.7 + (split ? 0 : 0), -face);
    }
  },
  confTable: ({ W, D, H, box, cyl }) => {
    box('darkWood', 0, H - 0.05, 0, W, 0.05, D);
    box('m:#3a3d42', 0, 0, -D * 0.3, 0.3, H - 0.05, 0.3);
    box('m:#3a3d42', 0, 0, D * 0.3, 0.3, H - 0.05, 0.3);
    const long = D > W;
    const n = Math.floor((long ? D : W) / 1.0);
    for (let i = 0; i < n; i++) {
      const t = -((long ? D : W) / 2) + 0.5 + i * ((long ? D : W) - 1) / Math.max(1, n - 1);
      if (long) { chair(box, cyl, -W / 2 - 0.45, t, -1); chair(box, cyl, W / 2 + 0.45, t, 1); }
      else { chair(box, cyl, t, -D / 2 - 0.45, -1); chair(box, cyl, t, D / 2 + 0.45, 1); }
    }
    box('rubber', 0, H, 0, 0.25, 0.04, 0.25);
  },
  reception: ({ W, D, H, box }) => {
    box('darkWood', 0, 0, 0, W, H - 0.05, D);
    box('marble', 0, H - 0.05, 0, W + 0.1, 0.05, D + 0.1);
    box('e:#f0a020', 0, 0.35, -D / 2 - 0.005, W * 0.9, 0.06, 0.01);
    monitor(box, -W * 0.25, H, D * 0.1, 1);
    monitor(box, W * 0.2, H, D * 0.1, 1);
  },
  sofa: ({ W, D, H, box }) => {
    box('p:#3c4a5a', 0, 0.1, 0, W, 0.35, D);
    box('p:#3c4a5a', 0, 0.1, D / 2 - 0.15, W, H - 0.1, 0.3);
    box('p:#334050', -W / 2 + 0.12, 0.1, 0, 0.24, 0.55, D);
    box('p:#334050', W / 2 - 0.12, 0.1, 0, 0.24, 0.55, D);
    box('rubber', 0, 0, 0, W - 0.1, 0.1, D - 0.1);
  },
  pillar: ({ W, D, H, box }) => {
    const mat = H > 7 ? 'concrete' : H > 4 ? 'marble' : 'p:#d8d4cc';
    box(mat, 0, 0, 0, W, H, D);
    if (H > 7) box('hazard', 0, 0, 0, W + 0.02, 1.2, D + 0.02);
  },
  planter: ({ W, H, box, cyl, r }) => {
    cyl('p:#2c2c30', 0, 0, 0, W / 2, 0.55, 10);
    for (let i = 0; i < 5; i++) box('foliage', r.range(-0.15, 0.15), 0.5 + i * 0.15, r.range(-0.15, 0.15), W * 0.8 - i * 0.08, H * 0.18, W * 0.8 - i * 0.08);
  },
  vending: ({ W, D, H, box, r }) => {
    const col = r.pick(['#b01e28', '#1e4fb0', '#1a1a1a']);
    box('p:' + col, 0, 0, 0, W, H, D);
    box('e:#dff4ff', -W * 0.12, 0.35, -D / 2 - 0.005, W * 0.62, H * 0.62, 0.01);
    box('rubber', W * 0.33, 0.9, -D / 2 - 0.005, 0.18, 0.4, 0.01);
    box('rubber', -W * 0.12, 0.12, -D / 2 - 0.005, W * 0.5, 0.15, 0.01);
  },
  copier: ({ W, D, H, box }) => {
    box('p:#d4d6d8', 0, 0, 0, W, H * 0.85, D);
    box('p:#8a8e94', 0, H * 0.85, 0, W, H * 0.15, D);
    box('screen', W * 0.3, H * 0.86, -D / 2 + 0.1, 0.25, 0.15, 0.12);
  },
  cabinet: ({ W, D, H, box }) => {
    box('m:#7c828a', 0, 0, 0, W, H, D);
    const n = Math.max(1, Math.floor(W / 0.5));
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) box('rubber', -W / 2 + (i + 0.5) * (W / n), 0.2 + k * (H / 3.2), -D / 2 - 0.005, 0.15, 0.03, 0.01);
  },
  whiteboard: ({ W, D, H, box, p }) => {
    const floating = (p.y ?? 0) > 0.2;
    box('m:#b0b4b8', 0, floating ? 0 : 0.8, 0, W, floating ? H : H - 0.8, D);
    box('e:#f4f4f0', 0, (floating ? 0 : 0.8) + 0.05, -D / 2 - 0.006, W - 0.1, (floating ? H : H - 0.8) - 0.1, 0.01);
    box('e:#f4f4f0', 0, (floating ? 0 : 0.8) + 0.05, D / 2 + 0.006, W - 0.1, (floating ? H : H - 0.8) - 0.1, 0.01);
    box('e:#2050c0', -W * 0.2, (floating ? 0 : 0.8) + H * 0.3, -D / 2 - 0.012, W * 0.4, 0.02, 0.005);
    box('e:#c02020', W * 0.1, (floating ? 0 : 0.8) + H * 0.15, -D / 2 - 0.012, W * 0.25, 0.02, 0.005);
    if (!floating) { box('m:#888', -W / 2 + 0.05, 0, 0, 0.05, 0.8, 0.5); box('m:#888', W / 2 - 0.05, 0, 0, 0.05, 0.8, 0.5); }
  },
  tv: ({ W, H, D, box }) => {
    box('rubber', 0, 0, 0, W, H, D);
    box('screen', 0, 0.04, -D / 2 - 0.005, W - 0.08, H - 0.08, 0.01);
  },
  logo: ({ W, H, b, p }) => {
    // handled in MapMesh with a textured plane; draw a backing panel here
    void b; void p;
    void W; void H;
  },
  counter: ({ W, D, H, box }) => {
    box('wood', 0, 0.1, 0, W, H - 0.14, D);
    box('rubber', 0, 0, 0, W - 0.05, 0.1, D - 0.1);
    box('p:#e8e6e0', 0, H - 0.04, 0, W + 0.04, 0.04, D + 0.04);
    box('chrome', 0, H, 0, Math.min(W, D) * 0.4, 0.15, Math.min(W, D) * 0.4);
  },
  fridge: ({ W, D, H, box }) => {
    box('chrome', 0, 0, 0, W, H, D);
    box('rubber', 0, H * 0.62, -D / 2 - 0.005, W, 0.02, 0.01);
    box('rubber', W * 0.38, H * 0.3, -D / 2 - 0.02, 0.03, 0.4, 0.03);
  },
  table: ({ W, D, H, box, cyl }) => {
    box('wood', 0, H - 0.04, 0, W, 0.04, D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('m:#555a60', sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.05, H - 0.04, 0.05);
    chair(box, cyl, -W * 0.25, -D / 2 - 0.4, -1);
    chair(box, cyl, W * 0.25, D / 2 + 0.4, 1);
  },
  serverRack: ({ W, D, H, box }) => {
    const n = Math.max(1, Math.round(W / 0.7));
    const w = W / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * w;
      box('p:#1e2126', x, 0, 0, w - 0.02, H, D);
      box('serverFront', x, 0.02, -D / 2 - 0.005, w - 0.08, H - 0.06, 0.01);
      box('serverFront', x, 0.02, D / 2 + 0.005, w - 0.08, H - 0.06, 0.01);
    }
    box('m:#30353c', 0, H, 0, W, 0.08, D * 0.3);
  },
  crac: ({ W, D, H, box }) => {
    box('p:#e0e2e4', 0, 0, 0, W, H, D);
    for (let y = 0.3; y < H - 0.3; y += 0.12) box('rubber', 0, y, -D / 2 - 0.005, W * 0.8, 0.04, 0.01);
  },
  ups: ({ W, D, H, box }) => {
    box('p:#2a2d32', 0, 0, 0, W, H, D);
    box('e:#30ff70', W * 0.3, H * 0.8, -D / 2 - 0.005, 0.05, 0.05, 0.01);
  },
  mailShelf: ({ W, D, H, box, r }) => {
    box('wood', 0, 0, 0, W, 0.05, D);
    box('wood', 0, H - 0.04, 0, W, 0.04, D);
    box('wood', 0, 0, D / 2 - 0.02, W, H, 0.04);
    const cols = Math.floor(W / 0.4), rows = 5;
    for (let i = 0; i <= cols; i++) box('wood', -W / 2 + i * (W / cols), 0, 0, 0.02, H, D);
    for (let k = 1; k < rows; k++) box('wood', 0, k * (H / rows), 0, W, 0.02, D);
    for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) if (r.chance(0.45))
      box('p:#f0eee8', -W / 2 + (i + 0.5) * (W / cols), k * (H / rows) + 0.03, 0, 0.28, r.range(0.03, 0.15), D * 0.8);
  },
  crate: ({ W, D, H, box }) => {
    if (H > 1.8) { box('crate', 0, 0, 0, W, H / 2, D); box('crate', 0, H / 2, 0, W * 0.96, H / 2, D * 0.96); }
    else box('crate', 0, 0, 0, W, H, D);
    for (const x of [-W * 0.44, W * 0.44]) for (const z of [-D / 2, D / 2]) {
      box('wood', x, 0, z, 0.09, H, 0.035);
      for (const y of [0.09, H - 0.1]) box('metal', x, y, z + Math.sign(z) * 0.023, 0.016, 0.016, 0.008);
    }
  },
  pallet: ({ W, D, H, box, r }) => {
    for (const x of [-W * 0.42, 0, W * 0.42]) box('wood', x, 0, 0, W * 0.12, 0.11, D);
    for (let k = 0; k < 5; k++) box('wood', 0, 0.11, -D / 2 + (k + 0.5) * D / 5, W, 0.035, D * 0.15);
    const nx = Math.max(1, Math.round(W / 0.6)), nz = Math.max(1, Math.round(D / 0.6));
    const layers = Math.max(1, Math.round((H - 0.14) / 0.4));
    const lh = (H - 0.14) / layers;
    for (let l = 0; l < layers; l++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (l === layers - 1 && r.chance(0.2)) continue;
      box('cardboard', -W / 2 + (i + 0.5) * (W / nx), 0.14 + l * lh, -D / 2 + (k + 0.5) * (D / nz), W / nx - 0.03, lh - 0.01, D / nz - 0.03);
    }
  },
  rack: ({ W, D, H, box, r }) => {
    const alongX = W > D;
    const L = alongX ? W : D, T = alongX ? D : W;
    const bays = Math.max(1, Math.round(L / 2.6));
    const levels = Math.max(2, Math.round(H / 1.4));
    const P = (a: number, t: number): [number, number] => (alongX ? [a, t] : [t, a]);
    for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) {
      const [x, z] = P(-L / 2 + i * (L / bays), s * (T / 2 - 0.05));
      box('p:#2a5aa8', x, 0, z, 0.08, H, 0.08);
    }
    for (let k = 1; k <= levels; k++) {
      const y = k * (H / levels) - 0.12;
      for (const s of [-1, 1]) { const [x, z] = P(0, s * (T / 2 - 0.05)); box('p:#e06a1a', x, y, z, alongX ? L : 0.1, 0.12, alongX ? 0.1 : L); }
    }
    for (let k = 0; k < levels; k++) {
      const y = k * (H / levels) + (k === 0 ? 0.02 : 0);
      for (let i = 0; i < bays; i++) {
        if (r.chance(0.15)) continue;
        const [x, z] = P(-L / 2 + (i + 0.5) * (L / bays), 0);
        const bh = Math.min(H / levels - 0.25, r.range(0.6, 1.1));
        box('wood', x, y, z, alongX ? 2.2 : T - 0.15, 0.12, alongX ? T - 0.15 : 2.2);
        box(r.chance(0.5) ? 'cardboard' : 'crate', x, y + 0.12, z, alongX ? 2.0 : T - 0.25, bh, alongX ? T - 0.25 : 2.0);
      }
    }
  },
  cnc: ({ W, D, H, box, cyl, r }) => {
    const col = r.pick(['#c9cdd1', '#d8dcd0', '#b8c4cc']);
    box('p:#3a3e44', 0, 0, 0, W, 0.25, D);
    box('p:' + col, 0, 0.25, 0, W, H - 0.25, D);
    box('m:#303d43', -W * 0.1, 0.85, -D / 2 - 0.014, W * 0.58, H * 0.43, 0.025);
    box('glass', -W * 0.1, 0.91, -D / 2 - 0.035, W * 0.53, H * 0.37, 0.02);
    box('m:#b0b8b6', W * 0.2, 1.04, -D / 2 - 0.055, 0.035, 0.4, 0.035);
    box('p:#2a7a8a', 0, H - 0.25, 0, W + 0.02, 0.15, D + 0.02);
    box('p:#2a2d32', W / 2 - 0.35, 0.9, -D / 2 - 0.15, 0.5, 0.7, 0.3);
    box('screen', W / 2 - 0.35, 1.2, -D / 2 - 0.31, 0.36, 0.28, 0.01);
    for (let k = 0; k < 5; k++) box('rubber', W / 2 - 0.49 + k * 0.065, 1.04, -D / 2 - 0.31, 0.04, 0.025, 0.012);
    box('p:#b94e35', W / 2 - 0.23, 0.96, -D / 2 - 0.32, 0.06, 0.06, 0.025);
    for (let k = 0; k < 6; k++) box('m:#616e73', W / 2 + 0.006, 0.5 + k * 0.065, 0, 0.014, 0.024, D * 0.46);
    // Maintenance panels and vents on every approach, including the back of cover.
    for (const side of [-1, 1]) {
      box('m:#7b8989', side * (W / 2 + 0.005), 0.38, 0, 0.025, H * 0.61, D * 0.76);
      box('p:' + col, side * (W / 2 + 0.022), 0.42, 0, 0.014, H * 0.58, D * 0.73);
      box('rubber', side * (W / 2 + 0.035), 1.0, D * 0.18, 0.016, 0.16, 0.035);
      for (let k = 0; k < 7; k++) box('m:#657274', side * (W / 2 + 0.035), 0.52 + k * 0.06, -D * 0.2, 0.012, 0.019, D * 0.25);
    }
    box('m:#8b9693', 0, 0.4, D / 2 + 0.01, W * 0.8, H * 0.55, 0.025);
    box('p:' + col, 0, 0.44, D / 2 + 0.028, W * 0.77, H * 0.52, 0.015);
    box('rubber', 0, 0.44, D / 2 + 0.04, 0.01, H * 0.52, 0.009);
    for (const x of [-0.09, 0.09]) box('m:#465357', x, H * 0.48, D / 2 + 0.063, 0.025, 0.24, 0.03);
    box('machineBadge', -W * 0.2, H * 0.72, D / 2 + 0.043, 0.62, 0.16, 0.012);
    for (let k = 0; k < 6; k++) box('m:#657274', W * 0.25, 0.56 + k * 0.07, D / 2 + 0.043, W * 0.26, 0.023, 0.015);
    cyl('rubber', -W / 2 + 0.2, H, -D / 2 + 0.2, 0.065, 0.12, 16);
    for (let k = 0; k < 3; k++) cyl(['p:#a43b31', 'p:#ac8b38', 'e:#72b97b'][k], -W / 2 + 0.2, H + 0.12 + k * 0.065, -D / 2 + 0.2, 0.052, 0.06, 16);
  },
  press: ({ W, D, H, box, cyl }) => {
    box('p:#536559', 0, 0, 0, W, 1.0, D);
    for (const sx of [-1, 1]) box('p:#536559', sx * (W / 2 - 0.4), 1.0, 0, 0.8, H - 1.8, D * 0.7);
    box('p:#536559', 0, H - 0.8, 0, W, 0.8, D);
    box('chrome', 0, 1.6, 0, W * 0.5, 0.25, D * 0.5);
    cyl('chrome', 0, 1.85, 0, 0.15, H - 2.65, 20);
    // Service panel and fasteners on both sides of the machine.
    for (const side of [-1, 1]) {
      box('m:#414e46', 0, 0.14, side * (D / 2 + 0.008), W * 0.7, 0.65, 0.02);
      for (const x of [-W * 0.3, W * 0.3]) for (const y of [0.2, 0.7]) box('metal', x, y, side * (D / 2 + 0.024), 0.04, 0.04, 0.01);
      box('p:#aba68e', 0, H - 0.61, side * (D / 2 + 0.01), W * 0.3, 0.2, 0.015);
    }
    box('hazard', 0, 0.95, -D / 2 - 0.01, W, 0.1, 0.02);
    box('hazard', 0, H - 0.8, -D / 2 - 0.01, W, 0.15, 0.02);
  },
  robotCell: ({ W, D, H, box, cyl }) => {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box('p:#e8b818', x * (W / 2 - 0.05), 0, z * (D / 2 - 0.05), 0.1, H, 0.1);
    box('glass', 0, 0.1, -D / 2 + 0.02, W - 0.2, H - 0.3, 0.02);
    box('glass', 0, 0.1, D / 2 - 0.02, W - 0.2, H - 0.3, 0.02);
    box('glass', -W / 2 + 0.02, 0.1, 0, 0.02, H - 0.3, D - 0.2);
    box('glass', W / 2 - 0.02, 0.1, 0, 0.02, H - 0.3, D - 0.2);
    box('p:#e8b818', 0, H - 0.1, 0, W, 0.1, 0.1);
    // robot arm
    cyl('p:#ee6a10', 0, 0, 0, 0.45, 0.5);
    cyl('p:#ee6a10', 0, 0.5, 0, 0.3, 0.6);
    box('p:#ee6a10', 0.2, 1.0, 0, 0.3, 1.3, 0.3);
    box('p:#ee6a10', 0.2, 2.2, -0.5, 0.25, 0.25, 1.3);
    box('rubber', 0.2, 2.0, -1.15, 0.2, 0.35, 0.2);
    box('m:#80868c', 0, 0, 0.6, 1.2, 0.8, 0.8);
  },
  conveyor: ({ W, D, H, box, r }) => {
    const alongX = W > D;
    const L = alongX ? W : D, T = alongX ? D : W;
    const P = (a: number, t: number): [number, number] => (alongX ? [a, t] : [t, a]);
    for (let a = -L / 2 + 0.3; a <= L / 2; a += 1.6) for (const s of [-1, 1]) {
      const [x, z] = P(a, s * (T / 2 - 0.08));
      box('m:#6a7078', x, 0, z, 0.08, H - 0.15, 0.08);
    }
    for (const s of [-1, 1]) { const [x, z] = P(0, s * (T / 2 - 0.04)); box('m:#9aa2aa', x, H - 0.2, z, alongX ? L : 0.08, 0.2, alongX ? 0.08 : L); }
    const [bx, bz] = P(0, 0);
    box('rubber', bx, H - 0.12, bz, alongX ? L : T - 0.16, 0.08, alongX ? T - 0.16 : L);
    for (let a = -L / 2 + 1; a < L / 2 - 0.5; a += r.range(1.5, 3.5)) {
      const [x, z] = P(a, 0);
      const s = r.range(0.35, 0.6);
      box('cardboard', x, H - 0.04, z, s, s * 0.7, s);
    }
  },
  forklift: ({ W, D, H, box, axle }) => {
    box('p:#e8b818', 0, 0.25, 0.2, W, 0.9, D - 0.8);
    box('p:#2a2a2a', 0, 1.15, 0.5, W - 0.1, 0.1, 1.0);
    box('rubber', 0, 1.2, 0.8, W * 0.6, 0.5, 0.4);
    for (const sx of [-1, 1]) {
      box('m:#3a3a3a', sx * (W / 2 - 0.05), 1.15, 0.2, 0.06, H - 1.15, 0.06);
      box('m:#3a3a3a', sx * (W / 2 - 0.05), 1.15, 1.0, 0.06, H - 1.15, 0.06);
      box('m:#4a4a4a', sx * 0.3, 0, -D / 2 + 0.6, 0.1, H - 0.1, 0.12);
      box('m:#555', sx * 0.25, 0.05, -D / 2 + 0.3, 0.12, 0.05, 0.9);
    }
    box('m:#3a3a3a', 0, H - 0.05, 0.6, W, 0.05, 0.9);
    for (const sx of [-1, 1]) for (const sz of [-0.5, 0.9]) {
      axle('rubber', sx * (W / 2 - 0.1), 0, sz, 0.29, 0.22, 20);
      axle('metal', sx * (W / 2 + 0.015), 0.15, sz, 0.14, 0.025, 16);
    }
  },
  barrels: ({ W, D, H, cyl, r }) => {
    const n = W > 1.3 ? 2 : 1;
    const rad = Math.min(W, D) / (n * 2) - 0.02;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      const col = r.pick(['#1e4fb0', '#b02020', '#2a7a3a', '#3a3a3a']);
      cyl('p:' + col, -W / 2 + (i + 0.5) * (W / n), 0, -D / 2 + (k + 0.5) * (D / n), rad, H, 14);
      for (const y of [0.035, H * 0.3, H * 0.68, H - 0.035]) cyl('m:#666c65', -W / 2 + (i + 0.5) * (W / n), y, -D / 2 + (k + 0.5) * (D / n), rad + 0.012, 0.025, 20);
    }
  },
  trailer: ({ W, D, H, box, axle }) => {
    box('p:#e6e8ea', 0, 1.2, 0, W, H - 1.2, D);
    for (let z = -D / 2 + 0.6; z < D / 2; z += 1.2) box('m:#c8ccd0', 0, 1.2, z, W + 0.04, H - 1.2, 0.06);
    box('m:#404448', 0, 0.9, 0, W - 0.3, 0.3, D);
    for (const sx of [-1, 1]) for (const sz of [D / 2 - 1.0, D / 2 - 2.2]) {
      axle('rubber', sx * (W / 2 - 0.3), 0, sz, 0.5, 0.35, 24);
      axle('metal', sx * (W / 2 - 0.11), 0.24, sz, 0.26, 0.035, 20);
    }
    box('p:#d84020', 0, 1.2, D / 2 + 0.01, W, 0.15, 0.02);
  },
  boxTruck: ({ W, D, H, box, axle }) => {
    // facing 1 → local length along Z (D)
    box('p:#f2f2f2', 0, 0.9, 0.7, W, H - 0.9, D - 2.2);
    box('p:#1e4fb0', 0, 0.6, -D / 2 + 1.0, W, 1.6, 2.0);
    box('glass', 0, 1.4, -D / 2 - 0.01, W - 0.2, 0.7, 0.02);
    box('m:#404448', 0, 0.45, 0, W - 0.2, 0.25, D);
    for (const sx of [-1, 1]) for (const sz of [-D / 2 + 1.0, D / 2 - 1.2]) {
      axle('rubber', sx * (W / 2 - 0.15), 0, sz, 0.45, 0.3, 24);
      axle('metal', sx * (W / 2 + 0.015), 0.22, sz, 0.23, 0.025, 20);
    }
    box('rubber', 0, 0.85, -D / 2 - 0.02, W * 0.5, 0.34, 0.025);
    for (const x of [-W * 0.35, W * 0.35]) box('lightWarm', x, 0.95, -D / 2 - 0.04, 0.28, 0.17, 0.025);
  },
  dumpster: ({ W, D, H, box }) => {
    box('p:#2a5a32', 0, 0.15, 0, W, H - 0.2, D);
    box('p:#1e4026', 0, H - 0.05, 0, W + 0.05, 0.08, D + 0.05);
    box('rubber', 0, 0, 0, W - 0.2, 0.15, D - 0.2);
  },
  car: ({ W, D, H, box, axle, r }) => {
    const col = r.pick(['#8a1c1c', '#2a4a7a', '#c8c8c8', '#202224']);
    box('p:' + col, 0, 0.3, 0, W, 0.6, D);
    box('p:' + col, 0, 0.9, 0.2, W - 0.2, 0.5, D * 0.5);
    box('glass', 0, 0.95, 0.2, W - 0.18, 0.4, D * 0.52);
    for (const sx of [-1, 1]) for (const sz of [-D / 2 + 0.7, D / 2 - 0.7]) {
      axle('rubber', sx * (W / 2 - 0.1), 0, sz, 0.32, 0.25, 24);
      axle('metal', sx * (W / 2 + 0.04), 0.13, sz, 0.19, 0.025, 20);
    }
    for (const side of [-1, 1]) {
      box('light', side * W * 0.33, 0.63, -D / 2 - 0.012, W * 0.2, 0.14, 0.025);
      box('p:#a2342c', side * W * 0.33, 0.63, D / 2 + 0.012, W * 0.2, 0.14, 0.025);
    }
    void H;
  },
  barrier: ({ W, D, H, box }) => {
    box('concrete', 0, 0, 0, W, H * 0.3, D);
    box('concrete', 0, H * 0.3, 0, W, H * 0.7, D * 0.55);
    box('hazard', 0, H * 0.5, -D * 0.28, W, 0.12, 0.01);
  },
  partition: ({ W, D, H, box }) => {
    box('wall:office', 0, 0, 0, W, H, D);
  },
  packTable: ({ W, D, H, box, r }) => {
    box('wood', 0, H - 0.05, 0, W, 0.05, D);
    box('m:#5a6068', 0, 0, 0, W - 0.1, H - 0.05, D - 0.1);
    for (let i = 0; i < 3; i++) if (r.chance(0.7)) box('cardboard', -W / 2 + 0.4 + i * (W / 3), H, r.range(-D / 4, D / 4), 0.4, 0.3, 0.35);
    box('m:#c02020', W / 2 - 0.3, H, -D / 2 + 0.2, 0.2, 0.12, 0.1);
  },
  container: ({ W, D, H, box }) => {
    box('p:#1f5fa0', 0, 0, 0, W, H, D);
    const alongZ = D > W;
    for (let a = -((alongZ ? D : W) / 2) + 0.3; a < (alongZ ? D : W) / 2; a += 0.3) {
      if (alongZ) { box('p:#184c80', -W / 2 - 0.02, 0.1, a, 0.04, H - 0.2, 0.12); box('p:#184c80', W / 2 + 0.02, 0.1, a, 0.04, H - 0.2, 0.12); }
      else { box('p:#184c80', a, 0.1, -D / 2 - 0.02, 0.12, H - 0.2, 0.04); box('p:#184c80', a, 0.1, D / 2 + 0.02, 0.12, H - 0.2, 0.04); }
    }
  },
  console: ({ W, D, H, box }) => {
    box('p:#3a4048', 0, 0, 0, W, H, D);
    box('screen', -W * 0.2, H * 0.5, -D / 2 - 0.005, W * 0.4, H * 0.35, 0.01);
    box('e:#30ff70', W * 0.2, H * 0.7, -D / 2 - 0.005, 0.06, 0.06, 0.01);
    box('e:#ff3030', W * 0.3, H * 0.7, -D / 2 - 0.005, 0.06, 0.06, 0.01);
  },
  bench: ({ W, D, H, box }) => {
    box('wood', 0, H - 0.06, 0, W, 0.06, D);
    box('m:#444', -W / 2 + 0.15, 0, 0, 0.06, H - 0.06, D - 0.1);
    box('m:#444', W / 2 - 0.15, 0, 0, 0.06, H - 0.06, D - 0.1);
  },
  cooler: ({ W, H, box, cyl }) => {
    box('p:#e8e8e8', 0, 0, 0, W, H - 0.35, W);
    cyl('glass', 0, H - 0.35, 0, W * 0.4, 0.35, 10);
  },
  lightPole: ({ H, box }) => {
    box('m:#555a60', 0, 0, 0, 0.18, H, 0.18);
    box('m:#555a60', 0, H - 0.1, -0.5, 0.2, 0.12, 1.0);
    box('lightWarm', 0, H - 0.14, -0.8, 0.35, 0.04, 0.5);
  },
  cart: ({ W, D, H, box, cyl }) => {
    box('p:#e8b818', 0, 0.15, 0, W, 0.5, D);
    box('m:#666', 0, 0.15, D / 2 - 0.05, W, H - 0.15, 0.04);
    cyl('p:#1e4fb0', 0, 0.65, -D * 0.2, 0.18, 0.3, 10);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl('rubber', sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.08), 0.06, 0.15, 8);
  },
};
