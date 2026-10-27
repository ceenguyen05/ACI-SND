import { describe, expect, it } from 'vitest';
import { ZombiesMatch } from '../src/sim/zombies/ZombiesMatch';
import { ACI_HQ_ZOMBIES } from '../src/sim/maps/aciHqZombies';
import { OUTFITS } from '../src/config/cosmetics';

// Long all-bot Zombies runs (balance + performance). Opt in: SOAK=1 npx vitest run tests/zombies-soak.test.ts --silent=false
const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };

/** Wrap a method to accumulate its time and worst single call. */
function probe(obj: Record<string, unknown>, name: string, stats: Record<string, { total: number; worst: number; n: number }>) {
  const fn = obj[name] as (...args: unknown[]) => unknown;
  const s = (stats[name] = { total: 0, worst: 0, n: 0 });
  obj[name] = function (this: unknown, ...args: unknown[]) {
    const t = performance.now();
    const r = fn.apply(this, args);
    const d = performance.now() - t;
    s.total += d; s.n++; if (d > s.worst) s.worst = d;
    return r;
  };
}

describe.skipIf(!process.env.SOAK)('zombies soak', () => {
  for (const [players, difficulty] of [[5, 'normal'], [3, 'normal'], [1, 'casual']] as const) {
    it(`${players} bots on ${difficulty}`, () => {
      const m = new ZombiesMatch({ layout: ACI_HQ_ZOMBIES, difficulty, players, length: 'endless', playerName: 'P', playerLook: look, seed: 21, spectate: true });
      const stats: Record<string, { total: number; worst: number; n: number }> = {};
      const mm = m as unknown as Record<string, unknown>;
      for (const k of ['computeFlow', 'updateZombie', 'updateHuman', 'resolveBodies', 'spawnTick', 'updateHazards']) probe(mm, k, stats);
      probe(m.world.nav as unknown as Record<string, unknown>, 'findPath', stats);
      const t0 = performance.now();
      let ticks = 0, worst = 0;
      const log: string[] = [];
      let lastWave = 0, lastWaveAt = 0, longestWave = 0;
      const trespass: string[] = [];
      while (!m.gameOver && m.time < 60 * 18) {
        const s = performance.now();
        m.step(1 / 64);
        worst = Math.max(worst, performance.now() - s);
        ticks++;
        for (const h of m.humans) {
          const z = h.alive ? m.zoneAt(h.pos.x, h.pos.z) : null;
          if (z && !m.zoneOpen[z]) trespass.push(`${h.name} in ${z} at ${m.time.toFixed(1)}s`);
        }
        longestWave = Math.max(longestWave, m.time - lastWaveAt);
        if (m.wave !== lastWave) {
          lastWave = m.wave; lastWaveAt = m.time;
          log.push(`w${m.wave} t=${Math.round(m.time)}s alive=${m.standing().length} pts=${m.humans.map((h) => h.money).join('/')} doors=${m.gates.filter((g) => g.open).length} power=${m.power} perks=${m.humans.map((h) => h.zp!.perks.length).join('/')} armor=${m.humans.map((h) => Math.round(h.armor)).join('/')} guns=${m.humans.map((h) => [h.primary?.def.id, h.secondary?.def.id].join('+')).join(' ')}`);
        }
      }
      const ms = (performance.now() - t0) / ticks;
      const prof = Object.entries(stats).map(([k, s]) => `${k}: ${(s.total / ticks).toFixed(3)} ms/tick, worst ${s.worst.toFixed(1)} ms (${s.n} calls)`).join('\n  ');
      console.log(`\n${players} bots ${difficulty}: reached wave ${m.wave} in ${Math.round(m.time)}s, kills ${m.totalKills}, ${ms.toFixed(3)} ms/tick (worst ${worst.toFixed(1)} ms)\n  ${log.join('\n  ')}\n  ${prof}`);
      expect(m.wave).toBeGreaterThanOrEqual(3);
      expect(ms).toBeLessThan(4);
      expect(trespass.slice(0, 3)).toEqual([]);
      expect(longestWave).toBeLessThan(300); // no wave is held open by an unreachable zombie
    }, 900_000);
  }
});
