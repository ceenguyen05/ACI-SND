import { describe, expect, it } from 'vitest';
import { SND_MAPS, SND_MAP_IDS, mapChoicesCompatible, narrowMapChoice, resolveMapChoice, sndMap } from '../../src/sim/maps/index';
import { ACI_HQ } from '../../src/sim/maps/aciHq';
import { World, propBounds, propColliders } from '../../src/sim/world/World';
import { cubicleLayout } from '../../src/sim/world/PropShapes';
import { MOVE } from '../../src/config/movement';
import type { MapDef, PropDef, Spot } from '../../src/sim/world/MapTypes';
import { inRect } from '../../src/core/math';
import { Vector3 } from 'three';

/** Run speed with a knife out: the fastest anyone reaches a site. */
const RUN = MOVE.knifeSpeed;

/** Props that stand in open sky or rise through nothing (their tops are allowed above any ceiling). */
const OUTDOOR_TALL = new Set<PropDef['kind']>(['lightPole', 'tree', 'poleMount', 'alprCam', 'speedCamera', 'speedSignPole', 'trailer', 'boxTruck', 'canopy']);

/** Navigation path length in metres (sum of segment lengths), or null if unreachable. */
function pathLength(world: World, ax: number, az: number, bx: number, bz: number): number | null {
  const path = world.nav.findPath(ax, az, bx, bz);
  if (!path) return null;
  let len = 0, px = ax, pz = az;
  for (const p of path) { len += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
  return len + Math.hypot(bx - px, bz - pz);
}

describe('map registry', () => {
  it('lists both Search & Destroy maps with unique ids', () => {
    expect(SND_MAP_IDS).toEqual(['aci_hq', 'aci_b2']);
    for (const id of SND_MAP_IDS) expect(SND_MAPS[id].id).toBe(id);
  });
  it('resolves choices and falls back to ACI HQ for unknown ids', () => {
    expect(resolveMapChoice('aci_b2')).toBe('aci_b2');
    expect(resolveMapChoice('random', () => 0)).toBe('aci_hq');
    expect(resolveMapChoice('random', () => 1)).toBe('aci_b2');
    expect(resolveMapChoice('random', () => 99)).toBe('aci_b2');
    expect(sndMap('nope')).toBe(ACI_HQ);
    expect(sndMap(undefined)).toBe(ACI_HQ);
    const seen = new Set(Array.from({ length: 200 }, () => resolveMapChoice('random')));
    expect(seen).toEqual(new Set(SND_MAP_IDS));
  });
  it('matches "random" with any map, and narrows to the specific choice', () => {
    expect(mapChoicesCompatible('random', 'aci_b2')).toBe(true);
    expect(mapChoicesCompatible('aci_hq', 'aci_b2')).toBe(false);
    expect(mapChoicesCompatible(undefined, 'aci_hq')).toBe(true);
    expect(narrowMapChoice('random', 'aci_b2')).toBe('aci_b2');
    expect(narrowMapChoice('aci_hq', 'random')).toBe('aci_hq');
  });
});

describe.each(SND_MAP_IDS.map((id) => [SND_MAPS[id].name, SND_MAPS[id]] as const))('%s map data', (_name, map: MapDef) => {
  const world = new World(map);
  const cs = map.cellSize;
  const cellAt = (x: number, z: number) => world.cellAt(x, z);
  const ceilingAt = (x: number, z: number) => { const { c, r } = cellAt(x, z); return world.ceilingAtCell(c, r); };
  const isWallAt = (x: number, z: number) => { const { c, r } = cellAt(x, z); return world.charAt(c, r) === '#'; };
  const spotsOf = (t: 'T' | 'CT') => map.spawnAreas[t].flatMap((a) => a.spots);
  const firstT = map.spawnAreas.T[0].spots[0];

  it('grid has consistent dimensions and only known chars', () => {
    expect(map.grid.length).toBe(map.rows);
    for (const row of map.grid) {
      expect(row.length).toBe(map.cols);
      for (const ch of row) expect(ch === '#' || ch in map.floorTypes).toBe(true);
    }
  });

  it('is enclosed by walls', () => {
    const g = map.grid;
    for (let c = 0; c < map.cols; c++) { expect(g[0][c]).toBe('#'); expect(g[map.rows - 1][c]).toBe('#'); }
    for (let r = 0; r < map.rows; r++) { expect(g[r][0]).toBe('#'); expect(g[r][map.cols - 1]).toBe('#'); }
  });

  it('solid props do not intersect walls', () => {
    const bad: string[] = [];
    for (const p of map.props) {
      if (p.solid === false) continue;
      for (const b of propColliders(p)) {
        for (const x of [b.minX + 0.01, b.maxX - 0.01]) for (const z of [b.minZ + 0.01, b.maxZ - 0.01]) {
          if (isWallAt(x, z)) bad.push(`${p.kind}@(${p.x},${p.z})`);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('solid props do not overlap each other', () => {
    const solids = map.props.filter((p) => p.solid !== false);
    const bad: string[] = [];
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = propBounds(solids[i]), b = propBounds(solids[j]);
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX), oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      if (ox > 0.02 && oz > 0.02 && oy > 0.02) bad.push(`${solids[i].kind}@(${solids[i].x},${solids[i].z}) × ${solids[j].kind}@(${solids[j].x},${solids[j].z})`);
    }
    expect(bad).toEqual([]);
  });

  it('every prop stands on the floor of a room and fits under its ceiling', () => {
    const bad: string[] = [];
    for (const p of map.props) {
      const b = propBounds(p), at = `${p.kind}@(${p.x},${p.z})`;
      if (isWallAt(p.x, p.z)) {
        // Wall-hung props (TV, whiteboard, signs) are centred within a few cm of the wall face.
        if (p.solid !== false) bad.push(`${at} centre in a wall`);
        continue;
      }
      if (OUTDOOR_TALL.has(p.kind) && ceilingAt(p.x, p.z) === null) continue;
      let ceil = Infinity;
      for (const x of [b.minX + 0.05, p.x, b.maxX - 0.05]) for (const z of [b.minZ + 0.05, p.z, b.maxZ - 0.05]) {
        if (isWallAt(x, z)) continue;
        const c = ceilingAt(x, z);
        if (c !== null) ceil = Math.min(ceil, c);
      }
      // Structural pillars and full-height partitions meet the ceiling; everything else stands clear of it.
      const flush = p.kind === 'pillar' || p.kind === 'partition';
      if (flush ? b.maxY > ceil + 0.01 : b.maxY > ceil - 0.02) bad.push(`${at} top ${b.maxY.toFixed(2)} ≥ ceiling ${ceil}`);
      if ((p.y ?? 0) < 0) bad.push(`${at} below the floor`);
    }
    expect(bad).toEqual([]);
  });

  it('wall-hung props sit against a wall', () => {
    const hung = map.props.filter((p) => p.solid === false && ['tv', 'whiteboard', 'projScreen', 'speedSign', 'fireExt', 'logo'].includes(p.kind));
    const bad: string[] = [];
    for (const p of hung) {
      const b = propBounds(p);
      // one face of the footprint touches a wall cell (sample just beyond each face)
      const touching = isWallAt(b.minX - 0.06, p.z) || isWallAt(b.maxX + 0.06, p.z) || isWallAt(p.x, b.minZ - 0.06) || isWallAt(p.x, b.maxZ + 0.06);
      if (!touching) bad.push(`${p.kind}@(${p.x},${p.z})`);
    }
    expect(bad).toEqual([]);
  });

  it('signs hang on a wall or a solid prop face, below the ceiling', () => {
    const bad: string[] = [];
    const inProp = (x: number, y: number, z: number) => map.props.some((p) => {
      const b = propBounds(p);
      return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && y >= b.minY && y <= b.maxY;
    });
    for (const s of map.signs) {
      // a point 12 cm behind the sign face is inside a wall cell, a collider (door lintels) or a prop (canopy fascia)
      const bx = s.x - Math.sin(s.rot) * 0.12, bz = s.z - Math.cos(s.rot) * 0.12;
      const behind = isWallAt(bx, bz) || world.collision.inside(bx, s.y, bz) || inProp(bx, s.y, bz);
      const front = !isWallAt(s.x + Math.sin(s.rot) * 0.06, s.z + Math.cos(s.rot) * 0.06);
      const c = ceilingAt(s.x + Math.sin(s.rot) * 0.06, s.z + Math.cos(s.rot) * 0.06);
      const top = s.y + (s.h ?? 0.42) / 2;
      if (!behind || !front) bad.push(`"${s.text}" not on a wall`);
      else if (c !== null && top > c) bad.push(`"${s.text}" top ${top.toFixed(2)} above ceiling ${c}`);
    }
    expect(bad).toEqual([]);
  });

  it('CCTV cameras and lights are inside rooms, under the ceiling', () => {
    const bad: string[] = [];
    for (const cam of map.cctv) {
      const c = ceilingAt(cam.x, cam.z);
      if (isWallAt(cam.x, cam.z)) bad.push(`${cam.name} in a wall`);
      else if (c !== null && cam.y > c - 0.15) bad.push(`${cam.name} above ceiling`);
      if (isWallAt(cam.lookX, cam.lookZ)) bad.push(`${cam.name} looks at a wall cell`);
    }
    for (const l of map.lights) {
      const c = ceilingAt(l.x, l.z);
      if (isWallAt(l.x, l.z) || (c !== null && l.y > c)) bad.push(`light (${l.x},${l.z})`);
    }
    expect(bad).toEqual([]);
  });

  it('every spawn, plant spot and AI spot is walkable', () => {
    const spots = [
      ...spotsOf('T'), ...spotsOf('CT'), ...map.plantSpots.A, ...map.plantSpots.B,
      ...map.ai.holds, ...map.ai.postPlant.A, ...map.ai.postPlant.B,
      ...map.ai.routes.flatMap((r) => r.via.map(([x, z]) => ({ x, z }))),
    ];
    const bad = spots.filter((s) => !world.nav.isWalkableAt(s.x, s.z)).map((s) => `(${s.x},${s.z})`);
    expect(bad).toEqual([]);
  });

  it('has three Attacker spawn areas outside and one Defender area per bombsite', () => {
    expect(map.spawnAreas.T.length).toBe(3);
    expect(map.spawnAreas.CT.map((a) => a.site).sort()).toEqual(['A', 'B']);
    for (const a of map.spawnAreas.T) for (const s of a.spots) expect(world.isOutdoors(s.x, s.z), `${a.id} (${s.x},${s.z})`).toBe(true);
    for (const a of map.spawnAreas.CT) {
      const site = map.sites[a.site!];
      // the site lies inside the defence area's zone, so Defenders start on their bombsite
      expect(inRect(a.zone, site.x0, site.z0) && inRect(a.zone, site.x1, site.z1), a.id).toBe(true);
    }
    const ids = [...map.spawnAreas.T, ...map.spawnAreas.CT].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spawn spots have room to stand (with the random offset), sit in their zone and are 3 m apart', () => {
    const r = MOVE.radius;
    for (const t of ['T', 'CT'] as const) for (const area of map.spawnAreas[t]) {
      expect(area.spots.length, area.id).toBeGreaterThanOrEqual(t === 'T' ? 10 : 8);
      for (const s of area.spots) {
        const at = `${area.id} (${s.x},${s.z})`;
        expect(inRect(area.zone, s.x, s.z), `${at} outside its zone`).toBe(true);
        expect(world.collision.overlaps(s.x - r, MOVE.stepHeight, s.z - r, s.x + r, MOVE.standHeight, s.z + r), `${at} blocked`).toBe(false);
        expect(world.nav.isWalkableAt(s.x, s.z), `${at} not walkable`).toBe(true);
      }
      const sp = area.spots;
      for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
        expect(Math.hypot(sp[i].x - sp[j].x, sp[i].z - sp[j].z), `${area.id} (${sp[i].x},${sp[i].z})-(${sp[j].x},${sp[j].z})`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('no Attacker spawn can see a Defender spawn (and the zones never overlap)', () => {
    const seen: string[] = [];
    for (const t of spotsOf('T')) for (const c of spotsOf('CT')) {
      for (const [hy, cy] of [[1.6, 1.6], [1.2, 1.6], [1.6, 1.2]]) {
        if (!world.collision.segmentBlocked(new Vector3(t.x, hy, t.z), new Vector3(c.x, cy, c.z))) { seen.push(`(${t.x},${t.z})→(${c.x},${c.z})`); break; }
      }
    }
    expect(seen).toEqual([]);
    for (const a of map.spawnAreas.T) for (const b of map.spawnAreas.CT) {
      const overlap = a.zone.x0 < b.zone.x1 && b.zone.x0 < a.zone.x1 && a.zone.z0 < b.zone.z1 && b.zone.z0 < a.zone.z1;
      expect(overlap, `${a.id} × ${b.id}`).toBe(false);
    }
    for (const site of ['A', 'B'] as const) {
      expect(map.plantSpots[site].length).toBeGreaterThanOrEqual(3);
      for (const s of map.plantSpots[site]) expect(world.siteAt(s.x, s.z)).toBe(site);
    }
  });

  it('every floor cell not covered by a prop is reachable from the Attacker spawn', () => {
    // One 4-connected flood fill over the bots' nav grid from the Attacker spawn (stricter than A*, which may cut corners).
    const nav = world.nav, t = firstT;
    const seen = new Uint8Array(nav.cols * nav.rows), queue = [nav.rowOf(t.z) * nav.cols + nav.colOf(t.x)];
    seen[queue[0]] = 1;
    while (queue.length) {
      const i = queue.pop()!, col = i % nav.cols, row = (i - col) / nav.cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = col + dc, rr = row + dr, j = rr * nav.cols + cc;
        if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows || seen[j] || !nav.walk[j]) continue;
        seen[j] = 1; queue.push(j);
      }
    }
    const sealed: string[] = [];
    // Workstations inside cubicle pods are reached through 1 m entrances players fit (tested below) but the 0.5 m nav grid does not.
    const pods = map.props.filter((p) => p.kind === 'cubicle').map(propBounds);
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
      if (map.grid[r][c] === '#') continue;
      const x = map.originX + (c + 0.5) * cs, z = map.originZ + (r + 0.5) * cs;
      if (!nav.isWalkableAt(x, z) || pods.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
      if (!seen[nav.rowOf(z) * nav.cols + nav.colOf(x)]) sealed.push(`${map.grid[r][c]}(${c},${r})`);
    }
    expect(sealed).toEqual([]);
  });

  it('every doorway can be walked through', () => {
    const bad: string[] = [];
    for (const d of map.doors) {
      const x = map.originX + ((d.c0 + d.c1 + 1) / 2) * cs, z = map.originZ + ((d.r0 + d.r1 + 1) / 2) * cs;
      if (!world.nav.isWalkableAt(x, z)) bad.push(`door (${d.c0},${d.r0})`);
      if (d.lintel < MOVE.standHeight + 0.2) bad.push(`door (${d.c0},${d.r0}) lintel ${d.lintel}`);
    }
    expect(bad).toEqual([]);
  });

  it('every floor cell has a callout', () => {
    const missing: string[] = [];
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
      if (map.grid[r][c] === '#') continue;
      const x = map.originX + (c + 0.5) * cs, z = map.originZ + (r + 0.5) * cs;
      if (!world.calloutAt(x, z)) missing.push(`(${c},${r})`);
    }
    expect(missing).toEqual([]);
  });

  it('run times: every Attacker area reaches both sites in 8-25 s; Defenders start on site and rotate in under 20 s', () => {
    const time = (from: Spot, to: Spot) => {
      const len = pathLength(world, from.x, from.z, to.x, to.z);
      expect(len, `(${from.x},${from.z}) → (${to.x},${to.z})`).not.toBeNull();
      return len! / RUN;
    };
    const report: string[] = [];
    for (const site of ['A', 'B'] as const) {
      const p = map.plantSpots[site][0];
      for (const area of map.spawnAreas.T) {
        // the area's closest spot is what a rushing team uses
        const fastest = Math.min(...area.spots.map((s) => time(s, p)));
        report.push(`T ${area.id}→${site} ${fastest.toFixed(1)}s`);
        expect(fastest, `T ${area.id} → ${site}`).toBeGreaterThan(8);
        expect(fastest, `T ${area.id} → ${site}`).toBeLessThan(25);
      }
      for (const area of map.spawnAreas.CT) {
        const slowest = Math.max(...area.spots.map((s) => time(s, p)));
        report.push(`CT ${area.id}→${site} ${slowest.toFixed(1)}s`);
        expect(slowest, `CT ${area.id} → ${site}`).toBeLessThan(area.site === site ? 5 : 20);
      }
    }
    console.log(map.id, report.join(' · '));
  });

  it('every T route is traversable waypoint to waypoint from every Attacker area, with routes to both sites', () => {
    expect(new Set(map.ai.routes.map((r) => r.site))).toEqual(new Set(['A', 'B']));
    for (const area of map.spawnAreas.T) for (const route of map.ai.routes) {
      let cur = { x: area.spots[0].x, z: area.spots[0].z };
      for (const [x, z] of [...route.via, [map.plantSpots[route.site][0].x, map.plantSpots[route.site][0].z]]) {
        expect(world.nav.findPath(cur.x, cur.z, x, z), `${area.id} ${route.id} → (${x},${z})`).not.toBeNull();
        cur = { x, z };
      }
    }
  });

  it('cubicle chairs sit inside their pod, clear of partitions and desks, behind an entrance a player fits through', () => {
    // Prop-local → world, as in Props.ts / propColliders (quarter turns).
    const toWorld = (p: PropDef, lx: number, lz: number) => {
      const rot = -(p.facing ?? 0) * Math.PI / 2, cos = Math.round(Math.cos(rot)), sin = Math.round(Math.sin(rot));
      return { x: p.x + lx * cos + lz * sin, z: p.z - lx * sin + lz * cos };
    };
    const pods = map.props.filter((p) => p.kind === 'cubicle');
    expect(pods.length).toBeGreaterThan(0);
    const r = MOVE.radius;
    for (const p of pods) {
      const odd = (p.facing ?? 0) % 2 === 1;
      const { stations } = cubicleLayout(odd ? p.d : p.w, odd ? p.w : p.d, p.h);
      const outer = propBounds(p);
      for (const s of stations) {
        const seat = toWorld(p, s.seatX, s.seatZ);
        const at = `pod (${p.x},${p.z}) seat (${seat.x.toFixed(2)},${seat.z.toFixed(2)})`;
        expect(seat.x > outer.minX + 0.3 && seat.x < outer.maxX - 0.3 && seat.z > outer.minZ + 0.3 && seat.z < outer.maxZ - 0.3, at).toBe(true);
        expect(world.collision.overlaps(seat.x - 0.25, 0.05, seat.z - 0.25, seat.x + 0.25, 1.2, seat.z + 0.25), at).toBe(false);
        // a standing player fits in the doorway, and inside the workstation just behind the chair
        const door = toWorld(p, s.door.x, s.door.z);
        const stand = toWorld(p, s.seatX, s.seatZ - s.toDesk * 0.4);
        expect(world.collision.overlaps(door.x - r, MOVE.stepHeight, door.z - r, door.x + r, MOVE.standHeight, door.z + r), `${at} door`).toBe(false);
        expect(world.collision.overlaps(stand.x - r, MOVE.stepHeight, stand.z - r, stand.x + r, MOVE.standHeight, stand.z + r), `${at} standing`).toBe(false);
      }
    }
  });

  it('compound props collide only within their footprint', () => {
    for (const p of map.props.filter((q) => q.kind === 'cubicle' || q.kind === 'speedTrailer')) {
      const o = propBounds(p);
      for (const b of propColliders(p)) {
        expect(b.minX >= o.minX - 1e-9 && b.maxX <= o.maxX + 1e-9 && b.minZ >= o.minZ - 1e-9 && b.maxZ <= o.maxZ + 1e-9, `${p.kind}@(${p.x},${p.z})`).toBe(true);
        expect(b.maxY <= o.maxY + 1e-9, `${p.kind}@(${p.x},${p.z}) height`).toBe(true);
      }
    }
  });

  it('callouts resolve for key areas', () => {
    const c = (rect: { x0: number; z0: number; x1: number; z1: number }) => world.calloutAt((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2);
    expect(c(map.sites.A)).toBe('A Site');
    expect(c(map.sites.B)).toBe('B Site');
    expect(world.calloutAt(firstT.x, firstT.z)).toBe('T Spawn');
    for (const area of map.spawnAreas.CT) expect(world.calloutAt(area.spots[0].x, area.spots[0].z)).toBe(`${area.site} Site`);
    expect(world.calloutAt(-1, 0)).toBe('Mid');
  });
});
