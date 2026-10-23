import type { World } from '../../sim/world/World';
import {
  PROBE_LEVELS, PROBE_SPACING, SUN_DIR, buildLayout, fixtures, texelPoint,
  type Fixture, type LightLayout, type Region, type Vec3,
} from './LightLayout';

/**
 * Offline global-illumination-lite baker (runs in Node via `npm run bake`).
 * Per texel: shadowed direct light from every ceiling fixture in range, sun, sky
 * visibility, short-range ambient occlusion and a one-bounce fill derived from the
 * lit floor. Output is linear irradiance where 1.0 renders a surface at its albedo.
 */
export interface BakeOutput {
  layout: LightLayout;
  atlas: Float32Array; // RGB per atlas pixel
  probes: { nx: number; nz: number; ny: number; x0: number; z0: number; spacing: number; levels: number[]; data: Float32Array };
}

const SUN_COLOR: Vec3 = [1, 0.9, 0.76], SUN_I = 2.1;
const SKY_COLOR: Vec3 = [0.6, 0.73, 0.95], SKY_I = 1.15;
const BOUNCE = 0.42, AMBIENT = 0.025;

/** Low-discrepancy cosine-weighted hemisphere directions in a +Z-up local frame. */
function hemisphere(n: number, cosine: boolean): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    let v = 0, f = 0.5, k = i;
    while (k) { v += f * (k & 1); k >>= 1; f *= 0.5; } // van der Corput
    const phi = 2 * Math.PI * v;
    const r = cosine ? Math.sqrt(u) : Math.sqrt(1 - (1 - u) * (1 - u));
    const z = cosine ? Math.sqrt(1 - u) : 1 - u;
    out.push([r * Math.cos(phi), r * Math.sin(phi), z]);
  }
  return out;
}

function frame(n: Vec3): [Vec3, Vec3] {
  const t: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const b: Vec3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  const bl = Math.hypot(b[0], b[1], b[2]);
  b[0] /= bl; b[1] /= bl; b[2] /= bl;
  const tt: Vec3 = [b[1] * n[2] - b[2] * n[1], b[2] * n[0] - b[0] * n[2], b[0] * n[1] - b[1] * n[0]];
  return [tt, b];
}

export function bakeLighting(world: World, opts: { aoRays?: number; skyRays?: number; log?: (s: string) => void } = {}): BakeOutput {
  const log = opts.log ?? (() => {});
  const col = world.collision;
  const map = world.map;
  const layout = buildLayout(world);
  const W = layout.width, H = layout.height;
  const atlas = new Float32Array(W * H * 3);
  const lights = fixtures(world);
  const AO_N = opts.aoRays ?? 20, SKY_N = opts.skyRays ?? 14;
  const aoDirs = hemisphere(AO_N, true), skyDirs = hemisphere(SKY_N, true);

  // spatial hash for fixtures
  const HC = 4;
  const hash = new Map<number, Fixture[]>();
  const hkey = (cx: number, cz: number) => (cx + 1000) * 4096 + (cz + 1000);
  for (const f of lights) {
    const r = Math.ceil(f.range / HC);
    const cx = Math.floor(f.x / HC), cz = Math.floor(f.z / HC);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const k = hkey(cx + i, cz + j);
      let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(f);
    }
  }

  let rotSeed = 1;
  const rot = () => { rotSeed = (rotSeed * 1664525 + 1013904223) >>> 0; return (rotSeed / 4294967296) * Math.PI * 2; };

  /** Direct light (fixtures + sun + sky) at P with normal N. omni = probe (no cosine term). */
  function direct(P: Vec3, N: Vec3, omni: boolean, out: Vec3) {
    out[0] = out[1] = out[2] = 0;
    const [px, py, pz] = P;
    const list = hash.get(hkey(Math.floor(px / HC), Math.floor(pz / HC)));
    if (list) for (const f of list) {
      const lx = f.x - px, ly = f.y - py, lz = f.z - pz;
      const d2 = lx * lx + ly * ly + lz * lz;
      if (d2 > f.range * f.range) continue;
      const d = Math.sqrt(d2);
      const dx = lx / d, dy = ly / d, dz = lz / d;
      const cosN = omni ? 1 : dx * N[0] + dy * N[1] + dz * N[2];
      if (cosN <= 0) continue;
      const emit = f.pow === 0 ? 1 : 0.12 + 0.88 * Math.pow(Math.max(0, dy), f.pow);
      const q = d / f.range, win = Math.max(0, 1 - q * q * q * q);
      const e = f.intensity * cosN * emit * win * win / (d2 + 0.4);
      if (e < 0.002) continue;
      if (col.occludes(px, py, pz, dx, dy, dz, d - 0.12)) continue;
      out[0] += f.color[0] * e; out[1] += f.color[1] * e; out[2] += f.color[2] * e;
    }
    const cosS = omni ? 0.55 : SUN_DIR[0] * N[0] + SUN_DIR[1] * N[1] + SUN_DIR[2] * N[2];
    if (cosS > 0 && !col.occludes(px, py, pz, SUN_DIR[0], SUN_DIR[1], SUN_DIR[2], 250)) {
      for (let c = 0; c < 3; c++) out[c] += SUN_COLOR[c] * SUN_I * cosS;
    }
    // sky visibility (cheap early-out: rays that leave upward through a ceiling die immediately)
    const n: Vec3 = omni ? [0, 1, 0] : N;
    const [t, b] = frame(n);
    const a = rot(), ca = Math.cos(a), sa = Math.sin(a);
    let open = 0;
    for (const s of skyDirs) {
      const lx = s[0] * ca - s[1] * sa, ly = s[0] * sa + s[1] * ca;
      const dx = t[0] * lx + b[0] * ly + n[0] * s[2], dy = t[1] * lx + b[1] * ly + n[1] * s[2], dz = t[2] * lx + b[2] * ly + n[2] * s[2];
      if (dy < 0.05) continue;
      if (!col.occludes(px, py, pz, dx, dy, dz, 140)) open++;
    }
    const sky = (open / SKY_N) * SKY_I * (omni ? 0.6 : 1);
    for (let c = 0; c < 3; c++) out[c] += SKY_COLOR[c] * sky;
  }

  function ambientOcclusion(P: Vec3, N: Vec3, reach = 1.1): number {
    const [t, b] = frame(N);
    const a = rot(), ca = Math.cos(a), sa = Math.sin(a);
    let open = 0;
    for (const s of aoDirs) {
      const lx = s[0] * ca - s[1] * sa, ly = s[0] * sa + s[1] * ca;
      const dx = t[0] * lx + b[0] * ly + N[0] * s[2], dy = t[1] * lx + b[1] * ly + N[1] * s[2], dz = t[2] * lx + b[2] * ly + N[2] * s[2];
      if (!col.occludes(P[0], P[1], P[2], dx, dy, dz, reach)) open++;
    }
    return open / AO_N;
  }

  const put = (x: number, y: number, rgb: Vec3 | Float32Array) => {
    const o = (y * W + x) * 3; atlas[o] = rgb[0]; atlas[o + 1] = rgb[1]; atlas[o + 2] = rgb[2];
  };
  const tmp: Vec3 = [0, 0, 0];

  // -------------------------------------------------------------- floor (direct first)
  const fr = layout.floor;
  const floorDirect = new Float32Array(fr.tw * fr.th * 3);
  const floorAO = new Float32Array(fr.tw * fr.th);
  const floorKey = new Int16Array(fr.tw * fr.th).fill(-1);
  const charIndex = new Map<string, number>();
  const cellChar = (x: number, z: number) => {
    const c = Math.floor((x - map.originX) / map.cellSize), r = Math.floor((z - map.originZ) / map.cellSize);
    return world.charAt(c, r);
  };
  log(`floor ${fr.tw}x${fr.th}`);
  for (let j = 0; j < fr.th; j++) {
    for (let i = 0; i < fr.tw; i++) {
      const p = texelPoint(fr, i, j);
      const ch = cellChar(p[0], p[2]);
      if (ch === '#') continue;
      p[1] = 0.04;
      const k = j * fr.tw + i;
      if (!charIndex.has(ch)) charIndex.set(ch, charIndex.size);
      floorKey[k] = charIndex.get(ch)!;
      if (col.inside(p[0], 0.04, p[2])) continue; // under a prop: stays dark (contact shadow)
      direct(p, [0, 1, 0], false, tmp);
      floorDirect.set(tmp, k * 3);
      floorAO[k] = ambientOcclusion(p, [0, 1, 0]);
    }
  }

  // -------------------------------------------------------------- one-bounce fill: masked box blur per room type
  const bounce = new Float32Array(fr.tw * fr.th * 3);
  {
    const R = 10; // texels (2.5 m)
    const tw = fr.tw, th = fr.th;
    for (let key = 0; key < charIndex.size; key++) {
      // summed-area tables of value*mask and mask
      const sat = new Float64Array((tw + 1) * (th + 1) * 4);
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
        const k = j * tw + i, m = floorKey[k] === key ? 1 : 0;
        const o = ((j + 1) * (tw + 1) + (i + 1)) * 4, up = (j * (tw + 1) + (i + 1)) * 4, left = ((j + 1) * (tw + 1) + i) * 4, diag = (j * (tw + 1) + i) * 4;
        for (let c = 0; c < 3; c++) sat[o + c] = floorDirect[k * 3 + c] * m + sat[up + c] + sat[left + c] - sat[diag + c];
        sat[o + 3] = m + sat[up + 3] + sat[left + 3] - sat[diag + 3];
      }
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
        const k = j * tw + i;
        if (floorKey[k] !== key) continue;
        const i0 = Math.max(0, i - R), i1 = Math.min(tw, i + R + 1), j0 = Math.max(0, j - R), j1 = Math.min(th, j + R + 1);
        const A = (j1 * (tw + 1) + i1) * 4, B = (j0 * (tw + 1) + i1) * 4, C = (j1 * (tw + 1) + i0) * 4, Dd = (j0 * (tw + 1) + i0) * 4;
        const m = sat[A + 3] - sat[B + 3] - sat[C + 3] + sat[Dd + 3];
        if (m <= 0) continue;
        for (let c = 0; c < 3; c++) bounce[k * 3 + c] = (sat[A + c] - sat[B + c] - sat[C + c] + sat[Dd + c]) / m;
      }
    }
  }
  const bounceAt = (x: number, z: number, out: Vec3) => {
    let i = Math.floor((x - fr.origin[0]) / fr.texel), j = Math.floor((z - fr.origin[2]) / fr.texel);
    i = Math.max(0, Math.min(fr.tw - 1, i)); j = Math.max(0, Math.min(fr.th - 1, j));
    // walk to the nearest valid texel (walls have no bounce data)
    for (let rad = 0; rad < 6; rad++) {
      for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= fr.tw || jj >= fr.th) continue;
        const k = jj * fr.tw + ii;
        if (floorKey[k] < 0) continue;
        out[0] = bounce[k * 3]; out[1] = bounce[k * 3 + 1]; out[2] = bounce[k * 3 + 2];
        return;
      }
    }
    out[0] = out[1] = out[2] = 0;
  };

  // floor final
  for (let j = 0; j < fr.th; j++) for (let i = 0; i < fr.tw; i++) {
    const k = j * fr.tw + i;
    const ao = floorAO[k];
    const v: Vec3 = [0, 0, 0];
    if (floorKey[k] >= 0) for (let c = 0; c < 3; c++) v[c] = floorDirect[k * 3 + c] * (0.55 + 0.45 * ao) + (bounce[k * 3 + c] * BOUNCE + AMBIENT) * ao;
    put(fr.px + i, fr.py + j, v);
  }

  // -------------------------------------------------------------- walls
  log(`walls ${layout.walls.length}`);
  const b3: Vec3 = [0, 0, 0];
  layout.walls.forEach((r) => {
    const N = r.normal;
    for (let j = 0; j < r.th; j++) for (let i = 0; i < r.tw; i++) {
      const p = texelPoint(r, i, j);
      const P: Vec3 = [p[0] + N[0] * 0.04, p[1], p[2] + N[2] * 0.04];
      if (col.inside(P[0], P[1], P[2])) { put(r.px + i, r.py + j, [0.04, 0.04, 0.04]); continue; }
      direct(P, N, false, tmp);
      const ao = ambientOcclusion(P, N, 0.9);
      bounceAt(P[0] + N[0] * 0.8, P[2] + N[2] * 0.8, b3);
      // light reflected off the floor reaches the lower wall more than the top
      const lowBias = 1.15 - Math.min(0.45, P[1] * 0.08);
      const v: Vec3 = [0, 0, 0];
      for (let c = 0; c < 3; c++) v[c] = tmp[c] * (0.6 + 0.4 * ao) + (b3[c] * BOUNCE * lowBias + AMBIENT) * ao;
      put(r.px + i, r.py + j, v);
    }
  });

  // -------------------------------------------------------------- ceilings
  const cr = layout.ceiling;
  log(`ceiling ${cr.tw}x${cr.th}`);
  for (let j = 0; j < cr.th; j++) for (let i = 0; i < cr.tw; i++) {
    const p = texelPoint(cr, i, j);
    const c = Math.floor((p[0] - map.originX) / map.cellSize), rr = Math.floor((p[2] - map.originZ) / map.cellSize);
    const h = world.ceilingAtCell(c, rr);
    if (h === null || world.charAt(c, rr) === '#') { put(cr.px + i, cr.py + j, [0.05, 0.05, 0.05]); continue; }
    const P: Vec3 = [p[0], h - 0.04, p[2]];
    direct(P, [0, -1, 0], false, tmp);
    bounceAt(P[0], P[2], b3);
    const ao = ambientOcclusion(P, [0, -1, 0], 0.8);
    const v: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) v[k] = tmp[k] + (b3[k] * BOUNCE * 1.1 + AMBIENT) * ao;
    put(cr.px + i, cr.py + j, v);
  }

  // -------------------------------------------------------------- denoise (3x3 within regions) + border fill
  const regions: Region[] = [layout.floor, layout.ceiling, ...layout.walls];
  const scratch = new Float32Array(atlas.length);
  scratch.set(atlas);
  for (const r of regions) {
    if (r === layout.floor) continue; // floor keeps crisp contact shadows
    for (let j = 0; j < r.th; j++) for (let i = 0; i < r.tw; i++) {
      const acc = [0, 0, 0]; let n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= r.tw || jj >= r.th) continue;
        const o = ((r.py + jj) * W + r.px + ii) * 3;
        acc[0] += scratch[o]; acc[1] += scratch[o + 1]; acc[2] += scratch[o + 2]; n++;
      }
      put(r.px + i, r.py + j, [acc[0] / n, acc[1] / n, acc[2] / n]);
    }
  }
  for (const r of regions) {
    for (let j = -1; j <= r.th; j++) for (let i = -1; i <= r.tw; i++) {
      if (i >= 0 && j >= 0 && i < r.tw && j < r.th) continue;
      const si = Math.max(0, Math.min(r.tw - 1, i)), sj = Math.max(0, Math.min(r.th - 1, j));
      const o = ((r.py + sj) * W + r.px + si) * 3;
      put(r.px + i, r.py + j, [atlas[o], atlas[o + 1], atlas[o + 2]]);
    }
  }

  // -------------------------------------------------------------- light probes
  const nx = Math.round(map.cols * map.cellSize / PROBE_SPACING), nz = Math.round(map.rows * map.cellSize / PROBE_SPACING), ny = PROBE_LEVELS.length;
  const x0 = map.originX + PROBE_SPACING / 2, z0 = map.originZ + PROBE_SPACING / 2;
  const pdata = new Float32Array(nx * nz * ny * 3);
  const valid = new Uint8Array(nx * nz * ny);
  log(`probes ${nx}x${nz}x${ny}`);
  for (let l = 0; l < ny; l++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * PROBE_SPACING, z = z0 + k * PROBE_SPACING, y = PROBE_LEVELS[l];
    const c = Math.floor((x - map.originX) / map.cellSize), r = Math.floor((z - map.originZ) / map.cellSize);
    if (world.charAt(c, r) === '#') continue;
    const ceil = world.ceilingAtCell(c, r);
    if (ceil !== null && y > ceil - 0.1) continue;
    if (col.inside(x, y, z)) continue;
    direct([x, y, z], [0, 1, 0], true, tmp);
    bounceAt(x, z, b3);
    const o = ((l * nz + k) * nx + i) * 3;
    for (let ch = 0; ch < 3; ch++) pdata[o + ch] = tmp[ch] * 0.85 + b3[ch] * BOUNCE * 1.1 + AMBIENT;
    valid[(l * nz + k) * nx + i] = 1;
  }
  // fill invalid probes from valid neighbours so sampling never hits black
  for (let pass = 0; pass < 8; pass++) {
    const next = valid.slice();
    for (let l = 0; l < ny; l++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const id = (l * nz + k) * nx + i;
      if (valid[id]) continue;
      const acc = [0, 0, 0]; let n = 0;
      for (const [di, dk, dl] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const ii = i + di, kk = k + dk, ll = l + dl;
        if (ii < 0 || kk < 0 || ll < 0 || ii >= nx || kk >= nz || ll >= ny) continue;
        const nid = (ll * nz + kk) * nx + ii;
        if (!valid[nid]) continue;
        acc[0] += pdata[nid * 3]; acc[1] += pdata[nid * 3 + 1]; acc[2] += pdata[nid * 3 + 2]; n++;
      }
      if (!n) continue;
      pdata.set([acc[0] / n, acc[1] / n, acc[2] / n], id * 3);
      next[id] = 1;
    }
    valid.set(next);
  }
  return { layout, atlas, probes: { nx, nz, ny, x0, z0, spacing: PROBE_SPACING, levels: PROBE_LEVELS, data: pdata } };
}
