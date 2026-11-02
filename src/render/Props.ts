import type { PropDef } from '../sim/world/MapTypes';
import type { Batcher } from './Materials';
import type { MapAnimator } from './MapAnimation';
import { Random } from '../core/Random';
import { SPEED_TRAILER, cubicleLayout } from '../sim/world/PropShapes';
import { CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';

/** `turn` rotates the box about Y on top of the prop's own facing (quarter turns or any angle). */
type BoxFn = (mat: string, lx: number, ly: number, lz: number, w: number, h: number, d: number, turn?: number) => void;
type CylFn = (mat: string, lx: number, ly: number, lz: number, r: number, h: number, seg?: number) => void;
/** `box` bevels its edges; `plain` is a sharp box for small parts repeated by the hundred (12 triangles, not ~108). */
interface Prims { box: BoxFn; plain: BoxFn; cyl: CylFn; axle: CylFn }
interface Ctx extends Prims {
  W: number; D: number; H: number; r: Random; b: Batcher; p: PropDef;
  /** Prop rotation about Y; `world` maps prop-local points with it. */
  rot: number;
  world(lx: number, ly: number, lz: number): [number, number, number];
  /** The same primitives drawing into another batcher (geometry for animated parts). */
  into(target: Batcher): Prims;
  anim: MapAnimator;
}

/** Materials painted as a single panel (or with no texture) keep plain box UVs. */
const FLAT = ['crate', 'cardboard', 'hazard', 'glass', 'screen'];

/** Build a prop's visual geometry into the batcher. Local frame: front faces -Z, origin at footprint center, y=0 at base. */
export function buildProp(b: Batcher, p: PropDef, seed: number, anim: MapAnimator) {
  const f = p.facing ?? 0;
  const rot = -f * Math.PI / 2;
  const odd = f % 2 === 1;
  const W = odd ? p.d : p.w, D = odd ? p.w : p.d;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const y0 = p.y ?? 0;
  const wx = (lx: number, lz: number) => p.x + lx * cos + lz * sin;
  const wz = (lx: number, lz: number) => p.z - lx * sin + lz * cos;
  const into = (t: Batcher): Prims => ({
    box: (mat, lx, ly, lz, w, h, d, turn = 0) => {
      const rounded = Math.min(w, h, d) >= 0.045 && !FLAT.includes(mat) && !mat.startsWith('label:');
      if (rounded) t.roundedBox(mat, w, h, d, wx(lx, lz), y0 + ly, wz(lx, lz), rot + turn);
      else t.box(mat, w, h, d, wx(lx, lz), y0 + ly, wz(lx, lz), rot + turn);
    },
    plain: (mat, lx, ly, lz, w, h, d, turn = 0) => t.box(mat, w, h, d, wx(lx, lz), y0 + ly, wz(lx, lz), rot + turn),
    cyl: (mat, lx, ly, lz, r, h, seg = 14) => t.cylinder(mat, r, h, wx(lx, lz), y0 + ly, wz(lx, lz), seg),
    axle: (mat, lx, ly, lz, radius, length, segments = 20) => {
      t.addGeometry(mat, new CylinderGeometry(radius, radius, length, segments), wx(lx, lz), y0 + ly + radius, wz(lx, lz), rot, 0, Math.PI / 2);
    },
  });
  const ctx: Ctx = {
    W, D, H: p.h, ...into(b), r: new Random(seed), b, p, rot, into, anim,
    world: (lx, ly, lz) => [wx(lx, lz), y0 + ly, wz(lx, lz)],
  };
  (BUILDERS[p.kind] ?? fallback)(ctx);
}

const fallback = ({ W, D, H, box }: Ctx) => box('p:#888888', 0, 0, 0, W, H, D);

/** Heading (for `turned` / chairs) whose front, local -Z, points along (dx, dz). */
const faceTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** Box placer in a sub-frame at (x, z) turned by `face`: u across, v toward the back. */
function turned(box: BoxFn, x: number, z: number, face: number): BoxFn {
  const co = Math.cos(face), si = Math.sin(face);
  return (mat, u, y, v, w, h, d, turn = 0) => box(mat, x + u * co + v * si, y, z - u * si + v * co, w, h, d, face + turn);
}

function monitor(box: BoxFn, x: number, y: number, z: number, faceZ: 1 | -1) {
  box('rubber', x, y, z, 0.18, 0.02, 0.15);
  box('rubber', x, y, z, 0.04, 0.22, 0.04);
  box('rubber', x, y + 0.18, z, 0.52, 0.32, 0.04);
  box('screen', x, y + 0.2, z + faceZ * 0.022, 0.48, 0.28, 0.005);
}

/** Swivel task chair: five-star base on casters, gas lift, seat, backrest and arms. Faces `face` (see faceTo). */
function officeChair({ box, plain, cyl }: Prims, x: number, z: number, face: number) {
  const part = turned(box, x, z, face), caster = turned(plain, x, z, face);
  const frame = 'p:#2b2d31';
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5 + 0.3, su = Math.sin(a), sv = Math.cos(a);
    part(frame, su * 0.15, 0.045, sv * 0.15, 0.045, 0.035, 0.3, a);
    caster('rubber', su * 0.29, 0, sv * 0.29, 0.04, 0.05, 0.06, a);
  }
  cyl('chrome', x, 0.08, z, 0.024, 0.3, 8);
  part(frame, 0, 0.37, 0, 0.34, 0.04, 0.32);
  part('fabric', 0, 0.41, -0.02, 0.5, 0.08, 0.48);
  part(frame, 0, 0.4, 0.245, 0.06, 0.22, 0.035);
  part('fabric', 0, 0.58, 0.27, 0.47, 0.52, 0.07);
  for (const s of [-1, 1]) {
    part(frame, s * 0.24, 0.45, 0.03, 0.03, 0.19, 0.035);
    part('rubber', s * 0.24, 0.64, 0.01, 0.06, 0.03, 0.26);
  }
}

/** Four-leg stacking chair for the break room. */
function cafeChair({ box }: Prims, x: number, z: number, face: number, color: string) {
  const part = turned(box, x, z, face);
  for (const [u, v] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) part('m:#3a3e44', u, 0, v, 0.03, 0.45, 0.03);
  part(color, 0, 0.45, 0, 0.44, 0.04, 0.42);
  for (const s of [-1, 1]) part('m:#3a3e44', s * 0.19, 0.49, 0.19, 0.025, 0.36, 0.025);
  part(color, 0, 0.66, 0.2, 0.42, 0.2, 0.03);
}

/** Handheld traffic radar: antenna barrel along local X pointing `dir`, body with rear display, pistol grip. */
function radarGun({ box, axle }: Prims, x: number, y: number, z: number, dir: 1 | -1 = 1) {
  box('rubber', x - dir * 0.05, y, z, 0.045, 0.12, 0.04);
  box('p:#2c3036', x - dir * 0.01, y + 0.1, z, 0.17, 0.1, 0.085);
  axle('p:#3a3f46', x + dir * 0.13, y + 0.09, z, 0.058, 0.13, 10);
  axle('rubber', x + dir * 0.2, y + 0.1, z, 0.05, 0.012, 10);
  box('screen', x - dir * 0.098, y + 0.12, z, 0.006, 0.05, 0.07);
}

/** Handheld lidar: twin lenses, sighting scope and grip. */
function lidarGun({ box, axle }: Prims, x: number, y: number, z: number) {
  box('rubber', x - 0.05, y, z, 0.045, 0.12, 0.04);
  box('p:#34383d', x, y + 0.1, z, 0.22, 0.12, 0.1);
  for (const s of [-1, 1]) axle('rubber', x + 0.115, y + 0.14, z + s * 0.025, 0.02, 0.02, 12);
  box('rubber', x - 0.02, y + 0.22, z, 0.12, 0.04, 0.04);
  box('screen', x - 0.111, y + 0.13, z, 0.006, 0.06, 0.07);
}

const _v = new Vector3(), _sc = new Vector3(), _q = new Quaternion();

const BUILDERS: Partial<Record<PropDef['kind'], (c: Ctx) => void>> = {
  cubicle: (c) => {
    // Partitions, entrances and desks come from the same layout as the pod's collision.
    const { W, D, H, box, cyl, r } = c;
    const { panels, stations } = cubicleLayout(W, D, H);
    for (const q of panels) {
      box('fabric', q.x, 0, q.z, q.w, q.h, q.d);
      box('m:#9aa0a8', q.x, q.h, q.z, q.w + 0.012, 0.03, q.d + 0.012);
    }
    for (const s of stations) {
      const { desk, toDesk: tz } = s;
      const top = desk.h, front = desk.z - tz * desk.d / 2;
      // pedestal at the end of the desk away from the entrance
      const away = Math.sign(desk.x - s.door.x) || 1;
      box('wood', desk.x, top - 0.035, desk.z, desk.w, 0.035, desk.d);
      box('m:#5a6068', desk.x + away * (desk.w / 2 - 0.25), 0, desk.z + tz * 0.02, 0.42, top - 0.04, desk.d - 0.08);
      box('m:#4a4f56', desk.x - away * (desk.w / 2 - 0.03), 0, desk.z, 0.04, top - 0.035, desk.d - 0.06);
      box('m:#4a4f56', desk.x, 0.25, desk.z + tz * (desk.d / 2 - 0.03), desk.w - 0.1, top - 0.3, 0.02);
      const mx = desk.x + r.range(-0.15, 0.15), mz = desk.z + tz * 0.18;
      if (r.chance(0.6)) { monitor(box, mx - 0.28, top, mz, -tz as 1 | -1); monitor(box, mx + 0.28, top, mz, -tz as 1 | -1); }
      else monitor(box, mx, top, mz, -tz as 1 | -1);
      box('rubber', mx, top, front + tz * 0.2, 0.44, 0.02, 0.14);
      box('rubber', mx + 0.33, top, front + tz * 0.2, 0.06, 0.025, 0.1);
      if (r.chance(0.7)) cyl('p:' + r.pick(['#d8d4cc', '#2a5aa8', '#b02a2a', '#2a2d31']), desk.x - away * (desk.w / 2 - 0.35), top, front + tz * 0.25, 0.04, 0.1, 10);
      if (r.chance(0.6)) box('p:#f2f0ea', desk.x + away * (desk.w / 2 - 0.45), top, desk.z, 0.22, r.range(0.01, 0.06), 0.3, r.range(-0.3, 0.3));
      // engineers' benches: a radar unit on the desk, or a parts carton
      if (r.chance(0.35)) radarGun(c, desk.x - away * 0.7, top, desk.z + tz * 0.05, away > 0 ? -1 : 1);
      else if (r.chance(0.5)) box('cardboard', desk.x - away * (desk.w / 2 - 0.3), top, desk.z + tz * 0.12, 0.3, 0.22, 0.3);
      officeChair(c, s.seatX + r.range(-0.2, 0.2), s.seatZ - tz * r.range(0, 0.12), faceTo(r.range(-0.3, 0.3), tz));
    }
  },
  confTable: (c) => {
    const { W, D, H, box, r } = c;
    box('darkWood', 0, H - 0.05, 0, W, 0.05, D);
    box('m:#3a3d42', 0, 0, -D * 0.3, 0.3, H - 0.05, 0.3);
    box('m:#3a3d42', 0, 0, D * 0.3, 0.3, H - 0.05, 0.3);
    const long = D > W, L = long ? D : W, T = long ? W : D;
    const n = Math.floor(L / 1.0);
    for (let i = 0; i < n; i++) {
      const a = -L / 2 + 0.5 + i * (L - 1) / Math.max(1, n - 1);
      for (const s of [-1, 1]) {
        // every chair is pulled up to the table and faces across it
        const off = s * (T / 2 + 0.36) + s * r.range(0, 0.12);
        const face = (long ? faceTo(-s, 0) : faceTo(0, -s)) + r.range(-0.2, 0.2);
        officeChair(c, long ? off : a, long ? a : off, face);
        const at = s * (T / 2 - 0.22), sitter = long ? faceTo(-s, 0) : faceTo(0, -s);
        const item = turned(box, long ? at : a, long ? a : at, sitter);
        if (r.chance(0.35)) {
          item('p:#9aa0a6', 0, H, 0.02, 0.32, 0.018, 0.22);
          item('p:#9aa0a6', 0, H + 0.018, -0.1, 0.32, 0.21, 0.012);
          item('screen', 0, H + 0.03, -0.092, 0.29, 0.18, 0.004);
        } else if (r.chance(0.5)) item('p:#f4f0d8', r.range(-0.1, 0.1), H, 0, 0.21, 0.012, 0.29, r.range(-0.2, 0.2));
      }
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
    // Shared work counter: storage below, a multifunction printer and paper stock on top.
    box('wood', 0, 0.1, 0, W, H - 0.14, D);
    box('rubber', 0, 0, 0, W - 0.05, 0.1, D - 0.1);
    box('p:#e8e6e0', 0, H - 0.04, 0, W + 0.04, 0.04, D + 0.04);
    for (const s of [-1, 1]) for (let i = 1; i < Math.round(W / 0.6); i++) {
      box('p:#6b5236', -W / 2 + i * W / Math.round(W / 0.6), 0.14, s * (D / 2 + 0.003), 0.012, H - 0.26, 0.006);
    }
    box('p:#dcdee0', -W * 0.25, H, 0, 0.55, 0.36, 0.48);
    box('p:#8a8e94', -W * 0.25, H + 0.36, 0, 0.55, 0.07, 0.48);
    box('screen', -W * 0.25 + 0.16, H + 0.43, -0.17, 0.16, 0.012, 0.09);
    box('p:#f4f2ec', W * 0.12, H, -0.1, 0.3, 0.1, 0.22);
    box('p:#f4f2ec', W * 0.12, H + 0.1, -0.1, 0.3, 0.1, 0.22);
    box('rubber', W * 0.32, H, 0.1, 0.34, 0.06, 0.26);
  },
  kitchenette: ({ W, D, H, box, cyl }) => {
    // Break-room counter against a wall (back = local +Z): base cabinets, sink, appliances, wall cabinets.
    box('wood', 0, 0.1, 0.02, W, H - 0.14, D - 0.04);
    box('rubber', 0, 0, 0.06, W - 0.05, 0.1, D - 0.12);
    box('p:#e8e6e0', 0, H - 0.04, 0, W + 0.02, 0.04, D);
    const n = Math.max(2, Math.round(W / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * W / n;
      box('p:#6b5236', x - W / n / 2, 0.14, -D / 2 + 0.037, 0.012, H - 0.26, 0.006);
      box('chrome', x + W / n / 2 - 0.08, H - 0.32, -D / 2 + 0.027, 0.02, 0.14, 0.025);
    }
    const sink = -W * 0.18;
    box('chrome', sink, H - 0.005, -0.05, 0.78, 0.012, 0.48);
    box('m:#5d656b', sink, H - 0.004, -0.05, 0.68, 0.012, 0.38);
    cyl('chrome', sink, H, D / 2 - 0.2, 0.022, 0.32, 10);
    box('chrome', sink, H + 0.3, D / 2 - 0.38, 0.035, 0.035, 0.36);
    box('rubber', W * 0.08, H, D / 2 - 0.35, 0.26, 0.38, 0.3);
    cyl('glass', W * 0.08, H, D / 2 - 0.52, 0.07, 0.16, 12);
    box('p:#2a2d32', W * 0.3, H, D / 2 - 0.4, 0.52, 0.31, 0.4);
    box('rubber', W * 0.3 - 0.06, H + 0.05, D / 2 - 0.605, 0.32, 0.2, 0.012);
    box('p:#e6e3dc', -W * 0.38, H, D / 2 - 0.25, 0.32, 0.42, 0.3);
    // wall cabinets with an under-cabinet light
    box('wood', 0, 1.45, D / 2 - 0.18, W, 0.75, 0.35);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * W / n;
      box('p:#6b5236', x - W / n / 2, 1.47, D / 2 - 0.357, 0.012, 0.71, 0.006);
      box('chrome', x + W / n / 2 - 0.08, 1.5, D / 2 - 0.37, 0.02, 0.14, 0.025);
    }
    box('e:#fff1d6', 0, 1.435, D / 2 - 0.3, W * 0.92, 0.012, 0.04);
  },
  fridge: ({ W, D, H, box }) => {
    box('chrome', 0, 0, 0, W, H, D);
    box('rubber', 0, H * 0.62, -D / 2 - 0.005, W, 0.02, 0.01);
    box('rubber', W * 0.38, H * 0.3, -D / 2 - 0.02, 0.03, 0.4, 0.03);
  },
  table: (c) => {
    const { W, D, H, box, cyl, r } = c;
    box('wood', 0, H - 0.04, 0, W, 0.04, D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('m:#555a60', sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.05, H - 0.04, 0.05);
    const seat = 'p:' + r.pick(['#a8432f', '#2c6f73', '#c9962a', '#3d5a80']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cafeChair(c, sx * W * 0.24 + r.range(-0.08, 0.08), sz * (D / 2 + 0.34 + r.range(0, 0.1)), faceTo(0, -sz) + r.range(-0.15, 0.15), seat);
    }
    box('chrome', r.range(-0.2, 0.2), H, 0, 0.14, 0.11, 0.06);
    if (r.chance(0.6)) cyl('p:#f2f0ea', W * 0.22, H, -D * 0.2, 0.045, 0.1, 10);
    if (r.chance(0.4)) cyl('p:#b02a2a', -W * 0.3, H, D * 0.18, 0.033, 0.12, 10);
  },
  serverRack: ({ W, D, H, box, r, world, rot, anim }) => {
    const n = Math.max(1, Math.round(W / 0.7));
    const w = W / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * w;
      box('p:#1e2126', x, 0, 0, w - 0.02, H, D);
      box('serverFront', x, 0.02, -D / 2 - 0.005, w - 0.08, H - 0.06, 0.01);
      box('serverFront', x, 0.02, D / 2 + 0.005, w - 0.08, H - 0.06, 0.01);
      // activity lights on both faces
      for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
        const [lx, ly, lz] = world(x + r.range(-w / 2 + 0.1, w / 2 - 0.1), r.range(0.2, H - 0.25), side * (D / 2 + 0.013));
        anim.blinker(lx, ly, lz, 0.025, 0.025, 0.012, rot, r.chance(0.8) ? '#3dff7a' : '#ffb020', r.range(0.12, 1.6), r.range(0.25, 0.85), r.next());
      }
    }
    box('m:#30353c', 0, H, 0, W, 0.08, D * 0.3);
  },
  crac: ({ W, D, H, box }) => {
    box('p:#e0e2e4', 0, 0, 0, W, H, D);
    for (let y = 0.3; y < H - 0.3; y += 0.12) box('rubber', 0, y, -D / 2 - 0.005, W * 0.8, 0.04, 0.01);
  },
  ups: ({ W, D, H, box, world, rot, anim }) => {
    box('p:#2a2d32', 0, 0, 0, W, H, D);
    const [x, y, z] = world(W * 0.3, H * 0.8, -D / 2 - 0.006);
    anim.blinker(x, y, z, 0.05, 0.05, 0.012, rot, '#30ff70', 2.4, 0.92);
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
  chamber: ({ W, D, H, box, cyl, r, world, rot, anim }) => {
    // Environmental test chamber: finished radar units are cycled hot / cold behind the insulated door.
    const shell = 'p:' + r.pick(['#e2e4e1', '#d6dadd', '#e4e0d6']);
    const f = -D / 2;
    box('p:#3a3e44', 0, 0, 0, W, 0.14, D);
    box(shell, 0, 0.14, 0, W, H - 0.14, D);
    box('p:#2f6f86', 0, H - 0.24, 0, W + 0.02, 0.12, D + 0.02);
    const cw = W * 0.62, cx = -W / 2 + cw / 2 + 0.06;
    const mw = W - cw - 0.12, mx = W / 2 - mw / 2 - 0.04;
    box('rubber', cx, 0.3, f - 0.008, cw - 0.04, H - 0.68, 0.016);
    box('p:#cfd2cf', cx, 0.32, f - 0.035, cw - 0.12, H - 0.72, 0.05);
    box('m:#2f363b', cx, 0.98, f - 0.068, cw * 0.4, 0.6, 0.016);
    box('p:#151a1f', cx, 1.02, f - 0.077, cw * 0.36, 0.52, 0.004);
    box('glass', cx, 1.02, f - 0.081, cw * 0.36, 0.52, 0.004);
    box('chrome', cx + cw / 2 - 0.17, 0.92, f - 0.09, 0.05, 0.5, 0.05);
    for (const y of [0.55, H - 0.8]) box('m:#7b8389', cx - cw / 2 + 0.05, y, f - 0.065, 0.06, 0.2, 0.05);
    // controller touchscreen, E-stop and condenser louvres on the machinery section
    box('p:#2a2d32', mx, 1.25, f - 0.018, 0.46, 0.36, 0.036);
    box('screen', mx, 1.29, f - 0.038, 0.4, 0.28, 0.008);
    box('p:#b94e35', mx + 0.16, 1.02, f - 0.025, 0.07, 0.07, 0.035);
    for (let k = 0; k < 9; k++) box('rubber', mx, 0.28 + k * 0.065, f - 0.008, mw * 0.8, 0.026, 0.014);
    // cable port, side service panels and vents
    box('m:#8b9693', -W / 2 - 0.03, 1.32, 0, 0.06, 0.22, 0.22);
    box('rubber', -W / 2 - 0.065, 1.36, 0, 0.012, 0.14, 0.14);
    for (const side of [-1, 1]) {
      box('m:#7b8989', side * (W / 2 + 0.005), 0.38, D * 0.12, 0.025, H * 0.58, D * 0.5);
      for (let k = 0; k < 7; k++) box('m:#657274', side * (W / 2 + 0.022), 0.52 + k * 0.06, -D * 0.28, 0.012, 0.019, D * 0.25);
    }
    box('m:#8b9693', 0, 0.4, D / 2 + 0.01, W * 0.8, H * 0.55, 0.025);
    box(shell, 0, 0.44, D / 2 + 0.028, W * 0.77, H * 0.52, 0.015);
    box('machineBadge', -W * 0.2, H * 0.72, D / 2 + 0.043, 0.62, 0.16, 0.012);
    for (let k = 0; k < 6; k++) box('m:#657274', W * 0.25, 0.56 + k * 0.07, D / 2 + 0.043, W * 0.26, 0.023, 0.015);
    // stack light: green = cycle running, amber blinks at each temperature step
    const tx = W / 2 - 0.2, tz = f + 0.2;
    cyl('rubber', tx, H, tz, 0.05, 0.14, 12);
    cyl('e:#2fbf5a', tx, H + 0.14, tz, 0.045, 0.06, 12);
    cyl('p:#5a1e1e', tx, H + 0.26, tz, 0.045, 0.06, 12);
    const [bx, by, bz] = world(tx, H + 0.2, tz);
    anim.blinker(bx, by, bz, 0.08, 0.06, 0.08, rot, '#ffb020', r.range(1.4, 2.4), 0.5, r.next());
  },
  burnIn: ({ W, D, H, box, plain, r, world, rot, anim }) => {
    // Burn-in / life-test rack: two back-to-back shelving faces of powered units under test.
    const steel = 'p:#2b2f35';
    box(steel, 0, 0, 0, W, 0.12, D);
    box('m:#6b7378', 0, 0.12, 0, W - 0.1, H - 0.24, 0.06);
    box(steel, 0, H - 0.08, 0, W, 0.08, D);
    box('m:#8b9693', 0, H, 0, W * 0.9, 0.08, 0.4);
    for (const sx of [-1, 1]) box(steel, sx * (W / 2 - 0.02), 0, 0, 0.04, H, D);
    const bays = 3, shelves = 4, bw = (W - 0.08) / bays;
    for (const s of [-1, 1]) {
      for (let i = 1; i < bays; i++) box(steel, -W / 2 + 0.04 + i * bw, 0.12, s * (D / 2 - 0.04), 0.05, H - 0.2, 0.05);
      for (let k = 0; k < shelves; k++) {
        const y = 0.12 + k * (H - 0.3) / shelves;
        box(steel, 0, y, s * D / 4, W - 0.08, 0.035, D / 2 - 0.12);
        for (let i = 0; i < bays; i++) for (let j = 0; j < 3; j++) {
          if (r.chance(0.12)) continue;
          const ux = -W / 2 + 0.04 + i * bw + (j + 0.5) * bw / 3, uz = s * (D / 2 - 0.32);
          plain('p:#3b4148', ux, y + 0.035, uz, bw / 3 - 0.08, 0.17, 0.4);
          plain('rubber', ux, y + 0.06, s * (D / 4 - 0.1), 0.03, 0.03, D / 2 - 0.6);
          const [lx, ly, lz] = world(ux + 0.07, y + 0.15, uz + s * 0.203);
          const fail = r.chance(0.06);
          anim.blinker(lx, ly, lz, 0.022, 0.022, 0.01, rot, fail ? '#ff3a2a' : '#3dff7a', fail ? 0.5 : r.range(0.8, 3), fail ? 0.5 : 0.85, r.next());
        }
      }
    }
    box('rubber', W / 2 + 0.02, 1.2, 0, 0.04, 0.32, 0.5);
    box('screen', W / 2 + 0.045, 1.24, 0, 0.006, 0.26, 0.44);
  },
  rfChamber: ({ W, D, H, box, r, world, rot, anim }) => {
    // Shielded RF test chamber: galvanised modular panels, a knife-edge door and filtered I/O.
    const galv = 'm:#b4bbbd', seam = 'm:#8e9597';
    box('p:#3a3e44', 0, 0, 0, W, 0.12, D);
    box(galv, 0, 0.12, 0, W, H - 0.12, D);
    for (const s of [-1, 1]) {
      for (let x = -W / 2 + 1.2; x < W / 2 - 0.1; x += 1.2) box(seam, x, 0.12, s * (D / 2 + 0.008), 0.05, H - 0.12, 0.016);
      for (let z = -D / 2 + 1.2; z < D / 2 - 0.1; z += 1.2) box(seam, s * (W / 2 + 0.008), 0.12, z, 0.016, H - 0.12, 0.05);
      box(seam, 0, 2.4, s * (D / 2 + 0.008), W, 0.05, 0.016);
      box(seam, s * (W / 2 + 0.008), 2.4, 0, 0.016, 0.05, D);
    }
    const dx = W * 0.18, dw = 1.15, dh = 2.15, f = -D / 2;
    box('m:#7d8587', dx, 0.12, f - 0.03, dw + 0.18, dh + 0.12, 0.05);
    box('m:#c3c9cb', dx, 0.2, f - 0.065, dw, dh - 0.04, 0.045);
    for (const y of [0.45, 1.25, 2.0]) box('m:#5d6466', dx - dw / 2 - 0.02, y, f - 0.07, 0.07, 0.2, 0.07);
    box('chrome', dx + dw / 2 - 0.16, 1.05, f - 0.11, 0.28, 0.05, 0.05);
    box('chrome', dx + dw / 2 - 0.04, 0.95, f - 0.1, 0.05, 0.16, 0.05);
    box('hazard', dx, 0, f - 0.22, dw + 0.24, 0.05, 0.36);
    box('label:rf', dx, 2.48, f - 0.012, 0.9, 0.36, 0.01);
    // I/O filter panel with bulkhead connectors, and honeycomb vents
    box('m:#6d7577', -W * 0.27, 0.85, f - 0.02, 0.86, 0.62, 0.035);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) box('chrome', -W * 0.27 - 0.3 + i * 0.2, 1.0 + k * 0.25, f - 0.05, 0.07, 0.07, 0.04);
    for (const s of [-1, 1]) {
      box('m:#5a6265', s * (W / 2 + 0.02), 2.9, -D * 0.15, 0.03, 0.6, 0.9);
      for (let k = 0; k < 6; k++) box('rubber', s * (W / 2 + 0.04), 2.95 + k * 0.09, -D * 0.15, 0.012, 0.03, 0.82);
    }
    box('m:#8b9693', 0, H, D * 0.15, W * 0.85, 0.06, 0.35);
    box('p:#d6d9d6', -W * 0.25, H, -D * 0.2, 0.9, 0.42, 0.7);
    // "RF ON" lamp above the door: lit while a test is running
    const [lx, ly, lz] = world(dx, 2.955, f - 0.06);
    box('rubber', dx, 2.92, f - 0.03, 0.2, 0.2, 0.05);
    anim.blinker(lx, ly, lz, 0.13, 0.13, 0.04, rot, '#ff3324', r.range(5, 7), 0.72, r.next());
  },
  robotCell: (c) => {
    const { W, D, H, box, cyl, world, rot, into, anim } = c;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box('p:#e8b818', x * (W / 2 - 0.05), 0, z * (D / 2 - 0.05), 0.1, H, 0.1);
    box('glass', 0, 0.1, -D / 2 + 0.02, W - 0.2, H - 0.3, 0.02);
    box('glass', 0, 0.1, D / 2 - 0.02, W - 0.2, H - 0.3, 0.02);
    box('glass', -W / 2 + 0.02, 0.1, 0, 0.02, H - 0.3, D - 0.2);
    box('glass', W / 2 - 0.02, 0.1, 0, 0.02, H - 0.3, D - 0.2);
    box('p:#e8b818', 0, H - 0.1, 0, W, 0.1, 0.1);
    // Automated radar test: the arm takes a unit from the in-tray, holds it to the test horn, sets it in the out-tray.
    cyl('p:#3a3e44', 0, 0, 0, 0.42, 0.35, 18);
    for (const s of [-1, 1]) {
      box('m:#80868c', s * 1.0, 0, -0.5, 0.6, 0.85, 0.6);
      box('p:#22262b', s * 1.0, 0.85, -0.5, 0.48, 0.08, 0.42);
    }
    box('m:#5a6068', 0, 0, -D / 2 + 0.4, 0.12, 1.45, 0.12);
    box('p:#3a3f46', 0, 1.45, -D / 2 + 0.42, 0.34, 0.3, 0.2);
    box('rubber', 0, 1.47, -D / 2 + 0.52, 0.26, 0.24, 0.012);
    box('p:#2a2d32', W / 2 - 0.45, 0, D / 2 - 0.4, 0.6, 1.5, 0.5);
    box('screen', W / 2 - 0.45, 1.0, D / 2 - 0.656, 0.4, 0.3, 0.008);
    const [gx, gy, gz] = world(W / 2 - 0.05, H, -D / 2 + 0.05);
    anim.blinker(gx, gy, gz, 0.1, 0.12, 0.1, rot, '#3dff7a', 1, 1);
    const orange = 'p:#ee6a10';
    const [px, py, pz] = world(0, 0.35, 0);
    const turret = anim.part(px, py, pz, (b) => {
      const q = into(b);
      q.cyl(orange, 0, 0.35, 0, 0.3, 0.32, 18);
      q.box(orange, 0, 0.6, 0, 0.36, 0.5, 0.42);
    });
    const [sx, sy, sz] = world(0, 1.05, 0);
    const arm = anim.part(sx, sy, sz, (b) => {
      const q = into(b);
      q.box('rubber', 0, 0.95, 0, 0.44, 0.2, 0.2);
      q.box(orange, 0, 1.05, 0, 0.24, 1.05, 0.26);
      q.box(orange, 0, 1.92, -0.48, 0.22, 0.22, 1.08);
      q.box('rubber', 0, 1.68, -1.0, 0.14, 0.32, 0.14);
      q.box('m:#80868c', 0, 1.6, -1.0, 0.3, 0.08, 0.12);
      q.box('p:#2c3036', 0, 1.4, -1.0, 0.18, 0.18, 0.16);
      q.box('rubber', 0, 1.42, -1.085, 0.14, 0.14, 0.01);
    }, turret);
    const axis = new Vector3(Math.cos(rot), 0, -Math.sin(rot));
    const ease = (x: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;
    anim.onFrame((t) => {
      const u = (t / 9) % 1;
      let yaw: number, dip = 0;
      if (u < 0.12) { yaw = 1.1; dip = Math.sin(Math.PI * u / 0.12); }
      else if (u < 0.3) yaw = 1.1 * (1 - ease((u - 0.12) / 0.18));
      else if (u < 0.55) yaw = Math.sin(t * 2.2) * 0.03;
      else if (u < 0.7) yaw = -1.1 * ease((u - 0.55) / 0.15);
      else if (u < 0.82) { yaw = -1.1; dip = Math.sin(Math.PI * (u - 0.7) / 0.12); }
      else yaw = -1.1 + 2.2 * ease((u - 0.82) / 0.18);
      turret.rotation.y = yaw;
      arm.quaternion.setFromAxisAngle(axis, -0.06 - 0.3 * dip);
    });
  },
  conveyor: (c) => {
    const { W, D, H, box, r, world, rot, into, anim } = c;
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
    for (const e of [-1, 1]) { const [x, z] = P(e * (L / 2 - 0.12), 0); box('m:#4a5056', x, H - 0.24, z, alongX ? 0.2 : T - 0.1, 0.16, alongX ? T - 0.1 : 0.2); }
    // Products ride the belt: ESD totes carrying radar units on the long assembly line, cartons on the pack-out line.
    const assembly = L > 12;
    const span = L - 0.8, slots = Math.max(3, Math.round(span / (1.4 + r.range(0, 0.4)))), speed = 0.35;
    const [ax, az] = alongX ? [Math.cos(rot), -Math.sin(rot)] : [Math.sin(rot), Math.cos(rot)];
    const [cx, cy, cz] = world(0, H - 0.04, 0);
    const ride = (ids: number[]) => (i: number, t: number, m: Matrix4) => {
      const s = ((ids[i] / slots) * span + t * speed) % span;
      const grow = Math.max(0.001, Math.min(1, s / 0.3, (span - s) / 0.3));
      m.compose(_v.set(ax * (s - span / 2), 0, az * (s - span / 2)), _q, _sc.setScalar(grow));
    };
    const totes: number[] = [], cartons: number[] = [];
    for (let k = 0; k < slots; k++) (assembly && k % 3 !== 2 ? totes : cartons).push(k);
    if (totes.length) anim.instanced(cx, cy, cz, totes.length, (b) => {
      const q = into(b);
      const [tw, td] = P(0.46, 0.34);
      q.box('p:#22262b', 0, H - 0.04, 0, tw, 0.1, td);
      radarGun(q, 0, H - 0.02, 0);
    }, ride(totes));
    if (cartons.length) anim.instanced(cx, cy, cz, cartons.length, (b) => {
      const q = into(b);
      q.box('cardboard', 0, H - 0.04, 0, 0.44, 0.32, 0.4);
      const [sw, sd] = P(0.44, 0.07);
      q.box('p:#c9ad78', 0, H + 0.28, 0, sw + 0.004, 0.006, sd);
    }, ride(cartons));
  },
  forklift: ({ W, D, H, box, axle, cyl, world, rot, anim, r }) => {
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
    // amber safety beacon on the overhead guard
    cyl('rubber', W * 0.3, H, 0.95, 0.06, 0.05, 10);
    const [x, y, z] = world(W * 0.3, H + 0.05, 0.95);
    anim.blinker(x, y, z, 0.1, 0.09, 0.1, rot, '#ff9a1a', 0.8, 0.3, r.next());
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
    // dropped at the yard: landing gear down at the nose, rear doors with lock rods and an underride guard
    for (const sx of [-1, 1]) {
      box('m:#3a3e44', sx * (W / 2 - 0.35), 0.06, -D / 2 + 1.9, 0.1, 0.86, 0.1);
      box('m:#3a3e44', sx * (W / 2 - 0.35), 0, -D / 2 + 1.9, 0.26, 0.06, 0.26);
    }
    box('m:#3a3e44', 0, 0.62, -D / 2 + 1.9, W - 0.6, 0.06, 0.06);
    box('m:#b8bcc0', 0, 1.35, D / 2 + 0.012, 0.03, H - 1.5, 0.012);
    for (const x of [-W * 0.38, -W * 0.13, W * 0.13, W * 0.38]) box('chrome', x, 1.4, D / 2 + 0.03, 0.03, H - 1.6, 0.03);
    box('m:#404448', 0, 0.45, D / 2 - 0.08, W - 0.3, 0.12, 0.1);
    for (const sx of [-1, 1]) box('m:#404448', sx * (W / 2 - 0.45), 0.55, D / 2 - 0.08, 0.08, 0.4, 0.08);
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
  car: (c) => vehicle(c, 'p:' + c.r.pick(['#8a1c1c', '#2a4a7a', '#c8c8c8', '#202224']), null),
  patrolCar: (c) => {
    // Black-and-white demo patrol car (in-car radar installs): white doors and roof, light bar, push bar.
    const { W, D, box, cyl } = c;
    const white = 'p:#eceef0';
    vehicle(c, 'p:#16181b', white);
    for (const s of [-1, 1]) box(white, s * (W / 2 + 0.004), 0.36, 0.1, 0.008, 0.5, D * 0.42);
    box('rubber', 0, 1.4, 0.25, W * 0.78, 0.1, 0.3);
    for (const s of [-1, 1]) for (const e of [-1, 1]) box(s < 0 ? 'p:#c0202a' : 'p:#1f4fd0', s * W * 0.2, 1.415, 0.25 + e * 0.153, W * 0.34, 0.07, 0.006);
    box('rubber', 0, 0.2, -D / 2 - 0.1, W * 0.56, 0.42, 0.05);
    for (const s of [-1, 1]) box('rubber', s * W * 0.22, 0.2, -D / 2 - 0.05, 0.05, 0.4, 0.1);
    cyl('chrome', -(W / 2 - 0.05), 0.98, -D * 0.04, 0.05, 0.09, 12);
    for (const s of [-1, 1]) box('rubber', s * 0.3, 1.4, D * 0.35, 0.008, 0.38, 0.008);
  },
  speedTrailer: (c) => {
    // Radar speed trailer: battery bed on two wheels, "SPEED LIMIT" plate over a live LED display.
    const { W, D, box, axle, world, rot, anim, p } = c;
    const { bed, sign } = SPEED_TRAILER;
    const white = 'p:#e9eaeb', steel = 'm:#5d6368';
    const z0 = bed.z - bed.d / 2, z1 = bed.z + bed.d / 2;
    box(steel, 0, 0.3, bed.z, W - 0.5, 0.12, bed.d);
    box(white, 0, 0.42, bed.z, W - 0.48, bed.h - 0.42, bed.d);
    for (const s of [-1, 1]) {
      axle('rubber', s * (W / 2 - 0.11), 0, bed.z, 0.3, 0.2, 20);
      axle('metal', s * (W / 2 - 0.005), 0.15, bed.z, 0.15, 0.02, 16);
      box('p:#2a2d31', s * (W / 2 - 0.11), 0.62, bed.z, 0.25, 0.04, 0.82);
      for (const z of [z0 + 0.12, z1 - 0.12]) box(steel, s * 0.48, 0, z, 0.06, 0.32, 0.06);
    }
    box(steel, 0, 0.34, (z1 + D / 2) / 2, 0.1, 0.08, D / 2 - z1);
    box(steel, 0, 0.3, D / 2 - 0.09, 0.12, 0.12, 0.18);
    box(steel, 0, 0, D / 2 - 0.4, 0.05, 0.34, 0.05);
    box(white, sign.x, sign.y, sign.z, sign.w, sign.h, sign.d);
    const front = sign.z - sign.d / 2;
    box('label:speedLimit', 0, 2.0, front - 0.006, 0.6, 0.72, 0.01);
    box('rubber', 0, 1.08, front - 0.004, 1.32, 0.86, 0.008);
    box('m:#22324a', 0, sign.y + sign.h, sign.z, 1.5, 0.04, 0.9);
    const [x, y, z] = world(0, 1.5, front - 0.01);
    anim.speedDisplay(x, y, z, rot + Math.PI, 1.2, 0.74, 30, Math.round(p.x * 7 + p.z));
    for (const s of [-1, 1]) {
      const [sx, sy, sz] = world(s * 0.62, 2.55, front - 0.02);
      anim.blinker(sx, sy, sz, 0.12, 0.12, 0.03, rot, '#ffb020', 0.9, 0.18, s < 0 ? 0 : 0.5);
    }
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
  display: (c) => {
    // Lobby showcase: product line-up on glass shelves (handheld radar and lidar, sensor modules).
    const { W, D, H, box } = c;
    box('darkWood', 0, 0, 0, W, 0.9, D);
    box('marble', 0, 0.9, 0, W + 0.02, 0.03, D + 0.02);
    box('darkWood', 0, 0.93, D / 2 - 0.03, W, H - 0.93, 0.06);
    box('p:#e9e6df', 0, 0.93, D / 2 - 0.062, W - 0.06, H - 1.03, 0.004);
    box('darkWood', 0, H - 0.1, 0, W, 0.1, D);
    box('e:#fff3dc', 0, H - 0.105, -D * 0.1, W - 0.12, 0.006, 0.05);
    box('glass', 0, 0.93, -D / 2 + 0.01, W - 0.04, H - 1.03, 0.012);
    for (const s of [-1, 1]) {
      box('glass', s * (W / 2 - 0.01), 0.93, 0, 0.012, H - 1.03, D - 0.04);
      box('chrome', s * (W / 2 - 0.01), 0.93, -D / 2 + 0.01, 0.02, H - 1.03, 0.02);
    }
    for (const y of [1.33, 1.68]) box('glass', 0, y, 0, W - 0.06, 0.012, D - 0.08);
    for (const [x, kind] of [[-0.75, 0], [0, 1], [0.75, 0]] as const) {
      box('rubber', x, 0.93, 0, 0.24, 0.02, 0.16);
      if (kind === 0) radarGun(c, x, 0.95, 0); else lidarGun(c, x, 0.95, 0);
    }
    for (const x of [-0.5, 0.5]) radarGun(c, x, 1.342, 0, x < 0 ? 1 : -1);
    for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5;
      box('p:#2c3036', x, 1.692, 0, 0.16, 0.12, 0.12);
      box('rubber', x, 1.712, -0.061, 0.12, 0.08, 0.004);
    }
  },
  speedSign: ({ W, D, H, box, world, rot, anim, p }) => {
    // Wall-mounted radar speed sign, live in the lobby as a demo.
    box('p:#f2f2ee', 0, 0, 0, W, H, D);
    box('rubber', 0, 0.05, -D / 2 - 0.004, W - 0.08, 0.66, 0.008);
    box('label:speedLimit', 0, H - 0.77, -D / 2 - 0.006, 0.6, 0.72, 0.01);
    const [x, y, z] = world(0, 0.38, -D / 2 - 0.01);
    anim.speedDisplay(x, y, z, rot + Math.PI, W - 0.14, 0.6, 30, Math.round(p.x * 13 - p.z));
  },
  fan: ({ W, H, box, cyl, r, world, into, anim }) => {
    // HVLS ceiling fan: down-rod to the roof steel, motor housing and six slowly turning blades.
    cyl('m:#3a3e44', 0, 0.35, 0, 0.045, H - 0.35, 8);
    cyl('p:#2b2d31', 0, 0.1, 0, 0.22, 0.3, 16);
    box('m:#3a3e44', 0, H - 0.05, 0, 0.5, 0.05, 0.32);
    const [x, y, z] = world(0, 0, 0);
    const rotor = anim.part(x, y, z, (b) => {
      const q = into(b);
      q.cyl('m:#c9ced3', 0, 0, 0, 0.3, 0.1, 18);
      const R = W / 2, len = R - 0.32;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, su = Math.sin(a), sv = Math.cos(a);
        q.box('m:#c9ced3', su * (0.3 + len / 2), 0.035, sv * (0.3 + len / 2), 0.2, 0.025, len, a);
        q.plain('p:#e8b818', su * (R - 0.03), 0, sv * (R - 0.03), 0.24, 0.09, 0.05, a);
      }
    });
    const speed = r.range(1.4, 1.9), phase = r.range(0, 6);
    anim.onFrame((t) => { rotor.rotation.y = -(t * speed + phase); });
  },
};

/** Car body shared by the yard sedans and the patrol car. `roof` defaults to the body colour. */
function vehicle({ W, D, box, axle }: Ctx, body: string, roof: string | null) {
  const top = roof ?? body;
  box(body, 0, 0.3, 0, W, 0.6, D);
  box('p:#1d2125', 0, 0.9, 0.2, W - 0.2, 0.46, D * 0.5);
  box('glass', 0, 0.95, 0.2, W - 0.18, 0.38, D * 0.52);
  box(top, 0, 1.35, 0.2, W - 0.18, 0.05, D * 0.5);
  for (const s of [-1, 1]) for (const e of [-1, 1]) box(top, s * (W / 2 - 0.1), 0.9, 0.2 + e * (D * 0.25 - 0.04), 0.06, 0.46, 0.07);
  box('rubber', 0, 0.2, -D / 2 - 0.02, W - 0.06, 0.18, 0.07);
  box('rubber', 0, 0.2, D / 2 + 0.02, W - 0.06, 0.18, 0.07);
  box('rubber', 0, 0.48, -D / 2 - 0.006, W * 0.4, 0.13, 0.012);
  box('p:#e8e8e2', 0, 0.42, D / 2 + 0.008, 0.3, 0.15, 0.008);
  for (const s of [-1, 1]) box(body, s * (W / 2 + 0.05), 0.9, 0.2 - D * 0.23, 0.1, 0.07, 0.12);
  for (const sx of [-1, 1]) for (const sz of [-D / 2 + 0.7, D / 2 - 0.7]) {
    axle('rubber', sx * (W / 2 - 0.1), 0, sz, 0.32, 0.25, 24);
    axle('metal', sx * (W / 2 + 0.04), 0.13, sz, 0.19, 0.025, 20);
  }
  for (const side of [-1, 1]) {
    box('light', side * W * 0.33, 0.63, -D / 2 - 0.012, W * 0.2, 0.14, 0.025);
    box('p:#a2342c', side * W * 0.33, 0.63, D / 2 + 0.012, W * 0.2, 0.14, 0.025);
  }
}
