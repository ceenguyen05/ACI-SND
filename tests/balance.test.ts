import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import type { BotDifficulty } from '../src/config/difficulty';

/**
 * Long-running balance report (skipped by default). Run with:
 *   BALANCE=1 npx vitest run tests/balance.test.ts
 */
describe.skipIf(!process.env.BALANCE)('balance report', () => {
  it('simulates many rounds and reports win rates', () => {
    const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
    const diff = (process.env.DIFF ?? 'normal') as BotDifficulty;
    const tally: Record<string, number> = {};
    let rounds = 0, plants = 0, kills = 0, throws = 0;
    const weaponKills: Record<string, number> = {};
    const fights: Record<string, number> = {};
    for (let seed = 1; seed <= Number(process.env.SEEDS ?? 6); seed++) {
      const m = new Match({ map: ACI_HQ, difficulty: diff, playerTeam: 'spectator', playerName: 'x', playerLook: look, seed,
        rules: { roundsToWin: 7, halfLength: 6, freezeTime: 2, roundEndDelay: 1 } });
      m.events.on('bombPlanted', () => plants++);
      m.events.on('throw', () => throws++);
      m.events.on('kill', (e) => {
        kills++; weaponKills[e.weapon] = (weaponKills[e.weapon] ?? 0) + 1;
        const k = m.getAgent(e.killerId), v = m.getAgent(e.victimId);
        if (k && v && k.team !== v.team) {
          const key = `${m.phase === 'planted' ? 'post' : 'pre'}:${k.team}kills`;
          fights[key] = (fights[key] ?? 0) + 1;
          const vb = m.bots.get(v.id), kb = m.bots.get(k.id);
          const vk = `${v.team}victimOrder:${vb?.order.kind}`; fights[vk] = (fights[vk] ?? 0) + 1;
          if (v.speed2D > 2) fights[`${v.team}victimMoving`] = (fights[`${v.team}victimMoving`] ?? 0) + 1;
          if (v.flashUntil > m.time) fights[`${v.team}victimFlashed`] = (fights[`${v.team}victimFlashed`] ?? 0) + 1;
          void kb;
        }
      });
      const dt = 1 / 64;
      for (let t = 0; t < 3000 && m.phase !== 'matchOver'; t += dt) m.step(dt);
      for (const h of m.history) { tally[`${h.winner}/${h.reason}`] = (tally[`${h.winner}/${h.reason}`] ?? 0) + 1; rounds++; }
    }
    const tWins = Object.entries(tally).filter(([k]) => k.startsWith('T/')).reduce((s, [, v]) => s + v, 0);
    console.log(JSON.stringify({ diff, rounds, tWinRate: +(tWins / rounds).toFixed(2), plants, kills, killsPerRound: +(kills / rounds).toFixed(1), throws, tally, fights }, null, 1));
    expect(rounds).toBeGreaterThan(10);
  }, 600_000);
});
