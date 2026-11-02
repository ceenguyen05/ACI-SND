import { describe, expect, it } from 'vitest';
import { OUTFITS } from '../src/config/cosmetics';
import { DIFFICULTY, type BotDifficulty } from '../src/config/difficulty';
import { emptyCommand, makeWeapon } from '../src/sim/entities/Agent';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';

const DT = 1 / 64, look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const levels = Object.keys(DIFFICULTY) as BotDifficulty[];

function duel(level: BotDifficulty, seed = 1, weapon: 'sentinel' | 'marshal' = 'sentinel') {
  const m = new Match({ map: ACI_HQ, difficulty: level, playerTeam: 'CT', playerName: 'Target', playerLook: look, seed, rules: { teamSize: 1 } });
  const p = m.player!, e = m.agents.find((a) => a.isBot)!, bot = m.bots.get(e.id)!;
  m.world.collision.boxes.length = 0; m.world.collision.clearDynamic();
  m.world.collision.add({ minX: -100, maxX: 100, minZ: -100, maxZ: 100, minY: -1, maxY: 0, surface: 'floor' });
  m.world.collision.build();
  m.debugTeleport(p, 0, 0, 0); m.debugTeleport(e, 0, -20, Math.PI);
  p.health = p.maxHealth = 1e8; e.primary = makeWeapon(weapon); e.active = 'primary'; e.primary.mag = 1000;
  e.wpn.drawUntil = e.wpn.nextAttack = 0;
  m.phase = 'live'; m.phaseEnd = 999;
  bot.resetRound(); bot.setOrder({ kind: 'idle' });
  const think = bot.think.bind(bot);
  // Isolate aim and fire decisions from navigation in a fixed 20 m firing lane.
  bot.think = (dt) => { const cmd = think(dt); cmd.forward = cmd.right = 0; cmd.crouch = cmd.prone = false; return cmd; };
  const shots: number[] = [], hitTimes: number[] = [];
  m.events.on('shot', (v) => { if (v.agentId === e.id && !v.pellet) shots.push(m.time); });
  m.events.on('hit', (v) => { if (v.attackerId === e.id && v.victimId === p.id) hitTimes.push(m.time); });
  return { m, p, e, bot, shots, hitTimes };
}

describe('humanized bot aim', () => {
  it.each(levels)('%s has a reaction window and takes breaks during a sustained duel', (level) => {
    const { m, shots } = duel(level);
    for (let t = 0; t < 8; t += DT) m.step(DT);
    expect(shots.length).toBeGreaterThan(4);
    expect(shots[0]).toBeGreaterThanOrEqual(DIFFICULTY[level].reaction * 0.8);
    const gaps = shots.slice(1).map((t, i) => t - shots[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(DIFFICULTY[level].burstPause * 0.9);
  });

  it.each(levels)('%s releases and re-presses a scoped semi-auto trigger at a human cadence', (level) => {
    const { m, shots } = duel(level, 7, 'marshal');
    for (let t = 0; t < 8; t += DT) m.step(DT);
    expect(shots.length).toBeGreaterThan(2);
    for (let i = 1; i < shots.length; i++) expect(shots[i] - shots[i - 1]).toBeGreaterThanOrEqual(DIFFICULTY[level].triggerInterval - DT);
  });

  it('stops firing immediately on lost visibility and reacts again when the target reappears', () => {
    const { m, p, shots } = duel('expert');
    for (let t = 0; t < 3; t += DT) m.step(DT);
    expect(shots.length).toBeGreaterThan(0);
    const wall = m.world.collision.addDynamic({ minX: -20, maxX: 20, minY: 0, maxY: 4, minZ: -11, maxZ: -10, surface: 'metal' });
    const n = shots.length;
    for (let t = 0; t < 0.2; t += DT) { p.pos.x += 0.02; m.step(DT); }
    expect(shots.length).toBe(n);
    m.world.collision.removeDynamic(wall);
    for (let t = 0; t < DIFFICULTY.expert.reaction * 0.75; t += DT) m.step(DT);
    expect(shots.length).toBe(n);
  });

  it('keeps moving-target accuracy imperfect and difficulty meaningfully separated', () => {
    const report = levels.map((level) => {
      let shots = 0, hits = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const d = duel(level, seed);
        for (let t = 0; t < 8; t += DT) {
          const cmd = emptyCommand(); cmd.right = Math.cos(t * 2.3) > 0 ? 1 : -1;
          d.m.setPlayerCommand(cmd); d.m.step(DT);
        }
        shots += d.shots.length; hits += d.hitTimes.length;
      }
      return { level, shots, hits, accuracy: hits / shots };
    });
    console.log('20 m moving-target bot accuracy', report);
    for (const r of report) { expect(r.shots).toBeGreaterThan(10); expect(r.accuracy).toBeLessThan(0.85); }
    expect(report[3].accuracy).toBeGreaterThan(report[0].accuracy);
    expect(report[2].hits + report[3].hits).toBeGreaterThan(report[0].hits + report[1].hits);
  }, 30_000);
});
