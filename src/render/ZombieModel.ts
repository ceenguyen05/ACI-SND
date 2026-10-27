import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, BoxGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { legPose } from './HumanoidGeometry';
import { clamp, damp } from '../core/math';
import { ZOMBIES, type Gait, type ZombieKind } from '../config/zombies';
import type { ZombieMode } from '../sim/zombies/types';

type Part = 'torso' | 'head' | 'armR' | 'foreR' | 'armL' | 'foreL' | 'legL' | 'legR' | 'shinL' | 'shinR' | 'footL' | 'footR' | 'helmet' | 'plates';
const PARTS: Part[] = ['torso', 'head', 'armR', 'foreR', 'armL', 'foreL', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'helmet', 'plates'];

interface Built { body: BufferGeometry | null; glow: BufferGeometry | null }

export interface ZombiePose {
  speed: number;
  gait: Gait;
  mode: ZombieMode;
  /** Seconds in the current mode / its planned length. */
  modeT: number;
  modeDur: number;
  /** Seconds since the last swipe landed (follow-through), large when none. */
  strikeT: number;
  arm: number;
  /** 0 → 1 while climbing out of the floor. */
  rise: number;
  enraged: boolean;
  headless: boolean;
  helmet: boolean;
  vest: boolean;
  dead: boolean;
  deathT: number;
  deathVariant: number;
  hitT: number;
  dt: number;
  time: number;
}

// ------------------------------------------------------------------------------- geometry
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _s = new Vector3(), _p = new Vector3(), _c = new Color();
const sphere = new SphereGeometry(1, 12, 9);
const cyl = new CylinderGeometry(1, 1, 1, 10, 1);
const cube = new BoxGeometry(1, 1, 1);

class Builder {
  lists = new Map<Part, { body: BufferGeometry[]; glow: BufferGeometry[] }>();
  private push(part: Part, base: BufferGeometry, color: string, glow: boolean, mul = 1) {
    const g = base.clone().applyMatrix4(_m);
    const n = g.getAttribute('position').count;
    _c.set(color).multiplyScalar(mul);
    const col = new Float32Array(n * 3);
    const pos = g.getAttribute('position'), normal = g.getAttribute('normal');
    for (let i = 0; i < n; i++) {
      // Subtle baked creases / mottling preserve shape under the flat office probes.
      // Stored in the cached geometry: no extra texture fetches or per-frame work.
      const shade = glow ? 1 : 0.94 + normal.getY(i) * 0.04
        + Math.sin(pos.getX(i) * 67 + pos.getY(i) * 41) * Math.sin(pos.getZ(i) * 79 + pos.getY(i) * 53) * 0.035;
      col[i * 3] = _c.r * shade; col[i * 3 + 1] = _c.g * shade; col[i * 3 + 2] = _c.b * shade;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    let l = this.lists.get(part);
    if (!l) this.lists.set(part, (l = { body: [], glow: [] }));
    (glow ? l.glow : l.body).push(g);
  }
  box(part: Part, w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0, ry = 0, rz = 0, glow = false) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(w, h, d));
    this.push(part, cube, color, glow);
  }
  ball(part: Part, sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, glow = false, mul = 1) {
    _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz));
    this.push(part, sphere, color, glow, mul);
  }
  /** Tapered limb from a to b. */
  limb(part: Part, a: [number, number, number], b: [number, number, number], r0: number, r1: number, color: string) {
    const from = new Vector3(...a), to = new Vector3(...b);
    const dir = to.clone().sub(from), len = dir.length();
    const geo = new CylinderGeometry(r1, r0, 1, 10, 1);
    _q.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    _m.compose(_p.copy(from).addScaledVector(dir, len / 2), _q, _s.set(1, len, 1));
    this.push(part, geo, color, false);
    geo.dispose();
  }
  cylinder(part: Part, r: number, h: number, x: number, y: number, z: number, color: string, rx = 0, rz = 0, glow = false) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, 0, rz)), _s.set(r, h, r));
    this.push(part, cyl, color, glow);
  }
  build(): Map<Part, Built> {
    const out = new Map<Part, Built>();
    for (const p of PARTS) {
      const l = this.lists.get(p);
      const merge = (arr: BufferGeometry[]) => {
        if (!arr.length) return null;
        const flat = arr.map((g) => (g.index ? g.toNonIndexed() : g));
        const m = mergeGeometries(flat, false);
        for (const g of arr) g.dispose();
        for (const g of flat) g.dispose();
        if (m) { m.computeBoundingSphere(); m.userData.sharedResource = true; }
        return m;
      };
      out.set(p, { body: l ? merge(l.body) : null, glow: l ? merge(l.glow) : null });
    }
    return out;
  }
}

const SKINS = ['#8b957b', '#7f8b73', '#9a9886', '#76836d', '#8e8a78'];
const BLOOD = '#561010', DARK = '#262124', BONE = '#d8d2bc';

interface Outfit { shirt: string; pants: string; shoes: string; extra: 'tie' | 'vest' | 'coat' | 'badge' | 'none'; extraColor: string; hat: 'none' | 'hardhat' | 'cap'; hatColor: string; skin: string }
function outfitFor(kind: ZombieKind, v: number): Outfit {
  const skin = SKINS[v % SKINS.length];
  if (kind === 'runner') return { shirt: ['#5a6e7a', '#7a3a32', '#3e4a3a', '#5c5a6e'][v % 4], pants: '#34404e', shoes: '#22252a', extra: 'none', extraColor: '', hat: 'none', hatColor: '', skin };
  if (kind === 'brute') return { shirt: '#4a5260', pants: '#2c3138', shoes: '#1c1d20', extra: 'vest', extraColor: '#e86a1a', hat: 'hardhat', hatColor: '#e0b020', skin };
  if (kind === 'armored') return { shirt: '#9c8550', pants: '#8e7a4a', shoes: '#1a1a1a', extra: 'coat', extraColor: '#e8e070', hat: 'none', hatColor: '', skin };
  if (kind === 'shrieker') return { shirt: '#9fb7c0', pants: '#9fb7c0', shoes: '#c0c0b8', extra: 'none', extraColor: '', hat: 'none', hatColor: '', skin: '#a6a6a0' };
  if (kind === 'spitter') return { shirt: '#5f6a52', pants: '#3a3a30', shoes: '#2a2620', extra: 'none', extraColor: '', hat: 'none', hatColor: '', skin: '#7a8f68' };
  if (kind === 'bloater') return { shirt: '#b8b0a0', pants: '#3a3c42', shoes: '#262626', extra: 'none', extraColor: '', hat: 'none', hatColor: '', skin: '#8fa072' };
  if (kind === 'bomber') return { shirt: '#3c4246', pants: '#2c2f33', shoes: '#1c1c1c', extra: 'none', extraColor: '', hat: 'none', hatColor: '', skin };
  if (kind === 'tank') return { shirt: '#3a3f46', pants: '#262a30', shoes: '#141414', extra: 'none', extraColor: '', hat: 'none', hatColor: '', skin: '#7a7468' };
  // shamblers / crawlers: ACI staff in four flavours
  switch (v % 4) {
    case 0: return { shirt: ['#c9ccd2', '#9fb3c9', '#d8d0c0'][v % 3], pants: '#2a2d33', shoes: '#1a1a1a', extra: 'tie', extraColor: ['#7a1e1e', '#1e2a5a'][v % 2], hat: 'none', hatColor: '', skin };
    case 1: return { shirt: '#3b4a5a', pants: '#3b4a5a', shoes: '#2a2218', extra: 'vest', extraColor: v % 2 ? '#d8ff3a' : '#ff7a1a', hat: 'hardhat', hatColor: v % 2 ? '#e8e8e8' : '#e0b020', skin };
    case 2: return { shirt: '#d8dcdc', pants: '#3a3f48', shoes: '#262626', extra: 'coat', extraColor: '#d8dcdc', hat: 'none', hatColor: '', skin };
    default: return { shirt: '#1f2a44', pants: '#1f2a44', shoes: '#141414', extra: 'badge', extraColor: '#c8a040', hat: 'cap', hatColor: '#1a2238', skin };
  }
}

const cache = new Map<string, Map<Part, Built>>();

function buildKind(kind: ZombieKind, v: number): Map<Part, Built> {
  const key = `${kind}:${v}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new Builder();
  const o = outfitFor(kind, v);
  const eye = ZOMBIES[kind].eye;
  const big = kind === 'brute' || kind === 'tank';
  const thin = kind === 'runner' || kind === 'shrieker' || kind === 'spitter';
  const wide = kind === 'tank' ? 1.25 : kind === 'brute' ? 1.12 : thin ? 0.88 : 1;
  // legs
  for (const [leg, shin, foot] of [['legL', 'shinL', 'footL'], ['legR', 'shinR', 'footR']] as const) {
    b.limb(leg, [0, 0, 0], [0, -0.43, 0], 0.088 * wide, 0.07 * wide, o.pants);
    if (v % 3 === 0 && leg === 'legL') b.box(leg, 0.13, 0.12, 0.02, 0.02, -0.26, -0.07, BLOOD); // torn knee
    b.limb(shin, [0, 0, 0], [0, -0.42, 0], 0.066 * wide, 0.05 * wide, kind === 'shrieker' ? o.skin : o.pants);
    b.box(foot, 0.11 * wide, 0.08, 0.25, 0, -0.035, -0.06, o.shoes);
  }
  // torso
  const t: Part = 'torso';
  b.box(t, 0.34 * wide, 0.16, 0.21 * wide, 0, 0.06, 0, o.pants);
  b.ball(t, 0.205 * wide, 0.27, 0.135 * wide, 0, 0.35, 0, o.shirt);
  b.box(t, 0.42 * wide, 0.1, 0.2 * wide, 0, 0.53, 0, o.shirt);
  b.limb(t, [0, 0.56, -0.01], [0, 0.66, -0.02], 0.055, 0.05, o.skin); // neck
  // wounds, blood, ribs
  b.box(t, 0.12, 0.16, 0.02, 0.06 - (v % 2) * 0.12, 0.32, -0.13 * wide, BLOOD, 0, 0, 0.2);
  b.box(t, 0.08, 0.06, 0.02, -0.08, 0.46, -0.13 * wide, '#3a0c0c');
  if (kind === 'runner' || kind === 'shrieker') for (let i = 0; i < 4; i++) b.box(t, 0.14, 0.018, 0.02, 0.05, 0.24 + i * 0.05, -0.12 * wide, BONE);
  switch (o.extra) {
    case 'tie': b.box(t, 0.05, 0.3, 0.02, 0.01, 0.38, -0.135, o.extraColor, 0, 0, 0.12); break;
    case 'vest':
      b.ball(t, 0.215 * wide, 0.24, 0.145 * wide, 0, 0.36, 0, o.extraColor);
      for (const y of [0.28, 0.42]) b.box(t, 0.42 * wide, 0.03, 0.3 * wide, 0, y, 0, '#d8d8c8');
      break;
    case 'coat':
      b.box(t, 0.44 * wide, 0.62, 0.27 * wide, 0, 0.25, 0.005, o.shirt);
      if (kind === 'armored') for (const y of [0.0, 0.32]) b.box(t, 0.45 * wide, 0.035, 0.28 * wide, 0, y, 0, o.extraColor);
      break;
    case 'badge': b.box(t, 0.05, 0.06, 0.02, 0.1, 0.45, -0.135, o.extraColor); break;
  }
  // Clothing seams, torn edges and an ACI badge make the staff readable up close.
  if (!big && kind !== 'bloater') {
    const front = o.extra === 'coat' || o.extra === 'vest' ? -0.157 : -0.14;
    for (const x of [-0.065, 0.065]) b.box(t, 0.075, 0.035, 0.018, x, 0.5, front, o.shirt, 0, 0, x > 0 ? -0.4 : 0.4);
    for (let i = 0; i < 3; i++) b.box(t, 0.008, 0.012, 0.012, 0, 0.28 + i * 0.06, front - 0.004, '#a19b88');
    b.box(t, 0.046, 0.062, 0.012, -0.11, 0.42, front - 0.008, '#c8c5af', 0, 0, 0.15);
    b.box(t, 0.034, 0.012, 0.014, -0.11, 0.435, front - 0.015, '#455e60', 0, 0, 0.15);
    for (let i = 0; i < 3; i++) b.box(t, 0.014, 0.09 - i * 0.016, 0.014, 0.065 + i * 0.018, 0.3 - i * 0.018, front - 0.005, BLOOD, 0, 0, -0.35);
  }
  // kind specials on the body
  if (kind === 'bloater') {
    b.ball(t, 0.32, 0.31, 0.3, 0, 0.27, -0.09, o.skin);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, y = 0.15 + (i % 3) * 0.1;
      b.ball(t, 0.035, 0.035, 0.035, Math.cos(a) * 0.27, y, -0.09 + Math.sin(a) * 0.25, '#7dff4a', true, 0.9);
    }
    b.box(t, 0.5, 0.06, 0.32, 0, 0.5, 0, o.shirt);
  }
  if (kind === 'bomber') {
    for (const [x, z] of [[-0.13, -0.15], [0.13, -0.15], [-0.15, 0.13], [0.15, 0.13]]) {
      b.cylinder(t, 0.05, 0.3, x, 0.32, z, '#b02a1a');
      b.cylinder(t, 0.02, 0.05, x, 0.49, z, '#c8c8c8');
    }
    b.box(t, 0.36, 0.05, 0.32, 0, 0.42, 0, '#2a2a2a');
    b.box(t, 0.36, 0.05, 0.32, 0, 0.22, 0, '#2a2a2a');
    b.ball(t, 0.04, 0.04, 0.03, 0, 0.36, -0.17, '#ff6a10', true, 1.4);
  }
  if (kind === 'tank') {
    b.ball(t, 0.3, 0.3, 0.21, 0, 0.36, 0, o.skin);
    for (const x of [-0.27, 0.27]) b.ball(t, 0.16, 0.13, 0.16, x, 0.53, 0, '#5a5f66');
    b.box(t, 0.36, 0.22, 0.04, 0, 0.42, -0.2, '#4a4f56', 0.1);
    for (const [x, rz] of [[-0.12, 0.5], [0.16, -0.4]]) b.cylinder(t, 0.012, 0.42, x, 0.55, 0.12, '#8a5a3a', 0.3, rz);
    for (let i = 0; i < 5; i++) b.box(t, 0.02, 0.18 - i * 0.02, 0.02, -0.1 + i * 0.05, 0.3 + (i % 2) * 0.06, -0.205, '#ff3020', 0, 0, 0.3 - i * 0.12, true);
  }
  if (kind === 'armored') {
    b.box('plates', 0.34, 0.3, 0.05, 0, 0.36, -0.15, '#4c5056');
    b.box('plates', 0.34, 0.3, 0.05, 0, 0.36, 0.15, '#4c5056');
    for (const x of [-0.24, 0.24]) b.ball('plates', 0.09, 0.06, 0.09, x, 0.56, 0, '#4c5056');
  }
  // head
  const h: Part = 'head';
  const hw = kind === 'tank' ? 0.85 : 1;
  b.ball(h, 0.105 * hw, 0.125 * hw, 0.115 * hw, 0, 0.12, 0, o.skin);
  b.box(h, 0.11, 0.05, 0.09, 0, 0.035, -0.035, '#5a524a', kind === 'spitter' || kind === 'shrieker' ? 0.5 : 0.25); // slack jaw
  b.box(h, 0.08, 0.02, 0.02, 0, 0.06, -0.1, DARK); // mouth
  b.ball(h, 0.022, 0.03, 0.033, 0, 0.102, -0.101, o.skin); // broken nose
  for (const side of [-1, 1]) {
    b.ball(h, 0.02, 0.033, 0.018, side * 0.104, 0.115, 0.005, o.skin);
    b.ball(h, 0.033, 0.025, 0.016, side * 0.04, 0.135, -0.098, '#34372e'); // sunken sockets
    b.box(h, 0.06, 0.014, 0.018, side * 0.043, 0.157, -0.098, o.skin, 0, 0, side * 0.18);
    b.ball(h, 0.033, 0.016, 0.015, side * 0.066, 0.09, -0.092, '#a3a18c');
  }
  for (let i = 0; i < 5; i++) if (i !== (v % 5)) b.box(h, 0.009, 0.012 + (i % 2) * 0.003, 0.01, -0.028 + i * 0.014, 0.065, -0.113, BONE, 0, 0, 0.06 * (i - 2));
  b.ball(h, 0.03, 0.02, 0.02, (v % 2 ? 1 : -1) * 0.05, 0.19, -0.09, BLOOD);
  if (o.hat === 'hardhat') { b.ball(h, 0.125, 0.07, 0.135, 0, 0.21, 0, o.hatColor); b.box(h, 0.24, 0.015, 0.27, 0, 0.19, 0, o.hatColor); }
  else if (o.hat === 'cap') { b.ball(h, 0.115, 0.06, 0.125, 0, 0.21, 0, o.hatColor); b.box(h, 0.17, 0.012, 0.1, 0, 0.19, -0.12, o.hatColor); }
  else if (kind !== 'tank' && kind !== 'shrieker') b.ball(h, 0.108, 0.06, 0.118, 0, 0.19, 0.01, ['#2a1e16', '#3a3530', '#6a6a66', '#1a1714'][v % 4]);
  if (kind === 'bomber') { b.box(h, 0.2, 0.05, 0.03, 0, 0.13, -0.105, '#202020'); }
  // eyes (and kind glows) — additive, so they glow in the dark
  for (const x of [-0.04, 0.04]) {
    b.ball(h, 0.016, 0.012, 0.01, x, 0.135, -0.12, eye, true, 1.7);
    b.ball(h, 0.027, 0.02, 0.012, x, 0.135, -0.119, eye, true, 0.28);
  }
  if (kind === 'spitter') b.ball(h, 0.05, 0.035, 0.03, 0, 0.04, -0.085, '#9dff2a', true, 1.2);
  if (kind === 'shrieker') b.ball(h, 0.045, 0.04, 0.03, 0, 0.04, -0.085, '#c46aff', true, 1.2);
  // armored helmet (shot off separately)
  if (kind === 'armored') {
    b.ball('helmet', 0.135, 0.09, 0.15, 0, 0.2, 0.01, '#d8a020');
    b.box('helmet', 0.26, 0.02, 0.3, 0, 0.16, 0.03, '#d8a020');
    b.box('helmet', 0.17, 0.07, 0.02, 0, 0.12, -0.13, '#405060', -0.1);
  }
  // arms: upper (shoulder pivot) and fore (elbow pivot), hanging down
  const sleeve = kind === 'bloater' || kind === 'tank' ? o.skin : o.shirt;
  const armLen = kind === 'shrieker' ? 0.34 : 0.3, foreLen = kind === 'shrieker' ? 0.33 : 0.27;
  const ar = kind === 'tank' ? 0.085 : kind === 'brute' ? 0.07 : thin ? 0.046 : 0.055;
  for (const [up, fore] of [['armR', 'foreR'], ['armL', 'foreL']] as const) {
    b.ball(up, ar * 1.5, ar * 1.6, ar * 1.5, 0, -0.01, 0, sleeve);
    b.limb(up, [0, 0, 0], [0, -armLen, 0], ar, ar * 0.85, sleeve);
    b.limb(fore, [0, 0, 0], [0, -foreLen, 0], ar * 0.85, ar * 0.7, kind === 'armored' ? o.shirt : o.skin);
    const hand = kind === 'tank' ? 0.09 : kind === 'brute' ? 0.06 : 0.045;
    b.ball(fore, hand, hand * 1.5, hand * 0.8, 0, -foreLen - hand * 0.8, 0, kind === 'armored' ? '#1e1e1e' : o.skin);
    for (const x of [-0.02, 0, 0.02]) b.box(fore, 0.008, 0.05, 0.008, x * (hand / 0.045), -foreLen - hand * 1.9, -0.01, '#1e1a16');
    if (up === 'armR' && v % 2 === 0 && !big) b.box(fore, 0.06, 0.08, 0.06, 0, -0.1, 0, BLOOD);
  }
  const built = b.build();
  cache.set(key, built);
  return built;
}

// ------------------------------------------------------------------------------- model
const LEAN: Record<ZombieKind, number> = { walker: 0.28, runner: 0.42, crawler: 0, brute: 0.3, bloater: 0.08, bomber: 0.35, spitter: 0.32, armored: 0.22, shrieker: 0.18, tank: 0.62 };

/**
 * Procedural zombie: one merged, vertex-coloured mesh per body part (cheap enough for a
 * 24-strong horde), additive glowing eyes, and a pose driven by the zombie's gait and AI
 * mode — shamble, sprint, crawl, swipe, scream, charge, ground slam, rising out of the
 * floor and falling dead.
 */
export class ZombieModel {
  readonly root = new Group();
  private hips = new Group();
  private g: Record<Part, Group>;
  private bodies = new Map<Part, Mesh>();
  private glows = new Map<Part, Mesh>();
  private mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
  private glowMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  private key = '';
  kind: ZombieKind = 'walker';
  private phase = Math.random() * 6;
  private move = 0;
  private tilt = (Math.random() - 0.5) * 0.4;
  private limp = Math.random() < 0.5 ? 1 : -1;
  private tint = new Color(1, 1, 1);

  constructor() {
    this.g = Object.fromEntries(PARTS.map((p) => [p, new Group()])) as Record<Part, Group>;
    const g = this.g;
    this.root.add(this.hips);
    this.hips.add(g.torso, g.legL, g.legR);
    g.torso.add(g.head, g.armR, g.armL, g.plates);
    g.head.add(g.helmet);
    g.armR.add(g.foreR); g.armL.add(g.foreL);
    g.legL.add(g.shinL); g.legR.add(g.shinR);
    g.shinL.add(g.footL); g.shinR.add(g.footR);
    g.legL.position.set(-0.12, 0, 0); g.legR.position.set(0.12, 0, 0);
    g.shinL.position.y = g.shinR.position.y = -0.43;
    g.footL.position.y = g.footR.position.y = -0.42;
    g.head.position.set(0, 0.64, -0.02);
    for (const p of PARTS) {
      const body = new Mesh(undefined, this.mat), glow = new Mesh(undefined, this.glowMat);
      body.frustumCulled = glow.frustumCulled = true;
      glow.renderOrder = 3;
      this.bodies.set(p, body); this.glows.set(p, glow);
      g[p].add(body, glow);
    }
  }

  /** Switch kind / outfit variant (pooled zombies change kind when they respawn). */
  setKind(kind: ZombieKind, variant: number) {
    this.move = 0;
    this.phase = (variant * 2.399963) % (Math.PI * 2);
    this.tilt = Math.sin(variant * 2.17) * 0.18;
    this.limp = variant % 2 ? 1 : -1;
    const v = kind === 'walker' || kind === 'crawler' || kind === 'runner' ? variant % 8 : 0;
    const key = `${kind}:${v}`;
    if (key === this.key) return;
    this.key = key; this.kind = kind;
    const built = buildKind(kind, v);
    for (const p of PARTS) {
      const b = built.get(p)!;
      const body = this.bodies.get(p)!, glow = this.glows.get(p)!;
      body.visible = !!b.body; glow.visible = !!b.glow;
      if (b.body) body.geometry = b.body;
      if (b.glow) glow.geometry = b.glow;
    }
    const d = ZOMBIES[kind];
    this.root.scale.set(d.scaleW, d.scaleH, d.scaleW);
    const g = this.g;
    const shoulder = kind === 'tank' ? 0.3 : kind === 'brute' ? 0.26 : 0.225;
    g.armR.position.set(shoulder, 0.53, 0); g.armL.position.set(-shoulder, 0.53, 0);
    g.foreR.position.y = g.foreL.position.y = kind === 'shrieker' ? -0.34 : -0.3;
    g.head.position.y = kind === 'spitter' ? 0.69 : kind === 'tank' ? 0.6 : 0.64;
  }

  setLight(c: Color) {
    if (this.tint.equals(c)) return;
    this.tint.copy(c);
    this.mat.color.copy(c);
  }

  update(p: ZombiePose) {
    const g = this.g, dt = Math.min(0.05, p.dt), kind = this.kind, crawl = kind === 'crawler';
    for (const part of PARTS) g[part].rotation.set(0, 0, 0);
    this.hips.rotation.set(0, 0, 0);
    this.hips.position.set(0, 0.92, 0);
    g.torso.position.set(0, 0, 0);
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    g.head.visible = !p.headless;
    g.helmet.visible = p.helmet;
    g.plates.visible = p.vest;
    // eye glow: brighter when enraged, a bomber's light blinks faster as the fuse burns
    let glow = p.enraged ? 1.8 : 1;
    if (kind === 'bomber') glow *= p.mode === 'fuse' ? (Math.sin(p.time * 40) > 0 ? 2.2 : 0.4) : (Math.sin(p.time * 6) > 0 ? 1.2 : 0.6);
    if (kind === 'tank' && p.mode === 'charge') glow = 2;
    this.glowMat.color.setScalar(p.dead ? Math.max(0, 1 - p.deathT * 0.6) : glow);
    if (p.dead) { this.deathPose(p); return; }

    const sprint = p.gait === 'sprint' || p.mode === 'charge';
    const run = sprint || p.gait === 'run';
    const moving = p.speed > 0.25;
    this.move = damp(this.move, moving ? Math.min(1, p.speed / (sprint ? 4.8 : run ? 3.2 : 1.4)) : 0, 9, dt);
    const stride = crawl ? 0.55 : sprint ? 1.15 : run ? 0.95 : 0.6;
    this.phase += dt * p.speed * Math.PI / stride;
    const ph = this.phase, mv = this.move;
    const lean = LEAN[kind] + (sprint ? 0.25 : run ? 0.1 : 0);
    const flinch = p.hitT < 0.22 ? Math.sin((p.hitT / 0.22) * Math.PI) : 0;

    if (crawl) {
      // dragging itself along the floor on its arms
      this.hips.position.y = 0.17;
      this.hips.rotation.x = -Math.PI / 2;
      g.torso.rotation.x = 0.1;
      g.head.rotation.x = Math.PI / 2 - 0.35 + Math.sin(ph * 0.5) * 0.05;
      g.head.rotation.z = this.tilt;
      const pull = Math.sin(ph);
      for (const [arm, fore, s] of [[g.armR, g.foreR, 1], [g.armL, g.foreL, -1]] as const) {
        arm.rotation.x = Math.PI - 0.25 + s * pull * 0.45;
        arm.rotation.z = s * 0.35;
        fore.rotation.x = -0.6 - Math.max(0, s * pull) * 0.7;
      }
      for (const [leg, shin, s] of [[g.legL, g.shinL, 1], [g.legR, g.shinR, -1]] as const) { leg.rotation.x = -0.05 + s * pull * 0.08; leg.rotation.z = s * 0.12; shin.rotation.x = 0.2; }
    } else {
      // legs: planted strides (same solver as the soldiers), one dragging leg for shamblers
      const hipY = 0.92 - (sprint ? 0.07 : run ? 0.04 : 0.05) - Math.abs(Math.sin(ph)) * 0.035 * mv;
      this.hips.position.y = hipY;
      for (const [leg, shin, foot, off, side] of [[g.legL, g.shinL, g.footL, 0, -1], [g.legR, g.shinR, g.footR, 0.5, 1]] as const) {
        const cycle = (ph / (Math.PI * 2) + off) % 1;
        const swing = Math.max(0, (cycle - 0.6) / 0.4);
        const drag = !run && side === this.limp ? 0.45 : 1;
        const travel = (cycle < 0.6 ? 0.5 - cycle / 0.6 : -0.5 + swing * swing * (3 - 2 * swing)) * mv * (run ? 0.9 : 0.55) * drag;
        const lift = Math.sin(swing * Math.PI) * mv * (sprint ? 0.24 : run ? 0.17 : 0.08) * drag;
        const pose = legPose(side * 0.02, -hipY + 0.09 + lift, 0.03 - travel);
        leg.rotation.set(pose.hip, 0, pose.roll, 'ZXY');
        shin.rotation.x = pose.knee;
        foot.rotation.set(pose.ankle + (!run && side === this.limp ? 0.35 : 0), side * 0.15, 0);
      }
      g.torso.rotation.x = lean + flinch * -0.3;
      g.torso.rotation.z = Math.sin(ph) * (run ? 0.05 : 0.09) * mv + this.tilt * 0.2;
      g.torso.rotation.y = Math.sin(ph) * (sprint ? 0.18 : 0.08) * mv;
      g.head.rotation.x = -lean * 0.6 + Math.sin(ph * 2) * 0.04 * mv - flinch * 0.35;
      g.head.rotation.z = this.tilt + Math.sin(p.time * 1.3) * 0.05;
      if (run) {
        // flailing sprint
        const s = Math.sin(ph);
        g.armR.rotation.x = 0.4 + s * 1.0 * mv; g.armL.rotation.x = 0.4 - s * 1.0 * mv;
        g.armR.rotation.z = 0.2; g.armL.rotation.z = -0.2;
        g.foreR.rotation.x = 0.9; g.foreL.rotation.x = 0.9;
      } else {
        // classic arms-out shamble
        const s = Math.sin(ph * 0.5 + 1), reach = kind === 'bloater' ? 0.9 : 1.25;
        g.armR.rotation.x = reach + s * 0.12; g.armL.rotation.x = reach - 0.15 - s * 0.12;
        g.armR.rotation.z = 0.12; g.armL.rotation.z = -0.1;
        g.foreR.rotation.x = 0.25 + Math.sin(p.time * 2.1) * 0.08; g.foreL.rotation.x = 0.35 + Math.sin(p.time * 1.7) * 0.08;
      }
      if (kind === 'tank') {
        // gorilla: knuckles low, huge shoulders rolling
        g.armR.rotation.x = 0.25 + Math.sin(ph) * 0.35 * mv; g.armL.rotation.x = 0.25 - Math.sin(ph) * 0.35 * mv;
        g.armR.rotation.z = 0.35; g.armL.rotation.z = -0.35;
        g.foreR.rotation.x = 0.45; g.foreL.rotation.x = 0.45;
      }
    }

    // ---- AI mode overlays
    const t = p.modeDur > 0 ? clamp(p.modeT / p.modeDur, 0, 1) : 1;
    const e = t * t * (3 - 2 * t);
    const [armS, foreS, side] = p.arm > 0 ? [g.armR, g.foreR, 1] : [g.armL, g.foreL, -1];
    switch (p.mode) {
      case 'attack': {
        // wind up over the head…
        armS.rotation.x = 1.2 + e * 1.6; armS.rotation.z = side * (0.25 + e * 0.2); foreS.rotation.x = 0.4 + e * 0.6;
        g.torso.rotation.x = LEAN[kind] - e * 0.25; g.torso.rotation.y = -side * e * 0.3;
        break;
      }
      case 'fuse':
        g.armR.rotation.set(0.6, 0, 1.2 + Math.sin(p.time * 30) * 0.15); g.armL.rotation.set(0.6, 0, -1.2 - Math.sin(p.time * 33) * 0.15);
        g.torso.rotation.x = 0.1 + Math.sin(p.time * 25) * 0.05;
        g.head.rotation.x = -0.3;
        break;
      case 'spit':
        g.torso.rotation.x = t < 0.7 ? -0.25 * (t / 0.7) : -0.25 + (t - 0.7) / 0.3 * 0.75;
        g.head.rotation.x = t < 0.7 ? -0.5 * (t / 0.7) : 0.3;
        break;
      case 'scream': case 'roar': {
        const k = Math.min(1, t * 3);
        g.torso.rotation.x = -0.35 * k + Math.sin(p.time * 22) * 0.02;
        g.head.rotation.x = -0.6 * k;
        g.armR.rotation.set(0.6 + 0.5 * k, 0, 1.0 * k); g.armL.rotation.set(0.6 + 0.5 * k, 0, -1.0 * k);
        g.foreR.rotation.x = g.foreL.rotation.x = 0.5;
        break;
      }
      case 'charge':
        g.torso.rotation.x = 0.95; g.head.rotation.x = -0.75;
        g.armR.rotation.x = -0.5; g.armL.rotation.x = -0.5; g.armR.rotation.z = 0.4; g.armL.rotation.z = -0.4;
        break;
      case 'dazed':
        g.torso.rotation.x = 0.3 + Math.sin(p.time * 3) * 0.1; g.torso.rotation.z = Math.sin(p.time * 2.4) * 0.15;
        g.head.rotation.x = 0.5; g.head.rotation.z = Math.sin(p.time * 3.1) * 0.4;
        g.armR.rotation.x = g.armL.rotation.x = 0.05;
        break;
      case 'slam':
        g.armR.rotation.set(1.2 + e * 1.8, 0, 0.3); g.armL.rotation.set(1.2 + e * 1.8, 0, -0.3);
        g.foreR.rotation.x = g.foreL.rotation.x = 0.5;
        g.torso.rotation.x = 0.6 - e * 0.7;
        break;
    }
    // …then the follow-through (and the tank's ground smash)
    if (p.strikeT < 0.32 && p.mode !== 'attack' && p.mode !== 'slam') {
      const k = p.strikeT / 0.32, down = Math.sin(k * Math.PI);
      armS.rotation.x = 2.8 - k * 2.6; armS.rotation.z = side * 0.4 * (1 - k); foreS.rotation.x = 0.2 + down * 0.4;
      g.torso.rotation.x = LEAN[kind] + down * 0.35; g.torso.rotation.y = side * down * 0.35;
      if (kind === 'tank') { g.armR.rotation.x = g.armL.rotation.x = 3 - k * 2.9; g.torso.rotation.x = 0.4 + down * 0.6; }
    }
    // climbing out of the floor
    if (p.rise < 1) {
      const r = p.rise, eased = 1 - Math.pow(1 - r, 2.2);
      this.hips.position.y -= (1 - eased) * 1.85;
      const reach = Math.max(0, 1 - r * 1.6);
      g.armR.rotation.x += reach * (2.6 - g.armR.rotation.x) ; g.armL.rotation.x += reach * (2.4 - g.armL.rotation.x);
      g.foreR.rotation.x = 0.3 + reach * 0.4; g.foreL.rotation.x = 0.3;
      g.torso.rotation.x += (1 - eased) * 0.5 * Math.sin(r * 12);
    }
  }

  private deathPose(p: ZombiePose) {
    const g = this.g, t = p.deathT, v = p.deathVariant;
    if (this.kind === 'crawler') {
      this.hips.position.y = 0.15;
      this.hips.rotation.x = -Math.PI / 2;
      g.head.rotation.x = Math.PI / 2 - Math.min(1, t / 0.4) * 0.7;
      g.armR.rotation.x = g.armL.rotation.x = Math.PI - 0.3;
    } else {
      const buckle = Math.min(1, t / 0.16);
      const f = Math.min(1, Math.max(0, (t - 0.06) / 0.5)), e = f * f * (3 - 2 * f);
      const s = t > 0.56 ? Math.min(1, (t - 0.56) / 0.3) : 0, bounce = Math.sin(s * Math.PI) * 0.05 * (1 - s);
      const lie = 0.13 * e + bounce;
      this.hips.position.set(0, 0.88 - 0.3 * Math.sin(Math.PI * Math.min(1, f * 1.1)) * (1 - 0.6 * e), 0);
      if (v === 0) { this.root.rotation.x = e * Math.PI / 2 * 0.97; this.hips.position.z = -lie; }
      else if (v === 1) { this.root.rotation.x = -e * Math.PI / 2 * 0.97; this.hips.position.z = lie; }
      else { const sg = v === 2 ? 1 : -1; this.root.rotation.z = sg * e * Math.PI / 2 * 0.97; this.hips.position.x = sg * lie; }
      const knee = 1.25 * buckle * (1 - 0.55 * e);
      g.legL.rotation.set(-0.55 * buckle * (1 - 0.4 * e), 0, 0.1 * e);
      g.legR.rotation.set(-0.35 * buckle * (1 - 0.4 * e), 0, -0.14 * e);
      g.shinL.rotation.x = knee; g.shinR.rotation.x = knee * 0.7;
      g.torso.rotation.set(v === 1 ? 0.35 * e : -0.25 * e, 0.2 * e, 0);
      g.head.rotation.set(v === 0 ? -0.5 * e : 0.3 * e, 0.4 * e, 0);
      g.armR.rotation.set(1.4 * e, 0, 0.6 * e); g.armL.rotation.set(0.6 + 1.2 * e, 0, -0.7 * e);
    }
    // corpses sink into the floor before the slot is reused
    if (t > 2.6) this.hips.position.y -= (t - 2.6) * 0.55;
  }

  dispose() {
    this.mat.dispose();
    this.glowMat.dispose();
    this.root.removeFromParent();
  }
}
