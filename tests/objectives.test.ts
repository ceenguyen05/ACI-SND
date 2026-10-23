import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { emptyCommand, type AgentCommand } from '../src/sim/entities/Agent';

const DT = 1 / 64, look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
function stage() {
  const m = new Match({ map: ACI_HQ, difficulty: 'easy', playerTeam: 'T', playerName: 'test', playerLook: look, seed: 9, rules: { teamSize: 1 } });
  m.skipFreeze();
  for (const bot of m.bots.values()) bot.think = () => emptyCommand();
  const p = m.player!, site = ACI_HQ.plantSpots.A[0];
  m.debugTeleport(p, site.x, site.z, 0);
  p.hasBomb = true; p.active = 'bomb'; p.wpn.drawUntil = 0;
  return { m, p };
}
function tick(m: Match, cmd: Partial<AgentCommand>, count: number) {
  m.setPlayerCommand({ ...emptyCommand(), ...cmd });
  for (let i = 0; i < count; i++) m.step(DT);
}
function plant() {
  const { m, p } = stage();
  tick(m, { crouch: true, prone: true }, 64);
  expect(p.prone).toBe(true);
  tick(m, { crouch: true, prone: true, fire: true }, Math.ceil(m.rules.plantTime / DT) + 1);
  expect(m.bomb.state).toBe('planted');
  return { m, p };
}

describe('search and destroy objective handling', () => {
  it('plants and defuses from prone, keeps hands busy, and finishes the round', () => {
    const { m, p } = plant();
    p.team = 'CT';
    m.debugGive(p, 'sentinel'); p.wpn.drawUntil = 0; p.hasKit = true;
    tick(m, { use: true, crouch: true, prone: true }, 2);
    expect(p.isDefusing).toBe(true);
    const mag = p.primary!.mag;
    tick(m, { use: true, fire: true, crouch: true, prone: true }, 64);
    expect(p.primary!.mag).toBe(mag);
    expect(p.prone).toBe(true);
    tick(m, { use: true, crouch: true, prone: true }, Math.ceil(m.rules.defuseTimeKit / DT));
    expect(m.bomb.state).toBe('defused');
    expect(m.history.at(-1)?.reason).toBe('defuse');
  });

  it('resets progress on release and refuses to defuse through cover', () => {
    const { m, p } = plant();
    p.team = 'CT';
    tick(m, { use: true, crouch: true, prone: true }, 32);
    expect(p.defuseProgress).toBeGreaterThan(0);
    tick(m, { crouch: true, prone: true }, 1);
    expect(p.defuseProgress).toBe(0); expect(m.bomb.defuserId).toBeNull();
    // Stand one metre south of the bomb, with a thin wall between eye and device.
    p.motor.prone = 0; p.motor.duck = 0;
    p.pos.copy(m.bomb.pos).add(new Vector3(0, 0, 1));
    m.world.collision.addDynamic({ minX: p.pos.x - 2, maxX: p.pos.x + 2, minZ: p.pos.z - 0.6, maxZ: p.pos.z - 0.5, minY: 0, maxY: 3, surface: 'wall' });
    tick(m, { use: true }, 32);
    expect(p.isDefusing).toBe(false); expect(p.defuseProgress).toBe(0);
  });
});
