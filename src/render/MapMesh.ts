import {
  AmbientLight, BackSide, BufferAttribute, BufferGeometry, DirectionalLight, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, PointLight, SphereGeometry, Vector3, type Light,
} from 'three';
import type { World } from '../sim/world/World';
import { Batcher, MaterialLib } from './Materials';
import { buildProp } from './Props';
import { TEX, contactShadow, signTexture, siteDecal } from './Textures';
import { dressWall } from './Architecture';
import type { BakedLighting } from './lighting/BakedLighting';
import { regionUV, wallFaces } from './lighting/LightLayout';

export interface MapVisual {
  group: Group;
  lights: Light[];
  sun: DirectionalLight;
  updateLights(position: Vector3): void;
}

function quadGeo(p: number[][], n: [number, number, number], uv: number[][], col: number[], uv1?: number[][]): BufferGeometry {
  // p: 4 corners (a,b,c,d) counter-clockwise seen from the normal side → tris (a,b,c) (a,c,d)
  const order = [0, 1, 2, 0, 2, 3];
  const pos = new Float32Array(18), nor = new Float32Array(18), uvs = new Float32Array(12), c = new Float32Array(18);
  const lm = uv1 ? new Float32Array(12) : null;
  order.forEach((k, i) => {
    pos.set(p[k], i * 3); nor.set(n, i * 3); uvs.set(uv[k], i * 2);
    if (lm && uv1) lm.set(uv1[k], i * 2);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = col[k];
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  if (lm) g.setAttribute('uv1', new BufferAttribute(lm, 2));
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

const CEIL_MAT = (h: number) => (h <= 4 ? 'ceil:office' : h <= 7 ? 'ceil:lobby' : 'ceil:factory');

/** Builds all static visuals for a world. */
export function buildMapVisual(world: World, lib: MaterialLib, opts: { shadows: 0 | 2048 | 4096; pointLights: boolean; baked?: BakedLighting | null }): MapVisual {
  const map = world.map;
  const { cellSize: cs, originX: ox, originZ: oz, cols, rows } = map;
  const group = new Group();
  group.name = 'map';
  const statics = new Batcher(lib);
  const isWall = (c: number, r: number) => world.charAt(c, r) === '#';
  const baked = opts.baked ?? null;
  const layout = baked?.layout ?? null;
  const lmKey = (k: string) => (baked ? 'lm:' + k : k);

  // ---------------------------------------------------------------- floors with corner AO
  const cornerAO = (i: number, j: number) => {
    let n = 0;
    if (isWall(i - 1, j - 1)) n++; if (isWall(i, j - 1)) n++; if (isWall(i - 1, j)) n++; if (isWall(i, j)) n++;
    return 1 - 0.13 * n;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = map.grid[r][c];
    const ft = map.floorTypes[ch];
    if (!ft) continue;
    const ws = lib.worldSize(ft.material);
    const x0 = ox + c * cs, x1 = x0 + cs, z0 = oz + r * cs, z1 = z0 + cs;
    const corners = [[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]];
    const g = quadGeo(corners, [0, 1, 0],
      [[x0 / ws.w, -z1 / ws.h], [x1 / ws.w, -z1 / ws.h], [x1 / ws.w, -z0 / ws.h], [x0 / ws.w, -z0 / ws.h]],
      [cornerAO(c, r + 1), cornerAO(c + 1, r + 1), cornerAO(c + 1, r), cornerAO(c, r)],
      layout ? corners.map((q) => regionUV(layout, layout.floor, q[0] - ox, q[2] - oz)) : undefined,
    );
    statics.addGeometry(lmKey(ft.material), g, 0, 0, 0);
  }

  // ---------------------------------------------------------------- walls (faces per cell edge, material from the room it faces)
  const AO_BOTTOM = 0.62;
  const skyCells = new Map<number, number>();
  wallFaces(world).forEach((face, fi) => {
    const { c, r, pts, normal: n, height: H, floor: ft } = face;
    const dc = n[0], dr = n[2];
    const x0 = ox + c * cs, x1 = x0 + cs, z0 = oz + r * cs, z1 = z0 + cs;
    if (ft.ceiling === null) skyCells.set(r * cols + c, H);
    const mat = 'wall:' + ft.wallMaterial;
    const ws = lib.worldSize(mat);
    const along = (q: number[]) => (dc === 0 ? q[0] : q[2]) * (dc === 0 ? (dr < 0 ? -1 : 1) : (dc > 0 ? -1 : 1));
    const uv = pts.map((q) => [along(q) / ws.w, q[1] / ws.h]);
    const colr = pts.map((q) => (q[1] === 0 ? AO_BOTTOM : 0.88));
    let uv1: number[][] | undefined;
    if (layout) {
      const region = layout.walls[fi];
      const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][2] - pts[0][2]);
      uv1 = [regionUV(layout, region, 0, 0), regionUV(layout, region, len, 0), regionUV(layout, region, len, H), regionUV(layout, region, 0, H)];
    }
    statics.addGeometry(lmKey(mat), quadGeo(pts, n, uv, colr, uv1), 0, 0, 0);
    const cx = (x0 + x1) / 2 + dc * (cs / 2 + 0.025);
    const cz = (z0 + z1) / 2 + dr * (cs / 2 + 0.025);
    const industrial = ft.wallMaterial === 'factory';
    dressWall(statics, cx, cz, H, Math.atan2(dc, dr), ft.wallMaterial, ft.ceiling === null, c * 19 + r * 7);
    // Real skirting / upper trim adds a light-catching edge to otherwise flat walls.
    statics.box(industrial ? 'm:#515b5b' : 'p:#596267', dc === 0 ? cs : 0.05, industrial ? 0.18 : 0.11,
      dc === 0 ? 0.05 : cs, cx, 0, cz);
    if (industrial && (c + r) % 4 === 0) {
      statics.box('m:#667176', dc === 0 ? 0.12 : 0.07, H - 1.65, dc === 0 ? 0.07 : 0.12, cx, 1.65, cz);
    }
    if (!industrial && ft.ceiling !== null) {
      statics.box('p:#aeb2ac', dc === 0 ? cs : 0.06, 0.07, dc === 0 ? 0.06 : cs, cx, Math.min(H, ft.ceiling) - 0.1, cz);
    }
  });
  for (const [key, H] of skyCells) {
    const c = key % cols, r = Math.floor(key / cols);
    const x0 = ox + c * cs, x1 = x0 + cs, z0 = oz + r * cs, z1 = z0 + cs;
    const ws = lib.worldSize('concrete');
    statics.addGeometry('concrete', quadGeo([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], [0, 1, 0],
      [[x0 / ws.w, z1 / ws.h], [x1 / ws.w, z1 / ws.h], [x1 / ws.w, z0 / ws.h], [x0 / ws.w, z0 / ws.h]], [0.8, 0.8, 0.8, 0.8]), 0, 0, 0);
  }

  // ---------------------------------------------------------------- door lintels
  for (const d of map.doors) {
    const ceil = world.ceilingAtCell(d.c0, d.r0);
    const ft = map.floorTypes[map.grid[d.r0][d.c0]];
    if (ceil === null || !ft || ceil <= d.lintel + 0.05) continue;
    const x0 = ox + d.c0 * cs, x1 = ox + (d.c1 + 1) * cs, z0 = oz + d.r0 * cs, z1 = oz + (d.r1 + 1) * cs;
    statics.box('wall:' + ft.wallMaterial, x1 - x0, ceil - d.lintel, z1 - z0, (x0 + x1) / 2, d.lintel, (z0 + z1) / 2, 0, false);
    statics.box('m:#5a5e64', x1 - x0, 0.06, z1 - z0 + 0.04, (x0 + x1) / 2, d.lintel - 0.03, (z0 + z1) / 2, 0, false);
    // which way the opening spans: multi-cell doors by their extent; single cells by their walls
    // (walls north + south of the cell → you walk east-west through it → the opening spans Z)
    const wideX = d.c1 > d.c0 ? true : d.r1 > d.r0 ? false : !(world.charAt(d.c0, d.r0 - 1) === '#' && world.charAt(d.c0, d.r0 + 1) === '#');
    for (const side of [-1, 1]) {
      const x = wideX ? (side < 0 ? x0 : x1) : (x0 + x1) / 2;
      const z = wideX ? (z0 + z1) / 2 : (side < 0 ? z0 : z1);
      statics.roundedBox('m:#667176', wideX ? 0.09 : x1 - x0 + 0.08, d.lintel,
        wideX ? z1 - z0 + 0.08 : 0.09, x, 0, z);
    }
  }

  // ---------------------------------------------------------------- ceilings + light fixtures
  const ceilings = new Batcher(lib);
  for (const cb of world.ceilings) {
    const x0 = ox + cb.c0 * cs, x1 = ox + (cb.c1 + 1) * cs, z0 = oz + cb.r0 * cs, z1 = oz + (cb.r1 + 1) * cs;
    const y = cb.height;
    const mat = CEIL_MAT(y);
    const ws = lib.worldSize(mat);
    const cq = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    ceilings.addGeometry(lmKey(mat), quadGeo(cq, [0, -1, 0],
      [[x0 / ws.w, z0 / ws.h], [x1 / ws.w, z0 / ws.h], [x1 / ws.w, z1 / ws.h], [x0 / ws.w, z1 / ws.h]], [1, 1, 1, 1],
      layout ? cq.map((q) => regionUV(layout, layout.ceiling, q[0] - ox, q[2] - oz)) : undefined), 0, 0, 0);
    // roof slab on top (casts the sun's shadow)
    ceilings.box('concrete', x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, y + 0.01, (z0 + z1) / 2, 0, false);
    if (y > 7 && x1 - x0 > 8 && z1 - z0 > 8) {
      // Suspended service pipes and steel flanges add scale without changing cover.
      for (const offset of [0.5, 0.85]) {
        statics.cylinder(offset < 0.6 ? 'm:#8e7660' : 'm:#737e83', 0.065, z1 - z0,
          x0 + offset, y - 0.95 - (z1 - z0) / 2, (z0 + z1) / 2, 12, Math.PI / 2);
      }
      for (let z = z0 + 1; z < z1; z += 6) {
        statics.box('m:#616d71', x1 - x0, 0.055, 0.46, (x0 + x1) / 2, y - 0.64, z, 0, false);
        statics.box('m:#616d71', x1 - x0, 0.055, 0.46, (x0 + x1) / 2, y - 0.28, z, 0, false);
      }
    }
    for (let r = cb.r0; r <= cb.r1; r++) for (let c = cb.c0; c <= cb.c1; c++) {
      const cx = ox + (c + 0.5) * cs, cz = oz + (r + 0.5) * cs;
      if (y <= 4) {
        if ((c + r) % 2 === 0) { statics.box('light', 0.6, 0.02, 1.2, cx, y - 0.025, cz, 0, false); statics.box('m:#c0c4c8', 0.68, 0.02, 1.28, cx, y - 0.01, cz, 0, false); }
      } else if (y <= 7) {
        if (c % 2 === 0 && r % 2 === 0) statics.box('lightWarm', 1.0, 0.03, 1.0, cx + 1, y - 0.03, cz + 1, 0, false);
      } else {
        if (c % 3 === 1 && r % 3 === 1) {
          statics.cylinder('m:#3a3e44', 0.02, 1.4, cx, y - 1.4, cz, 6);
          statics.cylinder('m:#4a4e54', 0.45, 0.35, cx, y - 1.75, cz, 12, 0, 0, 0.18);
          statics.cylinder('lightWarm', 0.4, 0.02, cx, y - 1.77, cz, 12);
        }
        if (r % 3 === 0 && c === cb.c0) {
          statics.box('m:#2e3238', x1 - x0, 0.45, 0.25, (x0 + x1) / 2, y - 0.6, oz + r * cs, 0, false);
        }
      }
    }
  }

  // ---------------------------------------------------------------- props
  let seed = 1;
  for (const p of map.props) buildProp(statics, p, seed++);

  // Contact shadows under props stay visible indoors, where the roof blocks the sun.
  const grounded = map.props.filter((p) => (p.y ?? 0) < 0.1 && p.w > 0.3 && p.d > 0.3);
  const contacts = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({
    map: contactShadow(), color: 0x111923, transparent: true, opacity: 0.38, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1,
  }), grounded.length);
  const matrix = new Matrix4(), rot = new Matrix4().makeRotationX(-Math.PI / 2);
  grounded.forEach((p, i) => {
    matrix.makeScale(p.w + 1.1, 1, p.d + 1.1).multiply(rot);
    matrix.setPosition(p.x, 0.009, p.z); contacts.setMatrixAt(i, matrix);
  });
  contacts.instanceMatrix.needsUpdate = true;
  if (!baked) group.add(contacts);

  statics.build(group);
  const ceilGroup = new Group();
  ceilings.build(ceilGroup, { castShadow: true });
  ceilGroup.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  group.add(ceilGroup);
  group.traverse((o) => { if ((o as Mesh).isMesh) o.castShadow = true; });
  contacts.castShadow = false;

  // ---------------------------------------------------------------- decals (site letters, zone paint, lines)
  const decalMat = (color: string) => new MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    lightMap: baked?.atlas ?? null, lightMapIntensity: baked?.intensity ?? 1 });
  /** Floor decals carry lightmap UVs so paint is shadowed like the floor it sits on. */
  const floorUV1 = (m: Mesh) => {
    if (!layout) return m;
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    const pos = g.getAttribute('position');
    const uv1 = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) uv1.set(regionUV(layout, layout.floor, pos.getX(i) - ox, pos.getZ(i) - oz), i * 2);
    g.setAttribute('uv1', new BufferAttribute(uv1, 2));
    m.geometry.dispose();
    m.geometry = g;
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrix();
    return m;
  };
  for (const site of ['A', 'B'] as const) {
    const rc = map.sites[site];
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    const letter = new Mesh(new PlaneGeometry(5, 5), new MeshBasicMaterial({ map: siteDecal(site), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      lightMap: baked?.atlas ?? null, lightMapIntensity: baked?.intensity ?? 1 }));
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(cx + (site === 'A' ? 3 : -2.5), 0.012, cz + (site === 'A' ? 2.5 : 1.5));
    group.add(floorUV1(letter));
    const zone = decalMat(site === 'A' ? '#e8b818' : '#d0302a');
    const t = 0.18;
    const edges: [number, number, number, number][] = [
      [cx, rc.z0, rc.x1 - rc.x0, t], [cx, rc.z1, rc.x1 - rc.x0, t], [rc.x0, cz, t, rc.z1 - rc.z0], [rc.x1, cz, t, rc.z1 - rc.z0],
    ];
    for (const [x, z, w, d] of edges) {
      const m = new Mesh(new PlaneGeometry(w, d), zone);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.011, z);
      group.add(floorUV1(m));
    }
  }
  const yellow = decalMat('#e8b818'), white = decalMat('#e8e8e8');
  const line = (mat: MeshBasicMaterial, x0: number, z0: number, x1: number, z1: number, wdt = 0.12) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new Mesh(new PlaneGeometry(len, wdt), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
    m.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
    group.add(floorUV1(m));
  };
  // factory walkway & shipping lanes
  line(yellow, 20.5, -6.4, 41, -6.4); line(yellow, 20.5, 0.6, 41, 0.6);
  line(yellow, 39.6, 6, 39.6, 23.5); line(yellow, 48.4, 6, 48.4, 23.5);
  line(yellow, 7.6, 6, 7.6, 23.5); line(yellow, 14.4, 6, 14.4, 23.5);
  // yard parking bays
  for (let x = -54; x <= -30; x += 3) line(white, x, 31.5, x, 37.5);
  for (const x of [12, 18, 32, 38, 48, 54]) line(white, x, 26.2, x, 31);

  // ---------------------------------------------------------------- signs
  const sign = (text: string, x: number, y: number, z: number, rotY: number, w = 2.2, h = 0.42, bg = '#1d2a3a', fg = '#f2f2f2') => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: signTexture(text, bg, fg), polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = rotY;
    if (baked) {
      const p = baked.probe(x + Math.sin(rotY) * 0.3, y, z + Math.cos(rotY) * 0.3);
      (m.material as MeshBasicMaterial).color.setRGB(Math.min(1.15, 0.25 + p.r), Math.min(1.15, 0.25 + p.g), Math.min(1.15, 0.25 + p.b));
    }
    group.add(m);
  };
  const S = 0, N = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;
  sign('CONFERENCE 1', -25, 2.9, -21.98, S, 1.8);
  sign('CONFERENCE 2', -15, 2.9, -21.98, S, 1.8);
  sign('ENGINEERING · B', -27.98, 2.9, -18, E, 2.6);
  sign('SERVER ROOM', -46, 2.9, 26.02, S, 2.4, 0.42, '#2a2a2a', '#7ad0ff');
  sign('MAIL ROOM', -22, 2.9, 26.02, S, 2.2);
  sign('MAIN HALL', -1, 3.4, 26.02, S, 2.8);
  sign('DOCK 1', 15, 4.75, 26.02, S, 2.0, 0.5, '#e8b818', '#151515');
  sign('DOCK 2', 35, 4.75, 26.02, S, 2.0, 0.5, '#e8b818', '#151515');
  sign('DOCK 3', 51, 4.75, 26.02, S, 2.0, 0.5, '#e8b818', '#151515');
  sign('ASSEMBLY · A', 17.98, 3.5, -28, W, 2.6, 0.5, '#e8b818', '#151515');
  sign('WAREHOUSE', 1.98, 3.2, -8, W, 2.0, 0.35);
  sign('BREAK ROOM', -36, 2.9, -12.02, N, 1.8);
  sign('B SITE →', -29.98, 2.9, -31, W, 1.8, 0.38, '#7a1c18', '#ffffff');
  sign('A LONG ↑', 54, 5.6, -11.98, S, 2.4, 0.5, '#e8b818', '#151515');
  sign('A', 24, 3.2, -37.94, S, 1.7, 2.1, '#a95735', '#ede3d2');
  sign('B', -52, 2.2, -37.94, S, 1.2, 1.5, '#3c6476', '#e4e7dc');
  sign('02  /  ASSEMBLY', 39, 4.1, -37.93, S, 4.8, 0.55, '#384549', '#d5d7c6');
  sign('SAFETY FIRST', 57.93, 2.5, -22, W, 2.4, 0.5, '#d4b25d', '#26302d');
  sign('01  /  ENGINEERING', -40, 2.7, -37.93, S, 3.8, 0.42, '#3c6476', '#e4e7dc');
  const logo = new Mesh(new PlaneGeometry(7, 2.2), new MeshBasicMaterial({ map: signTexture('ACI', '#14181f', '#f0a020', 512, 160) }));
  logo.position.set(4, 3.3, -37.88);
  group.add(logo);
  sign('A-CONCEPTS INDUSTRIES', 4, 1.95, -37.87, S, 5, 0.4, '#14181f', '#c8ccd4');

  // ---------------------------------------------------------------- sky dome
  const sky = new Mesh(new SphereGeometry(400, 24, 12), new MeshBasicMaterial({ map: TEX.sky().tex, side: BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -1;
  group.add(sky);

  // ---------------------------------------------------------------- lights
  const lights: Light[] = [];
  if (baked) {
    // Static geometry ignores these (its diffuse light is baked). They light dynamic objects
    // (characters, items) at a neutral level that MatchView rescales per object from probes.
    const hemi = new HemisphereLight(0xf4f6fa, 0x6c665c, Math.PI * 0.62);
    const key = new DirectionalLight(0xfff4e6, Math.PI * 0.42);
    key.position.set(0.35, 1, 0.55);
    const sunB = new DirectionalLight(0xffe3bb, 0);
    lights.push(hemi, key, new AmbientLight(0xffffff, Math.PI * 0.12), sunB);
    return { group, lights, sun: sunB, updateLights: () => {} };
  }
  const hemi = new HemisphereLight(0xdde8f0, 0x655f51, opts.pointLights ? 1.05 : 1.6);
  lights.push(hemi);
  lights.push(new AmbientLight(0xe7e5dc, opts.pointLights ? 0.3 : 0.55));
  const sun = new DirectionalLight(0xffe3bb, 2.6);
  sun.position.set(40, 80, 90);
  sun.target.position.set(0, 0, 0);
  if (opts.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.shadows, opts.shadows);
    const cam = sun.shadow.camera;
    cam.left = -95; cam.right = 95; cam.top = 75; cam.bottom = -75; cam.near = 10; cam.far = 260;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
  }
  lights.push(sun, sun.target as unknown as Light);
  // A constant pool avoids shader recompilation while keeping distant rooms out
  // of the per-pixel lighting loop. Four nearest sources cover adjoining rooms.
  const sources = map.lights.map((l) => ({ ...l, position: new Vector3(l.x, l.y, l.z), score: 0 }));
  const pool = opts.pointLights ? Array.from({ length: 4 }, () => new PointLight(0xffffff, 0, 30, 1.6)) : [];
  lights.push(...pool);
  const updateLights = (position: Vector3) => {
    for (const source of sources) source.score = source.intensity / (4 + source.position.distanceToSquared(position));
    sources.sort((a, b) => b.score - a.score);
    for (let i = 0; i < pool.length; i++) {
      const source = sources[i], light = pool[i];
      light.position.copy(source.position); light.color.setHex(source.color);
      light.intensity = source.intensity; light.distance = source.distance;
    }
  };
  return { group, lights, sun, updateLights };
}
