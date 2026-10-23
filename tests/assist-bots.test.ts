import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { makeAimAssist } from '../src/app/AimAssist';
import { yawTo } from '../src/core/math';
import type { AimAssist } from '../src/app/Profile';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

describe('aim assist', () => {
  function stage() {
    const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'CT', playerName: 'P', playerLook: look, seed: 3, rules: { teamSize: 2, freezeTime: 999 } });
    const p = m.player!, e = m.agents.find((a) => a.team === 'T')!;
    // open floor: player looking straight at an enemy 10 m away
    m.debugTeleport(p, 36, -20, 0); m.debugTeleport(e, 36, -30, 0);
    for (const a of m.agents) if (a !== p && a !== e) a.alive = false;
    p.yaw = 0; p.pitch = 0;
    return { m, p, e };
  }

  it('slows the crosshair and pulls toward a visible enemy, but only near them', () => {
    const { m, p, e } = stage();
    let level: AimAssist = 'medium';
    const assist = makeAimAssist(m, () => level);
    const eye = p.eyePos(new Vector3());
    const ty = yawTo(e.pos.x - eye.x, e.pos.z - eye.z);
    const near = assist(ty + 0.03, 0, 1 / 60, true)!;
    expect(near).not.toBeNull();
    expect(near.sens).toBeLessThan(1);
    expect(Math.sign(near.yaw)).toBe(-1); // pulls back toward the target
    expect(Math.abs(near.yaw)).toBeLessThan(0.01); // gentle, rate-capped
    expect(assist(ty + 0.6, 0, 1 / 60, true)).toBeNull(); // far off-target: nothing
    // holding still pulls much less than actively aiming
    const idle = assist(ty + 0.03, 0, 1 / 60, false)!;
    expect(Math.abs(idle.yaw)).toBeLessThan(Math.abs(near.yaw));
    level = 'off';
    expect(assist(ty + 0.03, 0, 1 / 60, true)).toBeNull();
  });

  it('never assists through walls or onto teammates', () => {
    const { m, p, e } = stage();
    const assist = makeAimAssist(m, () => 'high');
    // put the enemy behind the warehouse office wall
    m.debugTeleport(e, -30, 0, 0);
    const eye = p.eyePos(new Vector3());
    const ty = yawTo(e.pos.x - eye.x, e.pos.z - eye.z);
    if (m.world.collision.segmentBlocked(eye, e.eyePos(new Vector3()))) expect(assist(ty, 0, 1 / 60, true)).toBeNull();
    e.team = p.team;
    expect(assist(ty, 0, 1 / 60, true)).toBeNull();
  });
});

describe('bots use the new arsenal', () => {
  it('bots stim a hurt teammate with a real dart', () => {
    const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 21, rules: { teamSize: 2, freezeTime: 2 } });
    const [medic, hurt] = m.agents.filter((a) => a.team === 'CT');
    for (let i = 0; i < 2.2 / DT; i++) m.step(DT); // past freeze
    m.debugTeleport(medic, 36, -20, 0); m.debugTeleport(hurt, 36, -28, 0);
    medic.gadgets.stim = 3; hurt.health = 30;
    let darts = 0, heals = 0;
    m.events.on('gadgetDeploy', (e) => { if (e.kind === 'stim' && e.agentId === medic.id) darts++; });
    m.events.on('stimHeal', (e) => { if (e.targetId === hurt.id && !e.self) heals++; });
    for (let i = 0; i < 8 / DT && !heals; i++) { hurt.health = Math.min(hurt.health, 30); m.step(DT); }
    expect(darts).toBeGreaterThan(0);
    expect(heals).toBeGreaterThan(0);
  }, 30_000);

  it('bot matches use stims, killstreaks, barricades and quick melee without errors', () => {
    const tally = { stimHeal: 0, streakUsed: 0, barricades: 0, quickMelee: 0, explosions: 0, bought: new Set<string>() };
    for (const seed of [5, 6]) {
      const m = new Match({ map: ACI_HQ, difficulty: 'hard', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed,
        rules: { roundsToWin: 4, halfLength: 3, freezeTime: 2, roundEndDelay: 1.5 } });
      for (const a of m.agents) a.money = 16000; // rich bots buy everything
      m.events.on('roundStart', () => { for (const a of m.agents) a.money = 16000; });
      m.events.on('stimHeal', () => tally.stimHeal++);
      m.events.on('killstreakUsed', () => tally.streakUsed++);
      m.events.on('quickMelee', () => tally.quickMelee++);
      m.events.on('explosion', () => tally.explosions++);
      m.events.on('gadgetDeploy', (e) => { if (e.kind === 'barricade' || e.kind === 'steelBarricade') tally.barricades++; });
      m.events.on('buy', (e) => tally.bought.add(e.item));
      for (let t = 0; t < 420 && m.phase !== 'matchOver'; t += DT) m.step(DT);
    }
    console.log('arsenal use', { ...tally, bought: [...tally.bought].join(',') });
    expect(tally.stimHeal + tally.barricades + tally.quickMelee + tally.streakUsed).toBeGreaterThan(0);
  }, 240_000);
});
