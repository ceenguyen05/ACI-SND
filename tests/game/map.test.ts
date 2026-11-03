import { describe, expect, it } from 'vitest';
import { ACI_HQ } from '../../src/sim/maps/aciHq';
import { World, propBounds, propColliders } from '../../src/sim/world/World';
import { cubicleLayout } from '../../src/sim/world/PropShapes';
import { MOVE } from '../../src/config/movement';
import type { PropDef } from '../../src/sim/world/MapTypes';

const world = new World(ACI_HQ);

describe('ACI HQ map data', () => {
  it('grid has consistent dimensions and only known chars', () => {
    expect(ACI_HQ.grid.length).toBe(ACI_HQ.rows);
    for (const row of ACI_HQ.grid) {
      expect(row.length).toBe(ACI_HQ.cols);
      for (const ch of row) expect(ch === '#' || ch in ACI_HQ.floorTypes).toBe(true);
    }
  });

  it('is enclosed by walls', () => {
    const g = ACI_HQ.grid;
    for (let c = 0; c < ACI_HQ.cols; c++) { expect(g[0][c]).toBe('#'); expect(g[ACI_HQ.rows - 1][c]).toBe('#'); }
    for (let r = 0; r < ACI_HQ.rows; r++) { expect(g[r][0]).toBe('#'); expect(g[r][ACI_HQ.cols - 1]).toBe('#'); }
  });

  it('solid props do not intersect walls', () => {
    const bad: string[] = [];
    for (const p of ACI_HQ.props) {
      if (p.solid === false) continue;
      const b = propBounds(p);
      for (const x of [b.minX + 0.01, b.maxX - 0.01]) for (const z of [b.minZ + 0.01, b.maxZ - 0.01]) {
        const { c, r } = world.cellAt(x, z);
        if (world.charAt(c, r) === '#') bad.push(`${p.kind}@(${p.x},${p.z})`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('every spawn, plant spot and AI spot is walkable', () => {
    const spots = [
      ...ACI_HQ.spawns.T, ...ACI_HQ.spawns.CT, ...ACI_HQ.plantSpots.A, ...ACI_HQ.plantSpots.B,
      ...ACI_HQ.ai.holds, ...ACI_HQ.ai.postPlant.A, ...ACI_HQ.ai.postPlant.B,
      ...ACI_HQ.ai.routes.flatMap((r) => r.via.map(([x, z]) => ({ x, z }))),
    ];
    const bad = spots.filter((s) => !world.nav.isWalkableAt(s.x, s.z)).map((s) => `(${s.x},${s.z})`);
    expect(bad).toEqual([]);
  });

  it('spawns are inside their buy zones and plant spots inside sites', () => {
    for (const t of ['T', 'CT'] as const) for (const s of ACI_HQ.spawns[t]) expect(world.inBuyZone(t, s.x, s.z)).toBe(true);
    for (const site of ['A', 'B'] as const) for (const s of ACI_HQ.plantSpots[site]) expect(world.siteAt(s.x, s.z)).toBe(site);
  });

  it('both spawns can reach both bombsites', () => {
    const t = ACI_HQ.spawns.T[0], ct = ACI_HQ.spawns.CT[0];
    for (const site of ['A', 'B'] as const) {
      const p = ACI_HQ.plantSpots[site][0];
      expect(world.nav.findPath(t.x, t.z, p.x, p.z), `T→${site}`).not.toBeNull();
      expect(world.nav.findPath(ct.x, ct.z, p.x, p.z), `CT→${site}`).not.toBeNull();
    }
  });

  it('every T route is traversable waypoint to waypoint', () => {
    const t = ACI_HQ.spawns.T[0];
    for (const route of ACI_HQ.ai.routes) {
      let cur = { x: t.x, z: t.z };
      for (const [x, z] of [...route.via, [ACI_HQ.plantSpots[route.site][0].x, ACI_HQ.plantSpots[route.site][0].z]]) {
        expect(world.nav.findPath(cur.x, cur.z, x, z), `${route.id} → (${x},${z})`).not.toBeNull();
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
    const pods = ACI_HQ.props.filter((p) => p.kind === 'cubicle');
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
    for (const p of ACI_HQ.props.filter((q) => q.kind === 'cubicle' || q.kind === 'speedTrailer')) {
      const o = propBounds(p);
      for (const b of propColliders(p)) {
        expect(b.minX >= o.minX - 1e-9 && b.maxX <= o.maxX + 1e-9 && b.minZ >= o.minZ - 1e-9 && b.maxZ <= o.maxZ + 1e-9, `${p.kind}@(${p.x},${p.z})`).toBe(true);
        expect(b.maxY <= o.maxY + 1e-9, `${p.kind}@(${p.x},${p.z}) height`).toBe(true);
      }
    }
  });

  it('callouts resolve for key areas', () => {
    expect(world.calloutAt(40, -27)).toBe('A Site');
    expect(world.calloutAt(-44, -26)).toBe('B Site');
    expect(world.calloutAt(-1, 0)).toBe('Mid');
  });
});
