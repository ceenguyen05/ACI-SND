import { describe, expect, it } from 'vitest';
import { Match } from '../../src/sim/mode/Match';
import { SND_MAPS, SND_MAP_IDS } from '../../src/sim/maps/index';
import { OUTFITS } from '../../src/config/cosmetics';
import { inRect } from '../../src/core/math';
import { MOVE } from '../../src/config/movement';
import type { MapDef } from '../../src/sim/world/MapTypes';
import type { Team } from '../../src/config/rules';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const make = (map: MapDef, seed: number, teamSize = 5) =>
  new Match({ map, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed, rules: { teamSize, freezeTime: 999 } });
/** Start the next round directly (the spawn logic is all in startRound). */
const nextRound = (m: Match) => (m as unknown as { startRound(): void }).startRound();
const areaOf = (map: MapDef, team: Team, x: number, z: number) => map.spawnAreas[team].find((a) => inRect(a.zone, x, z))?.id;

describe.each(SND_MAP_IDS.map((id) => [SND_MAPS[id].name, SND_MAPS[id]] as const))('%s: spawns change every round', (_name, map: MapDef) => {
  it('Attackers use a different area every round and see all three; Defenders split between A and B', () => {
    const m = make(map, 5);
    const tAreas: string[] = [];
    const splits: string[] = [];
    let prev = new Map(m.agents.map((a) => [a.id, a.pos.clone()]));
    for (let round = 0; round < 14; round++) {
      if (round) nextRound(m);
      const ts = m.agents.filter((a) => a.team === 'T'), cts = m.agents.filter((a) => a.team === 'CT');
      // the whole Attacker team starts in the one area announced for the round
      expect(m.spawnAreas.T.length).toBe(1);
      for (const a of ts) expect(areaOf(map, 'T', a.pos.x, a.pos.z), `round ${m.round} ${a.name}`).toBe(m.spawnAreas.T[0]);
      tAreas.push(m.spawnAreas.T[0]);
      // Defenders: each in a defence area that is in use this round; 2/3 or 3/2 in a 5v5
      const perArea = new Map<string, number>();
      for (const a of cts) {
        const id = areaOf(map, 'CT', a.pos.x, a.pos.z);
        expect(id && m.spawnAreas.CT.includes(id), `round ${m.round} ${a.name}`).toBe(true);
        perArea.set(id!, (perArea.get(id!) ?? 0) + 1);
      }
      const counts = map.spawnAreas.CT.map((a) => perArea.get(a.id) ?? 0);
      expect(Math.min(...counts), `round ${m.round} split ${counts}`).toBeGreaterThanOrEqual(2);
      splits.push(counts.join('/'));
      // everyone starts somewhere new: not where they stood at the start of last round
      if (round) for (const a of m.agents) expect(a.pos.distanceTo(prev.get(a.id)!), `round ${m.round} ${a.team} ${a.name}`).toBeGreaterThan(1.5);
      prev = new Map(m.agents.map((a) => [a.id, a.pos.clone()]));
    }
    for (let i = 1; i < tAreas.length; i++) expect(tAreas[i], `round ${i + 1}`).not.toBe(tAreas[i - 1]);
    expect(new Set(tAreas)).toEqual(new Set(map.spawnAreas.T.map((a) => a.id)));
    expect(new Set(splits).size, splits.join(' ')).toBeGreaterThan(1); // the split itself varies
  });

  it('everyone spawns standing in open space, apart from each other, facing play, and can buy', () => {
    for (const seed of [1, 2, 3, 4]) {
      const m = make(map, seed);
      for (let round = 0; round < 6; round++) {
        if (round) nextRound(m);
        const r = MOVE.radius;
        for (const a of m.agents) {
          const at = `seed ${seed} round ${m.round} ${a.team} (${a.pos.x.toFixed(2)},${a.pos.z.toFixed(2)})`;
          expect(m.world.collision.overlaps(a.pos.x - r, MOVE.stepHeight, a.pos.z - r, a.pos.x + r, MOVE.standHeight, a.pos.z + r), at).toBe(false);
          expect(m.canBuyNow(a), `${at} cannot buy`).toBe(true);
          expect(Number.isFinite(a.yaw), at).toBe(true);
        }
        for (let i = 0; i < m.agents.length; i++) for (let j = i + 1; j < m.agents.length; j++) {
          expect(m.agents[i].pos.distanceTo(m.agents[j].pos), `seed ${seed} round ${m.round}`).toBeGreaterThanOrEqual(1.05);
        }
        // a buy zone of this round never lets the other team buy
        for (const a of m.agents) expect(m.inBuyZone(a.team === 'T' ? 'CT' : 'T', a.pos.x, a.pos.z)).toBe(false);
      }
    }
  });

  it('spots are nudged at random, so the same spot is not the same position', () => {
    const exact = new Set(map.spawnAreas.T.flatMap((a) => a.spots).concat(map.spawnAreas.CT.flatMap((a) => a.spots)).map((s) => `${s.x},${s.z}`));
    let nudged = 0, total = 0;
    for (const seed of [10, 11, 12]) {
      const m = make(map, seed);
      for (let round = 0; round < 4; round++) {
        if (round) nextRound(m);
        for (const a of m.agents) { total++; if (!exact.has(`${a.pos.x},${a.pos.z}`)) nudged++; }
      }
    }
    expect(nudged / total).toBeGreaterThan(0.8);
  });

  it('a lone Defender (1v1) starts at A or B at random', () => {
    const sites = new Set<string>();
    const m = make(map, 9, 1);
    for (let round = 0; round < 12; round++) {
      if (round) nextRound(m);
      const ct = m.agents.find((a) => a.team === 'CT')!;
      sites.add(map.spawnAreas.CT.find((a) => inRect(a.zone, ct.pos.x, ct.pos.z))!.site!);
      expect(m.spawnAreas.CT.length).toBe(1);
    }
    expect([...sites].sort()).toEqual(['A', 'B']);
  });

  it('works for every team size', () => {
    for (const size of [1, 2, 3, 4, 5]) {
      const m = make(map, 20 + size, size);
      for (let round = 0; round < 4; round++) {
        if (round) nextRound(m);
        expect(m.agents.length).toBe(size * 2);
        for (const a of m.agents) expect(m.canBuyNow(a), `${size}v${size} ${a.team}`).toBe(true);
      }
    }
  });
});
