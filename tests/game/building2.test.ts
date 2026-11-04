import { describe, expect, it } from 'vitest';
import { Match } from '../../src/sim/mode/Match';
import { ACI_B2 } from '../../src/sim/maps/aciB2';
import { OUTFITS } from '../../src/config/cosmetics';
import type { SiteId } from '../../src/sim/world/MapTypes';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };

function runMatch(seed: number, maxSeconds: number, rounds = 3, teamSize = 5) {
  const m = new Match({
    map: ACI_B2, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed,
    rules: { roundsToWin: rounds, halfLength: rounds - 1, freezeTime: 2, roundEndDelay: 2, teamSize },
  });
  const dt = 1 / 64;
  const counts = { kills: 0, plants: 0, defuses: 0, explosions: 0, shots: 0 };
  const sites = new Set<SiteId>();
  m.events.on('kill', () => counts.kills++);
  m.events.on('bombPlanted', (e) => { counts.plants++; sites.add(e.site); });
  m.events.on('bombDefused', () => counts.defuses++);
  m.events.on('bombExploded', () => counts.explosions++);
  m.events.on('shot', (e) => { if (!e.pellet) counts.shots++; });
  // Nobody may end up inside a wall or a prop: sample every agent each second.
  const stuck: string[] = [];
  let next = 1;
  for (let t = 0; t < maxSeconds && m.phase !== 'matchOver'; t += dt) {
    m.step(dt);
    if (t >= next) {
      next += 1;
      for (const a of m.agents) {
        if (!a.alive) continue;
        if (m.world.collision.overlaps(a.pos.x - 0.2, a.pos.y + 0.5, a.pos.z - 0.2, a.pos.x + 0.2, a.pos.y + 1.0, a.pos.z + 0.2)) stuck.push(`${a.name}@(${a.pos.x.toFixed(1)},${a.pos.z.toFixed(1)})`);
      }
    }
  }
  return { m, counts, sites, stuck };
}

describe('ACI Building 2: bot-vs-bot play', () => {
  it('plays a complete match with kills, a winner and nobody inside geometry', () => {
    const { m, counts, stuck } = runMatch(1700, 900, 3);
    console.log('B2 history', m.history.map((h) => `${h.round}:${h.winner}/${h.reason}`).join(' '), counts);
    expect(m.phase).toBe('matchOver');
    expect(m.history.length).toBeGreaterThanOrEqual(3);
    expect(counts.kills).toBeGreaterThan(5);
    expect(counts.shots).toBeGreaterThan(50);
    expect(stuck).toEqual([]);
    if (m.winner !== null) expect(m.score[m.winner]).toBe(3);
  }, 180_000);

  it('Attackers plant at both sites across seeds, and Defenders win rounds too', () => {
    const sites = new Set<SiteId>();
    let plants = 0;
    const winners = { T: 0, CT: 0 };
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const r = runMatch(seed, 420, 2);
      plants += r.counts.plants;
      for (const s of r.sites) sites.add(s);
      for (const h of r.m.history) winners[h.winner]++;
      expect(r.stuck, `seed ${seed}`).toEqual([]);
    }
    console.log('B2 plants', plants, 'sites', [...sites], 'round wins', winners);
    expect(plants).toBeGreaterThan(1);
    expect(sites).toEqual(new Set(['A', 'B']));
    expect(winners.T).toBeGreaterThan(0);
    expect(winners.CT).toBeGreaterThan(0);
  }, 300_000);

  it('Defenders get every building camera on this map', () => {
    const m = new Match({ map: ACI_B2, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 3, rules: { teamSize: 2, freezeTime: 999 } });
    const cams = m.gadgets.devices.filter((d) => d.kind === 'cctv');
    expect(cams.length).toBe(ACI_B2.cctv.length);
    for (const cam of cams) expect(m.world.collision.inside(cam.pos.x, cam.pos.y, cam.pos.z)).toBe(false);
  });
});
