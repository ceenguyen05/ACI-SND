import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };

function runMatch(seed: number, maxSeconds: number, rounds = 3) {
  const m = new Match({
    map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed,
    rules: { roundsToWin: rounds, halfLength: rounds - 1, freezeTime: 2, roundEndDelay: 2 },
  });
  const dt = 1 / 64;
  const counts = { kills: 0, plants: 0, defuses: 0, explosions: 0, throws: 0, shots: 0 };
  m.events.on('kill', () => counts.kills++);
  m.events.on('bombPlanted', () => counts.plants++);
  m.events.on('bombDefused', () => counts.defuses++);
  m.events.on('bombExploded', () => counts.explosions++);
  m.events.on('throw', () => counts.throws++);
  m.events.on('shot', (e) => { if (!e.pellet) counts.shots++; });
  for (let t = 0; t < maxSeconds && m.phase !== 'matchOver'; t += dt) m.step(dt);
  return { m, counts };
}

describe('full bot-vs-bot match simulation', () => {
  it('plays complete rounds with kills, economy and a winner', () => {
    const { m, counts } = runMatch(1234, 900, 3);
    console.log('history', m.history.map((h) => `${h.round}:${h.winner}/${h.reason}`).join(' '), counts);
    expect(m.history.length).toBeGreaterThanOrEqual(3);
    expect(counts.kills).toBeGreaterThan(5);
    expect(counts.shots).toBeGreaterThan(50);
    expect(m.phase).toBe('matchOver');
    if (m.winner === null) expect(m.score.T).toBe(m.score.CT); // draw
    else expect(m.score[m.winner]).toBe(3);
    for (const a of m.agents) {
      expect(a.money).toBeGreaterThanOrEqual(0);
      expect(a.money).toBeLessThanOrEqual(16000);
    }
  }, 120_000);

  it('attackers plant the bomb in some rounds across seeds', () => {
    let plants = 0, rounds = 0;
    const reasons: string[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const { m, counts } = runMatch(seed, 400, 2);
      plants += counts.plants;
      rounds += m.history.length;
      reasons.push(...m.history.map((h) => `${h.winner}/${h.reason}`));
    }
    console.log('reasons', reasons.join(' '), 'plants', plants);
    expect(rounds).toBeGreaterThan(3);
    expect(plants).toBeGreaterThan(0);
  }, 180_000);

  it('halftime swaps sides and resets money', () => {
    const m = new Match({
      map: ACI_HQ, difficulty: 'normal', playerTeam: 'T', playerName: 'P', playerLook: look, seed: 9,
      rules: { roundsToWin: 3, halfLength: 2, freezeTime: 1, roundEndDelay: 1, teamSize: 2 },
    });
    const p = m.player!;
    expect(p.team).toBe('T');
    const dt = 1 / 64;
    for (let t = 0; t < 600 && m.round < 3; t += dt) m.step(dt);
    expect(m.round).toBe(3);
    expect(p.team).toBe('CT');
    expect(p.money).toBe(800);
  }, 120_000);
});
